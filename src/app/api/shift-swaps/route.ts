/**
 * src/app/api/shift-swaps/route.ts
 *
 * Shift swap endpoints (tenant-scoped):
 *   GET  /api/shift-swaps  — list swaps relevant to the current user
 *   POST /api/shift-swaps  — propose a swap (STAFF/ADMIN)
 *
 * Sprint 4 (CON-14): staff proposes swapping their shift with another staff
 * member's shift. Manager (ADMIN) approves/rejects via PUT.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET /api/shift-swaps ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  // ADMIN sees all; STAFF sees their own proposed/targeted swaps
  let staffFilter: { proposerId?: string; targetStaffId?: string } | undefined;
  if (session.user.role !== "ADMIN") {
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (!staffRecord) {
      return NextResponse.json([]);
    }
    staffFilter = undefined; // will filter via OR below
    const swaps = await prisma.shiftSwap.findMany({
      where: {
        propertyId: session.user.propertyId,
        OR: [
          { proposerId: staffRecord.id },
          { targetStaffId: staffRecord.id },
        ],
        ...(statusFilter ? { status: statusFilter as "PENDING" | "APPROVED" | "REJECTED" } : {}),
      },
      include: {
        proposer: { select: { id: true, name: true, staffRole: true } },
        targetStaff: { select: { id: true, name: true, staffRole: true } },
        proposerShift: { select: { id: true, startsAt: true, endsAt: true } },
        targetShift: { select: { id: true, startsAt: true, endsAt: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    return NextResponse.json(swaps);
  }

  const swaps = await prisma.shiftSwap.findMany({
    where: {
      propertyId: session.user.propertyId,
      ...(statusFilter ? { status: statusFilter as "PENDING" | "APPROVED" | "REJECTED" } : {}),
    },
    include: {
      proposer: { select: { id: true, name: true, staffRole: true } },
      targetStaff: { select: { id: true, name: true, staffRole: true } },
      proposerShift: { select: { id: true, startsAt: true, endsAt: true } },
      targetShift: { select: { id: true, startsAt: true, endsAt: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json(swaps);
  void staffFilter;
}

// ─── POST /api/shift-swaps ────────────────────────────────────────────────────

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

  // Determine proposerId
  let proposerId: string;
  if (session.user.role === "ADMIN" && typeof b.proposerId === "string" && b.proposerId.trim()) {
    proposerId = b.proposerId.trim();
    const proposer = await prisma.staff.findFirst({
      where: { id: proposerId, propertyId: session.user.propertyId },
    });
    if (!proposer) {
      return NextResponse.json(
        { error: "proposerId not found in this property" },
        { status: 422 },
      );
    }
  } else {
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (!staffRecord) {
      return NextResponse.json(
        { error: "No staff profile found for the current user" },
        { status: 422 },
      );
    }
    proposerId = staffRecord.id;
  }

  // Validate required fields
  const targetStaffId =
    typeof b.targetStaffId === "string" ? b.targetStaffId.trim() : "";
  const proposerShiftId =
    typeof b.proposerShiftId === "string" ? b.proposerShiftId.trim() : "";
  const targetShiftId =
    typeof b.targetShiftId === "string" ? b.targetShiftId.trim() : "";

  if (!targetStaffId) {
    return NextResponse.json({ error: "targetStaffId is required" }, { status: 422 });
  }
  if (!proposerShiftId) {
    return NextResponse.json({ error: "proposerShiftId is required" }, { status: 422 });
  }
  if (!targetShiftId) {
    return NextResponse.json({ error: "targetShiftId is required" }, { status: 422 });
  }
  if (proposerId === targetStaffId) {
    return NextResponse.json(
      { error: "Cannot propose a swap with yourself" },
      { status: 422 },
    );
  }

  // Verify all referenced entities belong to this property
  const [targetStaff, proposerShift, targetShift] = await Promise.all([
    prisma.staff.findFirst({
      where: { id: targetStaffId, propertyId: session.user.propertyId },
    }),
    prisma.shift.findFirst({
      where: {
        id: proposerShiftId,
        staffId: proposerId,
        propertyId: session.user.propertyId,
      },
    }),
    prisma.shift.findFirst({
      where: {
        id: targetShiftId,
        staffId: targetStaffId,
        propertyId: session.user.propertyId,
      },
    }),
  ]);

  if (!targetStaff) {
    return NextResponse.json(
      { error: "targetStaffId not found in this property" },
      { status: 422 },
    );
  }
  if (!proposerShift) {
    return NextResponse.json(
      { error: "proposerShiftId not found or does not belong to the proposer" },
      { status: 422 },
    );
  }
  if (!targetShift) {
    return NextResponse.json(
      { error: "targetShiftId not found or does not belong to the target staff" },
      { status: 422 },
    );
  }

  const swap = await prisma.shiftSwap.create({
    data: {
      propertyId: session.user.propertyId,
      proposerId,
      targetStaffId,
      proposerShiftId,
      targetShiftId,
      status: "PENDING",
    },
    include: {
      proposer: { select: { id: true, name: true, staffRole: true } },
      targetStaff: { select: { id: true, name: true, staffRole: true } },
      proposerShift: { select: { id: true, startsAt: true, endsAt: true } },
      targetShift: { select: { id: true, startsAt: true, endsAt: true } },
    },
  });

  return NextResponse.json(swap, { status: 201 });
}
