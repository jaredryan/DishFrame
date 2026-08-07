import type { DishKindValue } from "@/lib/dishes/schema";
import type { DirectShareStatusValue } from "@/lib/sharing/schema";
import type {
  SentDirectShareSummary,
  ReceivedDirectShareSummary,
} from "@/lib/sharing/service";
import type {
  SentDirectShareCollectionSummary,
  ReceivedDirectShareCollectionSummary,
} from "@/lib/sharing/collections";

/**
 * Merges the legacy/single `DirectShare` rows with `DirectShareCollection`
 * rows into the single "Sent"/"Received" mental model the redesigned
 * Sharing page presents — the user never needs to know which underlying
 * shape a given item is.
 *
 * `buildSentItems` always renders a `DirectShareCollection` (a Recipe
 * collection send) as a `"group"`, even with a single child — the "Show
 * recipes" disclosure is the one visible signal that an item is
 * collection-backed rather than a true individual Recipe/Part send, so it
 * must survive regardless of child count. Only ungrouped `DirectShare` rows
 * (true individual sends) render as `"single"`.
 *
 * `buildReceivedItems` still collapses a one-item collection into a
 * `"single"` view using the child's own `DirectShare` id directly
 * (accept/decline/preview all operate on any `DirectShare` id regardless of
 * whether it belongs to a collection).
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
  shares: SentDirectShareSummary[],
  collections: SentDirectShareCollectionSummary[],
): SentItemView[] {
  const singles: SentItemView[] = shares.map((share) => ({
    kind: "single",
    id: share.id,
    dishKind: share.dishKind,
    dishTitleSnapshot: share.dishTitleSnapshot,
    recipientName: share.recipientName,
    recipientLookup: share.recipientLookup,
    hasJoined: share.hasJoined,
    note: share.note,
    status: share.status,
    createdAt: share.createdAt.toISOString(),
  }));

  const fromCollections: SentItemView[] = collections.map((collection) => ({
    kind: "group",
    id: collection.id,
    recipientName: collection.recipientName,
    recipientLookup: collection.recipientLookup,
    hasJoined: collection.hasJoined,
    note: collection.note,
    createdAt: collection.createdAt.toISOString(),
    children: collection.children.map((child) => ({
      id: child.id,
      dishTitleSnapshot: child.dishTitleSnapshot,
      status: child.status,
    })),
  }));

  return sortByCreatedAtDesc([...singles, ...fromCollections]);
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
  shares: ReceivedDirectShareSummary[],
  collections: ReceivedDirectShareCollectionSummary[],
): ReceivedItemView[] {
  const singles: ReceivedItemView[] = shares.map((share) => ({
    kind: "single",
    id: share.id,
    dishKind: share.dishKind,
    dishTitleSnapshot: share.dishTitleSnapshot,
    senderName: share.senderName,
    note: share.note,
    status: share.status,
    createdAt: share.createdAt.toISOString(),
    createdDishId: share.createdDishId,
  }));

  const fromCollections: ReceivedItemView[] = collections.map((collection) => {
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

  return sortByCreatedAtDesc([...singles, ...fromCollections]);
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
