/**
 * src/app/api/bookings/[id]/invoice-data/route.ts
 *
 * GET /api/bookings/:id/invoice-data
 *
 * Returns aggregated line-item data for billing system integration.
 * Response shape:
 * {
 *   bookingId: string,
 *   guestName: string,
 *   guestEmail: string | null,
 *   checkIn: string,      // ISO datetime
 *   checkOut: string,     // ISO datetime
 *   nights: number,       // calendar days between checkIn and checkOut
 *   type: BookingType,
 *   status: BookingStatus,
 *   facilities: { id, name, type }[],
 *   lineItems: { description, amount }[],
 *   subtotal: number,
 *   total: number,        // = totalPrice (source of truth)
 *   invoices: { id, amount, status, issuedAt }[],
 * }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const booking = await prisma.booking.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
      deletedAt: null,
    },
    include: {
      bookingFacilities: {
        include: {
          facility: { select: { id: true, name: true, type: true } },
        },
      },
      invoices: {
        select: {
          id: true,
          amount: true,
          status: true,
          issuedAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Calculate nights (each started calendar day counts as 1)
  const msPerDay = 1000 * 60 * 60 * 24;
  const nights = Math.max(
    1,
    Math.ceil((booking.checkOut.getTime() - booking.checkIn.getTime()) / msPerDay),
  );

  const facilities = booking.bookingFacilities.map((bf) => bf.facility);
  const totalPrice = Number(booking.totalPrice);

  // Build line items: one per facility (evenly split) + notes line if any
  const facilityShare =
    facilities.length > 0
      ? +(totalPrice / facilities.length).toFixed(2)
      : totalPrice;

  const lineItems: { description: string; amount: number }[] =
    facilities.length > 0
      ? facilities.map((f) => ({
          description: `${f.name} — ${nights} night${nights !== 1 ? "s" : ""}`,
          amount: facilityShare,
        }))
      : [
          {
            description: `Booking — ${nights} night${nights !== 1 ? "s" : ""}`,
            amount: totalPrice,
          },
        ];

  // Adjust last item to absorb any rounding difference
  const lineSubtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const rounding = +(totalPrice - lineSubtotal).toFixed(2);
  if (lineItems.length > 0 && rounding !== 0) {
    lineItems[lineItems.length - 1].amount = +(
      lineItems[lineItems.length - 1].amount + rounding
    ).toFixed(2);
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);

  return NextResponse.json({
    bookingId: booking.id,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    checkIn: booking.checkIn.toISOString(),
    checkOut: booking.checkOut.toISOString(),
    nights,
    type: booking.type,
    status: booking.status,
    facilities,
    lineItems,
    subtotal: +subtotal.toFixed(2),
    total: totalPrice,
    invoices: booking.invoices.map((inv) => ({
      id: inv.id,
      amount: Number(inv.amount),
      status: inv.status,
      issuedAt: inv.issuedAt?.toISOString() ?? null,
    })),
  });
}
