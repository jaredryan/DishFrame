import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PreferencesFormValues } from "@/lib/preferences/schema";

/**
 * Framework-agnostic domain function (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale. Preferences are a
 * stable per-user row, not Version content — a plain update, never a
 * Recipe/Part Version-creating path (PRODUCT_SPEC.md §88.1).
 */
export async function updatePreferences(
  ownerId: string,
  data: PreferencesFormValues,
) {
  return prisma.userPreference.upsert({
    where: { userId: ownerId },
    update: data,
    create: { userId: ownerId, ...data },
  });
}
