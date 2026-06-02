/**
 * prisma/seed.ts
 *
 * Development seed: creates one demo Property, one admin User, and 5 demo Rooms.
 * Run with: npm run db:seed
 *
 * Note: passwordHash below is a bcrypt hash of "admin1234" with cost factor 12
 * (minimum required per CON-5 auth spec). This seed is for development only.
 *
 * Prisma 7 requires the driver adapter to be passed to PrismaClient.
 */
import { PrismaClient, RoomType, RoomStatus, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Aborting seed.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create demo property
  const property = await prisma.property.upsert({
    where: { slug: "grand-hotel-demo" },
    update: {},
    create: {
      name: "Grand Hotel Demo",
      slug: "grand-hotel-demo",
      timezone: "America/New_York",
    },
  });
  console.log(`  ✓ Property: ${property.name} (${property.id})`);

  // 2. Create admin user
  // passwordHash = bcrypt("admin1234", 12) — dev only, not a real secret
  const user = await prisma.user.upsert({
    where: { email_propertyId: { email: "admin@granddemo.local", propertyId: property.id } },
    update: {},
    create: {
      propertyId: property.id,
      email: "admin@granddemo.local",
      // bcrypt hash of "admin1234" (saltRounds=12) — change before production
      passwordHash: "$2b$12$XGo10Ywh23cYGJKCX6mWouNtaqRtfTKlK2Q91zB43MPG7djhz63ry",
      role: UserRole.ADMIN,
    },
  });
  console.log(`  ✓ User: ${user.email} (role: ${user.role})`);

  // 3. Create 5 demo rooms
  const rooms = [
    {
      name: "Deluxe King Room 101",
      type: RoomType.BEDROOM,
      capacity: 2,
      description: "Spacious king bedroom with city view and en-suite bathroom.",
      status: RoomStatus.AVAILABLE,
    },
    {
      name: "Twin Room 102",
      type: RoomType.BEDROOM,
      capacity: 2,
      description: "Comfortable twin room with garden view.",
      status: RoomStatus.AVAILABLE,
    },
    {
      name: "Suite 201",
      type: RoomType.BEDROOM,
      capacity: 4,
      description: "Luxury suite with separate living area and panoramic views.",
      status: RoomStatus.AVAILABLE,
    },
    {
      name: "Boardroom A",
      type: RoomType.CONFERENCE,
      capacity: 12,
      description: "Executive boardroom with AV equipment and video conferencing.",
      status: RoomStatus.AVAILABLE,
    },
    {
      name: "Grand Ballroom",
      type: RoomType.EVENT,
      capacity: 200,
      description: "Elegant ballroom for weddings, galas, and large corporate events.",
      status: RoomStatus.AVAILABLE,
    },
  ];

  for (const roomData of rooms) {
    const room = await prisma.room.create({
      data: {
        propertyId: property.id,
        ...roomData,
      },
    });
    console.log(`  ✓ Room: ${room.name} (${room.type})`);
  }

  console.log("\n✅ Seed complete.");
  console.log(`   Property ID : ${property.id}`);
  console.log(`   Admin email : ${user.email}`);
  console.log(`   Admin pass  : admin1234 (change before production)`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
