/**
 * src/app/api/health/route.ts
 *
 * Health check endpoint for Vercel deployment monitoring and uptime checks.
 *
 * GET /api/health → { status: "ok", timestamp: ISO-string }
 *
 * This route is excluded from auth middleware (see middleware.ts matcher).
 * It does NOT require a database connection — it only confirms the runtime
 * is alive and Next.js is responding.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
