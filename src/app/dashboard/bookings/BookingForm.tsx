"use client";

/**
 * src/app/dashboard/bookings/BookingForm.tsx
 *
 * Client component: Create (and future Edit) form for bookings.
 *
 * - Selects one or more facilities (multi-select via checkboxes)
 * - Date/time range picker
 * - Guest info (name, email)
 * - Booking type + status
 * - Validates availability on submit — shows conflict error from server
 * - On success navigates to /dashboard/bookings
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookingType, BookingStatus } from "@prisma/client";

interface Facility {
  id: string;
  name: string;
  type: string;
}

interface Props {
  facilities: Facility[];
}

const BOOKING_TYPES: { value: BookingType; label: string }[] = [
  { value: "STAY", label: "Stay (Room)" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "EVENT", label: "Event" },
];

const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
];

export default function BookingForm({ facilities }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedFacilities, setSelectedFacilities] = useState<Set<string>>(
    new Set(),
  );
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [type, setType] = useState<BookingType>("STAY");
  const [status, setStatus] = useState<BookingStatus>("PENDING");
  const [totalPrice, setTotalPrice] = useState("0");
  const [notes, setNotes] = useState("");

  function toggleFacility(id: string) {
    setSelectedFacilities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConflictError(null);

    if (!guestName.trim()) {
      setError("Guest name is required");
      return;
    }
    if (!checkIn) {
      setError("Check-in date is required");
      return;
    }
    if (!checkOut) {
      setError("Check-out date is required");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setError("Check-out must be after check-in");
      return;
    }

    const price = parseFloat(totalPrice);
    if (isNaN(price) || price < 0) {
      setError("Total price must be a non-negative number");
      return;
    }

    const payload = {
      facilityIds: Array.from(selectedFacilities),
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || undefined,
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      type,
      status,
      totalPrice: price,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      const resp = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const msg =
          (data as { error?: string }).error ?? "Failed to create booking";
        if (resp.status === 409) {
          setConflictError(msg);
        } else {
          setError(msg);
        }
        return;
      }

      router.push("/dashboard/bookings");
      router.refresh();
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Guest info */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">
          Guest Information
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="guestName">Guest Name *</Label>
            <Input
              id="guestName"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Jane Doe"
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guestEmail">Guest Email</Label>
            <Input
              id="guestEmail"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="jane@example.com"
              disabled={isPending}
            />
          </div>
        </div>
      </fieldset>

      {/* Dates */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700">
          Booking Dates
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="checkIn">Check-in *</Label>
            <Input
              id="checkIn"
              type="datetime-local"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="checkOut">Check-out *</Label>
            <Input
              id="checkOut"
              type="datetime-local"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
        </div>
      </fieldset>

      {/* Booking type + status */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Booking Type *</Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as BookingType)}
            disabled={isPending}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Initial Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as BookingStatus)}
            disabled={isPending}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Facilities selection */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-700">
          Facilities
        </legend>
        {facilities.length === 0 ? (
          <p className="text-sm text-gray-500">
            No facilities available. Create a facility first.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((f) => (
              <label
                key={f.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  selectedFacilities.has(f.id)
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedFacilities.has(f.id)}
                  onChange={() => toggleFacility(f.id)}
                  disabled={isPending}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {f.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {f.type.replace("_", " ")}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {/* Conflict error (409) */}
      {conflictError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">
            Availability conflict
          </p>
          <p className="mt-1 text-sm text-red-600">{conflictError}</p>
          <p className="mt-1 text-xs text-red-500">
            Please choose different facilities or adjust the dates.
          </p>
        </div>
      )}

      {/* Total price */}
      <div className="space-y-1.5">
        <Label htmlFor="totalPrice">Total Price (£) *</Label>
        <Input
          id="totalPrice"
          type="number"
          min={0}
          step={0.01}
          value={totalPrice}
          onChange={(e) => setTotalPrice(e.target.value)}
          disabled={isPending}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Special requirements, dietary needs, etc."
          rows={3}
          disabled={isPending}
        />
      </div>

      {/* General error */}
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create Booking"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push("/dashboard/bookings")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
