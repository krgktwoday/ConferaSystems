"use client";

/**
 * src/app/dashboard/bookings/BookingCalendarActions.tsx
 *
 * Client component: quick status actions (Confirm, Cancel) for each booking row
 * on the calendar list view. Uses fetch() to PATCH the booking status.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  bookingId: string;
  currentStatus: string;
}

export default function BookingCalendarActions({ bookingId, currentStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(newStatus: string) {
    setError(null);
    const resp = await fetch(`/api/bookings/${bookingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Update failed");
      return false;
    }
    return true;
  }

  function handleConfirm() {
    startTransition(async () => {
      const ok = await updateStatus("CONFIRMED");
      if (ok) router.refresh();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const ok = await updateStatus("CANCELLED");
      if (ok) {
        setConfirmOpen(false);
        router.refresh();
      }
    });
  }

  if (currentStatus === "CANCELLED" || currentStatus === "COMPLETED") {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}

      {currentStatus === "PENDING" && (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleConfirm}
          className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
        >
          Confirm
        </Button>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
            />
          }
        >
          Cancel
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking?</DialogTitle>
            <DialogDescription>
              This will cancel the booking. The record will be retained for
              audit purposes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
