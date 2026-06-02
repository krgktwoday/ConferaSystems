/**
 * src/app/api/staff/[id]/route.ts
 *
 * Single staff profile endpoints (tenant-scoped):
 *   GET    /api/staff/:id  — fetch one staff profile
 *   PUT    /api/staff/:id  — update (ADMIN only)
 *   DELETE /api/staff/:id  — hard-delete (ADMIN only) — soft-delete not required for staff
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { parseStaffBody } from "../route";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/staff/:id ───────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const staff = await prisma.staff.findFirst({
    where: { id, propertyId: session.user.propertyId },
  });

  if (!staff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(staff);
}

// ─── PUT /api/staff/:id ───────────────────────────────────────────────────────

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

  const existing = await prisma.staff.findFirst({
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

  // Allow partial updates — merge with existing data before validation
  const merged = {
    userId: existing.userId,
    name: existing.name,
    email: existing.email,
    staffRole: existing.staffRole,
    contractedHours: existing.contractedHours,
    ...(body as object),
  };

  const parsed = parseStaffBody(merged);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const updated = await prisma.staff.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      staffRole: parsed.data.staffRole,
      contractedHours: parsed.data.contractedHours,
    },
  });

  return NextResponse.json(updated);
}

// ─── DELETE /api/staff/:id ────────────────────────────────────────────────────

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

  const existing = await prisma.staff.findFirst({
    where: { id, propertyId: session!.user.propertyId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.staff.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
