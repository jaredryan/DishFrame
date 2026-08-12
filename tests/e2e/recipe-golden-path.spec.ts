import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

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
 * Design remediation pass: Archive/Restore/Duplicate/Delete moved off the
 * detail page's own button row into the "More actions" overflow menu
 * (src/components/domain/dish/dish-detail-actions.tsx) — every one of
 * those now opens from here rather than being a directly-clickable button.
 */
async function openMoreActions(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click();
}

/**
 * Golden path for BUILD_PLAN.md Slice 3: create a Recipe with one
 * ingredient and no instruction (must succeed, §8.3), view it, edit it,
 * archive it, restore it, duplicate it, and delete the duplicate.
 */
test.describe("Recipes: create, view, edit, archive, restore, duplicate, delete", () => {
  // Both tests in this suite mutate the same local dev server + Postgres
  // database; running them in parallel workers occasionally produced a
  // >5s timeout on an unrelated assertion under load.
  // Serial mode removes the shared-resource contention without forcing
  // every unrelated Playwright suite onto one worker.
  test.describe.configure({ mode: "serial" });

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
    const title = `Ginger Soy Bowl ${Date.now()}`;

    // --- Create: one ingredient, no instruction — must save per §8.3 ---
    await page.goto("/recipes");
    await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();

    await page.getByRole("link", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/recipes\/new/);

    await page.getByLabel("Recipe title").fill(title);

    await page.getByRole("button", { name: "Add section", exact: true }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByRole("button", { name: "Add ingredient" }).click();
    await createDialog.getByLabel("Ingredient name").fill("Ginger");

    // A substitute clicked open and then left entirely blank must not
    // block creation (Gate 2 remediation — this is the exact bug this
    // pass fixed: a fully-unused substitute used to fail Zod validation).
    await createDialog.getByRole("button", { name: "Add substitute" }).click();
    await createDialog.getByRole("button", { name: "Finish section" }).click();

    // exact: true — a Section's "Save as reusable Part" trigger (Slice 6)
    // also has an accessible name containing "Save", which Playwright's
    // default substring name matching would otherwise also match.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Idea")).toBeVisible();
    await expect(page.getByText("Ginger", { exact: true })).toBeVisible();
    await expect(page.getByText("V1.0")).toBeVisible();

    const dishUrl = page.url();

    // --- Edit: add an instruction (a cooking-content change — triggers the
    // minor/major version choice), save it into this version ---
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/);

    // Slice 6 correction pass §4: a Section loaded from an already-saved
    // Dish now defaults to its view-first (collapsed) presentation — the
    // explicit Edit toggle opens it in the Section modal, where "Finish
    // section" commits the edit back into this page before the page-level
    // Save persists the whole Recipe.
    await page.getByRole("button", { name: "Edit Section 1" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByRole("button", { name: "Add instruction" }).click();
    await editDialog
      .getByRole("textbox", { name: "Instruction 1" })
      .fill("Grate the ginger.");
    await editDialog.getByRole("button", { name: "Finish section" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      page.getByText("How should this change be saved?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save as a refinement" }).click();

    await expect(page).toHaveURL(dishUrl);
    await expect(page.getByText("Grate the ginger.")).toBeVisible();
    await expect(page.getByText("V1.1")).toBeVisible();

    // --- Archive: confirm it disappears from the default library view ---
    await openMoreActions(page);
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive" })
      .click();
    await expect(page.getByText("Archived")).toBeVisible();

    // Slice 10 (BUILD_PLAN.md, §43.3): the old "Show archived" link is gone
    // — Stage's own value set now includes Archived, and selecting it as a
    // Stage filter chip is the one and only way archived items appear.
    await page.goto("/recipes");
    await expect(page.getByText(title)).not.toBeVisible();
    await page.getByRole("button", { name: "Stage" }).click();
    await page
      .locator('[data-slot="popover-content"]')
      .getByText("Archived")
      .click();
    await expect(page.getByText(title)).toBeVisible();

    // Clear the Stage filter before continuing — the rest of the golden
    // path re-navigates to /recipes expecting the ordinary default view.
    await page.getByRole("button", { name: "Clear all" }).click();

    // --- Restore ---
    await page.goto(dishUrl);
    await openMoreActions(page);
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Restore" })
      .click();
    // The dialog's own Select defaults to "Active" the moment it opens, so
    // getByText("Active") alone would already be satisfied by that label
    // and wouldn't prove the restore mutation actually completed. Wait for
    // the dialog to close first — it only does so after the Server Action
    // resolves — so the subsequent goto("/recipes") can't race ahead of it.
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();

    await page.goto("/recipes");
    await expect(page.getByText(title)).toBeVisible();

    // --- Duplicate: confirm the copy's title and independent identity ---
    await page.goto(dishUrl);
    await openMoreActions(page);
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Duplicate" })
      .click();

    await expect(page).not.toHaveURL(dishUrl);
    const copyTitle = `Copy of ${title}`;
    await expect(page.getByRole("heading", { name: copyTitle })).toBeVisible();
    const copyUrl = page.url();
    expect(copyUrl).not.toBe(dishUrl);

    // --- Delete the duplicate ---
    await openMoreActions(page);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();

    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByText(copyTitle)).not.toBeVisible();
  });

  /**
   * Slice 3 Gate 2 correction pass: covers the three
   * areas that changed — foundational Ingredient controls (fraction/mixed-
   * number quantity entry, range, approximate, optional), the minor/major
   * Version choice when Ingredient content changes (here: choosing a new
   * major Version), and the library's grid/list view toggle.
   */
  test("ingredient controls, a major Version choice, and the grid/list toggle", async ({
    page,
  }) => {
    const title = `Herb Broth ${Date.now()}`;

    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title);

    await page.getByRole("button", { name: "Add section", exact: true }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByRole("button", { name: "Add ingredient" }).click();

    await createDialog.getByLabel("Ingredient name").fill("Vegetable broth");
    await createDialog.getByLabel("Quantity", { exact: true }).fill("1 1/2");
    await createDialog.getByLabel("Amount", { exact: true }).click();
    await page.getByRole("option", { name: "Range" }).click();
    await createDialog.getByLabel("To", { exact: true }).fill("2");
    await createDialog.getByLabel("Unit", { exact: true }).fill("cup");
    await createDialog.getByRole("checkbox", { name: "Approximate" }).check();
    await createDialog.getByRole("checkbox", { name: "Optional" }).check();
    await createDialog
      .getByLabel("Preparation note", { exact: true })
      .fill("warmed");

    // A complete substitute (Gate 2 remediation: substitutes now use the
    // same explicit amount-entry pattern) must persist and display.
    await createDialog.getByRole("button", { name: "Add substitute" }).click();
    await createDialog.getByLabel("Substitute name").fill("Chicken broth");
    await createDialog.getByRole("button", { name: "Finish section" }).click();

    // exact: true — see the "golden path" test above for why.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // (?!new$) — plain [^/]+ also matches the literal "new", so this can
    // pass while still on /recipes/new (before the save navigation lands),
    // letting the dishUrl capture below grab the wrong URL. Same fix
    // already used in home-dashboard.spec.ts and print.spec.ts.
    await expect(page).toHaveURL(/\/recipes\/(?!new$)[^/]+$/);
    // "1 1/2" parses to the decimal 1.5, formatted plainly on the detail
    // page (fraction *display* is Slice 5 scaling/formatting scope, not
    // Slice 3) — approximate + range + unit + optional all show together.
    await expect(
      page.getByText(/about 1\.5–2 cup Vegetable broth/),
    ).toBeVisible();
    await expect(page.getByText("(optional)")).toBeVisible();
    await expect(page.getByText(/Substitute: Chicken broth/)).toBeVisible();

    const dishUrl = page.url();

    // --- Edit the ingredient's name (a cooking-content change) and start
    // a new major Version ---
    await page.getByRole("link", { name: "Edit" }).click();
    // Slice 6 correction pass §4: see the golden path test above.
    await page.getByRole("button", { name: "Edit Section 1" }).click();
    const editDialog = page.getByRole("dialog");
    const nameInput = editDialog.getByLabel("Ingredient name");
    await nameInput.fill("");
    await nameInput.fill("Roasted vegetable broth");
    await editDialog.getByRole("button", { name: "Finish section" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      page.getByText("How should this change be saved?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start a new version" }).click();

    await expect(page).toHaveURL(dishUrl);
    // exact: true — the seeded Version note ("V1.0 → V2.0:", Slice 4) also
    // contains "V2.0" as a substring, so a non-exact match is ambiguous.
    await expect(page.getByText("V2.0", { exact: true })).toBeVisible();
    await expect(page.getByText(/Roasted vegetable broth/)).toBeVisible();
    // The substitute survives the edit unchanged.
    await expect(page.getByText(/Substitute: Chicken broth/)).toBeVisible();

    // --- Library grid/compact toggle: same Recipe visible in both views ---
    await page.goto("/recipes");
    await expect(
      page.getByRole("radio", { name: "Grid view" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("radio", { name: "Compact view" }).click();
    await expect(
      page.getByRole("radio", { name: "Compact view" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("radio", { name: "Grid view" }).click();
    await expect(page.getByText(title)).toBeVisible();

    // --- Clean up ---
    await page.goto(dishUrl);
    await openMoreActions(page);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(page).toHaveURL(/\/recipes$/);
  });
});
