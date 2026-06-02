/**
 * src/app/dashboard/page.tsx
 *
 * Dashboard home — protected by middleware.ts (unauthenticated users are
 * redirected to /auth/signin before reaching this component).
 *
 * Demonstrates: getServerSession(), session.user.propertyId, session.user.role
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getServerSession, signOut } from "@/lib/auth";
import SignOutButton from "./SignOutButton";

const STAT_CARDS = [
  { label: "Active Bookings", value: "—", description: "Confirmed reservations" },
  { label: "Rooms Available", value: "—", description: "Ready for check-in" },
  { label: "Staff on Shift", value: "—", description: "On duty today" },
];

export default async function DashboardPage() {
  // Double-check auth in the Server Component (belt-and-suspenders; middleware
  // already protects this route but this ensures session data is available).
  const session = await getServerSession();
  if (!session) {
    redirect("/auth/signin");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/auth/signin" });
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Hotel &amp; Venue Platform
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {session.user.email}
              </p>
              <p className="text-xs text-gray-500">
                {session.user.role} &middot; property{" "}
                <span className="font-mono">{session.user.propertyId.slice(0, 8)}&hellip;</span>
              </p>
            </div>
            <SignOutButton action={handleSignOut} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          {STAT_CARDS.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardDescription>{stat.description}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-gray-600">
                  {stat.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Authentication ready</CardTitle>
            <CardDescription>Sprint 1 — CON-5 complete</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none text-gray-600">
            <p>
              NextAuth.js v5 with CredentialsProvider is configured. Your
              session includes:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>
                <strong>userId:</strong>{" "}
                <span className="font-mono text-xs">{session.user.id}</span>
              </li>
              <li>
                <strong>propertyId:</strong>{" "}
                <span className="font-mono text-xs">{session.user.propertyId}</span>
              </li>
              <li>
                <strong>role:</strong> {session.user.role}
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Module navigation */}
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Modules</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/facilities" className={buttonVariants({ variant: "outline" })}>
              Manage Facilities →
            </Link>
            <Link href="/dashboard/bookings" className={buttonVariants()}>
              Booking Calendar →
            </Link>
            <Link href="/dashboard/staff" className={buttonVariants({ variant: "outline" })}>
              Staff Profiles →
            </Link>
            <Link href="/dashboard/shifts" className={buttonVariants({ variant: "outline" })}>
              Shift Calendar →
            </Link>
            <Link href="/portal" className={buttonVariants({ variant: "secondary" })}>
              Employee Portal →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
