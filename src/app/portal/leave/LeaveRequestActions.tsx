"use client";

/**
 * src/app/portal/leave/LeaveRequestActions.tsx
 *
 * Client Component: approve/reject (admin) or withdraw (staff) a leave request.
 * Sprint 4 (CON-14)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  requestId: string;
  canWithdraw?: boolean; // true for staff's own PENDING request
}

export default function LeaveRequestActions({
  requestId,
  canWithdraw,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function act(action: "approve" | "reject" | "withdraw") {
    if (action === "withdraw") {
      if (!confirm("Withdraw this leave request?")) return;
    }

    setLoading(true);
    try {
      const res =
        action === "withdraw"
          ? await fetch(`/api/leave-requests/${requestId}`, { method: "DELETE" })
          : await fetch(`/api/leave-requests/${requestId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: action === "approve" ? "APPROVED" : "REJECTED",
              }),
            });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Action failed");
        return;
      }

      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (canWithdraw) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
        onClick={() => act("withdraw")}
        disabled={loading}
      >
        Withdraw
      </Button>
    );
  }

  return (
    <div className="flex gap-1">
      <Button
        variant="outline"
        size="sm"
        className="text-xs text-green-700 border-green-300 hover:bg-green-50"
        onClick={() => act("approve")}
        disabled={loading}
      >
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-xs text-red-600 border-red-300 hover:bg-red-50"
        onClick={() => act("reject")}
        disabled={loading}
      >
        Reject
      </Button>
    </div>
  );
}
