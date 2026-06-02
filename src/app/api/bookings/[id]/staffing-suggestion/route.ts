/**
 * src/app/api/bookings/[id]/staffing-suggestion/route.ts
 *
 * GET /api/bookings/:id/staffing-suggestion
 *
 * Given a booking, suggest number of staff needed per role using the
 * per-tenant StaffingRule configuration. Falls back to sensible defaults
 * if no rules are configured:
 *   WAITER:       1 per 10 guests
 *   RECEPTIONIST: 1 per 20 guests
 *   CLEANING:     1 per 15 guests
 *   KITCHEN:      1 per 10 guests
 *   MANAGER:      always 1
 *
 * Guest count is derived from the booking's facilities' total capacity
 * (max capacity of all booked facilities). If no facilities are linked,
 * it defaults to 1.
 *
 * Sprint 4 (CON-14)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { StaffRole } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

// Default staffing ratios (guests per 1 staff) used when no StaffingRule exists
const DEFAULT_RATIOS: Record<StaffRole, number> = {
  WAITER: 10,
  RECEPTIONIST: 20,
  CLEANING: 15,
  KITCHEN: 10,
  MANAGER: 0, // special: always 1 MANAGER regardless of guest count
};

const ALL_ROLES: StaffRole[] = [
  "WAITER",
  "RECEPTIONIST",
  "CLEANING",
  "KITCHEN",
  "MANAGER",
];

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  // Load the booking with its facilities' capacities
  const booking = await prisma.booking.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
      deletedAt: null,
    },
    include: {
      bookingFacilities: {
        include: {
          facility: { select: { maxCapacity: true } },
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Derive guest count from total facility capacity
  const guestCount = booking.bookingFacilities.reduce(
    (sum, bf) => sum + bf.facility.maxCapacity,
    0,
  ) || 1;

  // Load per-tenant rules (may be empty if none configured)
  const rules = await prisma.staffingRule.findMany({
    where: { propertyId: session.user.propertyId },
  });

  const ruleByRole = new Map(rules.map((r) => [r.staffRole, r.guestsPerStaff]));

  // Build suggestions
  const suggestions: { role: StaffRole; staffNeeded: number; guestsPerStaff: number }[] =
    ALL_ROLES.map((role) => {
      const guestsPerStaff =
        ruleByRole.get(role) ?? DEFAULT_RATIOS[role];

      let staffNeeded: number;
      if (guestsPerStaff === 0) {
        // MANAGER — always 1
        staffNeeded = 1;
      } else {
        staffNeeded = Math.max(1, Math.ceil(guestCount / guestsPerStaff));
      }

      return { role, staffNeeded, guestsPerStaff };
    });

  return NextResponse.json({
    bookingId: booking.id,
    guestCount,
    suggestions,
  });
}
