/**
 * src/__tests__/bookings.test.ts
 *
 * Tests for the Booking Engine module (CON-13).
 *
 * Coverage:
 *  A. parseBookingBody — input validation
 *  B. GET /api/bookings — list (tenant-scoped, optional filters)
 *  C. POST /api/bookings — create with conflict detection
 *  D. GET /api/bookings/:id — single fetch
 *  E. PUT /api/bookings/:id — status-only update + full update
 *  F. DELETE /api/bookings/:id — soft-delete (CANCELLED)
 *  G. GET /api/bookings/:id/invoice-data — aggregated line items
 *  H. Cross-tenant isolation
 *  I. Conflict detection — overlapping booking rejected with 409
 *
 * All tests run with mocked Prisma (no DB required).
 * Auth is mocked via vi.mock("@/lib/auth").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseBookingBody } from "@/app/api/bookings/route";
import type { BookingStatus, BookingType, FacilityType } from "@prisma/client";

// ─── Auth mock setup ──────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getServerSession: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { GET as getList, POST as postBooking } from "@/app/api/bookings/route";
import {
  GET as getOne,
  PUT as putBooking,
  DELETE as deleteBooking,
} from "@/app/api/bookings/[id]/route";
import { GET as getInvoiceData } from "@/app/api/bookings/[id]/invoice-data/route";
import { NextRequest } from "next/server";

// ─── Session factories ────────────────────────────────────────────────────────

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

// ─── Data factories ────────────────────────────────────────────────────────────

const CI = new Date("2026-07-01T14:00:00Z");
const CO = new Date("2026-07-03T10:00:00Z");

function makeBooking(
  overrides: Partial<{
    id: string;
    propertyId: string;
    roomId: string | null;
    guestName: string;
    guestEmail: string | null;
    checkIn: Date;
    checkOut: Date;
    type: BookingType;
    status: BookingStatus;
    // Accept either a number or a Decimal-like for flexibility
    totalPrice: number | { toNumber: () => number };
    notes: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    bookingFacilities: {
      facilityId: string;
      facility: { id: string; name: string; type: FacilityType };
    }[];
    invoices: unknown[];
  }> = {},
) {
  return {
    id: "bk-1",
    propertyId: "prop-a",
    roomId: null,
    guestName: "Alice Smith",
    guestEmail: "alice@example.com",
    checkIn: CI,
    checkOut: CO,
    type: "STAY" as BookingType,
    status: "PENDING" as BookingStatus,
    // Use a plain number — Number(200) === 200, works fine
    totalPrice: 200 as number,
    notes: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    bookingFacilities: [
      {
        facilityId: "fac-1",
        facility: { id: "fac-1", name: "Boardroom A", type: "CONFERENCE_HALL" as FacilityType },
      },
    ],
    invoices: [],
    ...overrides,
  };
}

function makeRouteCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── A. parseBookingBody ──────────────────────────────────────────────────────

describe("parseBookingBody()", () => {
  it("parses a complete valid body", () => {
    const result = parseBookingBody({
      facilityIds: ["fac-1", "fac-2"],
      guestName: "Bob",
      guestEmail: "bob@example.com",
      checkIn: CI.toISOString(),
      checkOut: CO.toISOString(),
      type: "CONFERENCE",
      status: "PENDING",
      totalPrice: 500,
      notes: "Vegetarian meal required",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.guestName).toBe("Bob");
      expect(result.data.facilityIds).toEqual(["fac-1", "fac-2"]);
      expect(result.data.type).toBe("CONFERENCE");
      expect(result.data.totalPrice).toBe(500);
    }
  });

  it("defaults type to STAY and facilityIds to [] when omitted", () => {
    const result = parseBookingBody({
      guestName: "Carol",
      checkIn: CI.toISOString(),
      checkOut: CO.toISOString(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.type).toBe("STAY");
      expect(result.data.facilityIds).toEqual([]);
    }
  });

  it("rejects missing guestName", () => {
    const result = parseBookingBody({
      checkIn: CI.toISOString(),
      checkOut: CO.toISOString(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/guestName/);
  });

  it("rejects missing checkIn", () => {
    const result = parseBookingBody({ guestName: "Dan", checkOut: CO.toISOString() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/checkIn/);
  });

  it("rejects checkOut <= checkIn", () => {
    const result = parseBookingBody({
      guestName: "Eve",
      checkIn: CO.toISOString(),
      checkOut: CI.toISOString(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/after/);
  });

  it("rejects invalid type", () => {
    const result = parseBookingBody({
      guestName: "Frank",
      checkIn: CI.toISOString(),
      checkOut: CO.toISOString(),
      type: "UNKNOWN",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects negative totalPrice", () => {
    const result = parseBookingBody({
      guestName: "Grace",
      checkIn: CI.toISOString(),
      checkOut: CO.toISOString(),
      totalPrice: -10,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/totalPrice/);
  });

  it("accepts totalPrice = 0", () => {
    const result = parseBookingBody({
      guestName: "Hank",
      checkIn: CI.toISOString(),
      checkOut: CO.toISOString(),
      totalPrice: 0,
    });
    expect(result.ok).toBe(true);
  });
});

// ─── B. GET /api/bookings ─────────────────────────────────────────────────────

describe("GET /api/bookings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings");
    const res = await getList(req);
    expect(res.status).toBe(401);
  });

  it("returns bookings filtered to tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    const bookings = [makeBooking()];
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce(bookings as never);

    const req = new NextRequest("http://localhost/api/bookings");
    const res = await getList(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);

    // Verify tenant scoping
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-a" }),
      }),
    );
  });

  it("passes facilityId filter through", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([] as never);

    const req = new NextRequest(
      "http://localhost/api/bookings?facilityId=fac-99",
    );
    await getList(req);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingFacilities: { some: { facilityId: "fac-99" } },
        }),
      }),
    );
  });
});

// ─── C. POST /api/bookings ────────────────────────────────────────────────────

describe("POST /api/bookings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({ guestName: "Iris", checkIn: CI.toISOString(), checkOut: CO.toISOString() }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBooking(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u-3", email: "v@a.local", propertyId: "prop-a", role: "VIEWER" },
      expires: "",
    } as never);
    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({ guestName: "Iris", checkIn: CI.toISOString(), checkOut: CO.toISOString() }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBooking(req);
    expect(res.status).toBe(403);
  });

  it("creates a booking (no facilities)", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);

    const created = makeBooking({ bookingFacilities: [] });
    // For bookings with no facilityIds, there's no $queryRaw conflict check
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (cb: unknown) => {
        if (typeof cb !== "function") return;
        const mockTx = {
          ...prisma,
          $queryRaw: vi.fn().mockResolvedValue([]),
          booking: {
            ...prisma.booking,
            create: vi.fn().mockResolvedValue(created),
          },
        };
        return cb(mockTx);
      },
    );

    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        guestName: "Jack",
        checkIn: CI.toISOString(),
        checkOut: CO.toISOString(),
        totalPrice: 100,
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBooking(req);
    expect(res.status).toBe(201);
  });

  it("returns 422 for invalid body", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({ guestName: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBooking(req);
    expect(res.status).toBe(422);
  });
});

// ─── D. GET /api/bookings/:id ─────────────────────────────────────────────────

describe("GET /api/bookings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-1");
    const res = await getOne(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when booking not in tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-999");
    const res = await getOne(req, makeRouteCtx("bk-999"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with booking when found", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(makeBooking() as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-1");
    const res = await getOne(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("bk-1");
  });
});

// ─── E. PUT /api/bookings/:id ─────────────────────────────────────────────────

describe("PUT /api/bookings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "PUT",
      body: JSON.stringify({ status: "CONFIRMED" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(401);
  });

  it("status-only update: PENDING → CONFIRMED", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(makeBooking() as never);
    const confirmed = makeBooking({ status: "CONFIRMED" });
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(confirmed as never);

    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "PUT",
      body: JSON.stringify({ status: "CONFIRMED" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("CONFIRMED");
  });

  it("returns 422 for unknown status", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(makeBooking() as never);

    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "PUT",
      body: JSON.stringify({ status: "UNKNOWN_STATUS" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(422);
  });

  it("returns 404 when booking not found for tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/bookings/bk-999", {
      method: "PUT",
      body: JSON.stringify({ status: "CONFIRMED" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putBooking(req, makeRouteCtx("bk-999"));
    expect(res.status).toBe(404);
  });

  it("returns 403 for VIEWER", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u-3", email: "v@a.local", propertyId: "prop-a", role: "VIEWER" },
      expires: "",
    } as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "PUT",
      body: JSON.stringify({ status: "CONFIRMED" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await putBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(403);
  });
});

// ─── F. DELETE /api/bookings/:id ──────────────────────────────────────────────

describe("DELETE /api/bookings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes and returns 204", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(makeBooking() as never);
    vi.mocked(prisma.booking.update).mockResolvedValueOnce(
      makeBooking({ deletedAt: new Date(), status: "CANCELLED" }) as never,
    );

    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "DELETE",
    });
    const res = await deleteBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(204);

    // Verify soft-delete pattern
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          status: "CANCELLED",
        }),
      }),
    );
  });

  it("returns 404 when booking not found for tenant", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-999", {
      method: "DELETE",
    });
    const res = await deleteBooking(req, makeRouteCtx("bk-999"));
    expect(res.status).toBe(404);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("returns 403 for VIEWER", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u-3", email: "v@a.local", propertyId: "prop-a", role: "VIEWER" },
      expires: "",
    } as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "DELETE",
    });
    const res = await deleteBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(403);
  });
});

// ─── G. GET /api/bookings/:id/invoice-data ────────────────────────────────────

describe("GET /api/bookings/:id/invoice-data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-1/invoice-data");
    const res = await getInvoiceData(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when booking not found", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null as never);
    const req = new NextRequest("http://localhost/api/bookings/bk-999/invoice-data");
    const res = await getInvoiceData(req, makeRouteCtx("bk-999"));
    expect(res.status).toBe(404);
  });

  it("returns aggregated invoice data with line items", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(
      makeBooking({ totalPrice: 400 }) as never,
    );

    const req = new NextRequest("http://localhost/api/bookings/bk-1/invoice-data");
    const res = await getInvoiceData(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.bookingId).toBe("bk-1");
    expect(data.guestName).toBe("Alice Smith");
    expect(data.total).toBe(400);
    expect(data.lineItems).toHaveLength(1);
    expect(data.lineItems[0].amount).toBe(400);
    expect(data.nights).toBeGreaterThan(0);
  });

  it("splits line items evenly across multiple facilities", async () => {
    const multiBooking = makeBooking({
      totalPrice: 300,
      bookingFacilities: [
        { facilityId: "fac-1", facility: { id: "fac-1", name: "Room A", type: "ROOM" as FacilityType } },
        { facilityId: "fac-2", facility: { id: "fac-2", name: "Room B", type: "ROOM" as FacilityType } },
        { facilityId: "fac-3", facility: { id: "fac-3", name: "Conf C", type: "CONFERENCE_HALL" as FacilityType } },
      ],
    });
    vi.mocked(auth).mockResolvedValueOnce(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(multiBooking as never);

    const req = new NextRequest("http://localhost/api/bookings/bk-1/invoice-data");
    const res = await getInvoiceData(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.lineItems).toHaveLength(3);
    // Sum must equal total
    const sum = data.lineItems.reduce(
      (acc: number, li: { amount: number }) => acc + li.amount,
      0,
    );
    expect(sum).toBeCloseTo(300, 2);
    expect(data.total).toBe(300);
  });
});

// ─── H. Cross-tenant isolation ────────────────────────────────────────────────

describe("Cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Tenant B GET /api/bookings sees only prop-b bookings", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([] as never);

    const req = new NextRequest("http://localhost/api/bookings");
    await getList(req);

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-b" }),
      }),
    );
  });

  it("Tenant B cannot read Tenant A booking by ID (returns 404)", async () => {
    vi.mocked(auth).mockResolvedValueOnce(adminSession("prop-b") as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/bookings/bk-1");
    const res = await getOne(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(404);

    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-b" }),
      }),
    );
  });

  it("Tenant B cannot delete Tenant A booking", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession("prop-b") as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce(null as never);

    const req = new NextRequest("http://localhost/api/bookings/bk-1", {
      method: "DELETE",
    });
    const res = await deleteBooking(req, makeRouteCtx("bk-1"));
    expect(res.status).toBe(404);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });
});

// ─── I. Conflict detection ────────────────────────────────────────────────────

describe("Conflict detection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 409 when facility has overlapping booking", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.facility.count).mockResolvedValueOnce(1 as never);

    // Simulate the transaction throwing a ConflictError (as the DB-level check would do)
    // We need to simulate the transaction callback being invoked with a queryRaw conflict
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (cb: unknown) => {
        if (typeof cb !== "function") return;
        // Build a mock tx proxy that simulates finding a conflict
        const mockTx = {
          ...prisma,
          $queryRaw: vi.fn().mockResolvedValue([{ id: "bf-conflict" }]),
          booking: {
            ...prisma.booking,
            create: vi.fn(),
          },
        };
        return cb(mockTx);
      },
    );

    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        guestName: "Karen",
        guestEmail: "karen@example.com",
        checkIn: CI.toISOString(),
        checkOut: CO.toISOString(),
        facilityIds: ["fac-1"],
        totalPrice: 100,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBooking(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/conflict|booked|overlap/i);
  });

  it("creates booking when no conflict", async () => {
    vi.mocked(auth).mockResolvedValueOnce(staffSession() as never);
    vi.mocked(prisma.facility.count).mockResolvedValueOnce(1 as never);

    const created = makeBooking({ id: "bk-new" });

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (cb: unknown) => {
        if (typeof cb !== "function") return;
        const mockTx = {
          ...prisma,
          $queryRaw: vi.fn().mockResolvedValue([]), // no conflicts
          booking: {
            ...prisma.booking,
            create: vi.fn().mockResolvedValue(created),
          },
        };
        return cb(mockTx);
      },
    );

    const req = new NextRequest("http://localhost/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        guestName: "Liam",
        guestEmail: "liam@example.com",
        checkIn: CI.toISOString(),
        checkOut: CO.toISOString(),
        facilityIds: ["fac-1"],
        totalPrice: 150,
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await postBooking(req);
    expect(res.status).toBe(201);
  });
});
