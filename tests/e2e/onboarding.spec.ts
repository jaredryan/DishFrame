import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  test,
  expect,
  type Page,
  type Locator,
  type Response,
} from "@playwright/test";

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
 * GroceryCategoryManager and TasterManager both apply mutations to local
 * state optimistically, before their Server Action's fetch resolves — so a
 * client-side visibility assertion right after a click can pass before the
 * mutation has actually reached the database. That's invisible normally,
 * but a subsequent `page.reload()` re-fetches server truth, so it must wait
 * for the real round trip, not just the optimistic render. Waiting for the
 * action's own POST response here (registered before the click, so it can't
 * resolve and be missed before we start listening) is what makes it safe to
 * reload immediately afterward.
 *
 * The predicate is scoped to same-origin responses, not just any POST:
 * `<SpeedInsights />` (mounted app-wide in `src/app/layout.tsx`) injects an
 * external debug-script beacon in dev mode that also POSTs shortly after
 * page load. An unscoped `method() === "POST"` predicate can resolve on
 * that beacon instead of the Server Action's own response, so the
 * `Promise.all` returns before the real mutation lands — the assertion
 * right after usually still passes on retry, but occasionally races a
 * slower-than-usual save and times out. Server Actions always POST to the
 * current page's own origin, so filtering to same-origin excludes the
 * unrelated third-party beacon.
 */
function isSameOriginPost(page: Page, response: Response) {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).origin === new URL(page.url()).origin &&
    Boolean(response.request().headers()["next-action"])
  );
}

async function clickAndWaitForServerAction(page: Page, locator: Locator) {
  await Promise.all([
    page.waitForResponse((response) => isSameOriginPost(page, response)),
    locator.click(),
  ]);
}

/**
 * BUILD_PLAN.md Slice 20: a brand-new account's first authenticated page
 * load shows the skippable initial introduction (PRODUCT_SPEC.md §92.2),
 * and completing/skipping it persists server-side (§92.5) — confirmed here
 * via a reload rather than local-storage, matching the manual QA target
 * "sign in on a second device... completion state is shared."
 */
test.describe("Onboarding: initial introduction", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    // Opts out of seed-session.ts's default (pre-completed "intro" guide,
    // added so every *other* e2e spec's freshly seeded account doesn't hit
    // this dialog) — this spec is specifically testing the real first-run
    // state.
    const { userId: seededUserId, cookies } = JSON.parse(
      seed("login", "with-intro"),
    ) as {
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

  test("shows once for a brand-new account, then never reappears after reload", async ({
    page,
  }) => {
    await page.goto("/home");

    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).toBeVisible();

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Skip" }),
    );
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();

    // A reload re-fetches server truth for onboardingState — proving the
    // skip persisted server-side, not merely in client component state.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();
  });

  test("completing both steps persists and never reappears", async ({
    page,
  }) => {
    await page.goto("/home");

    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Next: quick preferences" }).click();
    await expect(
      page.getByRole("heading", { name: "A few quick preferences" }),
    ).toBeVisible();

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Done" }),
    );
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();
  });
});
