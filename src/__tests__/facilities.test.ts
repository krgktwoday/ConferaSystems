/**
 * src/__tests__/facilities.test.ts
 *
 * Tests for the Facility Management module (CON-12).
 *
 * Coverage:
 *  A. parseFacilityBody — input validation
 *  B. GET /api/facilities — list (tenant-scoped, filters soft-deleted)
 *  C. POST /api/facilities — create (ADMIN only)
 *  D. GET /api/facilities/:id — single fetch
 *  E. PUT /api/facilities/:id — full update + status-only quick-action
 *  F. DELETE /api/facilities/:id — soft-delete
 *  G. Cross-tenant isolation — Tenant B cannot read Tenant A facilities
 *
 * All tests run with mocked Prisma (no DB required).
 * Auth is mocked via vi.mock("@/lib/auth").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseFacilityBody } from "@/app/api/facilities/route";
import type { FacilityStatus, FacilityType } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFacility(overrides: Partial<{
  id: string;
  propertyId: string;
  name: string;
  type: FacilityType;
  maxCapacity: number;
  description: string | null;
  equipment: string[];
  cateringZone: string | null;
  status: FacilityStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: "fac-1",
    propertyId: "prop-a",
    name: "Boardroom A",
    type: "CONFERENCE_HALL" as FacilityType,
    maxCapacity: 20,
    description: null,
    equipment: ["projector", "whiteboard"],
    cateringZone: null,
    status: "AVAILABLE" as FacilityStatus,
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// ─── A. parseFacilityBody ─────────────────────────────────────────────────────

describe("parseFacilityBody()", () => {
  it("parses a complete valid body", () => {
    const result = parseFacilityBody({
      name: "Grand Hall",
      type: "EVENT_SPACE",
      maxCapacity: 200,
      description: "Large ballroom",
      equipment: ["PA system", "stage lighting"],
      cateringZone: "Kitchen B",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Grand Hall");
      expect(result.data.type).toBe("EVENT_SPACE");
      expect(result.data.maxCapacity).toBe(200);
      expect(result.data.equipment).toEqual(["PA system", "stage lighting"]);
      expect(result.data.cateringZone).toBe("Kitchen B");
    }
  });

  it("defaults type to ROOM when omitted", () => {
    const result = parseFacilityBody({ name: "Simple Room", maxCapacity: 4 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.type).toBe("ROOM");
  });

  it("defaults equipment to empty array when omitted", () => {
    const result = parseFacilityBody({ name: "Room 101", maxCapacity: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.equipment).toEqual([]);
  });

  it("rejects missing name", () => {
    const result = parseFacilityBody({ maxCapacity: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/name/);
  });

  it("rejects blank name", () => {
    const result = parseFacilityBody({ name: "   ", maxCapacity: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = parseFacilityBody({ name: "X", maxCapacity: 1, type: "PENTHOUSE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/type/);
  });

  it("rejects maxCapacity of 0", () => {
    const result = parseFacilityBody({ name: "X", maxCapacity: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/maxCapacity/);
  });

  it("rejects non-array equipment", () => {
    const result = parseFacilityBody({ name: "X", maxCapacity: 1, equipment: "projector" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/equipment/);
  });

  it("rejects null body", () => {
    const result = parseFacilityBody(null);
    expect(result.ok).toBe(false);
  });

  it("trims name and description whitespace", () => {
    const result = parseFacilityBody({ name: "  Hall  ", maxCapacity: 50, description: "  Desc  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Hall");
      expect(result.data.description).toBe("Desc");
    }
  });
});

// ─── Auth mock setup ──────────────────────────────────────────────────────────
// We need to mock @/lib/auth at the module level for all route tests.

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getServerSession: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { GET as getList, POST as postFacility } from "@/app/api/facilities/route";
import {
  GET as getOne,
  PUT as putFacility,
  DELETE as deleteFacility,
} from "@/app/api/facilities/[id]/route";
import { NextRequest } from "next/server";

// ─── Shared mock session factories ───────────────────────────────────────────

function adminSession(propertyId = "prop-a") {
  return {
    user: { id: "user-1", email: "admin@a.local", propertyId, role: "ADMIN" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

function staffSession(propertyId = "prop-a") {
  return {
    user: { id: "user-2", email: "staff@a.local", propertyId, role: "STAFF" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

// ─── B. GET /api/facilities ───────────────────────────────────────────────────

describe("GET /api/facilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await getList();
    expect(res.status).toBe(401);
  });

  it("returns list of facilities for the tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    const facilities = [makeFacility(), makeFacility({ id: "fac-2", name: "Suite 201" })];
    vi.mocked(prisma.facility.findMany).mockResolvedValueOnce(facilities as never);

    const res = await getList();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].propertyId).toBe("prop-a");
  });

  it("queries only the current tenant's propertyId", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-a") as never);
    vi.mocked(prisma.facility.findMany).mockResolvedValueOnce([] as never);

    await getList();

    expect(prisma.facility.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-a" }),
      }),
    );
  });

  it("filters out soft-deleted records (deletedAt: null)", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.facility.findMany).mockResolvedValueOnce([] as never);

    await getList();

    expect(prisma.facility.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});

// ─── C. POST /api/facilities ──────────────────────────────────────────────────

describe("POST /api/facilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/facilities", {
      method: "POST",
      body: JSON.stringify({ name: "X", maxCapacity: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postFacility(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for STAFF role", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    const req = new NextRequest("http://localhost/api/facilities", {
      method: "POST",
      body: JSON.stringify({ name: "X", maxCapacity: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postFacility(req);
    expect(res.status).toBe(403);
  });

  it("creates a facility and returns 201 for ADMIN", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    const created = makeFacility({ name: "Grand Hall", type: "EVENT_SPACE", maxCapacity: 200 });
    vi.mocked(prisma.facility.create).mockResolvedValueOnce(created as never);

    const req = new NextRequest("http://localhost/api/facilities", {
      method: "POST",
      body: JSON.stringify({
        name: "Grand Hall",
        type: "EVENT_SPACE",
        maxCapacity: 200,
        equipment: ["PA system"],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postFacility(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Grand Hall");
  });

  it("returns 422 for invalid body", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    const req = new NextRequest("http://localhost/api/facilities", {
      method: "POST",
      body: JSON.stringify({ maxCapacity: 10 }), // missing name
      headers: { "Content-Type": "application/json" },
    });
    const res = await postFacility(req);
    expect(res.status).toBe(422);
  });

  it("stamps propertyId from session (not from request body)", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-a") as never);
    const created = makeFacility({ propertyId: "prop-a" });
    vi.mocked(prisma.facility.create).mockResolvedValueOnce(created as never);

    const req = new NextRequest("http://localhost/api/facilities", {
      method: "POST",
      body: JSON.stringify({ name: "Room", maxCapacity: 5, propertyId: "INJECTED" }),
      headers: { "Content-Type": "application/json" },
    });
    await postFacility(req);

    expect(prisma.facility.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ propertyId: "prop-a" }),
      }),
    );
  });
});

// ─── D. GET /api/facilities/:id ───────────────────────────────────────────────

describe("GET /api/facilities/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCtx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("returns 404 when not found", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-999");
    const res = await getOne(req, makeCtx("fac-999"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with facility when found", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    const facility = makeFacility();
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(facility as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-1");
    const res = await getOne(req, makeCtx("fac-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("fac-1");
  });
});

// ─── E. PUT /api/facilities/:id ───────────────────────────────────────────────

describe("PUT /api/facilities/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCtx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("updates a facility with full body", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    const existing = makeFacility();
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(existing as never);
    const updated = makeFacility({ name: "Boardroom B", maxCapacity: 30 });
    vi.mocked(prisma.facility.update).mockResolvedValueOnce(updated as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Boardroom B", type: "CONFERENCE_HALL", maxCapacity: 30 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(200);
  });

  it("handles status-only quick-action update", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(makeFacility() as never);
    vi.mocked(prisma.facility.update).mockResolvedValueOnce(
      makeFacility({ status: "IN_USE" }) as never,
    );

    const req = new NextRequest("http://localhost/api/facilities/fac-1", {
      method: "PUT",
      body: JSON.stringify({ status: "IN_USE" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("IN_USE");
  });

  it("returns 403 for STAFF", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    const req = new NextRequest("http://localhost/api/facilities/fac-1", {
      method: "PUT",
      body: JSON.stringify({ status: "IN_USE" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when facility not in tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-1", {
      method: "PUT",
      body: JSON.stringify({ status: "IN_USE" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(404);
  });
});

// ─── F. DELETE /api/facilities/:id ───────────────────────────────────────────

describe("DELETE /api/facilities/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCtx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("soft-deletes and returns 204", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(makeFacility() as never);
    vi.mocked(prisma.facility.update).mockResolvedValueOnce(
      makeFacility({ deletedAt: new Date() }) as never,
    );

    const req = new NextRequest("http://localhost/api/facilities/fac-1", {
      method: "DELETE",
    });
    const res = await deleteFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(204);

    // Verify it's a soft-delete (update with deletedAt), not a hard delete
    expect(prisma.facility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it("returns 403 for STAFF", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    const req = new NextRequest("http://localhost/api/facilities/fac-1", { method: "DELETE" });
    const res = await deleteFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when facility not found for tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-999", { method: "DELETE" });
    const res = await deleteFacility(req, makeCtx("fac-999"));
    expect(res.status).toBe(404);
  });
});

// ─── G. Cross-tenant isolation ────────────────────────────────────────────────

describe("Cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCtx(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it("Tenant B cannot read Tenant A's facility (GET list)", async () => {
    // Tenant B session
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    vi.mocked(prisma.facility.findMany).mockResolvedValueOnce([] as never);

    await getList();

    // Must query with prop-b, not prop-a
    expect(prisma.facility.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-b" }),
      }),
    );
  });

  it("Tenant B cannot read Tenant A's facility by ID (GET single)", async () => {
    // Tenant B session tries to fetch prop-a facility
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    // findFirst returns null because the query includes propertyId: "prop-b"
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-1");
    const res = await getOne(req, makeCtx("fac-1"));
    expect(res.status).toBe(404);

    // Confirm the query scoped to prop-b
    expect(prisma.facility.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-b" }),
      }),
    );
  });

  it("Tenant B cannot delete Tenant A's facility", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-1", { method: "DELETE" });
    const res = await deleteFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(404);
    expect(prisma.facility.update).not.toHaveBeenCalled();
  });

  it("Tenant B cannot update Tenant A's facility", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/facilities/fac-1", {
      method: "PUT",
      body: JSON.stringify({ status: "MAINTENANCE" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putFacility(req, makeCtx("fac-1"));
    expect(res.status).toBe(404);
    expect(prisma.facility.update).not.toHaveBeenCalled();
  });
});
