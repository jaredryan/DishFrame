import { test, expect } from "@playwright/test";
import { cleanup, login, waitForServerAction } from "./helpers";

/**
 * PRODUCT_SPEC.md §91: destructive account deletion — explicit typed-email
 * confirmation, the confirm action staying disabled until it matches, the
 * deletion itself ending the authenticated session, and the account no
 * longer behaving as signed in afterward. `cleanup(userId)` in `afterEach`
 * is a safe no-op once the account is actually deleted (seed-session.ts's
 * cleanup swallows a missing row).
 */
test.describe("Account deletion", () => {
  let userId: string;

  test.afterEach(() => {
    cleanup(userId);
  });

  test("typed-email confirmation gates the destructive action", async ({
    context,
    page,
  }) => {
    const seeded = await login(context);
    userId = seeded.userId;

    await page.goto("/profile");

    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(dialog).toBeVisible();

    const confirmButton = dialog.getByRole("button", {
      name: "Delete my account",
    });
    await expect(confirmButton).toBeDisabled();

    await dialog
      .locator("#confirm-email")
      .fill("not-the-right-email@example.invalid");
    await expect(confirmButton).toBeDisabled();

    await dialog.locator("#confirm-email").fill("");
    await dialog.locator("#confirm-email").fill(seeded.email);
    await expect(confirmButton).toBeEnabled();

    // Cancelling leaves the account untouched — a follow-up reload still
    // shows the same authenticated Profile page.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("deleting the account ends the session and the account stops behaving as authenticated", async ({
    context,
    page,
  }) => {
    const seeded = await login(context);
    userId = seeded.userId;

    await page.goto("/profile");

    await page.getByRole("button", { name: "Delete account" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await dialog.locator("#confirm-email").fill(seeded.email);

    await waitForServerAction(page, () =>
      dialog.getByRole("button", { name: "Delete my account" }).click(),
    );

    // Successful deletion signs out and lands on the public marketing home,
    // not the authenticated app shell.
    await expect(page).toHaveURL("/", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "A better framework for the dishes you cook.",
      }),
    ).toBeVisible();

    // The deleted account's session is gone — a protected route redirects
    // to sign-in exactly like a signed-out visitor, not the app shell.
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome to DishFrame" }),
    ).toBeVisible();
  });
});
