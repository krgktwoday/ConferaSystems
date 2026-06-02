/**
 * src/app/api/facilities/route.ts
 *
 * Facility collection endpoints (tenant-scoped):
 *   GET  /api/facilities         — list all non-deleted facilities for the session's property
 *   POST /api/facilities         — create a new facility
 *
 * All routes require an authenticated session. Create/delete require ADMIN role.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { FacilityType, FacilityStatus } from "@prisma/client";

// ─── GET /api/facilities ──────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const facilities = await prisma.facility.findMany({
    where: {
      propertyId: session.user.propertyId,
      deletedAt: null,
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(facilities);
}

// ─── POST /api/facilities ─────────────────────────────────────────────────────

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

  const parsed = parseFacilityBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  const { name, type, maxCapacity, description, equipment, cateringZone } =
    parsed.data;

  const facility = await prisma.facility.create({
    data: {
      propertyId: session!.user.propertyId,
      name,
      type,
      maxCapacity,
      description,
      equipment,
      cateringZone,
      status: "AVAILABLE",
    },
  });

  return NextResponse.json(facility, { status: 201 });
}

// ─── Shared validation ────────────────────────────────────────────────────────

type ParsedBody = {
  name: string;
  type: FacilityType;
  maxCapacity: number;
  description?: string;
  equipment: string[];
  cateringZone?: string;
  status?: FacilityStatus;
};

const VALID_TYPES: FacilityType[] = [
  "ROOM",
  "CONFERENCE_HALL",
  "EVENT_SPACE",
  "OUTDOOR",
];
const VALID_STATUSES: FacilityStatus[] = ["AVAILABLE", "IN_USE", "MAINTENANCE"];

export function parseFacilityBody(
  body: unknown,
): { ok: true; data: ParsedBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string" || b.name.trim().length === 0) {
    return { ok: false, error: "name is required" };
  }

  const type: FacilityType = (b.type as FacilityType) ?? "ROOM";
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, error: `type must be one of: ${VALID_TYPES.join(", ")}` };
  }

  const maxCapacity = Number(b.maxCapacity ?? 1);
  if (!Number.isInteger(maxCapacity) || maxCapacity < 1) {
    return { ok: false, error: "maxCapacity must be a positive integer" };
  }

  let equipment: string[] = [];
  if (b.equipment !== undefined) {
    if (!Array.isArray(b.equipment)) {
      return { ok: false, error: "equipment must be an array of strings" };
    }
    equipment = (b.equipment as unknown[]).map(String);
  }

  const status = b.status as FacilityStatus | undefined;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return {
      ok: false,
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }

  return {
    ok: true,
    data: {
      name: b.name.trim(),
      type,
      maxCapacity,
      description:
        typeof b.description === "string" && b.description.trim().length > 0
          ? b.description.trim()
          : undefined,
      equipment,
      cateringZone:
        typeof b.cateringZone === "string" && b.cateringZone.trim().length > 0
          ? b.cateringZone.trim()
          : undefined,
      status,
    },
  };
}
