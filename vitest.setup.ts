// vitest.setup.ts
// Global test setup: mock Prisma so tests run without a DB connection.
import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));
