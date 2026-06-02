/**
 * src/app/dashboard/staff/page.tsx
 *
 * Staff List — /dashboard/staff
 *
 * Server Component: fetches all staff profiles for the tenant and renders
 * them in a table with role badges, contracted hours, and action buttons.
 * Sprint 4 (CON-14).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@prisma/client";
import StaffActions from "./StaffActions";

// ─── Display helpers ──────────────────────────────────────────────────────────

const ROLE_LABEL: Record<StaffRole, string> = {
  WAITER: "Waiter",
  RECEPTIONIST: "Receptionist",
  CLEANING: "Cleaning",
  MANAGER: "Manager",
  KITCHEN: "Kitchen",
};

const ROLE_VARIANT: Record<
  StaffRole,
  "default" | "secondary" | "destructive" | "outline"
> = {
  WAITER: "default",
  RECEPTIONIST: "secondary",
  CLEANING: "outline",
  MANAGER: "destructive",
  KITCHEN: "secondary",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StaffPage() {
  const session = await auth();
  if (!session) {
    redirect("/auth/signin");
  }

  const staffList = await prisma.staff.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: [{ staffRole: "asc" }, { name: "asc" }],
  });

  const isAdmin = session.user.role === "ADMIN";

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Staff
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your property&apos;s staff profiles and roles
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              ← Dashboard
            </Link>
            <Link
              href="/dashboard/shifts"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Shift Calendar
            </Link>
            {isAdmin && (
              <Link
                href="/dashboard/staff/new"
                className={cn(buttonVariants())}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Staff
              </Link>
            )}
          </div>
        </header>

        {/* Empty state */}
        {staffList.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white py-16 text-center">
            <p className="text-gray-500 text-lg font-medium">No staff yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Add your first staff member to start scheduling shifts.
            </p>
            {isAdmin && (
              <Link
                href="/dashboard/staff/new"
                className={cn(buttonVariants(), "mt-4")}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Staff
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Weekly Hours</TableHead>
                  {isAdmin && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffList.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-gray-600">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[member.staffRole]}>
                        {ROLE_LABEL[member.staffRole]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {member.contractedHours}h / week
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <StaffActions
                          staff={{
                            id: member.id,
                            name: member.name,
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {staffList.length > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            {staffList.length} staff member
            {staffList.length === 1 ? "" : "s"} for this property
          </p>
        )}
      </div>
    </main>
  );
}
