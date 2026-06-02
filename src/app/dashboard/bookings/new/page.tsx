/**
 * src/app/dashboard/bookings/new/page.tsx
 *
 * Create Booking page — Sprint 3, CON-13
 *
 * Server component: fetches available facilities for the tenant, then
 * renders the BookingForm client component.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import BookingForm from "../BookingForm";

export default async function NewBookingPage() {
  const session = await getServerSession();
  if (!session) redirect("/auth/signin");

  const facilities = await prisma.facility.findMany({
    where: {
      propertyId: session.user.propertyId,
      deletedAt: null,
      status: { not: "MAINTENANCE" },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true },
  });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link
            href="/dashboard/bookings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ← Back to Calendar
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Booking</CardTitle>
            <CardDescription>
              Select one or more facilities and enter guest details. Availability
              is checked on submit — overlapping bookings will be rejected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BookingForm facilities={facilities} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
