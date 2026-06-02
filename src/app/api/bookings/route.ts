/**
 * src/app/api/bookings/route.ts
 *
 * Booking collection endpoints (tenant-scoped):
 *   GET  /api/bookings         — list all non-cancelled/deleted bookings for the tenant
 *   POST /api/bookings         — create a new booking with conflict detection
 *
 * Conflict detection is performed inside a SERIALIZABLE transaction with a
 * SELECT ... FOR UPDATE on conflicting BookingFacility rows. This prevents
 * double-booking under concurrent requests.
 *
 * Multi-facility: facilityIds[] links one booking to multiple facilities via
 * the BookingFacility junction table.
 *
 * On successful confirmation (status=CONFIRMED on create), a confirmation
 * email is sent via src/lib/email.ts (no-op in test env).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/email";
import type { BookingStatus, BookingType } from "@prisma/client";

// ─── GET /api/bookings ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") as BookingStatus | null;
  const facilityId = searchParams.get("facilityId");
  const from = searchParams.get("from"); // ISO date string
  const to = searchParams.get("to");     // ISO date string

  const bookings = await prisma.booking.findMany({
    where: {
      propertyId: session.user.propertyId,
      deletedAt: null,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(from || to
        ? {
            AND: [
              ...(from ? [{ checkOut: { gt: new Date(from) } }] : []),
              ...(to ? [{ checkIn: { lt: new Date(to) } }] : []),
            ],
          }
        : {}),
      ...(facilityId
        ? {
            bookingFacilities: {
              some: { facilityId },
            },
          }
        : {}),
    },
    include: {
      bookingFacilities: {
        include: {
          facility: {
            select: { id: true, name: true, type: true },
          },
        },
      },
    },
    orderBy: [{ checkIn: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(bookings);
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  try {
    requireRole(session, "STAFF");
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json(
      { error: e.message ?? "Forbidden" },
      { status: e.status ?? 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseBookingBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const {
    facilityIds,
    guestName,
    guestEmail,
    checkIn,
    checkOut,
    type,
    status,
    notes,
    totalPrice,
  } = parsed.data;

  // ── Validate facilities belong to this property ──────────────────────────
  if (facilityIds.length > 0) {
    const count = await prisma.facility.count({
      where: {
        id: { in: facilityIds },
        propertyId: session!.user.propertyId,
        deletedAt: null,
      },
    });
    if (count !== facilityIds.length) {
      return NextResponse.json(
        { error: "One or more facilityIds are invalid or do not belong to this property" },
        { status: 422 },
      );
    }
  }

  // ── Conflict detection + booking creation in a SERIALIZABLE transaction ──
  let booking: Awaited<ReturnType<typeof buildBookingResponse>>;
  try {
    booking = await prisma.$transaction(
      async (tx) => {
        if (facilityIds.length > 0) {
          // Lock all BookingFacility rows that overlap our window for these facilities.
          // Using raw SQL for FOR UPDATE is the Prisma-idiomatic way.
          const conflicts = await tx.$queryRaw<{ id: string }[]>`
            SELECT bf.id
            FROM "BookingFacility" bf
            JOIN "Booking" b ON b.id = bf."bookingId"
            WHERE bf."facilityId" = ANY(${facilityIds}::text[])
              AND b."propertyId" = ${session!.user.propertyId}
              AND b."deletedAt" IS NULL
              AND b."status" NOT IN ('CANCELLED', 'COMPLETED')
              AND b."checkIn" < ${checkOut}
              AND b."checkOut" > ${checkIn}
            FOR UPDATE
          `;

          if (conflicts.length > 0) {
            throw new ConflictError(
              "One or more selected facilities are already booked for the requested time window",
            );
          }
        }

        // Create the booking
        const newBooking = await tx.booking.create({
          data: {
            propertyId: session!.user.propertyId,
            guestName,
            guestEmail,
            checkIn,
            checkOut,
            type,
            status: status ?? "PENDING",
            totalPrice,
            notes,
            ...(facilityIds.length > 0
              ? {
                  bookingFacilities: {
                    create: facilityIds.map((fid) => ({ facilityId: fid })),
                  },
                }
              : {}),
          },
          include: {
            bookingFacilities: {
              include: {
                facility: { select: { id: true, name: true, type: true } },
              },
            },
          },
        });

        return newBooking;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  // ── Send confirmation email if booking is immediately confirmed ───────────
  if (booking.status === "CONFIRMED" && booking.guestEmail) {
    const propertyName = ""; // We avoid an extra DB round-trip; email helper handles empty name gracefully
    await sendBookingConfirmation({
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      bookingId: booking.id,
      propertyName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      facilityNames: booking.bookingFacilities.map((bf) => bf.facility.name),
      totalPrice: Number(booking.totalPrice),
    }).catch((e: unknown) => {
      console.error("[booking] email send failed (non-fatal)", e);
    });
  }

  return NextResponse.json(booking, { status: 201 });
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ParsedBookingBody = {
  facilityIds: string[];
  guestName: string;
  guestEmail?: string;
  checkIn: Date;
  checkOut: Date;
  type: BookingType;
  status?: BookingStatus;
  totalPrice: number;
  notes?: string;
};

const VALID_TYPES: BookingType[] = ["STAY", "CONFERENCE", "EVENT"];
const VALID_STATUSES: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
];

export function parseBookingBody(
  body: unknown,
): { ok: true; data: ParsedBookingBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.guestName !== "string" || b.guestName.trim().length === 0) {
    return { ok: false, error: "guestName is required" };
  }

  if (b.guestEmail !== undefined && b.guestEmail !== null) {
    if (typeof b.guestEmail !== "string" || !b.guestEmail.includes("@")) {
      return { ok: false, error: "guestEmail must be a valid email" };
    }
  }

  if (!b.checkIn || typeof b.checkIn !== "string") {
    return { ok: false, error: "checkIn is required (ISO datetime string)" };
  }
  if (!b.checkOut || typeof b.checkOut !== "string") {
    return { ok: false, error: "checkOut is required (ISO datetime string)" };
  }

  const checkIn = new Date(b.checkIn as string);
  const checkOut = new Date(b.checkOut as string);

  if (isNaN(checkIn.getTime())) {
    return { ok: false, error: "checkIn must be a valid datetime" };
  }
  if (isNaN(checkOut.getTime())) {
    return { ok: false, error: "checkOut must be a valid datetime" };
  }
  if (checkOut <= checkIn) {
    return { ok: false, error: "checkOut must be after checkIn" };
  }

  const type: BookingType = (b.type as BookingType) ?? "STAY";
  if (!VALID_TYPES.includes(type)) {
    return {
      ok: false,
      error: `type must be one of: ${VALID_TYPES.join(", ")}`,
    };
  }

  const status = b.status as BookingStatus | undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return {
      ok: false,
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }

  const totalPrice = Number(b.totalPrice ?? 0);
  if (isNaN(totalPrice) || totalPrice < 0) {
    return { ok: false, error: "totalPrice must be a non-negative number" };
  }

  let facilityIds: string[] = [];
  if (b.facilityIds !== undefined) {
    if (!Array.isArray(b.facilityIds)) {
      return { ok: false, error: "facilityIds must be an array of strings" };
    }
    facilityIds = (b.facilityIds as unknown[]).map(String);
  }

  return {
    ok: true,
    data: {
      facilityIds,
      guestName: (b.guestName as string).trim(),
      guestEmail:
        typeof b.guestEmail === "string" && b.guestEmail.trim().length > 0
          ? b.guestEmail.trim()
          : undefined,
      checkIn,
      checkOut,
      type,
      status,
      totalPrice,
      notes:
        typeof b.notes === "string" && b.notes.trim().length > 0
          ? b.notes.trim()
          : undefined,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Shape returned by booking endpoints (with eager-loaded facilities) */
async function buildBookingResponse(id: string) {
  return prisma.booking.findFirstOrThrow({
    where: { id },
    include: {
      bookingFacilities: {
        include: {
          facility: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });
}
// Exported for use by [id]/route.ts
export { ConflictError, buildBookingResponse };
