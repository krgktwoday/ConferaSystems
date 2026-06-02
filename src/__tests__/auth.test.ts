/**
 * src/__tests__/auth.test.ts
 *
 * Unit tests for the authentication system (CON-5).
 *
 * Tests run with vitest + mocked Prisma (no DB required).
 * We test the extracted authorizeCredentials() function directly instead of
 * importing next-auth, which requires the Next.js edge runtime in tests.
 *
 * Coverage:
 *  1. authorizeCredentials() returns user on valid credentials
 *  2. authorizeCredentials() returns null on wrong password
 *  3. authorizeCredentials() returns null on unknown email
 *  4. authorizeCredentials() returns null on missing credentials
 *  5. requireRole() passes for sufficient role
 *  6. requireRole() throws 403 for insufficient role
 *  7. requireRole() throws 401 for null session
 *  8. ROLE_LEVEL hierarchy: ADMIN > STAFF > VIEWER
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authorizeCredentials } from "@/lib/auth-credentials";
import { requireRole } from "@/lib/rbac";
import type { Session } from "next-auth";
import type { UserRole } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock session for requireRole tests. */
function mockSession(role: UserRole): Session {
  return {
    user: {
      id: "user-1",
      email: "test@example.com",
      propertyId: "prop-1",
      role,
    },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

// ─── authorizeCredentials() ───────────────────────────────────────────────────

describe("authorizeCredentials()", () => {
  const PLAIN_PASSWORD = "admin1234";
  let passwordHash: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Use cost 12 (matches production requirement)
    passwordHash = await bcrypt.hash(PLAIN_PASSWORD, 12);
  });

  it("returns user object when credentials are valid", async () => {
    const mockUser = {
      id: "user-1",
      email: "admin@granddemo.local",
      passwordHash,
      propertyId: "prop-1",
      role: "ADMIN" as UserRole,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser);

    const result = await authorizeCredentials({
      email: "admin@granddemo.local",
      password: PLAIN_PASSWORD,
    });

    expect(result).toMatchObject({
      id: "user-1",
      email: "admin@granddemo.local",
      propertyId: "prop-1",
      role: "ADMIN",
    });
  });

  it("returns null for wrong password", async () => {
    const mockUser = {
      id: "user-1",
      email: "admin@granddemo.local",
      passwordHash,
      propertyId: "prop-1",
      role: "ADMIN" as UserRole,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser);

    const result = await authorizeCredentials({
      email: "admin@granddemo.local",
      password: "wrongpassword",
    });

    expect(result).toBeNull();
  });

  it("returns null for unknown email", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

    const result = await authorizeCredentials({
      email: "nobody@nowhere.local",
      password: PLAIN_PASSWORD,
    });

    expect(result).toBeNull();
  });

  it("returns null when credentials are missing", async () => {
    const result = await authorizeCredentials({});

    expect(result).toBeNull();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});

// ─── requireRole() ────────────────────────────────────────────────────────────

describe("requireRole()", () => {
  it("does not throw when session role equals required role", () => {
    expect(() =>
      requireRole(mockSession("ADMIN"), "ADMIN"),
    ).not.toThrow();
  });

  it("does not throw when session role exceeds required role (ADMIN >= STAFF)", () => {
    expect(() =>
      requireRole(mockSession("ADMIN"), "STAFF"),
    ).not.toThrow();
  });

  it("does not throw when session role exceeds required role (STAFF >= VIEWER)", () => {
    expect(() =>
      requireRole(mockSession("STAFF"), "VIEWER"),
    ).not.toThrow();
  });

  it("throws 403 when VIEWER tries to access STAFF route", () => {
    expect(() =>
      requireRole(mockSession("VIEWER"), "STAFF"),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("throws 403 when STAFF tries to access ADMIN route", () => {
    expect(() =>
      requireRole(mockSession("STAFF"), "ADMIN"),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("throws 401 for null session", () => {
    expect(() =>
      requireRole(null, "VIEWER"),
    ).toThrow(expect.objectContaining({ status: 401 }));
  });
});

// ─── Role hierarchy ───────────────────────────────────────────────────────────

describe("Role hierarchy (ADMIN > STAFF > VIEWER)", () => {
  it("ADMIN can access VIEWER route", () => {
    expect(() => requireRole(mockSession("ADMIN"), "VIEWER")).not.toThrow();
  });

  it("VIEWER cannot access ADMIN route", () => {
    expect(() => requireRole(mockSession("VIEWER"), "ADMIN")).toThrow();
  });

  it("STAFF cannot access ADMIN route", () => {
    expect(() => requireRole(mockSession("STAFF"), "ADMIN")).toThrow();
  });
});
