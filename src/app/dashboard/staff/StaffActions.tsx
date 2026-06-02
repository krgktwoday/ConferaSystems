"use client";

/**
 * src/app/dashboard/staff/StaffActions.tsx
 *
 * Client Component: delete action for a staff profile.
 * Used in the staff list table (admin only).
 * Sprint 4 (CON-14)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface Props {
  staff: { id: string; name: string };
}

export default function StaffActions({ staff }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        `Delete staff member "${staff.name}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${staff.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Failed to delete staff member");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
      className="text-red-600 hover:text-red-700 hover:bg-red-50"
      aria-label={`Delete ${staff.name}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
