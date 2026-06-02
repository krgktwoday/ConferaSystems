-- CreateEnum: FacilityType
CREATE TYPE "FacilityType" AS ENUM ('ROOM', 'CONFERENCE_HALL', 'EVENT_SPACE', 'OUTDOOR');

-- CreateEnum: FacilityStatus
CREATE TYPE "FacilityStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE');

-- CreateTable: Facility (Sprint 2 — Module A, CON-12)
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FacilityType" NOT NULL DEFAULT 'ROOM',
    "maxCapacity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "equipment" TEXT[],
    "cateringZone" TEXT,
    "status" "FacilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Facility_propertyId_status_idx" ON "Facility"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Facility_propertyId_deletedAt_idx" ON "Facility"("propertyId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
