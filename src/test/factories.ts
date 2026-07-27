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
  // PartLink.targetVersion is onDelete: Restrict by design (Arch §I/§J — a
  // Part in use can only be removed through the deliberate two-phase
  // deletion flow, not an incidental cascade). Cascading a test user's own
  // Dishes can therefore hit that Restrict if some PartLink (in this user's
  // own Dishes, or another test's) still targets one of this user's Part
  // Versions — clear those links first so teardown doesn't depend on
  // Postgres's cascade-processing order across the two Dishes.
  await prisma.partLink.deleteMany({
    where: { targetVersion: { dish: { ownerId: userId } } },
  });
  await prisma.user.delete({ where: { id: userId } });
}
