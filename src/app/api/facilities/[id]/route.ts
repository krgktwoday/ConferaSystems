/**
 * src/app/api/facilities/[id]/route.ts
 *
 * Single facility endpoints (tenant-scoped):
 *   GET    /api/facilities/:id  — fetch one facility
 *   PUT    /api/facilities/:id  — update (full or partial) — ADMIN only
 *   DELETE /api/facilities/:id  — soft-delete             — ADMIN only
 *
 * All routes return 404 if the facility doesn't exist OR belongs to a
 * different property (prevents cross-tenant enumeration).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { FacilityStatus } from "@prisma/client";
import { parseFacilityBody } from "../route";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/facilities/:id ──────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const facility = await prisma.facility.findFirst({
    where: { id, propertyId: session.user.propertyId, deletedAt: null },
  });

  if (!facility) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(facility);
}

// ─── PUT /api/facilities/:id ──────────────────────────────────────────────────

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

  // Verify ownership before attempting update
  const existing = await prisma.facility.findFirst({
    where: { id, propertyId: session!.user.propertyId, deletedAt: null },
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

  // For status-only updates (quick-action from list view), allow a shortcut
  if (
    typeof body === "object" &&
    body !== null &&
    "status" in (body as object) &&
    Object.keys(body as object).length === 1
  ) {
    const status = (body as Record<string, unknown>).status as FacilityStatus;
    const VALID: FacilityStatus[] = ["AVAILABLE", "IN_USE", "MAINTENANCE"];
    if (!VALID.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID.join(", ")}` },
        { status: 422 },
      );
    }
    const updated = await prisma.facility.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(updated);
  }

  // Full / partial update
  const parsed = parseFacilityBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const updated = await prisma.facility.update({
    where: { id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      maxCapacity: parsed.data.maxCapacity,
      description: parsed.data.description,
      equipment: parsed.data.equipment,
      cateringZone: parsed.data.cateringZone,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });

  return NextResponse.json(updated);
}

// ─── DELETE /api/facilities/:id ───────────────────────────────────────────────

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

  // Verify ownership before soft-delete
  const existing = await prisma.facility.findFirst({
    where: { id, propertyId: session!.user.propertyId, deletedAt: null },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.facility.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return new NextResponse(null, { status: 204 });
}
