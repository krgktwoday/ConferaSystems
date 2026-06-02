/**
 * src/lib/auth-credentials.ts
 *
 * The core credential verification logic, extracted from the NextAuth config
 * so it can be unit-tested without importing next-auth (which requires the
 * Next.js edge runtime in tests).
 *
 * Exported and used by src/lib/auth.ts → CredentialsProvider.authorize.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export interface AuthorizedUser {
  id: string;
  email: string;
  propertyId: string;
  role: UserRole;
}

/**
 * Verifies email + password against the database.
 *
 * @returns An AuthorizedUser on success, or null on failure.
 *
 * Multi-tenant note: emails are scoped to a Property. For MVP we look up the
 * first user with a matching email and verify their password. Future OAuth
 * flows will add propertyId as an explicit login field.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>>,
): Promise<AuthorizedUser | null> {
  const email = credentials?.email as string | undefined;
  const password = credentials?.password as string | undefined;

  if (!email || !password) return null;

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      propertyId: true,
      role: true,
    },
  });

  if (!user) return null;

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) return null;

  return {
    id: user.id,
    email: user.email,
    propertyId: user.propertyId,
    role: user.role,
  };
}
