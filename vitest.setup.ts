// vitest.setup.ts
// Global test setup: mock Prisma so tests run without a DB connection.
import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    facility: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    booking: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bookingFacility: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
    // $transaction: called with a callback; we'll override per-test
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

// Mock email so tests never hit Resend
vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
}));
