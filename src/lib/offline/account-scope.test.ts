import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteDb, getEntity, putEntity } from "@/lib/offline/db";
import {
  clearCurrentAccountData,
  currentAccountMarker,
  reconcileAccountScope,
} from "@/lib/offline/account-scope";

async function seedOneDish() {
  await putEntity({
    entityType: "dish",
    id: "dish-1",
    doc: { title: "Soup" },
    serverRevision: null,
    localUpdatedAt: new Date().toISOString(),
    dirty: false,
    conflict: null,
  });
}

describe("offline/account-scope", () => {
  afterEach(async () => {
    window.localStorage.clear();
    await deleteDb();
  });

  it("first authenticated boot just remembers the account, without wiping anything", async () => {
    await seedOneDish();
    await reconcileAccountScope("user-a");

    expect(currentAccountMarker()).toBe("user-a");
    expect(await getEntity("dish", "dish-1")).toBeDefined();
  });

  it("re-booting as the same account is a no-op", async () => {
    await reconcileAccountScope("user-a");
    await seedOneDish();
    await reconcileAccountScope("user-a");

    expect(await getEntity("dish", "dish-1")).toBeDefined();
  });

  it("booting as a different account wipes the previous account's local data", async () => {
    await reconcileAccountScope("user-a");
    await seedOneDish();

    await reconcileAccountScope("user-b");

    expect(currentAccountMarker()).toBe("user-b");
    expect(await getEntity("dish", "dish-1")).toBeUndefined();
  });

  it("booting into an unauthenticated state clears the remembered account and its data", async () => {
    await reconcileAccountScope("user-a");
    await seedOneDish();

    await reconcileAccountScope(null);

    expect(currentAccountMarker()).toBeNull();
    expect(await getEntity("dish", "dish-1")).toBeUndefined();
  });

  it("an unauthenticated boot with nothing remembered is a harmless no-op", async () => {
    await reconcileAccountScope(null);
    expect(currentAccountMarker()).toBeNull();
  });

  it("explicit sign-out clears local data immediately, not just on next boot", async () => {
    await reconcileAccountScope("user-a");
    await seedOneDish();

    await clearCurrentAccountData();

    expect(currentAccountMarker()).toBeNull();
    expect(await getEntity("dish", "dish-1")).toBeUndefined();
  });
});
