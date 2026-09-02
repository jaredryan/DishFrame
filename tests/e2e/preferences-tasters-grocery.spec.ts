import { test, expect, type Page } from "@playwright/test";
import {
  cleanup,
  clickAndWaitForServerAction,
  login,
  waitForServerAction,
} from "./helpers";

/**
 * Reorders a row one position up via dnd-kit's `KeyboardSensor` — its
 * standard, first-class accessible interaction (`src/lib/dnd/sensors.ts`
 * uses `sortableKeyboardCoordinates`, dnd-kit's default keyboard pattern):
 * focus the handle, Space to pick up, Arrow key to move, Space to drop.
 * Deliberately not a simulated pointer drag: dnd-kit's `PointerSensor`
 * reorders based on `closestCenter` collision between the *dragged
 * element's* transformed rect and sibling droppable rects, recalculated on
 * every `pointermove` — reproducing that precisely with Playwright's
 * synthetic mouse events proved unreliable across several attempts, whereas
 * the keyboard path moves exactly one index per Arrow press,
 * deterministically, and is itself one of this component's required
 * accessibility guarantees — exercising it here is strictly more valuable
 * coverage than a pixel-perfect pointer simulation would have been.
 * The short waits give dnd-kit's `KeyboardSensor` time to attach its
 * drag-state listeners between the pick-up keypress and the following
 * move keypress — without them the move is dispatched before the sensor
 * has started tracking, and drop lands back on the origin.
 */
async function reorderUpViaKeyboard(page: Page, handleName: string) {
  const handle = page.getByRole("button", { name: handleName });
  await handle.focus();
  await expect(handle).toBeFocused();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(150);
  // The drop is what triggers `onDragEnd` → `persistOrder`'s fetch — wait
  // for that response rather than a fixed delay, since callers that reload
  // right after (the Tasters flow below) need the reorder to actually be
  // persisted first.
  await waitForServerAction(page, () => page.keyboard.press("Space"));
}

/**
 * Golden path for BUILD_PLAN.md Slice 2 + its follow-up's Settings UI:
 * sign-in is Google OAuth-only, so this mints a session directly via Better
 * Auth's `testUtils` plugin rather than driving a real OAuth consent
 * screen — the sanctioned mechanism for exactly this situation.
 */
test.describe("Settings: Preferences, Grocery Categories, and Tasters", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("save preferences, manage Grocery Categories (incl. the protected fallback), and manage Tasters", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // --- Preferences: change a setting and confirm it persists ---
    await page.getByLabel("Measurement system").click();
    // Synchronize on the Server Action's own POST, same as every other
    // mutation in this file — otherwise this assertion races the round
    // trip and can time out on a loaded dev server even though nothing is
    // actually broken (see the generous-timeout comments elsewhere in this
    // file for the same underlying cause).
    await clickAndWaitForServerAction(
      page,
      page.getByRole("option", { name: "Metric" }),
    );
    // `getByRole("status")` alone is ambiguous on this page: dnd-kit's
    // `DndContext` (mounted by GroceryCategoryManager below) renders its
    // own hidden `role="status"` live region for drag announcements, so a
    // plain role lookup matches both. Match on the visible text instead.
    await expect(page.getByText("Preferences saved.")).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await expect(page.getByLabel("Measurement system")).toContainText("Metric");

    // --- Grocery Categories: the seeded fallback is protected, but its
    // Delete action still renders in the same position as every other
    // category — disabled, with an explanation (Gate 2 remediation) ---
    await expect(page.getByText("Fallback")).toBeVisible();
    // `DisabledActionHint` wraps the real `<button>` in a `role="button"`
    // `<span>` trigger (see that component for why), so a bare role lookup
    // resolves to both the span and the button it wraps — intersect with
    // the `button` tag to land on the actual disabled button.
    const fallbackDelete = page
      .getByRole("button", {
        name: "Delete Other (unavailable)",
      })
      .and(page.locator("button"));
    await expect(fallbackDelete).toBeVisible();
    await expect(fallbackDelete).toBeDisabled();
    // The disabled button itself is `pointer-events: none`, so the hover
    // that opens its explanation is dispatched to its wrapping span — hover
    // that span (its immediate DOM parent), matching how a real pointer
    // interaction reaches it.
    await fallbackDelete.locator("xpath=..").hover();
    // A generous timeout here, not the default: this only waits on a local
    // Radix Tooltip open-delay (300ms), but that delay still runs on the
    // main thread behind whatever else is happening in the browser tab, so
    // it can lag well past 5s on a loaded machine without anything actually
    // being broken.
    await expect(
      page.getByText(
        "Items that cannot be categorized automatically are placed here, so this category cannot be deleted.",
      ),
    ).toBeVisible({ timeout: 15_000 });

    // --- Grocery Categories: create, rename, reorder, delete an ordinary one
    // (also exercises the create→rename→delete sequence for the stale-id
    // regression the Tasters flow below is specifically guarding) ---
    const categoryInput = page.getByLabel("Add a category");
    await categoryInput.fill("Spices");
    await page
      .locator("form")
      .filter({ has: categoryInput })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Spices", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Rename Spices" }).click();
    await page.getByLabel("Edit name for Spices").fill("Herbs & Spices");
    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Save" }),
    );
    await expect(page.getByText("Herbs & Spices")).toBeVisible();
    // Persisted correctly under the real server id, not a stale local one.
    await page.reload();
    await expect(page.getByText("Herbs & Spices")).toBeVisible();

    // Reordering is drag-and-drop (Gate 2 final correction pass removed
    // the Move up/down buttons). Both Grocery Categories and Tasters now
    // have "Drag to reorder" handles, so scope to this section specifically
    // (via its heading) rather than just filtering for the handle, which
    // would match both lists.
    const groceryCategoriesSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Grocery categories" }),
    });
    const groceryRows = groceryCategoriesSection.locator("li").filter({
      has: page.getByRole("button", { name: /^Drag to reorder/ }),
    });
    const namesBefore = await groceryRows.allTextContents();
    const indexBefore = namesBefore.findIndex((text) =>
      text.includes("Herbs & Spices"),
    );
    expect(indexBefore).toBeGreaterThan(0);

    await reorderUpViaKeyboard(page, "Drag to reorder Herbs & Spices");
    await page.waitForTimeout(500);

    const namesAfter = await groceryRows.allTextContents();
    const indexAfter = namesAfter.findIndex((text) =>
      text.includes("Herbs & Spices"),
    );
    expect(indexAfter).toBe(indexBefore - 1);

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Delete Herbs & Spices" }),
    );
    // Exact match: dnd-kit's own accessibility live region can still
    // contain "Herbs & Spices" as a substring of an earlier reorder
    // announcement even after the row itself is gone, since the region's
    // last announcement text isn't cleared on unmount.
    await expect(
      page.getByText("Herbs & Spices", { exact: true }),
    ).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Herbs & Spices", { exact: true }),
    ).not.toBeVisible();

    // --- Tasters: now a first-class Settings section, not just a link ---
    await expect(
      page.getByRole("heading", { name: "Tasters", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: "You" }),
    ).toBeVisible();

    // The built-in owner Taster's archive/delete are unavailable, explained
    // on hover rather than relying only on the "You" badge.
    // Same `DisabledActionHint` span/button ambiguity as the Grocery
    // Categories fallback above — intersect with `button` to get the real
    // disabled button, not its role="button" wrapper span.
    const ownerDelete = page
      .getByRole("button", {
        name: "Delete You (unavailable)",
      })
      .and(page.locator("button"));
    await expect(ownerDelete).toBeDisabled();
    await ownerDelete.locator("xpath=..").hover();
    // See the matching comment on the Grocery Categories fallback hover
    // above — same Tooltip open-delay, same generous timeout.
    await expect(
      page.getByText(
        "This is the built-in Taster for your own ratings, so it can't be archived or deleted.",
      ),
    ).toBeVisible({ timeout: 15_000 });

    // --- Tasters: create → rename → archive → delete, same session,
    // regression coverage for the stale-created-id bug (Gate 2 remediation)
    // — each mutation must persist under the real server id, not a locally
    // fabricated one that leaves the prior state behind. ---
    const addTasterInput = page.getByLabel("Add a taster");
    await addTasterInput.fill("Mom");
    await page
      .locator("form")
      .filter({ has: addTasterInput })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Mom", { exact: true })).toBeVisible();
    await expect(page.getByText("Added Mom.")).toBeVisible();

    // --- Tasters: drag-and-drop reordering, same treatment as Grocery
    // Categories (frontend and backend) ---
    await addTasterInput.fill("Dad");
    await page
      .locator("form")
      .filter({ has: addTasterInput })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Dad", { exact: true })).toBeVisible();

    const tastersSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Tasters", exact: true }),
    });
    const tasterRows = tastersSection.locator("li").filter({
      has: page.getByRole("button", { name: /^Drag to reorder/ }),
    });
    const tasterNamesBefore = await tasterRows.allTextContents();
    const dadIndexBefore = tasterNamesBefore.findIndex((text) =>
      text.includes("Dad"),
    );
    expect(dadIndexBefore).toBeGreaterThan(0);

    await reorderUpViaKeyboard(page, "Drag to reorder Dad");
    await page.waitForTimeout(500);

    const tasterNamesAfter = await tasterRows.allTextContents();
    const dadIndexAfter = tasterNamesAfter.findIndex((text) =>
      text.includes("Dad"),
    );
    expect(dadIndexAfter).toBe(dadIndexBefore - 1);

    await page.reload();
    // `allTextContents()` doesn't retry like a Playwright assertion does —
    // wait for the section to actually be hydrated and rendered first, or
    // this can read the DOM before the reloaded page is ready.
    await expect(
      page.getByRole("heading", { name: "Tasters", exact: true }),
    ).toBeVisible();
    await expect(tasterRows.filter({ hasText: "Dad" })).toBeVisible();
    const tasterNamesReloaded = await tasterRows.allTextContents();
    const dadIndexReloaded = tasterNamesReloaded.findIndex((text) =>
      text.includes("Dad"),
    );
    expect(dadIndexReloaded).toBe(dadIndexAfter);

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Delete Dad" }),
    );
    await expect(page.getByText("Dad", { exact: true })).not.toBeVisible();

    await page.getByRole("button", { name: "Rename Mom" }).click();
    await page.getByLabel("Edit name for Mom").fill("Mom (renamed)");
    await clickAndWaitForServerAction(
      page,
      page
        .locator("form")
        .filter({ has: page.getByLabel("Edit name for Mom") })
        .getByRole("button", { name: "Save" }),
    );
    await expect(page.getByText("Mom (renamed)")).toBeVisible();
    await page.reload();
    // If rename had used a stale (locally fabricated) id, the server-side
    // mutation would have silently no-op'd and the original "Mom" name
    // would reappear after reload — asserting the renamed value survives a
    // reload is exactly what catches that regression.
    await expect(page.getByText("Mom (renamed)")).toBeVisible();

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Archive Mom (renamed)" }),
    );
    // Generous timeout, not the default — same rationale as the fallback/
    // owner Tooltip hovers above: this waits on real render/hydration work
    // on a Next dev server under load, not a fixed local delay, and can
    // lag past the 5s default without anything actually being broken.
    // Exact match: the archive success feedback banner renders "Archived."
    // (from the server action's message) in the same commit as the row's
    // "Archived" badge, so a substring match here is ambiguous by
    // construction, not just occasionally flaky — same class of bug as the
    // dnd-kit live-region note above.
    await expect(page.getByText("Archived", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.reload();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Delete Mom (renamed)" }),
    );
    await expect(page.getByText("Mom (renamed)")).not.toBeVisible();
    await page.reload();
    await expect(page.getByText("Mom (renamed)")).not.toBeVisible();
  });
});
