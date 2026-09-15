import { test, expect, type BrowserContext } from "@playwright/test";
import {
  addAuthSession,
  cleanup,
  clickAndWaitForServerAction,
  login,
} from "./helpers";

/**
 * docs/E2E_FINAL_AUDIT.md: /profile's AuthSessionManager (session listing,
 * revoke-one, revoke-others — PRODUCT_SPEC.md §89) had only unit/
 * integration coverage (auth-session-manager.test.tsx for UI wiring,
 * account.integration.test.ts for the authorization boundary — both left
 * untouched here), never a real multi-session round trip. This seeds three
 * genuine Better Auth sessions for one account via `addAuthSession`
 * (seed-session.ts's `add-session`, minting an extra session row for an
 * existing userId rather than a new user), each held by its own browser
 * context, and revokes them through the real /profile UI.
 */
test.describe("Signed-in devices: list, revoke one, revoke all others", () => {
  let userId: string;
  let otherContextA: BrowserContext;
  let otherContextB: BrowserContext;

  test.beforeEach(async ({ context, browser }) => {
    const seeded = await login(context);
    userId = seeded.userId;

    otherContextA = await browser.newContext();
    await addAuthSession(otherContextA, userId);

    otherContextB = await browser.newContext();
    await addAuthSession(otherContextB, userId);
  });

  test.afterEach(async () => {
    await otherContextA.close();
    await otherContextB.close();
    cleanup(userId);
  });

  test("lists all sessions, revokes one, then revokes the rest", async ({
    page,
  }) => {
    const pageA = await otherContextA.newPage();
    const pageB = await otherContextB.newPage();

    // Both other sessions are real and independently authenticated.
    await pageA.goto("/profile");
    await expect(pageA.getByRole("heading", { name: "Profile" })).toBeVisible();
    await pageB.goto("/profile");
    await expect(pageB.getByRole("heading", { name: "Profile" })).toBeVisible();

    // The current session's own /profile lists all three.
    await page.goto("/profile");
    const sessionList = page.getByRole("list");
    await expect(sessionList.getByRole("listitem")).toHaveCount(3);
    // Scoped to the session list and exact-matched: "This device" is also a
    // substring of profile-actions.tsx's "End your session on this device."
    // hint text elsewhere on the page.
    const currentBadge = sessionList.getByText("This device", {
      exact: true,
    });
    await expect(currentBadge).toHaveCount(1);
    await expect(currentBadge).toBeVisible();
    // Scoped and exact-matched: an unscoped substring match on "Sign out"
    // also matches the page's separate "Sign out all other devices" button.
    const signOutButtons = sessionList.getByRole("button", {
      name: "Sign out",
      exact: true,
    });
    await expect(signOutButtons).toHaveCount(2);

    // Revoke exactly one other session.
    await clickAndWaitForServerAction(page, signOutButtons.first());
    await expect(sessionList.getByRole("listitem")).toHaveCount(2);
    await expect(signOutButtons).toHaveCount(1);

    // Exactly one of the two other contexts lost authenticated access; the
    // other still has real access — the retained session stays usable.
    await pageA.goto("/profile");
    await pageB.goto("/profile");
    const stillAuthed = [pageA, pageB].filter(
      (p) => new URL(p.url()).pathname === "/profile",
    );
    const signedOut = [pageA, pageB].filter((p) =>
      new URL(p.url()).pathname.startsWith("/sign-in"),
    );
    expect(stillAuthed).toHaveLength(1);
    expect(signedOut).toHaveLength(1);

    // "Sign out all other devices" revokes whatever's left.
    const revokeOthersButton = page.getByRole("button", {
      name: "Sign out all other devices",
      exact: true,
    });
    await clickAndWaitForServerAction(page, revokeOthersButton);
    await expect(sessionList.getByRole("listitem")).toHaveCount(1);
    const remainingBadge = sessionList.getByText("This device", {
      exact: true,
    });
    await expect(remainingBadge).toHaveCount(1);
    await expect(remainingBadge).toBeVisible();
    await expect(revokeOthersButton).toHaveCount(0);

    await stillAuthed[0].goto("/profile");
    await expect(stillAuthed[0]).toHaveURL(/\/sign-in/);

    // The current (never-revoked) session remains fully usable throughout.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });
});
