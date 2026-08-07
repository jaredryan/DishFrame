import { describe, it, expect } from "vitest";
import {
  buildSentItems,
  buildReceivedItems,
  shareLinkLifecycle,
} from "./view-model";
import type {
  SentDirectShareSummary,
  ReceivedDirectShareSummary,
} from "./service";
import type {
  SentDirectShareCollectionSummary,
  ReceivedDirectShareCollectionSummary,
} from "./collections";

function sentShare(
  overrides: Partial<SentDirectShareSummary> = {},
): SentDirectShareSummary {
  return {
    id: "share-1",
    dishId: "dish-1",
    dishKind: "RECIPE",
    dishTitleSnapshot: "Ramen",
    recipientName: "Alex",
    recipientLookup: "alex@example.invalid",
    hasJoined: true,
    note: null,
    status: "PENDING",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

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

function receivedShare(
  overrides: Partial<ReceivedDirectShareSummary> = {},
): ReceivedDirectShareSummary {
  return {
    id: "rshare-1",
    dishId: "dish-1",
    dishKind: "RECIPE",
    dishTitleSnapshot: "Ramen",
    senderName: "Alex",
    note: null,
    status: "PENDING",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    createdDishId: null,
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
  it("sorts merged legacy sends and collections newest first", () => {
    const items = buildSentItems(
      [sentShare({ id: "s1", createdAt: new Date("2026-01-01T00:00:00Z") })],
      [
        sentCollection({
          id: "c1",
          createdAt: new Date("2026-01-03T00:00:00Z"),
          children: [
            {
              id: "c1-child",
              dishId: "d",
              dishKind: "RECIPE",
              dishTitleSnapshot: "Tacos",
              status: "PENDING",
              createdDishId: null,
            },
            {
              id: "c1-child-2",
              dishId: "d2",
              dishKind: "RECIPE",
              dishTitleSnapshot: "Chili",
              status: "PENDING",
              createdDishId: null,
            },
          ],
        }),
      ],
    );
    expect(items.map((item) => item.id)).toEqual(["c1", "s1"]);
  });

  it("renders a one-item collection as a single item using the child's own id", () => {
    const items = buildSentItems([], [sentCollection()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "single",
      id: "child-1",
      dishTitleSnapshot: "Soup",
      recipientName: "Jordan",
      status: "PENDING",
    });
  });

  it("renders a multi-item collection as a group with its children", () => {
    const items = buildSentItems(
      [],
      [
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
              dishKind: "RECIPE",
              dishTitleSnapshot: "Chili",
              status: "ACCEPTED",
              createdDishId: "dish-copy",
            },
          ],
        }),
      ],
    );
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

  it("preserves a legacy single send as-is, including hasJoined", () => {
    const items = buildSentItems([sentShare({ hasJoined: false })], []);
    expect(items[0]).toMatchObject({ kind: "single", hasJoined: false });
  });
});

describe("buildReceivedItems", () => {
  it("renders a one-item collection as a single item carrying createdDishId", () => {
    const items = buildReceivedItems(
      [],
      [
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
      ],
    );
    expect(items[0]).toMatchObject({
      kind: "single",
      id: "rc1",
      status: "ACCEPTED",
      createdDishId: "copy-1",
    });
  });

  it("keeps a multi-item collection grouped with per-child statuses", () => {
    const items = buildReceivedItems(
      [],
      [
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
              dishKind: "RECIPE",
              dishTitleSnapshot: "Salad",
              status: "DECLINED",
              createdDishId: null,
            },
          ],
        }),
      ],
    );
    expect(items[0].kind).toBe("group");
  });

  it("sorts merged received items newest first regardless of source", () => {
    const items = buildReceivedItems(
      [
        receivedShare({
          id: "r1",
          createdAt: new Date("2026-01-05T00:00:00Z"),
        }),
      ],
      [
        receivedCollection({
          id: "rc-old",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        }),
      ],
    );
    // The lone-child collection collapses to a "single" item keyed by the
    // child's own id, not the collection id.
    expect(items.map((item) => item.id)).toEqual(["r1", "rchild-1"]);
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
