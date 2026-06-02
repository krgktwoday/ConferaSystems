/**
 * src/app/api/bookings/[id]/route.ts
 *
 * Single booking endpoints (tenant-scoped):
 *   GET    /api/bookings/:id — fetch a booking
 *   PUT    /api/bookings/:id — update fields / confirm / cancel
 *   DELETE /api/bookings/:id — soft-delete (sets deletedAt)
 *
 * Cross-tenant protection: all lookups include `propertyId` from the session.
 * Cancelled bookings are soft-deleted (retain for audit trail).
 * On status transition to CONFIRMED, sends confirmation email.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/email";
import { parseBookingBody, ConflictError } from "../route";
import type { BookingStatus } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_STATUSES: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
];

// ─── GET /api/bookings/:id ────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const booking = await prisma.booking.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
      deletedAt: null,
    },
    include: {
      bookingFacilities: {
        include: {
          facility: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(booking);
}

// ─── PUT /api/bookings/:id ────────────────────────────────────────────────────

export async function PUT(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;

  // Verify booking belongs to this tenant
  const existing = await prisma.booking.findFirst({
    where: {
      id,
      propertyId: session!.user.propertyId,
      deletedAt: null,
    },
    include: {
      bookingFacilities: { select: { facilityId: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  // ── Status-only quick update ─────────────────────────────────────────────
  if (Object.keys(b).length === 1 && b.status) {
    const newStatus = b.status as BookingStatus;
    if (!VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 422 },
      );
    }

    const previousStatus = existing.status;

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: newStatus },
      include: {
        bookingFacilities: {
          include: {
            facility: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    // Send confirmation email on transition to CONFIRMED
    if (
      newStatus === "CONFIRMED" &&
      previousStatus !== "CONFIRMED" &&
      updated.guestEmail
    ) {
      await sendBookingConfirmation({
        guestName: updated.guestName,
        guestEmail: updated.guestEmail,
        bookingId: updated.id,
        propertyName: "",
        checkIn: updated.checkIn,
        checkOut: updated.checkOut,
        facilityNames: updated.bookingFacilities.map((bf) => bf.facility.name),
        totalPrice: Number(updated.totalPrice),
      }).catch((e: unknown) => {
        console.error("[booking] email send failed (non-fatal)", e);
      });
    }

    return NextResponse.json(updated);
  }

  // ── Full update ──────────────────────────────────────────────────────────
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

  // Validate facilities belong to this property (if changed)
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
        {
          error:
            "One or more facilityIds are invalid or do not belong to this property",
        },
        { status: 422 },
      );
    }
  }

  let updated: Awaited<ReturnType<typeof prisma.booking.update>>;
  try {
    updated = await prisma.$transaction(
      async (tx) => {
        // Check for conflicts (excluding the current booking)
        if (facilityIds.length > 0) {
          const conflicts = await tx.$queryRaw<{ id: string }[]>`
            SELECT bf.id
            FROM "BookingFacility" bf
            JOIN "Booking" b ON b.id = bf."bookingId"
            WHERE bf."facilityId" = ANY(${facilityIds}::text[])
              AND b."id" != ${id}
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

        // Replace facility links
        await tx.bookingFacility.deleteMany({ where: { bookingId: id } });
        if (facilityIds.length > 0) {
          await tx.bookingFacility.createMany({
            data: facilityIds.map((fid) => ({ bookingId: id, facilityId: fid })),
          });
        }

        return tx.booking.update({
          where: { id },
          data: {
            guestName,
            guestEmail,
            checkIn,
            checkOut,
            type,
            status: status ?? existing.status,
            totalPrice,
            notes,
          },
          include: {
            bookingFacilities: {
              include: {
                facility: { select: { id: true, name: true, type: true } },
              },
            },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  // Send confirmation email on transition to CONFIRMED
  if (
    updated.status === "CONFIRMED" &&
    existing.status !== "CONFIRMED" &&
    updated.guestEmail
  ) {
    const fullBooking = await prisma.booking.findFirst({
      where: { id },
      include: {
        bookingFacilities: {
          include: { facility: { select: { name: true } } },
        },
      },
    });
    await sendBookingConfirmation({
      guestName: updated.guestName,
      guestEmail: updated.guestEmail,
      bookingId: updated.id,
      propertyName: "",
      checkIn: updated.checkIn,
      checkOut: updated.checkOut,
      facilityNames: fullBooking?.bookingFacilities.map((bf) => bf.facility.name) ?? [],
      totalPrice: Number(updated.totalPrice),
    }).catch((e: unknown) => {
      console.error("[booking] email send failed (non-fatal)", e);
    });
  }

  return NextResponse.json(updated);
}

// ─── DELETE /api/bookings/:id ─────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;

  const existing = await prisma.booking.findFirst({
    where: {
      id,
      propertyId: session!.user.propertyId,
      deletedAt: null,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Soft-delete: set deletedAt and status = CANCELLED
  await prisma.booking.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: "CANCELLED",
    },
  });

  return new NextResponse(null, { status: 204 });
}
