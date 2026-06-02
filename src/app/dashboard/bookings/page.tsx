/**
 * src/app/dashboard/bookings/page.tsx
 *
 * Booking Calendar — Sprint 3, CON-13
 *
 * Server component: fetches bookings + facilities for the tenant and renders
 * a facility-by-date CSS grid showing booking status per cell.
 *
 * Date range: defaults to current week (Mon–Sun), navigable via query params.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BookingCalendarActions from "./BookingCalendarActions";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Status color map ─────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  CONFIRMED: "default",
  CANCELLED: "destructive",
  COMPLETED: "secondary",
};

function statusLabel(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingWithFacilities {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  type: string;
  bookingFacilities: {
    facilityId: string;
    facility: { id: string; name: string };
  }[];
}

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BookingsPage({ searchParams }: PageProps) {
  const session = await getServerSession();
  if (!session) redirect("/auth/signin");

  const { week } = await searchParams;

  // Week anchor: ISO date of Monday
  const weekStart = week
    ? (() => {
        const d = new Date(week);
        return isNaN(d.getTime()) ? startOfWeek(new Date()) : d;
      })()
    : startOfWeek(new Date());

  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 7);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Fetch all non-deleted facilities for this property
  const facilities = await prisma.facility.findMany({
    where: { propertyId: session.user.propertyId, deletedAt: null },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  });

  // Fetch bookings that overlap the week window
  const bookings = (await prisma.booking.findMany({
    where: {
      propertyId: session.user.propertyId,
      deletedAt: null,
      checkIn: { lt: weekEnd },
      checkOut: { gt: weekStart },
    },
    include: {
      bookingFacilities: {
        include: { facility: { select: { id: true, name: true } } },
      },
    },
    orderBy: { checkIn: "asc" },
  })) as BookingWithFacilities[];

  // Build a map: facilityId → dayIndex → bookings[]
  const grid = new Map<string, Map<number, BookingWithFacilities[]>>();
  for (const facility of facilities) {
    const dayMap = new Map<number, BookingWithFacilities[]>();
    for (let d = 0; d < 7; d++) dayMap.set(d, []);
    grid.set(facility.id, dayMap);
  }

  for (const booking of bookings) {
    for (const bf of booking.bookingFacilities) {
      const dayMap = grid.get(bf.facilityId);
      if (!dayMap) continue;
      for (let d = 0; d < 7; d++) {
        const dayStart = days[d];
        const dayEnd = addDays(dayStart, 1);
        // Booking overlaps this day if checkIn < dayEnd AND checkOut > dayStart
        if (booking.checkIn < dayEnd && booking.checkOut > dayStart) {
          dayMap.get(d)!.push(booking);
        }
      }
    }
  }

  // Navigation ISO strings
  const prevWeek = isoDate(addDays(weekStart, -7));
  const nextWeek = isoDate(addDays(weekStart, 7));
  const currentWeek = isoDate(startOfWeek(new Date()));

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Booking Calendar
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Week of {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/bookings?week=${prevWeek}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              ← Prev
            </Link>
            <Link
              href={`/dashboard/bookings?week=${currentWeek}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Today
            </Link>
            <Link
              href={`/dashboard/bookings?week=${nextWeek}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next →
            </Link>
            <Link
              href="/dashboard/bookings/new"
              className={buttonVariants({ size: "sm" })}
            >
              + New Booking
            </Link>
          </div>
        </header>

        {facilities.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-gray-500">
            <p className="font-medium">No facilities found.</p>
            <p className="mt-1 text-sm">
              <Link
                href="/dashboard/facilities/new"
                className="text-blue-600 hover:underline"
              >
                Create a facility
              </Link>{" "}
              before making bookings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            {/* CSS Grid: 1 label col + 7 day cols */}
            <div
              className="grid min-w-[900px]"
              style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}
            >
              {/* Header row */}
              <div className="border-b border-r bg-gray-50 p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Facility
              </div>
              {days.map((day, di) => {
                const isToday = isoDate(day) === isoDate(new Date());
                return (
                  <div
                    key={di}
                    className={`border-b p-3 text-center text-xs font-semibold uppercase tracking-wide ${
                      isToday
                        ? "bg-blue-50 text-blue-700"
                        : "bg-gray-50 text-gray-500"
                    } ${di < 6 ? "border-r" : ""}`}
                  >
                    {formatDay(day)}
                  </div>
                );
              })}

              {/* Facility rows */}
              {facilities.map((facility, fi) => {
                const isLast = fi === facilities.length - 1;
                return (
                  <>
                    {/* Facility label */}
                    <div
                      key={`label-${facility.id}`}
                      className={`border-r p-3 ${!isLast ? "border-b" : ""}`}
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {facility.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {facility.type.replace("_", " ")}
                      </p>
                    </div>

                    {/* Day cells */}
                    {days.map((_, di) => {
                      const cellBookings =
                        grid.get(facility.id)?.get(di) ?? [];
                      const isToday =
                        isoDate(days[di]) === isoDate(new Date());
                      return (
                        <div
                          key={`cell-${facility.id}-${di}`}
                          className={`min-h-[80px] p-2 ${!isLast ? "border-b" : ""} ${di < 6 ? "border-r" : ""} ${
                            isToday ? "bg-blue-50/30" : ""
                          }`}
                        >
                          {cellBookings.length === 0 ? (
                            <div className="h-full w-full" />
                          ) : (
                            <div className="flex flex-col gap-1">
                              {cellBookings.map((bk) => (
                                <div
                                  key={bk.id}
                                  className="rounded border border-blue-200 bg-blue-50 px-1.5 py-1 text-xs"
                                >
                                  <p className="font-medium text-blue-800 truncate">
                                    {bk.guestName}
                                  </p>
                                  <Badge
                                    variant={
                                      STATUS_VARIANT[bk.status] ?? "outline"
                                    }
                                    className="mt-0.5 text-[10px] h-4"
                                  >
                                    {statusLabel(bk.status)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent bookings list */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Bookings this week
            </h2>
          </div>

          {bookings.length === 0 ? (
            <p className="text-sm text-gray-500">No bookings for this week.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map((bk) => (
                <div
                  key={bk.id}
                  className="flex flex-col gap-2 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {bk.guestName}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(bk.checkIn).toLocaleDateString("en-GB")} →{" "}
                      {new Date(bk.checkOut).toLocaleDateString("en-GB")}{" "}
                      &middot;{" "}
                      {bk.bookingFacilities
                        .map((bf) => bf.facility.name)
                        .join(", ") || "No facilities"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[bk.status] ?? "outline"}>
                      {statusLabel(bk.status)}
                    </Badge>
                    <BookingCalendarActions
                      bookingId={bk.id}
                      currentStatus={bk.status}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Back to dashboard */}
        <div className="mt-8">
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ← Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
