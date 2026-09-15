import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * PRODUCT_SPEC.md §13.7/§13.8/§37.2 — the "More actions" overflow menu's
 * Version history and Compare versions destinations
 * (dish-detail-actions.tsx) had no E2E coverage at all: viewing a
 * historical Version's own read-only page, promoting one back to current,
 * and the version-diff page. Reuses recipe-golden-path.spec.ts's own
 * create/edit/version-choice steps to reach a two-Version Recipe rather
 * than re-deriving them.
 */
test.describe("Version history: view a historical version, promote it, compare versions", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("golden path", async ({ page }) => {
    const title = `History Compare Bowl ${Date.now()}`;

    // --- Create a one-ingredient Recipe (V1.0) ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title);
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByRole("button", { name: "Add ingredient" }).click();
    await createDialog.getByLabel("Ingredient name").fill("Ginger");
    await createDialog.getByRole("button", { name: "Finish section" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // (?!new$) — plain [^/]+ also matches the literal "new", so this can
    // pass while still on /recipes/new (before the save navigation lands),
    // letting the dishUrl capture below grab the wrong URL. Same fix as
    // recipe-golden-path.spec.ts's second test. The trailing `$` already
    // rules out a further `/edit` segment (an extra "/" wouldn't match
    // [^/]+$), so no separate exclusion is needed for that.
    await expect(page).toHaveURL(/\/recipes\/(?!new$)[^/]+$/);
    const dishUrl = page.url();

    // --- Rename the ingredient and start a new major Version (V2.0) ---
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Edit Section 1" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByRole("button", { name: "Expand Ginger" }).click();
    const nameInput = editDialog.getByLabel("Ingredient name");
    await nameInput.fill("");
    await nameInput.fill("Roasted ginger");
    await editDialog.getByRole("button", { name: "Finish section" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("How should this change be saved?"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start a new version" }).click();
    await expect(page).toHaveURL(dishUrl);
    await expect(page.getByText("V2.0", { exact: true })).toBeVisible();
    await expect(page.getByText("Roasted ginger")).toBeVisible();

    // --- Version history, reached via More actions, opens on the current
    // Version and says so ---
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Version history" }).click();
    await expect(page).toHaveURL(/\/versions\/[^/]+$/);
    await expect(page.getByText("This is the current version.")).toBeVisible();
    await expect(page.getByText("Roasted ginger")).toBeVisible();

    // --- Switch to V1.0 via the searchable Version picker: real content
    // for a real historical Version, correctly marked read-only ---
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "V1.0" }).click();
    await expect(
      page.getByText(
        "This is a historical version — only description, photo, and note can be updated. Other edits will create a new version.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Ginger", { exact: true })).toBeVisible();
    await expect(page.getByText("Roasted ginger")).not.toBeVisible();

    // --- Promote V1.0's untouched content back to current (V3.0) ---
    await page
      .getByRole("button", { name: "Promote to a new version" })
      .click();
    await expect(
      page.getByText("Make this direction current again?"),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Promote" })
      .click();
    await expect(page).toHaveURL(dishUrl);
    await expect(page.getByText("V3.0", { exact: true })).toBeVisible();
    await expect(page.getByText("Ginger", { exact: true })).toBeVisible();
    await expect(page.getByText("Roasted ginger")).not.toBeVisible();

    // --- Compare versions: promotion is an exact copy of V1.0, so its
    // default comparison pair (current vs. its own source Version) must
    // show no differences at all — a real end-to-end fidelity check the
    // unit-level compare.test.ts can't provide. ---
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Compare versions" }).click();
    await expect(page).toHaveURL(/\/compare(\?.*)?$/);
    await expect(
      page.getByText("No differences between V1.0 and V3.0."),
    ).toBeVisible();

    // --- Explicitly compare V2.0 against V3.0 and see the ingredient
    // rename surface as a real diff. ---
    const fromPicker = page.getByRole("combobox", {
      name: "Compare from version",
    });
    await fromPicker.click();
    await page.getByRole("option", { name: "V2.0" }).click();
    await expect(page).toHaveURL(/from=[^&]+&to=[^&]+/);
    await expect(page.getByText("Ingredients")).toBeVisible();
    await expect(page.getByText("V2.0: Roasted ginger")).toBeVisible();
    await expect(page.getByText("V3.0: Ginger")).toBeVisible();

    // --- Clean up ---
    await page.goto(dishUrl);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(page).toHaveURL(/\/recipes$/);
  });
});
