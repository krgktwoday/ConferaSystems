/**
 * src/lib/rbac.ts
 *
 * RBAC helpers for the Hotel/Venue Platform.
 *
 * Role hierarchy (ascending privilege):
 *   VIEWER < STAFF < ADMIN
 *
 * Usage in Server Components / API routes:
 *   import { requireRole } from "@/lib/rbac";
 *   await requireRole(session, "ADMIN");
 */

import type { Session } from "next-auth";
import type { UserRole } from "@prisma/client";

/** Privilege level for each role (higher = more access). */
const ROLE_LEVEL: Record<UserRole, number> = {
  VIEWER: 0,
  STAFF: 1,
  ADMIN: 2,
};

/**
 * Asserts that the session's role meets the minimum required role.
 * Throws a 403 response-compatible error if the check fails.
 *
 * @param session  - The Auth.js session (from getServerSession / auth()).
 * @param required - Minimum role needed.
 * @throws {Error} with status 403 if insufficient privilege.
 */
export function requireRole(
  session: Session | null,
  required: UserRole,
): asserts session is Session {
  if (!session) {
    const err = new Error("Unauthenticated");
    (err as NodeJS.ErrnoException & { status: number }).status = 401;
    throw err;
  }

  const actualLevel = ROLE_LEVEL[session.user.role] ?? -1;
  const requiredLevel = ROLE_LEVEL[required] ?? 0;

  if (actualLevel < requiredLevel) {
    const err = new Error(
      `Forbidden: role '${session.user.role}' does not meet required '${required}'`,
    );
    (err as NodeJS.ErrnoException & { status: number }).status = 403;
    throw err;
  }
}
