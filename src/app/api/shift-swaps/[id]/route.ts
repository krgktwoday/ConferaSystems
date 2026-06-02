/**
 * src/app/api/shift-swaps/[id]/route.ts
 *
 * Single shift swap endpoints:
 *   GET  /api/shift-swaps/:id  — fetch one
 *   PUT  /api/shift-swaps/:id  — approve or reject (ADMIN only)
 *
 * On approval the two shifts are atomically re-assigned.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { RequestStatus } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/shift-swaps/:id ─────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const swap = await prisma.shiftSwap.findFirst({
    where: { id, propertyId: session.user.propertyId },
    include: {
      proposer: { select: { id: true, name: true, staffRole: true } },
      targetStaff: { select: { id: true, name: true, staffRole: true } },
      proposerShift: { select: { id: true, startsAt: true, endsAt: true } },
      targetShift: { select: { id: true, startsAt: true, endsAt: true } },
    },
  });

  if (!swap) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // STAFF can only see swaps they're involved in
  if (session.user.role !== "ADMIN") {
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (
      !staffRecord ||
      (swap.proposerId !== staffRecord.id && swap.targetStaffId !== staffRecord.id)
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json(swap);
}

// ─── PUT /api/shift-swaps/:id ─────────────────────────────────────────────────
// ADMIN approves or rejects. On approval, atomically re-assigns the two shifts.

export async function PUT(req: NextRequest, ctx: RouteContext) {
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

  const { id } = await ctx.params;

  const existing = await prisma.shiftSwap.findFirst({
    where: { id, propertyId: session!.user.propertyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: `Shift swap is already ${existing.status.toLowerCase()}` },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const VALID: RequestStatus[] = ["APPROVED", "REJECTED"];
  const status = b.status as RequestStatus | undefined;
  if (!status || !VALID.includes(status)) {
    return NextResponse.json(
      { error: "status must be APPROVED or REJECTED" },
      { status: 422 },
    );
  }

  let updatedSwap: Awaited<ReturnType<typeof prisma.shiftSwap.update>>;

  if (status === "APPROVED") {
    // Atomically re-assign the two shifts and update the swap record
    updatedSwap = await prisma.$transaction(async (tx) => {
      // Re-assign proposer's shift to target staff and vice-versa
      await tx.shift.update({
        where: { id: existing.proposerShiftId },
        data: { staffId: existing.targetStaffId },
      });
      await tx.shift.update({
        where: { id: existing.targetShiftId },
        data: { staffId: existing.proposerId },
      });

      return tx.shiftSwap.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedBy: session!.user.id,
          reviewedAt: new Date(),
        },
      });
    });
  } else {
    updatedSwap = await prisma.shiftSwap.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedBy: session!.user.id,
        reviewedAt: new Date(),
      },
    });
  }

  return NextResponse.json(updatedSwap);
}
