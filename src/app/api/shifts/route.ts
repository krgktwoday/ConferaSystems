/**
 * src/app/api/shifts/route.ts
 *
 * Shift collection endpoints (tenant-scoped):
 *   GET  /api/shifts   — list shifts (with optional filters: staffId, week, status)
 *   POST /api/shifts   — create a new shift (ADMIN only)
 *
 * Sprint 4 (CON-14): shifts carry staffId, facilityId (optional), startsAt,
 * endsAt, notes, and status (SCHEDULED | COMPLETED | CANCELLED).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { ShiftStatus } from "@prisma/client";

// ─── GET /api/shifts ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId");
  const statusFilter = searchParams.get("status") as ShiftStatus | null;
  const from = searchParams.get("from"); // ISO datetime
  const to = searchParams.get("to");     // ISO datetime

  const shifts = await prisma.shift.findMany({
    where: {
      propertyId: session.user.propertyId,
      ...(staffId ? { staffId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(from || to
        ? {
            AND: [
              ...(from ? [{ startsAt: { gte: new Date(from) } }] : []),
              ...(to ? [{ endsAt: { lte: new Date(to) } }] : []),
            ],
          }
        : {}),
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
    orderBy: [{ startsAt: "asc" }],
  });

  return NextResponse.json(shifts);
}

// ─── POST /api/shifts ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  try {
    requireRole(session, "ADMIN");
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

  const parsed = parseShiftBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const { staffId, facilityId, startsAt, endsAt, notes, status } = parsed.data;

  // Verify staff belongs to this property
  const staffMember = await prisma.staff.findFirst({
    where: { id: staffId, propertyId: session!.user.propertyId },
  });
  if (!staffMember) {
    return NextResponse.json(
      { error: "staffId not found in this property" },
      { status: 422 },
    );
  }

  // Verify facilityId if provided
  if (facilityId) {
    const facility = await prisma.facility.findFirst({
      where: { id: facilityId, propertyId: session!.user.propertyId, deletedAt: null },
    });
    if (!facility) {
      return NextResponse.json(
        { error: "facilityId not found in this property" },
        { status: 422 },
      );
    }
  }

  const shift = await prisma.shift.create({
    data: {
      propertyId: session!.user.propertyId,
      staffId,
      facilityId: facilityId ?? null,
      startsAt,
      endsAt,
      status: status ?? "SCHEDULED",
      notes: notes ?? null,
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
  });

  return NextResponse.json(shift, { status: 201 });
}

// ─── Shared validation ────────────────────────────────────────────────────────

export type ParsedShiftBody = {
  staffId: string;
  facilityId?: string;
  startsAt: Date;
  endsAt: Date;
  status?: ShiftStatus;
  notes?: string;
};

const VALID_STATUSES: ShiftStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];

export function parseShiftBody(
  body: unknown,
): { ok: true; data: ParsedShiftBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.staffId !== "string" || b.staffId.trim().length === 0) {
    return { ok: false, error: "staffId is required" };
  }

  if (!b.startsAt || typeof b.startsAt !== "string") {
    return { ok: false, error: "startsAt is required (ISO datetime string)" };
  }
  if (!b.endsAt || typeof b.endsAt !== "string") {
    return { ok: false, error: "endsAt is required (ISO datetime string)" };
  }

  const startsAt = new Date(b.startsAt as string);
  const endsAt = new Date(b.endsAt as string);

  if (isNaN(startsAt.getTime())) {
    return { ok: false, error: "startsAt must be a valid datetime" };
  }
  if (isNaN(endsAt.getTime())) {
    return { ok: false, error: "endsAt must be a valid datetime" };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "endsAt must be after startsAt" };
  }

  const status = b.status as ShiftStatus | undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return {
      ok: false,
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }

  return {
    ok: true,
    data: {
      staffId: b.staffId.trim(),
      facilityId:
        typeof b.facilityId === "string" && b.facilityId.trim().length > 0
          ? b.facilityId.trim()
          : undefined,
      startsAt,
      endsAt,
      status,
      notes:
        typeof b.notes === "string" && b.notes.trim().length > 0
          ? b.notes.trim()
          : undefined,
    },
  };
}
