/**
 * middleware.ts
 *
 * Next.js Middleware for route protection.
 *
 * Protects /dashboard/* routes — unauthenticated requests are redirected to
 * /auth/signin with the original URL preserved as `callbackUrl`.
 *
 * Auth.js v5 `auth` middleware is used so the JWT is verified edge-side
 * without a database round-trip.
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth(function middleware(req: NextRequest & { auth: unknown }) {
  const { nextUrl } = req;
  const isAuthenticated = !!(req as { auth?: unknown }).auth;

  // Protected path prefixes
  const isProtected = nextUrl.pathname.startsWith("/dashboard");

  if (isProtected && !isAuthenticated) {
    const signInUrl = new URL("/auth/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  /*
   * Match all routes except:
   *  - Next.js internals (_next/static, _next/image)
   *  - Static files (favicon, images, etc.)
   *  - NextAuth API routes (/api/auth/*)
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
