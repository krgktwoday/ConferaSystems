-- Migration: 20260602000003_booking_engine
-- Sprint 3 (CON-13): Booking Engine
--   1. Add BookingType enum
--   2. Extend Booking: add type column, make roomId nullable (multi-facility)
--   3. Add BookingFacility junction table for multi-facility bookings
--   4. Add indexes for conflict detection queries

-- ─── 1. BookingType enum ──────────────────────────────────────────────────────

CREATE TYPE "BookingType" AS ENUM ('STAY', 'CONFERENCE', 'EVENT');

-- ─── 2. Extend Booking table ──────────────────────────────────────────────────

-- Add type column with default STAY
ALTER TABLE "Booking" ADD COLUMN "type" "BookingType" NOT NULL DEFAULT 'STAY';

-- Make roomId nullable (new bookings use BookingFacility; legacy rows keep it)
ALTER TABLE "Booking" ALTER COLUMN "roomId" DROP NOT NULL;

-- Additional index for status+property queries (calendar view)
CREATE INDEX IF NOT EXISTS "Booking_propertyId_status_idx" ON "Booking"("propertyId", "status");

-- ─── 3. BookingFacility junction table ───────────────────────────────────────

CREATE TABLE "BookingFacility" (
    "id"         TEXT NOT NULL,
    "bookingId"  TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingFacility_pkey" PRIMARY KEY ("id")
);

-- FK: booking must exist, cascade delete with booking
ALTER TABLE "BookingFacility" ADD CONSTRAINT "BookingFacility_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: facility must exist
ALTER TABLE "BookingFacility" ADD CONSTRAINT "BookingFacility_facilityId_fkey"
    FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique: one booking can only book each facility once
CREATE UNIQUE INDEX "BookingFacility_bookingId_facilityId_key" ON "BookingFacility"("bookingId", "facilityId");

-- Index for looking up bookings by facility (conflict detection)
CREATE INDEX "BookingFacility_bookingId_idx" ON "BookingFacility"("bookingId");
CREATE INDEX "BookingFacility_facilityId_idx" ON "BookingFacility"("facilityId");
