/**
 * src/app/api/staff/route.ts
 *
 * Staff collection endpoints (tenant-scoped):
 *   GET  /api/staff   — list all staff profiles for the session's property
 *   POST /api/staff   — create a new staff profile (ADMIN only)
 *
 * Sprint 4 (CON-14): Staff profiles include name, email, staffRole, and
 * contractedHours. Each staff record is linked to a User (for portal auth).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { StaffRole } from "@prisma/client";

// ─── GET /api/staff ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const roleFilter = searchParams.get("role") as StaffRole | null;

  const staff = await prisma.staff.findMany({
    where: {
      propertyId: session.user.propertyId,
      ...(roleFilter ? { staffRole: roleFilter } : {}),
    },
    orderBy: [{ staffRole: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(staff);
}

// ─── POST /api/staff ──────────────────────────────────────────────────────────

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

  const parsed = parseStaffBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const { userId, name, email, staffRole, contractedHours } = parsed.data;

  // Verify the userId belongs to this property
  const user = await prisma.user.findFirst({
    where: { id: userId, propertyId: session!.user.propertyId },
  });
  if (!user) {
    return NextResponse.json(
      { error: "userId not found in this property" },
      { status: 422 },
    );
  }

  // Prevent duplicate staff profiles for the same user
  const existing = await prisma.staff.findFirst({
    where: { userId, propertyId: session!.user.propertyId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A staff profile already exists for this user" },
      { status: 409 },
    );
  }

  const staff = await prisma.staff.create({
    data: {
      propertyId: session!.user.propertyId,
      userId,
      name,
      email,
      staffRole,
      contractedHours,
    },
  });

  return NextResponse.json(staff, { status: 201 });
}

// ─── Shared validation ────────────────────────────────────────────────────────

export type ParsedStaffBody = {
  userId: string;
  name: string;
  email: string;
  staffRole: StaffRole;
  contractedHours: number;
};

const VALID_ROLES: StaffRole[] = [
  "WAITER",
  "RECEPTIONIST",
  "CLEANING",
  "MANAGER",
  "KITCHEN",
];

export function parseStaffBody(
  body: unknown,
): { ok: true; data: ParsedStaffBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.userId !== "string" || b.userId.trim().length === 0) {
    return { ok: false, error: "userId is required" };
  }

  if (typeof b.name !== "string" || b.name.trim().length === 0) {
    return { ok: false, error: "name is required" };
  }

  if (
    typeof b.email !== "string" ||
    b.email.trim().length === 0 ||
    !b.email.includes("@")
  ) {
    return { ok: false, error: "email must be a valid email address" };
  }

  const staffRole: StaffRole = (b.staffRole as StaffRole) ?? "WAITER";
  if (!VALID_ROLES.includes(staffRole)) {
    return {
      ok: false,
      error: `staffRole must be one of: ${VALID_ROLES.join(", ")}`,
    };
  }

  const contractedHours = Number(b.contractedHours ?? 40);
  if (!Number.isInteger(contractedHours) || contractedHours < 1 || contractedHours > 168) {
    return {
      ok: false,
      error: "contractedHours must be an integer between 1 and 168",
    };
  }

  return {
    ok: true,
    data: {
      userId: b.userId.trim(),
      name: b.name.trim(),
      email: b.email.trim().toLowerCase(),
      staffRole,
      contractedHours,
    },
  };
}
