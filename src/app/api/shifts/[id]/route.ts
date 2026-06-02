/**
 * src/app/api/shifts/[id]/route.ts
 *
 * Single shift endpoints (tenant-scoped):
 *   GET    /api/shifts/:id  — fetch one shift
 *   PUT    /api/shifts/:id  — update (ADMIN only)
 *   DELETE /api/shifts/:id  — delete (ADMIN only)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { ShiftStatus } from "@prisma/client";
import { parseShiftBody } from "../route";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_STATUSES: ShiftStatus[] = ["SCHEDULED", "COMPLETED", "CANCELLED"];

// ─── GET /api/shifts/:id ──────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const shift = await prisma.shift.findFirst({
    where: { id, propertyId: session.user.propertyId },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
  });

  if (!shift) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(shift);
}

// ─── PUT /api/shifts/:id ──────────────────────────────────────────────────────

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

  const existing = await prisma.shift.findFirst({
    where: { id, propertyId: session!.user.propertyId },
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

  // Allow status-only update (quick action)
  if (
    typeof body === "object" &&
    body !== null &&
    "status" in (body as object) &&
    Object.keys(body as object).length === 1
  ) {
    const status = (body as Record<string, unknown>).status as ShiftStatus;
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 422 },
      );
    }
    const updated = await prisma.shift.update({
      where: { id },
      data: { status },
      include: {
        staff: {
          select: { id: true, name: true, email: true, staffRole: true },
        },
      },
    });
    return NextResponse.json(updated);
  }

  // Full / partial update — merge with existing
  const merged = {
    staffId: existing.staffId,
    startsAt: existing.startsAt.toISOString(),
    endsAt: existing.endsAt.toISOString(),
    facilityId: existing.facilityId ?? undefined,
    status: existing.status,
    notes: existing.notes ?? undefined,
    ...(body as object),
  };

  const parsed = parseShiftBody(merged);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const updated = await prisma.shift.update({
    where: { id },
    data: {
      staffId: parsed.data.staffId,
      facilityId: parsed.data.facilityId ?? null,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      status: parsed.data.status ?? existing.status,
      notes: parsed.data.notes ?? null,
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
  });

  return NextResponse.json(updated);
}

// ─── DELETE /api/shifts/:id ───────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
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

  const existing = await prisma.shift.findFirst({
    where: { id, propertyId: session!.user.propertyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.shift.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
