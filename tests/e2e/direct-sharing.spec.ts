import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { cleanup, login } from "./helpers";

async function openMoreActions(page: Page) {
  await page.getByRole("button", { name: "More actions" }).click();
}

/**
 * Creates a one-ingredient Recipe as the currently-logged-in `page` and
 * sends it directly to `recipientEmail` through the contextual Send dialog
 * (Recipe detail page's "More actions" menu,
 * `direct-share-single-item-dialog.tsx`) — the shared starting point every
 * scenario below needs before it can exercise accept/decline/cancel.
 */
async function createAndSendRecipe(
  page: Page,
  recipientEmail: string,
): Promise<{ title: string }> {
  const title = `Shared Ginger Soy Bowl ${Date.now()}`;

  await page.goto("/recipes/new");
  await page.getByLabel("Recipe title").fill(title);
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const editorDialog = page.getByRole("dialog");
  await editorDialog.getByRole("button", { name: "Add ingredient" }).click();
  await editorDialog.getByLabel("Ingredient name").fill("Ginger");
  await editorDialog.getByRole("button", { name: "Finish section" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/(?!new$)[^/]+$/);

  await openMoreActions(page);
  await page.getByRole("menuitem", { name: "Send" }).click();
  const sendDialog = page.getByRole("dialog");
  await sendDialog.getByLabel("Recipient's email").fill(recipientEmail);
  await sendDialog.getByRole("button", { name: "Review" }).click();
  await sendDialog.getByRole("button", { name: "Send" }).click();
  // On success the dialog closes itself and shows a transient success toast
  // rather than an inline "Sent." confirmation step.
  await expect(
    page.getByText(`Sent "${title}" to ${recipientEmail}.`),
  ).toBeVisible();
  await expect(sendDialog).not.toBeVisible();

  return { title };
}

/**
 * Direct-sharing accept/decline/sender-cancel — the three flows
 * `docs/TODO.md` flagged as having no E2E coverage (integration tests
 * already cover the server-side outcomes; this is the real cross-account
 * UI round trip: sender sends, recipient's own browser session sees and
 * acts on it, sender's own session reflects the result). Each test seeds
 * two independent accounts/browser contexts (`browser.newContext()`,
 * following print.spec.ts's established pattern for a second session) so
 * sender/recipient state is never conflated with one shared context's
 * cookies.
 */
test.describe("Direct sharing: accept, decline, and sender-cancel", () => {
  let senderId: string;
  let recipientId: string;
  let recipientContext: BrowserContext;
  let recipientPage: Page;
  let recipientEmail: string;

  test.beforeEach(async ({ context, browser }) => {
    const sender = await login(context, { name: "E2E Sender" });
    senderId = sender.userId;

    recipientContext = await browser.newContext();
    const recipient = await login(recipientContext, { name: "E2E Recipient" });
    recipientId = recipient.userId;
    recipientEmail = recipient.email;
    recipientPage = await recipientContext.newPage();
  });

  test.afterEach(async () => {
    await recipientContext.close();
    cleanup(senderId);
    cleanup(recipientId);
  });

  test("recipient can see and accept a pending direct share; the accepted copy and status appear on both sides", async ({
    page,
  }) => {
    const { title } = await createAndSendRecipe(page, recipientEmail);

    // Recipient sees the incoming share, with the sender attributed.
    await recipientPage.goto("/share");
    const receivedCard = recipientPage.locator("li", { hasText: title });
    await expect(receivedCard).toBeVisible();
    await expect(receivedCard.getByText("Pending")).toBeVisible();
    await expect(receivedCard.getByText(/From E2E Sender/)).toBeVisible();

    // Accept it through the UI.
    await receivedCard.getByRole("button", { name: "Accept" }).click();
    await expect(
      receivedCard.getByRole("link", { name: "View your copy" }),
    ).toBeVisible();
    // Once resolved, PENDING's Accept/Decline row no longer renders.
    await expect(
      receivedCard.getByRole("button", { name: "Accept" }),
    ).toHaveCount(0);

    // The accepted copy is real, owned content in the recipient's own
    // library, not just a UI-only flag — the lower-level guarantee (a
    // genuine independent copy, correct ownership/content) is already
    // proven by sharing's own integration tests; this only needs to prove
    // the link actually resolves to a real page for this account.
    await receivedCard.getByRole("link", { name: "View your copy" }).click();
    await expect(
      recipientPage.getByRole("heading", { name: title }),
    ).toBeVisible();

    // The sender's own Sent list reflects the acceptance.
    await page.goto("/share");
    const sentCard = page.locator("li", { hasText: title });
    await expect(sentCard.getByText("Accepted")).toBeVisible();
  });

  test("recipient can decline a pending direct share; it is never treated as accepted on either side", async ({
    page,
  }) => {
    const { title } = await createAndSendRecipe(page, recipientEmail);

    await recipientPage.goto("/share");
    const receivedCard = recipientPage.locator("li", { hasText: title });
    await expect(receivedCard.getByText("Pending")).toBeVisible();

    await receivedCard.getByRole("button", { name: "Decline" }).click();
    await expect(receivedCard.getByText("Declined")).toBeVisible();
    await expect(
      receivedCard.getByRole("link", { name: "View your copy" }),
    ).toHaveCount(0);
    await expect(
      receivedCard.getByRole("button", { name: "Accept" }),
    ).toHaveCount(0);

    // The sender's own Sent list reflects the decline, not an acceptance.
    await page.goto("/share");
    const sentCard = page.locator("li", { hasText: title });
    await expect(sentCard.getByText("Declined")).toBeVisible();
    await expect(sentCard.getByText("Accepted")).toHaveCount(0);
  });

  test("sender can cancel a pending direct share; the recipient can no longer accept it", async ({
    page,
  }) => {
    const { title } = await createAndSendRecipe(page, recipientEmail);

    await page.goto("/share");
    const sentCard = page.locator("li", { hasText: title });
    await expect(sentCard.getByText("Pending")).toBeVisible();

    await sentCard.getByRole("button", { name: "Cancel" }).click();
    await expect(sentCard.getByText("Cancelled")).toBeVisible();

    // The recipient's own Received list reflects the current, established
    // DishFrame semantics for a canceled delivery — "No longer available"
    // (direct-share-received-list.tsx's STATUS_LABEL), not a silent
    // disappearance and not an actionable Pending row.
    await recipientPage.goto("/share");
    const receivedCard = recipientPage.locator("li", { hasText: title });
    await expect(receivedCard.getByText("No longer available")).toBeVisible();
    await expect(
      receivedCard.getByRole("button", { name: "Accept" }),
    ).toHaveCount(0);
    await expect(
      receivedCard.getByRole("button", { name: "Decline" }),
    ).toHaveCount(0);
  });
});
