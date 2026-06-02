/**
 * src/lib/auth.ts
 *
 * Auth.js v5 (NextAuth) configuration for the Hotel/Venue Platform.
 *
 * Strategy: JWT (no database sessions) — ideal for CredentialsProvider.
 * Session JWT carries userId, propertyId, and role for multi-tenant scoping.
 *
 * Environment variables required:
 *   AUTH_SECRET (or NEXTAUTH_SECRET) — random 32-char string
 *   NEXTAUTH_URL                      — public URL of the app
 */

import NextAuth, { type NextAuthConfig, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { UserRole } from "@prisma/client";
import { authorizeCredentials } from "./auth-credentials";

// ─── Type Augmentation ────────────────────────────────────────────────────────
// Extend the built-in Session / JWT types so TypeScript knows about our extras.

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      propertyId: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    propertyId: string;
    role: UserRole;
  }
}

// Auth.js v5 beta: JWT augmentation lives in @auth/core/jwt
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    propertyId: string;
    role: UserRole;
  }
}

// ─── Auth.js Configuration ────────────────────────────────────────────────────

export const authConfig: NextAuthConfig = {
  // Use JWT strategy — no database session table needed for CredentialsProvider.
  session: { strategy: "jwt" },

  pages: {
    signIn: "/auth/signin",
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],

  callbacks: {
    /**
     * Runs when a JWT is created (sign-in) or accessed (subsequent requests).
     * Persists custom fields into the token so they survive the JWT round-trip.
     */
    async jwt({ token, user }) {
      if (user) {
        // First call: user object comes from authorize(); stamp our fields.
        token.userId = user.id as string;
        token.propertyId = (user as { propertyId: string }).propertyId;
        token.role = (user as { role: UserRole }).role;
      }
      return token;
    },

    /**
     * Runs on every session() call. Projects JWT fields onto the session
     * object that client components and server components receive.
     */
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.propertyId = token.propertyId as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
};

// Export the NextAuth handler and convenience helpers.
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * getServerSession — convenience wrapper for Server Components and API routes.
 *
 * Usage:
 *   import { getServerSession } from "@/lib/auth";
 *   const session = await getServerSession();
 *   if (!session) redirect("/auth/signin");
 */
export const getServerSession = auth;
