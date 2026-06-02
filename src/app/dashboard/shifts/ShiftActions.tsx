"use client";

/**
 * src/app/dashboard/shifts/ShiftActions.tsx
 *
 * Client Component: quick status-update actions for a shift cell.
 * Allows marking a shift as COMPLETED or CANCELLED.
 * Sprint 4 (CON-14)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ShiftStatus } from "@prisma/client";

interface Props {
  shift: { id: string; status: ShiftStatus };
}

export default function ShiftActions({ shift }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateStatus(status: ShiftStatus) {
    setLoading(true);
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Failed to update shift");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (shift.status !== "SCHEDULED") return null;

  return (
    <div className="flex gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1 text-[10px] text-green-700 hover:bg-green-100"
        onClick={() => updateStatus("COMPLETED")}
        disabled={loading}
        title="Mark completed"
      >
        ✓
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1 text-[10px] text-red-600 hover:bg-red-50"
        onClick={() => updateStatus("CANCELLED")}
        disabled={loading}
        title="Cancel shift"
      >
        ✕
      </Button>
    </div>
  );
}
