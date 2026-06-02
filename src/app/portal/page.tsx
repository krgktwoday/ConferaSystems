/**
 * src/app/portal/page.tsx
 *
 * Employee Portal home — My Shifts (/portal)
 *
 * Shows the current staff member's upcoming and recent shifts for the next
 * 4 weeks. Also shows a summary of pending leave requests.
 *
 * Sprint 4 (CON-14)
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ShiftStatus } from "@prisma/client";

const STATUS_VARIANT: Record<
  ShiftStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  SCHEDULED: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationHours(start: Date, end: Date): string {
  const h = (end.getTime() - start.getTime()) / 3_600_000;
  return `${h.toFixed(1)}h`;
}

export default async function PortalHomePage() {
  const session = await getServerSession();
  if (!session) redirect("/auth/signin");

  // Look up the staff record for this user
  const staffRecord = await prisma.staff.findFirst({
    where: {
      userId: session.user.id,
      propertyId: session.user.propertyId,
    },
  });

  if (!staffRecord) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          No staff profile found
        </h2>
        <p className="text-sm text-slate-500">
          Ask your manager to set up your staff profile in the{" "}
          <a href="/dashboard/staff" className="text-blue-600 hover:underline">
            admin dashboard
          </a>
          .
        </p>
      </div>
    );
  }

  const now = new Date();
  const fourWeeksOut = new Date(now.getTime() + 28 * 24 * 3600 * 1000);

  // Fetch upcoming shifts
  const upcomingShifts = await prisma.shift.findMany({
    where: {
      staffId: staffRecord.id,
      startsAt: { gte: now, lt: fourWeeksOut },
      status: { not: "CANCELLED" },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  // Fetch pending leave requests
  const pendingLeave = await prisma.leaveRequest.findMany({
    where: { staffId: staffRecord.id, status: "PENDING" },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Hello, {staffRecord.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {staffRecord.staffRole.charAt(0) +
            staffRecord.staffRole.slice(1).toLowerCase()}{" "}
          &middot; {staffRecord.contractedHours}h/week contracted
        </p>
      </div>

      {/* Pending leave banner */}
      {pendingLeave.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            You have {pendingLeave.length} pending leave request
            {pendingLeave.length === 1 ? "" : "s"} awaiting manager review.
          </p>
          <Link
            href="/portal/leave"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-2 border-amber-300 text-amber-800 hover:bg-amber-100",
            )}
          >
            View leave requests
          </Link>
        </div>
      )}

      {/* Upcoming shifts */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            Upcoming shifts
          </h2>
          <Link
            href="/portal/leave"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            + Request leave
          </Link>
        </div>

        {upcomingShifts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
            <p className="text-slate-500 font-medium">No upcoming shifts</p>
            <p className="mt-1 text-sm text-slate-400">
              Your manager will assign shifts here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingShifts.map((shift) => (
              <div
                key={shift.id}
                className="rounded-lg border bg-white px-4 py-3 shadow-sm flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(shift.startsAt)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Until {formatDateTime(shift.endsAt)} &middot;{" "}
                    {durationHours(shift.startsAt, shift.endsAt)}
                    {shift.notes ? ` — ${shift.notes}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[shift.status]}>
                  {shift.status.charAt(0) + shift.status.slice(1).toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick links */}
      <section className="mt-8">
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/portal/leave"
            className={buttonVariants({ variant: "outline" })}
          >
            Leave Requests
          </Link>
          <Link
            href="/portal/swaps"
            className={buttonVariants({ variant: "outline" })}
          >
            Shift Swaps
          </Link>
        </div>
      </section>
    </div>
  );
}
