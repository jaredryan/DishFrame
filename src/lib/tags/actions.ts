"use server";

import { requireUserId } from "@/lib/auth/session";
import * as tagService from "@/lib/tags/service";
import {
  createTagSchema,
  renameTagSchema,
  tagIdSchema,
} from "@/lib/tags/schema";

// No dedicated tag-management UI ships in this slice — these exist for the
// Recipe/Part editor (later slices) and reuse the same service.ts functions
// that src/lib/account/init.ts and integration tests call directly.

export async function createTag(input: unknown) {
  const userId = await requireUserId();
  const { name } = createTagSchema.parse(input);
  return tagService.createTag(userId, name);
}

export async function renameTag(input: unknown) {
  const userId = await requireUserId();
  const { id, name } = renameTagSchema.parse(input);
  return tagService.renameTag(userId, id, name);
}

export async function deleteTag(input: unknown) {
  const userId = await requireUserId();
  const { id } = tagIdSchema.parse(input);
  return tagService.deleteTag(userId, id);
}
