/**
 * src/app/portal/layout.tsx
 *
 * Employee Self-Service Portal layout — /portal/*
 *
 * Separate from /dashboard: same session (NextAuth JWT), different layout.
 * Accessible to all authenticated users; staff see only their own data.
 *
 * Sprint 4 (CON-14)
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Employee Portal — Hotel & Venue Platform",
  description: "View your shifts, request leave, and manage shift swaps.",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Portal navigation bar */}
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-slate-800 text-sm tracking-wide">
              Employee Portal
            </span>
            <a
              href="/portal"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              My Shifts
            </a>
            <a
              href="/portal/leave"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Leave
            </a>
            <a
              href="/portal/swaps"
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Swap Shifts
            </a>
          </div>
          <a
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Admin Dashboard →
          </a>
        </div>
      </nav>

      {/* Page content */}
      <div className="max-w-4xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
