/**
 * src/__tests__/staff-scheduling.test.ts
 *
 * Tests for Sprint 4: Staff & Shift Scheduling (CON-14).
 *
 * Coverage:
 *  A. parseStaffBody   — input validation
 *  B. parseShiftBody   — input validation
 *  C. GET /api/staff   — list (tenant-scoped)
 *  D. POST /api/staff  — create staff profile
 *  E. PUT /api/staff/:id — update profile
 *  F. DELETE /api/staff/:id — delete
 *  G. GET /api/shifts  — list with filters
 *  H. POST /api/shifts — create shift
 *  I. PUT /api/shifts/:id — status-only + full update
 *  J. DELETE /api/shifts/:id — delete
 *  K. POST /api/leave-requests — submit leave
 *  L. PUT /api/leave-requests/:id — approve/reject
 *  M. GET /api/bookings/:id/staffing-suggestion — suggestion engine
 *  N. Cross-tenant isolation: staff list returns empty for other tenant
 *  O. Integration: create staff → create shift → request leave → approve leave
 *
 * All tests run with mocked Prisma (no DB required).
 * Auth is mocked via vi.mock("@/lib/auth").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseStaffBody } from "@/app/api/staff/route";
import { parseShiftBody } from "@/app/api/shifts/route";
import { parseLeaveRequestBody } from "@/app/api/leave-requests/route";
import { NextRequest } from "next/server";

// ─── Auth mock ────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getServerSession: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { GET as getStaff, POST as postStaff } from "@/app/api/staff/route";
import {
  GET as getStaffById,
  PUT as putStaff,
  DELETE as deleteStaff,
} from "@/app/api/staff/[id]/route";
import { GET as getShifts, POST as postShift } from "@/app/api/shifts/route";
import {
  GET as getShiftById,
  PUT as putShift,
  DELETE as deleteShift,
} from "@/app/api/shifts/[id]/route";
import {
  GET as getLeaveRequests,
  POST as postLeaveRequest,
} from "@/app/api/leave-requests/route";
import {
  PUT as putLeaveRequest,
} from "@/app/api/leave-requests/[id]/route";
import { GET as getStaffingSuggestion } from "@/app/api/bookings/[id]/staffing-suggestion/route";

// ─── Session factories ────────────────────────────────────────────────────────

function adminSession(propertyId = "prop-a") {
  return {
    user: { id: "user-admin", email: "admin@a.local", propertyId, role: "ADMIN" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

function staffSession(propertyId = "prop-a") {
  return {
    user: { id: "user-staff", email: "staff@a.local", propertyId, role: "STAFF" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

// ─── Data factories ────────────────────────────────────────────────────────────

function makeStaff(overrides: Partial<{
  id: string;
  propertyId: string;
  userId: string;
  name: string;
  email: string;
  staffRole: string;
  contractedHours: number;
}> = {}) {
  return {
    id: "staff-1",
    propertyId: "prop-a",
    userId: "user-staff",
    name: "Alice Smith",
    email: "alice@venue.local",
    staffRole: "WAITER",
    contractedHours: 40,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeShift(overrides: Partial<{
  id: string;
  propertyId: string;
  staffId: string;
  facilityId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
}> = {}) {
  const start = new Date("2026-07-14T09:00:00Z");
  const end = new Date("2026-07-14T17:00:00Z");
  return {
    id: "shift-1",
    propertyId: "prop-a",
    staffId: "staff-1",
    facilityId: null,
    startsAt: start,
    endsAt: end,
    status: "SCHEDULED",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    staff: {
      id: "staff-1",
      name: "Alice Smith",
      email: "alice@venue.local",
      staffRole: "WAITER",
    },
    ...overrides,
  };
}

function makeLeaveRequest(overrides: Partial<{
  id: string;
  propertyId: string;
  staffId: string;
  status: string;
}> = {}) {
  return {
    id: "lr-1",
    propertyId: "prop-a",
    staffId: "staff-1",
    startsAt: new Date("2026-07-20T00:00:00Z"),
    endsAt: new Date("2026-07-22T00:00:00Z"),
    reason: "Vacation",
    status: "PENDING",
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    staff: {
      id: "staff-1",
      name: "Alice Smith",
      email: "alice@venue.local",
      staffRole: "WAITER",
    },
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonReq(body: unknown, url = "http://localhost/api/test"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── A. parseStaffBody ────────────────────────────────────────────────────────

describe("A. parseStaffBody", () => {
  it("accepts valid input", () => {
    const result = parseStaffBody({
      userId: "u-1",
      name: "Bob Jones",
      email: "bob@venue.local",
      staffRole: "KITCHEN",
      contractedHours: 32,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Bob Jones");
      expect(result.data.staffRole).toBe("KITCHEN");
      expect(result.data.contractedHours).toBe(32);
    }
  });

  it("rejects missing userId", () => {
    const result = parseStaffBody({ name: "Bob", email: "b@b.com", staffRole: "WAITER" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/userId/);
  });

  it("rejects invalid role", () => {
    const result = parseStaffBody({
      userId: "u-1",
      name: "Bob",
      email: "b@b.com",
      staffRole: "CHEF",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/staffRole/);
  });

  it("rejects invalid email", () => {
    const result = parseStaffBody({
      userId: "u-1",
      name: "Bob",
      email: "not-an-email",
      staffRole: "WAITER",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/email/);
  });

  it("rejects contractedHours > 168", () => {
    const result = parseStaffBody({
      userId: "u-1",
      name: "Bob",
      email: "b@b.com",
      staffRole: "WAITER",
      contractedHours: 200,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/contractedHours/);
  });
});

// ─── B. parseShiftBody ────────────────────────────────────────────────────────

describe("B. parseShiftBody", () => {
  it("accepts valid input", () => {
    const result = parseShiftBody({
      staffId: "staff-1",
      startsAt: "2026-07-14T09:00:00Z",
      endsAt: "2026-07-14T17:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.staffId).toBe("staff-1");
    }
  });

  it("rejects when endsAt <= startsAt", () => {
    const result = parseShiftBody({
      staffId: "staff-1",
      startsAt: "2026-07-14T17:00:00Z",
      endsAt: "2026-07-14T09:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/endsAt/);
  });

  it("rejects invalid status", () => {
    const result = parseShiftBody({
      staffId: "staff-1",
      startsAt: "2026-07-14T09:00:00Z",
      endsAt: "2026-07-14T17:00:00Z",
      status: "WORKING",
    });
    expect(result.ok).toBe(false);
  });
});

// ─── C. GET /api/staff ────────────────────────────────────────────────────────

describe("C. GET /api/staff", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await getStaff(getReq("http://localhost/api/staff"));
    expect(res.status).toBe(401);
  });

  it("returns list of staff for the property", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.staff.findMany).mockResolvedValue([makeStaff()] as never);

    const res = await getStaff(getReq("http://localhost/api/staff"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Alice Smith");
  });

  it("returns empty list for other tenant (cross-tenant isolation)", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession("prop-b") as never);
    vi.mocked(prisma.staff.findMany).mockResolvedValue([] as never);

    const res = await getStaff(getReq("http://localhost/api/staff"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(0);
  });
});

// ─── D. POST /api/staff ───────────────────────────────────────────────────────

describe("D. POST /api/staff", () => {
  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(staffSession() as never);
    const res = await postStaff(
      jsonReq({
        userId: "user-staff",
        name: "Alice",
        email: "a@b.com",
        staffRole: "WAITER",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("creates a staff profile for admin", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "user-staff",
      propertyId: "prop-a",
    } as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.staff.create).mockResolvedValue(makeStaff() as never);

    const res = await postStaff(
      jsonReq({
        userId: "user-staff",
        name: "Alice Smith",
        email: "alice@venue.local",
        staffRole: "WAITER",
        contractedHours: 40,
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Alice Smith");
    expect(data.staffRole).toBe("WAITER");
  });

  it("returns 409 when staff profile already exists", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-staff" } as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(makeStaff() as never);

    const res = await postStaff(
      jsonReq({
        userId: "user-staff",
        name: "Alice",
        email: "alice@venue.local",
        staffRole: "WAITER",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 422 for validation error", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    const res = await postStaff(
      jsonReq({ name: "Alice", email: "alice@venue.local", staffRole: "WAITER" }),
    );
    expect(res.status).toBe(422);
  });
});

// ─── E. PUT /api/staff/:id ────────────────────────────────────────────────────

describe("E. PUT /api/staff/:id", () => {
  it("updates staff profile", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(makeStaff() as never);
    vi.mocked(prisma.staff.update).mockResolvedValue(
      makeStaff({ contractedHours: 32 }) as never,
    );

    const req = new NextRequest("http://localhost/api/staff/staff-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractedHours: 32 }),
    });
    const res = await putStaff(req, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contractedHours).toBe(32);
  });

  it("returns 404 for wrong tenant", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession("prop-b") as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(null as never);

    const req = new NextRequest("http://localhost/api/staff/staff-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractedHours: 32 }),
    });
    const res = await putStaff(req, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(404);
  });
});

// ─── F. DELETE /api/staff/:id ─────────────────────────────────────────────────

describe("F. DELETE /api/staff/:id", () => {
  it("deletes a staff member", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(makeStaff() as never);
    vi.mocked(prisma.staff.delete).mockResolvedValue(makeStaff() as never);

    const req = new NextRequest("http://localhost/api/staff/staff-1", {
      method: "DELETE",
    });
    const res = await deleteStaff(req, { params: Promise.resolve({ id: "staff-1" }) });
    expect(res.status).toBe(204);
  });
});

// ─── G. GET /api/shifts ───────────────────────────────────────────────────────

describe("G. GET /api/shifts", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await getShifts(getReq("http://localhost/api/shifts"));
    expect(res.status).toBe(401);
  });

  it("returns shifts list", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.shift.findMany).mockResolvedValue([makeShift()] as never);

    const res = await getShifts(getReq("http://localhost/api/shifts"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("SCHEDULED");
  });
});

// ─── H. POST /api/shifts ──────────────────────────────────────────────────────

describe("H. POST /api/shifts", () => {
  it("creates a shift (admin)", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(makeStaff() as never);
    vi.mocked(prisma.facility.findFirst).mockResolvedValue(null as never); // no facilityId
    vi.mocked(prisma.shift.create).mockResolvedValue(makeShift() as never);

    const res = await postShift(
      jsonReq({
        staffId: "staff-1",
        startsAt: "2026-07-14T09:00:00Z",
        endsAt: "2026-07-14T17:00:00Z",
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.staffId).toBe("staff-1");
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(staffSession() as never);
    const res = await postShift(
      jsonReq({
        staffId: "staff-1",
        startsAt: "2026-07-14T09:00:00Z",
        endsAt: "2026-07-14T17:00:00Z",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid staffId", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(null as never);

    const res = await postShift(
      jsonReq({
        staffId: "bad-id",
        startsAt: "2026-07-14T09:00:00Z",
        endsAt: "2026-07-14T17:00:00Z",
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ─── I. PUT /api/shifts/:id ───────────────────────────────────────────────────

describe("I. PUT /api/shifts/:id", () => {
  it("updates status only", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(makeShift() as never);
    vi.mocked(prisma.shift.update).mockResolvedValue(
      makeShift({ status: "COMPLETED" }) as never,
    );

    const req = new NextRequest("http://localhost/api/shifts/shift-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const res = await putShift(req, { params: Promise.resolve({ id: "shift-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("COMPLETED");
  });
});

// ─── J. DELETE /api/shifts/:id ────────────────────────────────────────────────

describe("J. DELETE /api/shifts/:id", () => {
  it("deletes a shift", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.shift.findFirst).mockResolvedValue(makeShift() as never);
    vi.mocked(prisma.shift.delete).mockResolvedValue(makeShift() as never);

    const req = new NextRequest("http://localhost/api/shifts/shift-1", {
      method: "DELETE",
    });
    const res = await deleteShift(req, { params: Promise.resolve({ id: "shift-1" }) });
    expect(res.status).toBe(204);
  });
});

// ─── K. POST /api/leave-requests ─────────────────────────────────────────────

describe("K. POST /api/leave-requests", () => {
  it("staff can submit a leave request", async () => {
    vi.mocked(auth).mockResolvedValue(staffSession() as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(makeStaff() as never);
    vi.mocked(prisma.leaveRequest.create).mockResolvedValue(
      makeLeaveRequest() as never,
    );

    const res = await postLeaveRequest(
      jsonReq({
        startsAt: "2026-07-20T00:00:00Z",
        endsAt: "2026-07-22T00:00:00Z",
        reason: "Vacation",
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe("PENDING");
  });

  it("returns 401 for unauthenticated request", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await postLeaveRequest(
      jsonReq({ startsAt: "2026-07-20T00:00:00Z", endsAt: "2026-07-22T00:00:00Z" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 for bad date range", async () => {
    vi.mocked(auth).mockResolvedValue(staffSession() as never);
    vi.mocked(prisma.staff.findFirst).mockResolvedValue(makeStaff() as never);

    const res = await postLeaveRequest(
      jsonReq({
        startsAt: "2026-07-22T00:00:00Z",
        endsAt: "2026-07-20T00:00:00Z",
      }),
    );
    expect(res.status).toBe(422);
  });
});

// ─── L. PUT /api/leave-requests/:id (approve/reject) ─────────────────────────

describe("L. PUT /api/leave-requests/:id", () => {
  it("admin can approve a pending leave request", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(
      makeLeaveRequest() as never,
    );
    vi.mocked(prisma.leaveRequest.update).mockResolvedValue(
      makeLeaveRequest({ status: "APPROVED" }) as never,
    );

    const req = new NextRequest("http://localhost/api/leave-requests/lr-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    const res = await putLeaveRequest(req, {
      params: Promise.resolve({ id: "lr-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("APPROVED");
  });

  it("admin can reject a pending leave request", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(
      makeLeaveRequest() as never,
    );
    vi.mocked(prisma.leaveRequest.update).mockResolvedValue(
      makeLeaveRequest({ status: "REJECTED" }) as never,
    );

    const req = new NextRequest("http://localhost/api/leave-requests/lr-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REJECTED" }),
    });
    const res = await putLeaveRequest(req, {
      params: Promise.resolve({ id: "lr-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("REJECTED");
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue(staffSession() as never);
    const req = new NextRequest("http://localhost/api/leave-requests/lr-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    const res = await putLeaveRequest(req, {
      params: Promise.resolve({ id: "lr-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 422 when trying to approve already-approved request", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(
      makeLeaveRequest({ status: "APPROVED" }) as never,
    );

    const req = new NextRequest("http://localhost/api/leave-requests/lr-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    const res = await putLeaveRequest(req, {
      params: Promise.resolve({ id: "lr-1" }),
    });
    expect(res.status).toBe(422);
  });
});

// ─── M. GET /api/bookings/:id/staffing-suggestion ─────────────────────────────

describe("M. GET /api/bookings/:id/staffing-suggestion", () => {
  const mockBooking = {
    id: "booking-1",
    propertyId: "prop-a",
    bookingFacilities: [
      { facility: { maxCapacity: 40 } },
      { facility: { maxCapacity: 20 } },
    ],
  };

  it("returns staffing suggestions based on guest count", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(mockBooking as never);
    vi.mocked(prisma.staffingRule.findMany).mockResolvedValue([] as never); // use defaults

    const req = new NextRequest(
      "http://localhost/api/bookings/booking-1/staffing-suggestion",
    );
    const res = await getStaffingSuggestion(req, {
      params: Promise.resolve({ id: "booking-1" }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.bookingId).toBe("booking-1");
    expect(data.guestCount).toBe(60); // 40 + 20
    expect(data.suggestions).toHaveLength(5); // one per StaffRole

    // 60 guests / 10 per waiter = 6 waiters
    const waiterSuggestion = data.suggestions.find(
      (s: { role: string }) => s.role === "WAITER",
    );
    expect(waiterSuggestion?.staffNeeded).toBe(6);

    // MANAGER should always be 1
    const managerSuggestion = data.suggestions.find(
      (s: { role: string }) => s.role === "MANAGER",
    );
    expect(managerSuggestion?.staffNeeded).toBe(1);
  });

  it("uses tenant custom rules when available", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(mockBooking as never);
    vi.mocked(prisma.staffingRule.findMany).mockResolvedValue([
      { staffRole: "WAITER", guestsPerStaff: 5 }, // override: 1 waiter per 5 guests
    ] as never);

    const req = new NextRequest(
      "http://localhost/api/bookings/booking-1/staffing-suggestion",
    );
    const res = await getStaffingSuggestion(req, {
      params: Promise.resolve({ id: "booking-1" }),
    });
    const data = await res.json();

    // 60 guests / 5 per waiter = 12 waiters (custom rule)
    const waiterSuggestion = data.suggestions.find(
      (s: { role: string }) => s.role === "WAITER",
    );
    expect(waiterSuggestion?.staffNeeded).toBe(12);
  });

  it("returns 404 for unknown booking", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.booking.findFirst).mockResolvedValue(null as never);

    const req = new NextRequest(
      "http://localhost/api/bookings/bad-id/staffing-suggestion",
    );
    const res = await getStaffingSuggestion(req, {
      params: Promise.resolve({ id: "bad-id" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── N. Cross-tenant isolation ────────────────────────────────────────────────

describe("N. Cross-tenant isolation", () => {
  it("staff list query uses session propertyId — no cross-tenant leak", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession("prop-b") as never);
    vi.mocked(prisma.staff.findMany).mockResolvedValue([] as never);

    const res = await getStaff(getReq("http://localhost/api/staff"));
    expect(res.status).toBe(200);

    // Verify the query was scoped to prop-b
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-b" }),
      }),
    );
  });

  it("shift list query uses session propertyId", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession("prop-b") as never);
    vi.mocked(prisma.shift.findMany).mockResolvedValue([] as never);

    const res = await getShifts(getReq("http://localhost/api/shifts"));
    expect(res.status).toBe(200);

    expect(prisma.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ propertyId: "prop-b" }),
      }),
    );
  });
});

// ─── O. Integration: create staff → shift → leave → approve ──────────────────

describe("O. Integration: full staff scheduling flow", () => {
  it("creates staff, creates shift, requests leave, approves leave", async () => {
    const staff = makeStaff();
    const shift = makeShift();
    const leave = makeLeaveRequest();
    const approvedLeave = makeLeaveRequest({ status: "APPROVED" });

    // Step 1: admin creates staff
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: "user-staff" } as never);
    vi.mocked(prisma.staff.findFirst)
      .mockResolvedValueOnce(null as never) // duplicate check
      .mockResolvedValue(staff as never);
    vi.mocked(prisma.staff.create).mockResolvedValue(staff as never);

    const createStaffRes = await postStaff(
      jsonReq({
        userId: "user-staff",
        name: "Alice Smith",
        email: "alice@venue.local",
        staffRole: "WAITER",
        contractedHours: 40,
      }),
    );
    expect(createStaffRes.status).toBe(201);

    // Step 2: admin creates shift for that staff
    vi.mocked(prisma.facility.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.shift.create).mockResolvedValue(shift as never);

    const createShiftRes = await postShift(
      jsonReq({
        staffId: "staff-1",
        startsAt: "2026-07-14T09:00:00Z",
        endsAt: "2026-07-14T17:00:00Z",
      }),
    );
    expect(createShiftRes.status).toBe(201);

    // Step 3: staff submits leave request
    vi.mocked(auth).mockResolvedValue(staffSession() as never);
    vi.mocked(prisma.leaveRequest.create).mockResolvedValue(leave as never);

    const createLeaveRes = await postLeaveRequest(
      jsonReq({
        startsAt: "2026-07-20T00:00:00Z",
        endsAt: "2026-07-22T00:00:00Z",
        reason: "Vacation",
      }),
    );
    expect(createLeaveRes.status).toBe(201);
    const leaveData = await createLeaveRes.json();
    expect(leaveData.status).toBe("PENDING");

    // Step 4: admin approves the leave request
    vi.mocked(auth).mockResolvedValue(adminSession() as never);
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(leave as never);
    vi.mocked(prisma.leaveRequest.update).mockResolvedValue(approvedLeave as never);

    const approveReq = new NextRequest(
      "http://localhost/api/leave-requests/lr-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      },
    );
    const approveRes = await putLeaveRequest(approveReq, {
      params: Promise.resolve({ id: "lr-1" }),
    });
    expect(approveRes.status).toBe(200);
    const approvedData = await approveRes.json();
    expect(approvedData.status).toBe("APPROVED");
  });
});

// ─── parseLeaveRequestBody tests ─────────────────────────────────────────────

describe("parseLeaveRequestBody", () => {
  it("accepts valid input", () => {
    const result = parseLeaveRequestBody({
      staffId: "staff-1",
      startsAt: "2026-07-20T00:00:00Z",
      endsAt: "2026-07-22T00:00:00Z",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing staffId", () => {
    const result = parseLeaveRequestBody({
      startsAt: "2026-07-20T00:00:00Z",
      endsAt: "2026-07-22T00:00:00Z",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects end before start", () => {
    const result = parseLeaveRequestBody({
      staffId: "s-1",
      startsAt: "2026-07-22T00:00:00Z",
      endsAt: "2026-07-20T00:00:00Z",
    });
    expect(result.ok).toBe(false);
  });
});
