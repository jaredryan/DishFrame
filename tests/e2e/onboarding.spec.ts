import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect, type Page, type Locator } from "@playwright/test";

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

// Same rationale as preferences-tasters-grocery.spec.ts's helper of the same
// name: markGuide() updates local state optimistically before its Server
// Action's fetch resolves, so a reload right after a click can race the
// mutation and re-fetch server truth from before it landed.
async function clickAndWaitForServerAction(page: Page, locator: Locator) {
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
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
