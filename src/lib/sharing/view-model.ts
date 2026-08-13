import type { DishKindValue } from "@/lib/dishes/schema";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";
import type {
  SentDirectShareCollectionSummary,
  ReceivedDirectShareCollectionSummary,
} from "@/lib/sharing/collections";

/**
 * Every Send is a `DirectShareCollection`, one or more items — this collapses
 * a one-item collection into a `"single"` view (no unnecessary "Show items"
 * disclosure for the common case) and leaves a multi-item collection as a
 * `"group"`. Sent and Received both collapse identically now that there is
 * no separate ungrouped send shape to distinguish. Accept/decline/preview
 * act on the child's own `DirectShare` id regardless of collection size;
 * cancelling a collapsed single item cancels its one-item collection.
 */

function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

export type SentShareChild = {
  id: string;
  dishTitleSnapshot: string;
  status: DirectShareStatusValue;
};

export type SentSingleItem = {
  kind: "single";
  id: string;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  recipientName: string | null;
  recipientLookup: string;
  hasJoined: boolean;
  note: string | null;
  status: DirectShareStatusValue;
  createdAt: string;
};

export type SentGroupItem = {
  kind: "group";
  id: string;
  recipientName: string | null;
  recipientLookup: string;
  hasJoined: boolean;
  note: string | null;
  createdAt: string;
  children: SentShareChild[];
};

export type SentItemView = SentSingleItem | SentGroupItem;

export function buildSentItems(
  collections: SentDirectShareCollectionSummary[],
): SentItemView[] {
  const items: SentItemView[] = collections.map((collection) => {
    const createdAt = collection.createdAt.toISOString();
    if (collection.children.length === 1) {
      const child = collection.children[0];
      return {
        kind: "single",
        id: collection.id,
        dishKind: child.dishKind,
        dishTitleSnapshot: child.dishTitleSnapshot,
        recipientName: collection.recipientName,
        recipientLookup: collection.recipientLookup,
        hasJoined: collection.hasJoined,
        note: collection.note,
        status: child.status,
        createdAt,
      };
    }
    return {
      kind: "group",
      id: collection.id,
      recipientName: collection.recipientName,
      recipientLookup: collection.recipientLookup,
      hasJoined: collection.hasJoined,
      note: collection.note,
      createdAt,
      children: collection.children.map((child) => ({
        id: child.id,
        dishTitleSnapshot: child.dishTitleSnapshot,
        status: child.status,
      })),
    };
  });

  return sortByCreatedAtDesc(items);
}

export type ReceivedShareChild = {
  id: string;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  status: DirectShareStatusValue;
  createdDishId: string | null;
};

export type ReceivedSingleItem = {
  kind: "single";
  id: string;
  dishKind: DishKindValue | null;
  dishTitleSnapshot: string;
  senderName: string;
  note: string | null;
  status: DirectShareStatusValue;
  createdAt: string;
  createdDishId: string | null;
};

export type ReceivedGroupItem = {
  kind: "group";
  id: string;
  senderName: string;
  note: string | null;
  createdAt: string;
  children: ReceivedShareChild[];
};

export type ReceivedItemView = ReceivedSingleItem | ReceivedGroupItem;

export function buildReceivedItems(
  collections: ReceivedDirectShareCollectionSummary[],
): ReceivedItemView[] {
  const items: ReceivedItemView[] = collections.map((collection) => {
    const createdAt = collection.createdAt.toISOString();
    if (collection.children.length === 1) {
      const child = collection.children[0];
      return {
        kind: "single",
        id: child.id,
        dishKind: child.dishKind,
        dishTitleSnapshot: child.dishTitleSnapshot,
        senderName: collection.senderName,
        note: collection.note,
        status: child.status,
        createdAt,
        createdDishId: child.createdDishId,
      };
    }
    return {
      kind: "group",
      id: collection.id,
      senderName: collection.senderName,
      note: collection.note,
      createdAt,
      children: collection.children.map((child) => ({
        id: child.id,
        dishKind: child.dishKind,
        dishTitleSnapshot: child.dishTitleSnapshot,
        status: child.status,
        createdDishId: child.createdDishId,
      })),
    };
  });

  return sortByCreatedAtDesc(items);
}

export type ShareLinkLifecycle = "active" | "disabled" | "expired";

export function shareLinkLifecycle(link: {
  revokedAt: string | null;
  expiresAt: string | null;
}): ShareLinkLifecycle {
  if (link.revokedAt !== null) return "disabled";
  if (link.expiresAt !== null && new Date(link.expiresAt) < new Date()) {
    return "expired";
  }
  return "active";
}
