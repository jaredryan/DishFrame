import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Creates a throwaway Better Auth `User` row for integration tests. Every
 * test owns and cleans up its own user (and, via cascade, everything that
 * user owns) rather than sharing fixtures across test files — see
 * ARCHITECTURE_PROPOSAL.md §O.
 */
export async function createTestUser(overrides?: { email?: string }) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      name: `Test User ${id.slice(0, 8)}`,
      email: overrides?.email ?? `test-${id}@example.invalid`,
    },
  });
}

export async function deleteTestUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } });
}
