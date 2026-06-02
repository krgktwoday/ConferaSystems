import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

const STAT_CARDS = [
  { label: "Active Bookings", value: "—", description: "Confirmed reservations" },
  { label: "Rooms Available", value: "—", description: "Ready for check-in" },
  { label: "Staff on Shift", value: "—", description: "On duty today" },
];

export default function DashboardPage() {
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
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
          >
            Back to Home
          </Link>
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
            <CardTitle>Platform scaffold ready</CardTitle>
            <CardDescription>Sprint 1 — Foundation</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none text-gray-600">
            <p>
              Next.js 14 + TypeScript (strict) + Tailwind CSS v4 + Prisma 7 +
              shadcn/ui are configured and running.
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>
                Authentication will be added in{" "}
                <strong>CON-5</strong> (NextAuth.js, RBAC)
              </li>
              <li>
                Database migrations will be finalized in{" "}
                <strong>CON-4</strong> (Prisma + PostgreSQL)
              </li>
              <li>Booking engine and property management follow in Sprint 2</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
