/**
 * src/app/api/auth/[...nextauth]/route.ts
 *
 * Next.js Route Handler that delegates all /api/auth/* requests to Auth.js v5.
 * Handles GET and POST for sign-in, sign-out, callback, session, and CSRF endpoints.
 */

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
