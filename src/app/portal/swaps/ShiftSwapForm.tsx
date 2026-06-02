"use client";

/**
 * src/app/portal/swaps/ShiftSwapForm.tsx
 *
 * Client Component: propose a shift swap.
 * Sprint 4 (CON-14)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface MyShift {
  id: string;
  startsAt: string;
  endsAt: string;
}

interface Colleague {
  id: string;
  name: string;
}

interface Props {
  myShifts: MyShift[];
  colleagues: Colleague[];
}

function formatDT(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShiftSwapForm({ myShifts, colleagues }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    proposerShiftId: "",
    targetStaffId: "",
    targetShiftId: "",
  });
  const [colleagueShifts, setColleagueShifts] = useState<MyShift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadColleagueShifts(staffId: string) {
    if (!staffId) {
      setColleagueShifts([]);
      return;
    }
    setLoadingShifts(true);
    try {
      const res = await fetch(
        `/api/shifts?staffId=${staffId}&status=SCHEDULED&from=${new Date().toISOString()}`,
      );
      if (res.ok) {
        const data = await res.json();
        setColleagueShifts(
          (data as { id: string; startsAt: string; endsAt: string }[]).map(
            (s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt }),
          ),
        );
      }
    } finally {
      setLoadingShifts(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.proposerShiftId || !form.targetStaffId || !form.targetShiftId) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/shift-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Failed to propose swap");
        return;
      }

      setForm({ proposerShiftId: "", targetStaffId: "", targetShiftId: "" });
      setColleagueShifts([]);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        + Propose Swap
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-4 mb-6"
    >
      <h2 className="font-semibold text-slate-800">Propose Shift Swap</h2>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Your shift to offer
        </label>
        <select
          required
          value={form.proposerShiftId}
          onChange={(e) =>
            setForm((f) => ({ ...f, proposerShiftId: e.target.value }))
          }
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a shift…</option>
          {myShifts.map((s) => (
            <option key={s.id} value={s.id}>
              {formatDT(s.startsAt)} → {formatDT(s.endsAt)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Colleague to swap with
        </label>
        <select
          required
          value={form.targetStaffId}
          onChange={(e) => {
            const id = e.target.value;
            setForm((f) => ({ ...f, targetStaffId: id, targetShiftId: "" }));
            loadColleagueShifts(id);
          }}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select colleague…</option>
          {colleagues.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {form.targetStaffId && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Their shift you want
          </label>
          {loadingShifts ? (
            <p className="text-sm text-slate-400">Loading shifts…</p>
          ) : colleagueShifts.length === 0 ? (
            <p className="text-sm text-slate-400">
              No upcoming scheduled shifts for this colleague.
            </p>
          ) : (
            <select
              required
              value={form.targetShiftId}
              onChange={(e) =>
                setForm((f) => ({ ...f, targetShiftId: e.target.value }))
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a shift…</option>
              {colleagueShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDT(s.startsAt)} → {formatDT(s.endsAt)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Propose Swap"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
