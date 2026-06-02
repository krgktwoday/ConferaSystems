-- Sprint 4: Staff & Shift Scheduling (CON-14)
-- Replaces the stub Staff/Shift models with full Sprint 4 domain models:
--   - StaffRole enum (WAITER, RECEPTIONIST, CLEANING, MANAGER, KITCHEN)
--   - ShiftStatus enum (SCHEDULED, COMPLETED, CANCELLED)
--   - RequestStatus enum (PENDING, APPROVED, REJECTED)
--   - Staff: name, email, staffRole, contractedHours (replaces department/role string cols)
--   - Shift: facilityId (optional), status field, FK to new Staff shape
--   - LeaveRequest: staff leave request with manager review
--   - ShiftSwap: swap proposal between two staff members
--   - StaffingRule: per-tenant rule for staffing suggestions
--   - Property.staffingRules relation

-- ─── 1. New enums ─────────────────────────────────────────────────────────────

CREATE TYPE "StaffRole" AS ENUM ('WAITER', 'RECEPTIONIST', 'CLEANING', 'MANAGER', 'KITCHEN');
CREATE TYPE "ShiftStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ─── 2. Migrate Staff table ───────────────────────────────────────────────────
-- Add new required columns (with defaults so the ADD COLUMN works on non-empty tables),
-- then drop the old stub columns.

ALTER TABLE "Staff"
    ADD COLUMN "name"            TEXT NOT NULL DEFAULT '',
    ADD COLUMN "email"           TEXT NOT NULL DEFAULT '',
    ADD COLUMN "staffRole"       "StaffRole" NOT NULL DEFAULT 'WAITER',
    ADD COLUMN "contractedHours" INTEGER NOT NULL DEFAULT 40;

-- Remove defaults after column is established (they were only needed for the migration)
ALTER TABLE "Staff"
    ALTER COLUMN "name"  DROP DEFAULT,
    ALTER COLUMN "email" DROP DEFAULT;

-- Drop old stub columns
ALTER TABLE "Staff"
    DROP COLUMN IF EXISTS "department",
    DROP COLUMN IF EXISTS "role";

-- Additional indexes
CREATE INDEX IF NOT EXISTS "Staff_propertyId_staffRole_idx" ON "Staff"("propertyId", "staffRole");

-- ─── 3. Migrate Shift table ───────────────────────────────────────────────────
-- Add facilityId (optional) and status (with default).

ALTER TABLE "Shift"
    ADD COLUMN "facilityId" TEXT,
    ADD COLUMN "status"     "ShiftStatus" NOT NULL DEFAULT 'SCHEDULED';

-- Remove the property-level column (it was redundant — shift links to staff which links to property)
-- Keep propertyId for now to avoid breaking existing indexes (it was in the original stub).
-- Add additional index for weekly calendar queries.
CREATE INDEX IF NOT EXISTS "Shift_propertyId_startsAt_endsAt_idx"
    ON "Shift"("propertyId", "startsAt", "endsAt");

-- ─── 4. LeaveRequest table ───────────────────────────────────────────────────

CREATE TABLE "LeaveRequest" (
    "id"          TEXT NOT NULL,
    "propertyId"  TEXT NOT NULL,
    "staffId"     TEXT NOT NULL,
    "startsAt"    TIMESTAMP(3) NOT NULL,
    "endsAt"      TIMESTAMP(3) NOT NULL,
    "reason"      TEXT,
    "status"      "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy"  TEXT,
    "reviewedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_staffId_fkey"
        FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LeaveRequest_propertyId_idx"        ON "LeaveRequest"("propertyId");
CREATE INDEX "LeaveRequest_staffId_idx"            ON "LeaveRequest"("staffId");
CREATE INDEX "LeaveRequest_propertyId_status_idx"  ON "LeaveRequest"("propertyId", "status");

-- ─── 5. ShiftSwap table ───────────────────────────────────────────────────────

CREATE TABLE "ShiftSwap" (
    "id"              TEXT NOT NULL,
    "propertyId"      TEXT NOT NULL,
    "proposerId"      TEXT NOT NULL,
    "targetStaffId"   TEXT NOT NULL,
    "proposerShiftId" TEXT NOT NULL,
    "targetShiftId"   TEXT NOT NULL,
    "status"          "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy"      TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftSwap_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShiftSwap"
    ADD CONSTRAINT "ShiftSwap_proposerId_fkey"
        FOREIGN KEY ("proposerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ShiftSwap_targetStaffId_fkey"
        FOREIGN KEY ("targetStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ShiftSwap_proposerShiftId_fkey"
        FOREIGN KEY ("proposerShiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ShiftSwap_targetShiftId_fkey"
        FOREIGN KEY ("targetShiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ShiftSwap_propertyId_idx"         ON "ShiftSwap"("propertyId");
CREATE INDEX "ShiftSwap_proposerId_idx"          ON "ShiftSwap"("proposerId");
CREATE INDEX "ShiftSwap_targetStaffId_idx"       ON "ShiftSwap"("targetStaffId");
CREATE INDEX "ShiftSwap_propertyId_status_idx"   ON "ShiftSwap"("propertyId", "status");

-- ─── 6. StaffingRule table ────────────────────────────────────────────────────

CREATE TABLE "StaffingRule" (
    "id"             TEXT NOT NULL,
    "propertyId"     TEXT NOT NULL,
    "staffRole"      "StaffRole" NOT NULL,
    "guestsPerStaff" INTEGER NOT NULL DEFAULT 10,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffingRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StaffingRule"
    ADD CONSTRAINT "StaffingRule_propertyId_fkey"
        FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "StaffingRule_propertyId_staffRole_key"
    ON "StaffingRule"("propertyId", "staffRole");
CREATE INDEX "StaffingRule_propertyId_idx" ON "StaffingRule"("propertyId");
