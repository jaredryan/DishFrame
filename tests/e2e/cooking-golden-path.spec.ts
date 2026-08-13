import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";

type SeedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
};

const SEED_SCRIPT = path.join(__dirname, "seed-session.ts");

// See preferences-tasters-grocery.spec.ts for why this shells out to `tsx`
// rather than importing seed-session.ts directly.
function seed(...args: string[]): string {
  return execFileSync("pnpm", ["exec", "tsx", SEED_SCRIPT, ...args], {
    encoding: "utf-8",
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      NODE_OPTIONS: "--conditions=react-server",
    },
  });
}

/**
 * BUILD_PLAN.md Slice 7's required journey (Gate 4), updated for Slice 8's
 * dedicated Cooking Mode UI: Cooking Setup → Start cooking → edit the
 * active plan via the Manage-plan sheet → End early. Uses a two-Section
 * Recipe so plan editing (remove/restore) can be exercised without ever
 * hitting the final-unit guard (§27.4) — that guard's own dialog is
 * covered by the integration suite, not here.
 */
test.describe("Cooking: setup, start, edit active plan, end early", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    const { userId: seededUserId, cookies } = JSON.parse(seed("login")) as {
      userId: string;
      cookies: SeedCookie[];
    };
    userId = seededUserId;

    await context.addCookies(
      cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      })),
    );
  });

  test.afterEach(() => {
    seed("cleanup", userId);
  });

  test("golden path", async ({ page }) => {
    // Slice 16 correction: the default 30s test timeout is no longer
    // enough headroom. This journey's very first steps hit `/recipes/new`
    // and `/recipes/[dishId]` for the first time in the whole suite (see
    // the two per-action overrides below), and the Recipe detail page's
    // action menu (`DishDetailActions`) now also reaches the whole sharing
    // feature (Slice 16's `ShareDialog` → `sharing/actions.ts` → the
    // independent-copy engine's full dependency graph) — a heavier
    // first-time dev-mode compile than any individual per-action override
    // can rescue, since an action-level `timeout` can never exceed an
    // already-expiring overall test deadline (Playwright applies whichever
    // limit is hit first). Doubling the whole-test budget is the correct
    // fix here, not another per-action bump.
    test.setTimeout(60_000);

    const title = `Cooking Test Bowl ${Date.now()}`;

    // --- Create a Recipe with two Sections, each with one ingredient ---
    await page.goto("/recipes/new");
    // Generous timeout, not the default: this is the first navigation of the
    // whole suite, so it pays Turbopack's one-time dev-mode compile cost for
    // this route — heavier since Slice 13 added the FDC search dialog and
    // nutrition fields — on top of the network round trip (see the same
    // pattern below for /cook/[sessionId]).
    await page.getByLabel("Recipe title").fill(title, { timeout: 15_000 });

    // Each Section is authored in its own modal session (opened by "Add
    // section", committed by "Finish section") — one at a time, so the same
    // dialog locator can be reused for both.
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Prep");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Ginger");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await sectionDialog.getByLabel("Section name").fill("Sear");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Soy sauce");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    // Generous timeout, not the default: this is the first navigation to
    // /recipes/[dishId] in the whole suite, so it pays Turbopack's one-time
    // dev-mode compile cost for that route — heavier since Slice 13 added
    // nutrition rendering to the detail page too — on top of the network
    // round trip (same pattern as the two waits above/below it in this file).
    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 15_000,
    });

    // --- Cooking Setup: both Sections appear, prefilled and included ---
    // Scoped to <main> — the sidebar's own "Cook" nav link (to the sessions
    // index) also matches this accessible name.
    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    // Generous timeout, not the default: like the two waits above, this is
    // the first navigation to /recipes/[dishId]/cook in the whole suite, so
    // it pays Turbopack's one-time dev-mode compile cost for that route too.
    await expect(page).toHaveURL(/\/cook$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Cooking setup" }),
    ).toBeVisible();
    await expect(page.getByText("Prep", { exact: true })).toBeVisible();
    await expect(page.getByText("Sear", { exact: true })).toBeVisible();

    // --- Start cooking: a real Cooking Session is created, landing in the
    // dedicated Cooking Mode surface focused on the first unit ---
    await page.getByRole("button", { name: "Start cooking" }).click();
    // Generous timeout, not the default: this is the first navigation to
    // /cook/[sessionId] in the whole suite, so it pays Turbopack's one-time
    // dev-mode compile cost for that route (observed ~6s) on top of the
    // network round trip — a known cause of slowness, not a hang.
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    const sessionId = page.url().match(/\/cook\/([^/]+)/)![1];
    await expect(page.getByRole("heading", { name: "Prep" })).toBeVisible();
    await expect(page.getByText("Ginger")).toBeVisible();

    // --- Switch focus to the other unit in one tap ---
    await page.getByRole("button", { name: /Sear/ }).click();
    await expect(page.getByRole("heading", { name: "Sear" })).toBeVisible();
    await expect(page.getByText("Soy sauce")).toBeVisible();

    // --- Edit the active plan via the Manage-plan sheet: remove "Prep",
    // confirm it moves to Removed, then restore it ---
    await page.getByRole("button", { name: "Manage plan" }).click();
    await page.getByRole("button", { name: "Remove Prep" }).click();
    await expect(
      page.getByRole("heading", { name: "Removed from this session" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore Prep" }).click();
    await expect(
      page.getByRole("heading", { name: "Removed from this session" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // --- End early: redirected to the optional Review (§30.2); "Not now"
    // returns to the session with partial progress preserved and state
    // updated ---
    await page.getByRole("button", { name: "End" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "End early" })
      .click();
    await expect(page).toHaveURL(`/cook/${sessionId}/review`);
    await page.getByRole("link", { name: "Not now" }).click();
    await expect(page).toHaveURL(`/cook/${sessionId}`);
    await expect(page.getByText("Ended early")).toBeVisible();
    await expect(page.getByRole("button", { name: "End" })).not.toBeVisible();
  });
});
