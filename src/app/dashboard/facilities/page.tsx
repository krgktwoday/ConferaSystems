/**
 * src/app/dashboard/facilities/page.tsx
 *
 * Facility List Page — /dashboard/facilities
 *
 * Server Component: fetches all non-deleted facilities for the tenant,
 * renders them in a shadcn/ui Table with status badges and action buttons.
 * All mutations are delegated to FacilityActions (client component).
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
import FacilityActions from "./FacilityActions";
import { cn } from "@/lib/utils";
import type { FacilityStatus, FacilityType } from "@prisma/client";

// ─── Display helpers ──────────────────────────────────────────────────────────

const TYPE_LABEL: Record<FacilityType, string> = {
  ROOM: "Room",
  CONFERENCE_HALL: "Conference Hall",
  EVENT_SPACE: "Event Space",
  OUTDOOR: "Outdoor",
};

const STATUS_VARIANT: Record<
  FacilityStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  AVAILABLE: "default",
  IN_USE: "secondary",
  MAINTENANCE: "destructive",
};

const STATUS_LABEL: Record<FacilityStatus, string> = {
  AVAILABLE: "Available",
  IN_USE: "In Use",
  MAINTENANCE: "Maintenance",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FacilitiesPage() {
  const session = await auth();
  if (!session) {
    redirect("/auth/signin");
  }

  const facilities = await prisma.facility.findMany({
    where: {
      propertyId: session.user.propertyId,
      deletedAt: null,
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Facilities
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your property&apos;s rooms, halls, and spaces
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
              ← Dashboard
            </Link>
            <Link href="/dashboard/facilities/new" className={cn(buttonVariants())}>
              <Plus className="h-4 w-4 mr-1" />
              Add Facility
            </Link>
          </div>
        </header>

        {/* Empty state */}
        {facilities.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white py-16 text-center">
            <p className="text-gray-500 text-lg font-medium">
              No facilities yet
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Add your first room, conference hall, or outdoor space.
            </p>
            <Link href="/dashboard/facilities/new" className={cn(buttonVariants(), "mt-4")}>
              <Plus className="h-4 w-4 mr-1" />
              Add Facility
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Catering Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facilities.map((facility) => (
                  <TableRow key={facility.id}>
                    <TableCell className="font-medium">
                      {facility.name}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {TYPE_LABEL[facility.type]}
                    </TableCell>
                    <TableCell>{facility.maxCapacity}</TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {facility.equipment.length > 0
                        ? facility.equipment.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {facility.cateringZone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[facility.status]}>
                        {STATUS_LABEL[facility.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <FacilityActions
                        facility={{
                          id: facility.id,
                          name: facility.name,
                          status: facility.status,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Summary */}
        {facilities.length > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            {facilities.length} facilit{facilities.length === 1 ? "y" : "ies"}{" "}
            for this property
          </p>
        )}
      </div>
    </main>
  );
}
