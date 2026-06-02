/**
 * src/app/portal/swaps/page.tsx
 *
 * Shift Swaps — /portal/swaps
 *
 * Staff can view swap proposals they're involved in and propose new ones.
 * ADMIN sees all pending swaps and can approve/reject.
 *
 * Sprint 4 (CON-14)
 */

import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@prisma/client";
import ShiftSwapForm from "./ShiftSwapForm";
import ShiftSwapActions from "./ShiftSwapActions";

const STATUS_VARIANT: Record<
  RequestStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
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

export default async function ShiftSwapsPage() {
  const session = await getServerSession();
  if (!session) redirect("/auth/signin");

  const isAdmin = session.user.role === "ADMIN";

  const myStaffRecord = await prisma.staff.findFirst({
    where: { userId: session.user.id, propertyId: session.user.propertyId },
  });

  const swaps = isAdmin
    ? await prisma.shiftSwap.findMany({
        where: { propertyId: session.user.propertyId },
        include: {
          proposer: { select: { id: true, name: true, staffRole: true } },
          targetStaff: { select: { id: true, name: true, staffRole: true } },
          proposerShift: { select: { id: true, startsAt: true, endsAt: true } },
          targetShift: { select: { id: true, startsAt: true, endsAt: true } },
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : myStaffRecord
    ? await prisma.shiftSwap.findMany({
        where: {
          propertyId: session.user.propertyId,
          OR: [
            { proposerId: myStaffRecord.id },
            { targetStaffId: myStaffRecord.id },
          ],
        },
        include: {
          proposer: { select: { id: true, name: true, staffRole: true } },
          targetStaff: { select: { id: true, name: true, staffRole: true } },
          proposerShift: { select: { id: true, startsAt: true, endsAt: true } },
          targetShift: { select: { id: true, startsAt: true, endsAt: true } },
        },
        orderBy: [{ createdAt: "desc" }],
      })
    : [];

  // Staff need their shifts + colleagues' shifts to propose a swap
  const myShifts = myStaffRecord
    ? await prisma.shift.findMany({
        where: {
          staffId: myStaffRecord.id,
          status: "SCHEDULED",
          startsAt: { gte: new Date() },
        },
        orderBy: { startsAt: "asc" },
        take: 30,
      })
    : [];

  const colleagues = myStaffRecord
    ? await prisma.staff.findMany({
        where: {
          propertyId: session.user.propertyId,
          id: { not: myStaffRecord.id },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Shift Swaps</h1>
        <span className="text-sm text-slate-500">
          {isAdmin ? "All swap proposals" : "Your swaps"}
        </span>
      </div>

      {/* Propose form — staff with upcoming shifts */}
      {myStaffRecord && myShifts.length > 0 && (
        <ShiftSwapForm
          myShifts={myShifts.map((s) => ({
            id: s.id,
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
          }))}
          colleagues={colleagues.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}

      {swaps.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-500 font-medium">No shift swaps yet</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {swaps.map((swap) => (
            <div
              key={swap.id}
              className="rounded-lg border bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    {swap.proposer.name} → {swap.targetStaff.name}
                  </p>
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">Offers:</span>{" "}
                    {formatDateTime(swap.proposerShift.startsAt)}
                  </p>
                  <p className="text-sm text-slate-800">
                    <span className="font-medium">Wants:</span>{" "}
                    {formatDateTime(swap.targetShift.startsAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANT[swap.status]}>
                    {swap.status.charAt(0) + swap.status.slice(1).toLowerCase()}
                  </Badge>
                  {isAdmin && swap.status === "PENDING" && (
                    <ShiftSwapActions swapId={swap.id} />
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
