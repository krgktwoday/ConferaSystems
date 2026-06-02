/**
 * src/app/api/leave-requests/route.ts
 *
 * Leave request endpoints (tenant-scoped):
 *   GET  /api/leave-requests  — list leave requests (ADMIN: all; STAFF: own)
 *   POST /api/leave-requests  — submit a leave request (STAFF / ADMIN)
 *
 * Sprint 4 (CON-14): staff submits leave; ADMIN approves/rejects via PUT.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RequestStatus } from "@prisma/client";

// ─── GET /api/leave-requests ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") as RequestStatus | null;

  // STAFF can only see their own requests; ADMIN can see all
  let staffIdFilter: string | undefined;
  if (session.user.role !== "ADMIN") {
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (!staffRecord) {
      // Staff user with no staff profile — return empty list
      return NextResponse.json([]);
    }
    staffIdFilter = staffRecord.id;
  }

  const requests = await prisma.leaveRequest.findMany({
    where: {
      propertyId: session.user.propertyId,
      ...(staffIdFilter ? { staffId: staffIdFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(requests);
}

// ─── POST /api/leave-requests ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  // Determine staffId: ADMIN can specify any staffId; STAFF uses their own
  let staffId: string;
  if (session.user.role === "ADMIN" && typeof b.staffId === "string" && b.staffId.trim()) {
    staffId = b.staffId.trim();
    // Verify staffId belongs to this property
    const staffRecord = await prisma.staff.findFirst({
      where: { id: staffId, propertyId: session.user.propertyId },
    });
    if (!staffRecord) {
      return NextResponse.json(
        { error: "staffId not found in this property" },
        { status: 422 },
      );
    }
  } else {
    // Look up by userId
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (!staffRecord) {
      return NextResponse.json(
        { error: "No staff profile found for the current user" },
        { status: 422 },
      );
    }
    staffId = staffRecord.id;
  }

  const parsed = parseLeaveRequestBody({ ...b, staffId });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      propertyId: session.user.propertyId,
      staffId: parsed.data.staffId,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      reason: parsed.data.reason ?? null,
      status: "PENDING",
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
  });

  return NextResponse.json(leaveRequest, { status: 201 });
}

// ─── Shared validation ────────────────────────────────────────────────────────

export type ParsedLeaveRequestBody = {
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  reason?: string;
};

export function parseLeaveRequestBody(
  body: unknown,
): { ok: true; data: ParsedLeaveRequestBody } | { ok: false; error: string } {
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

  return {
    ok: true,
    data: {
      staffId: b.staffId.trim(),
      startsAt,
      endsAt,
      reason:
        typeof b.reason === "string" && b.reason.trim().length > 0
          ? b.reason.trim()
          : undefined,
    },
  };
}
