/**
 * src/app/dashboard/facilities/FacilityActions.tsx
 *
 * Client component: provides per-row action buttons for the facility list.
 * Handles:
 *   - Status cycle quick-action  (Available → In Use → Maintenance → Available)
 *   - Delete with confirmation dialog (soft-delete)
 *
 * After each mutation the component calls router.refresh() to re-fetch the
 * server component data without a full navigation.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FacilityStatus } from "@prisma/client";

type Facility = {
  id: string;
  name: string;
  status: FacilityStatus;
};

const STATUS_CYCLE: Record<FacilityStatus, FacilityStatus> = {
  AVAILABLE: "IN_USE",
  IN_USE: "MAINTENANCE",
  MAINTENANCE: "AVAILABLE",
};

const STATUS_LABEL: Record<FacilityStatus, string> = {
  AVAILABLE: "Available",
  IN_USE: "In Use",
  MAINTENANCE: "Maintenance",
};

type Props = {
  facility: Facility;
};

export default function FacilityActions({ facility }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Status cycle ──────────────────────────────────────────────────────────

  function handleStatusCycle() {
    const nextStatus = STATUS_CYCLE[facility.status];
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/facilities/${facility.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Status update failed");
        return;
      }
      router.refresh();
    });
  }

  // ── Soft-delete ───────────────────────────────────────────────────────────

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/facilities/${facility.id}`, {
        method: "DELETE",
      });
      setDeleteOpen(false);
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Delete failed");
        return;
      }
      router.refresh();
    });
  }

  const nextStatus = STATUS_CYCLE[facility.status];

  return (
    <div className="flex items-center gap-2">
      {/* Status cycle */}
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleStatusCycle}
        title={`Set to ${STATUS_LABEL[nextStatus]}`}
      >
        <RefreshCw className="h-3.5 w-3.5 mr-1" />
        {STATUS_LABEL[nextStatus]}
      </Button>

      {/* Edit */}
      <Link
        href={`/dashboard/facilities/${facility.id}/edit`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        Edit
      </Link>

      {/* Delete trigger */}
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        disabled={isPending}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Delete
      </Button>

      {/* Inline error */}
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Facility</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <strong>{facility.name}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
