/**
 * src/app/api/leave-requests/[id]/route.ts
 *
 * Single leave request endpoints:
 *   GET  /api/leave-requests/:id  — fetch one
 *   PUT  /api/leave-requests/:id  — approve or reject (ADMIN only)
 *   DELETE /api/leave-requests/:id — withdraw (own PENDING request only)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { RequestStatus } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/leave-requests/:id ─────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const request = await prisma.leaveRequest.findFirst({
    where: { id, propertyId: session.user.propertyId },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // STAFF can only see their own requests
  if (session.user.role !== "ADMIN") {
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (!staffRecord || request.staffId !== staffRecord.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json(request);
}

// ─── PUT /api/leave-requests/:id ─────────────────────────────────────────────
// ADMIN approves or rejects a pending leave request.

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

  const existing = await prisma.leaveRequest.findFirst({
    where: { id, propertyId: session!.user.propertyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: `Leave request is already ${existing.status.toLowerCase()}` },
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

  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status,
      reviewedBy: session!.user.id,
      reviewedAt: new Date(),
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
  });

  return NextResponse.json(updated);
}

// ─── DELETE /api/leave-requests/:id ──────────────────────────────────────────
// Staff can withdraw their own PENDING request.

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const existing = await prisma.leaveRequest.findFirst({
    where: { id, propertyId: session.user.propertyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // STAFF can only withdraw their own requests
  if (session.user.role !== "ADMIN") {
    const staffRecord = await prisma.staff.findFirst({
      where: { userId: session.user.id, propertyId: session.user.propertyId },
    });
    if (!staffRecord || existing.staffId !== staffRecord.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: "Can only withdraw a PENDING leave request" },
      { status: 422 },
    );
  }

  await prisma.leaveRequest.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
