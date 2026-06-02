/**
 * src/app/dashboard/shifts/page.tsx
 *
 * Shift Calendar — /dashboard/shifts
 *
 * Server Component: fetches shifts + staff for the tenant and renders a
 * weekly staff × day grid showing scheduled shifts per cell.
 *
 * Date range: defaults to current week (Mon–Sun), navigable via ?week= param.
 * Sprint 4 (CON-14).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ShiftStatus, StaffRole } from "@prisma/client";
import ShiftActions from "./ShiftActions";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  ShiftStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  SCHEDULED: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

const ROLE_LABEL: Record<StaffRole, string> = {
  WAITER: "Waiter",
  RECEPTIONIST: "Receptionist",
  CLEANING: "Cleaning",
  MANAGER: "Manager",
  KITCHEN: "Kitchen",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftWithStaff {
  id: string;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  status: ShiftStatus;
  notes: string | null;
  staff: {
    id: string;
    name: string;
    email: string;
    staffRole: StaffRole;
  };
}

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ShiftsPage({ searchParams }: PageProps) {
  const session = await getServerSession();
  if (!session) redirect("/auth/signin");

  const { week } = await searchParams;

  const weekStart = week
    ? (() => {
        const d = new Date(week);
        return isNaN(d.getTime()) ? startOfWeek(new Date()) : d;
      })()
    : startOfWeek(new Date());

  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Fetch all staff and shifts for this week
  const staffList = await prisma.staff.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: [{ staffRole: "asc" }, { name: "asc" }],
  });

  const shifts = (await prisma.shift.findMany({
    where: {
      propertyId: session.user.propertyId,
      startsAt: { lt: weekEnd },
      endsAt: { gt: weekStart },
      status: { not: "CANCELLED" },
    },
    include: {
      staff: {
        select: { id: true, name: true, email: true, staffRole: true },
      },
    },
    orderBy: { startsAt: "asc" },
  })) as ShiftWithStaff[];

  // Build grid: staffId → dayIndex → shifts[]
  const grid = new Map<string, Map<number, ShiftWithStaff[]>>();
  for (const member of staffList) {
    const dayMap = new Map<number, ShiftWithStaff[]>();
    for (let d = 0; d < 7; d++) dayMap.set(d, []);
    grid.set(member.id, dayMap);
  }

  for (const shift of shifts) {
    const dayMap = grid.get(shift.staffId);
    if (!dayMap) continue;
    for (let d = 0; d < 7; d++) {
      const dayStart = days[d];
      const dayEnd = addDays(dayStart, 1);
      if (shift.startsAt < dayEnd && shift.endsAt > dayStart) {
        dayMap.get(d)!.push(shift);
      }
    }
  }

  const prevWeek = isoDate(addDays(weekStart, -7));
  const nextWeek = isoDate(addDays(weekStart, 7));
  const currentWeek = isoDate(startOfWeek(new Date()));
  const isAdmin = session.user.role === "ADMIN";

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Shift Calendar
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Week of{" "}
              {weekStart.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/shifts?week=${prevWeek}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              ← Prev
            </Link>
            <Link
              href={`/dashboard/shifts?week=${currentWeek}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Today
            </Link>
            <Link
              href={`/dashboard/shifts?week=${nextWeek}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next →
            </Link>
            <Link
              href="/dashboard/staff"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Manage Staff
            </Link>
            {isAdmin && (
              <Link
                href="/dashboard/shifts/new"
                className={buttonVariants({ size: "sm" })}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Shift
              </Link>
            )}
          </div>
        </header>

        {staffList.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-gray-500">
            <p className="font-medium">No staff found.</p>
            <p className="mt-1 text-sm">
              <Link
                href="/dashboard/staff/new"
                className="text-blue-600 hover:underline"
              >
                Add staff members
              </Link>{" "}
              before scheduling shifts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
            <div
              className="grid min-w-[900px]"
              style={{ gridTemplateColumns: "200px repeat(7, 1fr)" }}
            >
              {/* Header row */}
              <div className="border-b border-r bg-gray-50 p-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Staff
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

              {/* Staff rows */}
              {staffList.map((member, fi) => {
                const isLast = fi === staffList.length - 1;
                return (
                  <>
                    {/* Staff label */}
                    <div
                      key={`label-${member.id}`}
                      className={`border-r p-3 ${!isLast ? "border-b" : ""}`}
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {ROLE_LABEL[member.staffRole]}
                      </p>
                    </div>

                    {/* Day cells */}
                    {days.map((_, di) => {
                      const cellShifts =
                        grid.get(member.id)?.get(di) ?? [];
                      const isToday =
                        isoDate(days[di]) === isoDate(new Date());
                      return (
                        <div
                          key={`cell-${member.id}-${di}`}
                          className={`min-h-[80px] p-2 ${!isLast ? "border-b" : ""} ${di < 6 ? "border-r" : ""} ${
                            isToday ? "bg-blue-50/30" : ""
                          }`}
                        >
                          {cellShifts.length === 0 ? (
                            <div className="h-full w-full" />
                          ) : (
                            <div className="flex flex-col gap-1">
                              {cellShifts.map((shift) => (
                                <div
                                  key={shift.id}
                                  className="rounded border border-green-200 bg-green-50 px-1.5 py-1 text-xs"
                                >
                                  <p className="font-medium text-green-800">
                                    {formatTime(shift.startsAt)}–{formatTime(shift.endsAt)}
                                  </p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Badge
                                      variant={STATUS_VARIANT[shift.status]}
                                      className="text-[10px] h-4"
                                    >
                                      {shift.status.charAt(0) +
                                        shift.status.slice(1).toLowerCase()}
                                    </Badge>
                                    {isAdmin && (
                                      <ShiftActions
                                        shift={{
                                          id: shift.id,
                                          status: shift.status,
                                        }}
                                      />
                                    )}
                                  </div>
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
