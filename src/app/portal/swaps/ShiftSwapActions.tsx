"use client";

/**
 * src/app/portal/swaps/ShiftSwapActions.tsx
 *
 * Client Component: approve or reject a pending shift swap (admin only).
 * Sprint 4 (CON-14)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  swapId: string;
}

export default function ShiftSwapActions({ swapId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function act(status: "APPROVED" | "REJECTED") {
    setLoading(true);
    try {
      const res = await fetch(`/api/shift-swaps/${swapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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

  return (
    <div className="flex gap-1">
      <Button
        variant="outline"
        size="sm"
        className="text-xs text-green-700 border-green-300 hover:bg-green-50"
        onClick={() => act("APPROVED")}
        disabled={loading}
      >
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-xs text-red-600 border-red-300 hover:bg-red-50"
        onClick={() => act("REJECTED")}
        disabled={loading}
      >
        Reject
      </Button>
    </div>
  );
}
