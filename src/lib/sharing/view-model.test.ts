import { describe, it, expect } from "vitest";
import {
  buildSentItems,
  buildReceivedItems,
  shareLinkLifecycle,
} from "./view-model";
import type {
  SentDirectShareCollectionSummary,
  ReceivedDirectShareCollectionSummary,
} from "./collections";

function sentCollection(
  overrides: Partial<SentDirectShareCollectionSummary> = {},
): SentDirectShareCollectionSummary {
  return {
    id: "col-1",
    recipientName: "Jordan",
    recipientLookup: "jordan@example.invalid",
    hasJoined: false,
    note: "Enjoy",
    createdAt: new Date("2026-01-02T00:00:00Z"),
    children: [
      {
        id: "child-1",
        dishId: "dish-2",
        dishKind: "RECIPE",
        dishTitleSnapshot: "Soup",
        status: "PENDING",
        createdDishId: null,
      },
    ],
    ...overrides,
  };
}

function receivedCollection(
  overrides: Partial<ReceivedDirectShareCollectionSummary> = {},
): ReceivedDirectShareCollectionSummary {
  return {
    id: "rcol-1",
    senderName: "Jordan",
    note: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    children: [
      {
        id: "rchild-1",
        dishId: "dish-2",
        dishKind: "RECIPE",
        dishTitleSnapshot: "Soup",
        status: "PENDING",
        createdDishId: null,
      },
    ],
    ...overrides,
  };
}

describe("buildSentItems", () => {
  it("sorts collections newest first", () => {
    const items = buildSentItems([
      sentCollection({
        id: "c-old",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      sentCollection({
        id: "c-new",
        createdAt: new Date("2026-01-03T00:00:00Z"),
      }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["c-new", "c-old"]);
  });

  it("collapses a one-item collection into a single item, keyed by the collection id", () => {
    const items = buildSentItems([sentCollection()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "single",
      id: "col-1",
      dishKind: "RECIPE",
      dishTitleSnapshot: "Soup",
      hasJoined: false,
    });
  });

  it("renders a multi-item collection as a group with its children", () => {
    const items = buildSentItems([
      sentCollection({
        children: [
          {
            id: "c1",
            dishId: "d1",
            dishKind: "RECIPE",
            dishTitleSnapshot: "Tacos",
            status: "PENDING",
            createdDishId: null,
          },
          {
            id: "c2",
            dishId: "d2",
            dishKind: "PART",
            dishTitleSnapshot: "Chili",
            status: "ACCEPTED",
            createdDishId: "dish-copy",
          },
        ],
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("group");
    if (items[0].kind === "group") {
      expect(items[0].id).toBe("col-1");
      expect(items[0].children.map((c) => c.status)).toEqual([
        "PENDING",
        "ACCEPTED",
      ]);
    }
  });
});

describe("buildReceivedItems", () => {
  it("renders a one-item collection as a single item carrying createdDishId", () => {
    const items = buildReceivedItems([
      receivedCollection({
        children: [
          {
            id: "rc1",
            dishId: "d1",
            dishKind: "RECIPE",
            dishTitleSnapshot: "Soup",
            status: "ACCEPTED",
            createdDishId: "copy-1",
          },
        ],
      }),
    ]);
    expect(items[0]).toMatchObject({
      kind: "single",
      id: "rc1",
      status: "ACCEPTED",
      createdDishId: "copy-1",
    });
  });

  it("keeps a multi-item collection grouped with per-child statuses", () => {
    const items = buildReceivedItems([
      receivedCollection({
        children: [
          {
            id: "rc1",
            dishId: "d1",
            dishKind: "RECIPE",
            dishTitleSnapshot: "Soup",
            status: "PENDING",
            createdDishId: null,
          },
          {
            id: "rc2",
            dishId: "d2",
            dishKind: "PART",
            dishTitleSnapshot: "Salad",
            status: "DECLINED",
            createdDishId: null,
          },
        ],
      }),
    ]);
    expect(items[0].kind).toBe("group");
  });

  it("sorts merged received items newest first", () => {
    const items = buildReceivedItems([
      receivedCollection({
        id: "rc-old",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      receivedCollection({
        id: "rc-new",
        createdAt: new Date("2026-01-05T00:00:00Z"),
        children: [
          {
            id: "rchild-new",
            dishId: "dish-3",
            dishKind: "RECIPE",
            dishTitleSnapshot: "Bowl",
            status: "PENDING",
            createdDishId: null,
          },
        ],
      }),
    ]);
    // A lone-child collection collapses to a "single" item keyed by the
    // child's own id, not the collection id.
    expect(items.map((item) => item.id)).toEqual(["rchild-new", "rchild-1"]);
  });
});

describe("shareLinkLifecycle", () => {
  it("is active when never revoked or expired", () => {
    expect(shareLinkLifecycle({ revokedAt: null, expiresAt: null })).toBe(
      "active",
    );
  });

  it("is disabled once revoked, even if also past expiration", () => {
    expect(
      shareLinkLifecycle({
        revokedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe("disabled");
  });

  it("is expired when past expiresAt and not revoked", () => {
    expect(
      shareLinkLifecycle({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toBe("expired");
  });
});
