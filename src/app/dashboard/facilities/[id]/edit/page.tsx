/**
 * src/app/dashboard/facilities/[id]/edit/page.tsx
 *
 * Edit Facility Page — /dashboard/facilities/[id]/edit
 *
 * Server Component: fetches the facility by id (tenant-scoped), then renders
 * the shared FacilityForm pre-populated with existing values.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import FacilityForm from "../../FacilityForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditFacilityPage({ params }: Props) {
  const session = await auth();
  if (!session) {
    redirect("/auth/signin");
  }

  const { id } = await params;

  const facility = await prisma.facility.findFirst({
    where: { id, propertyId: session.user.propertyId, deletedAt: null },
  });

  if (!facility) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/dashboard/facilities"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Facilities
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Edit Facility</CardTitle>
            <CardDescription>
              Update the details for <strong>{facility.name}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityForm
              facility={{
                id: facility.id,
                name: facility.name,
                type: facility.type,
                maxCapacity: facility.maxCapacity,
                description: facility.description ?? "",
                equipment: facility.equipment.join(", "),
                cateringZone: facility.cateringZone ?? "",
                status: facility.status,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
