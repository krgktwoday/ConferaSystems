/**
 * src/app/dashboard/facilities/FacilityForm.tsx
 *
 * Client component: shared Create/Edit form for facilities.
 *
 * Props:
 *   - facility (optional): pre-populated values for edit mode
 *   - onSuccess (optional): callback called after successful save (triggers navigation)
 *
 * On save it calls POST /api/facilities (create) or PUT /api/facilities/:id (edit),
 * then navigates back to the list.
 */

"use client";

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
import type { FacilityType, FacilityStatus } from "@prisma/client";

type FacilityFormValues = {
  id?: string;
  name: string;
  type: FacilityType;
  maxCapacity: number;
  description: string;
  equipment: string; // comma-separated in the form
  cateringZone: string;
  status: FacilityStatus;
};

type Props = {
  /** Provide to pre-fill fields in edit mode. */
  facility?: FacilityFormValues;
};

const FACILITY_TYPES: { value: FacilityType; label: string }[] = [
  { value: "ROOM", label: "Room" },
  { value: "CONFERENCE_HALL", label: "Conference Hall" },
  { value: "EVENT_SPACE", label: "Event Space" },
  { value: "OUTDOOR", label: "Outdoor" },
];

const FACILITY_STATUSES: { value: FacilityStatus; label: string }[] = [
  { value: "AVAILABLE", label: "Available" },
  { value: "IN_USE", label: "In Use" },
  { value: "MAINTENANCE", label: "Maintenance" },
];

export default function FacilityForm({ facility }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────

  const [name, setName] = useState(facility?.name ?? "");
  const [type, setType] = useState<FacilityType>(facility?.type ?? "ROOM");
  const [maxCapacity, setMaxCapacity] = useState(
    String(facility?.maxCapacity ?? 1),
  );
  const [description, setDescription] = useState(facility?.description ?? "");
  const [equipment, setEquipment] = useState(facility?.equipment ?? "");
  const [cateringZone, setCateringZone] = useState(facility?.cateringZone ?? "");
  const [status, setStatus] = useState<FacilityStatus>(
    facility?.status ?? "AVAILABLE",
  );

  const isEdit = !!facility?.id;

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const capacityNum = parseInt(maxCapacity, 10);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (isNaN(capacityNum) || capacityNum < 1) {
      setError("Capacity must be a positive integer");
      return;
    }

    const payload = {
      name: name.trim(),
      type,
      maxCapacity: capacityNum,
      description: description.trim() || undefined,
      equipment: equipment
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      cateringZone: cateringZone.trim() || undefined,
      status,
    };

    startTransition(async () => {
      const url = isEdit
        ? `/api/facilities/${facility.id}`
        : "/api/facilities";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            `Failed to ${isEdit ? "update" : "create"} facility`,
        );
        return;
      }

      router.push("/dashboard/facilities");
      router.refresh();
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Boardroom A"
          required
          disabled={isPending}
        />
      </div>

      {/* Type + Capacity row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type *</Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as FacilityType)}
            disabled={isPending}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FACILITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="maxCapacity">Max Capacity *</Label>
          <Input
            id="maxCapacity"
            type="number"
            min={1}
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(e.target.value)}
            required
            disabled={isPending}
          />
        </div>
      </div>

      {/* Status (shown in edit, defaulted to AVAILABLE on create) */}
      {isEdit && (
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as FacilityStatus)}
            disabled={isPending}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FACILITY_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description…"
          rows={3}
          disabled={isPending}
        />
      </div>

      {/* Equipment */}
      <div className="space-y-1.5">
        <Label htmlFor="equipment">Equipment</Label>
        <Input
          id="equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="projector, whiteboard, AV system (comma-separated)"
          disabled={isPending}
        />
        <p className="text-xs text-gray-500">Separate items with commas</p>
      </div>

      {/* Catering Zone */}
      <div className="space-y-1.5">
        <Label htmlFor="cateringZone">Catering Zone</Label>
        <Input
          id="cateringZone"
          value={cateringZone}
          onChange={(e) => setCateringZone(e.target.value)}
          placeholder="e.g. Kitchen A, External"
          disabled={isPending}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Facility"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push("/dashboard/facilities")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
