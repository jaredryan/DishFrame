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
 * Golden path for BUILD_PLAN.md Slice 3: create a Recipe with one
 * ingredient and no instruction (must succeed, §8.3), view it, edit it,
 * archive it, restore it, duplicate it, and delete the duplicate.
 */
test.describe("Recipes: create, view, edit, archive, restore, duplicate, delete", () => {
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
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByPlaceholder("Ingredient (e.g. Soy sauce)").fill("Ginger");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Idea")).toBeVisible();
    await expect(page.getByText("Ginger", { exact: true })).toBeVisible();

    const dishUrl = page.url();

    // --- Edit: add an instruction, save ---
    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/edit$/);

    await page.getByRole("button", { name: "Add instruction" }).click();
    await page
      .getByRole("textbox", { name: "Instruction 1" })
      .fill("Grate the ginger.");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(dishUrl);
    await expect(page.getByText("Grate the ginger.")).toBeVisible();

    // --- Archive: confirm it disappears from the default library view ---
    await page.getByRole("button", { name: "Archive" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Archive" })
      .click();
    await expect(page.getByText("Archived")).toBeVisible();

    await page.goto("/recipes");
    await expect(page.getByText(title)).not.toBeVisible();
    await page.getByRole("link", { name: "Show archived" }).click();
    await expect(page.getByText(title)).toBeVisible();

    // --- Restore ---
    await page.goto(dishUrl);
    await page.getByRole("button", { name: "Restore" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Restore" })
      .click();
    await expect(page.getByText("Active")).toBeVisible();

    await page.goto("/recipes");
    await expect(page.getByText(title)).toBeVisible();

    // --- Duplicate: confirm the copy's title and independent identity ---
    await page.goto(dishUrl);
    await page.getByRole("button", { name: "Duplicate" }).click();
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
    await page.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();

    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByText(copyTitle)).not.toBeVisible();
  });
});
