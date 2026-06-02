/**
 * src/app/dashboard/facilities/new/page.tsx
 *
 * Create Facility Page — /dashboard/facilities/new
 *
 * Server Component wrapper. Verifies auth then renders the shared FacilityForm.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import FacilityForm from "../FacilityForm";

export default async function NewFacilityPage() {
  const session = await auth();
  if (!session) {
    redirect("/auth/signin");
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
            <CardTitle>Add Facility</CardTitle>
            <CardDescription>
              Create a new room, conference hall, outdoor area, or event space
              for your property.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
