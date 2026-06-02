/**
 * src/app/portal/leave/page.tsx
 *
 * Leave Requests — /portal/leave
 *
 * Staff can view their leave history and submit new requests.
 * ADMIN users see all leave requests for the property and can approve/reject.
 *
 * Sprint 4 (CON-14)
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@prisma/client";
import LeaveRequestForm from "./LeaveRequestForm";
import LeaveRequestActions from "./LeaveRequestActions";

const STATUS_VARIANT: Record<
  RequestStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function LeaveRequestsPage() {
  const session = await getServerSession();
  if (!session) redirect("/auth/signin");

  const isAdmin = session.user.role === "ADMIN";

  // Find staff record for the current user
  const myStaffRecord = await prisma.staff.findFirst({
    where: { userId: session.user.id, propertyId: session.user.propertyId },
  });

  // Fetch leave requests: ADMIN gets all, STAFF gets their own
  const requests = await prisma.leaveRequest.findMany({
    where: {
      propertyId: session.user.propertyId,
      ...(isAdmin ? {} : { staffId: myStaffRecord?.id ?? "__none__" }),
    },
    include: {
      staff: {
        select: { id: true, name: true, staffRole: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Leave Requests</h1>
        <span className="text-sm text-slate-500">
          {isAdmin ? "All staff requests" : "Your requests"}
        </span>
      </div>

      {/* Submit form — shown to all (staff submit their own; admin can submit for anyone) */}
      {(myStaffRecord || isAdmin) && (
        <LeaveRequestForm isAdmin={isAdmin} />
      )}

      {/* List */}
      {requests.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-500 font-medium">No leave requests yet</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-lg border bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {isAdmin && (
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      {req.staff.name} &middot;{" "}
                      {req.staff.staffRole.charAt(0) +
                        req.staff.staffRole.slice(1).toLowerCase()}
                    </p>
                  )}
                  <p className="font-medium text-slate-900">
                    {formatDate(req.startsAt)} → {formatDate(req.endsAt)}
                  </p>
                  {req.reason && (
                    <p className="text-sm text-slate-500 mt-0.5 truncate">
                      {req.reason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANT[req.status]}>
                    {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                  </Badge>
                  {isAdmin && req.status === "PENDING" && (
                    <LeaveRequestActions requestId={req.id} />
                  )}
                  {!isAdmin && req.status === "PENDING" && (
                    <LeaveRequestActions requestId={req.id} canWithdraw />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
