// Shared E2E reliability layer: session seeding/login and Server Action
// synchronization. Consolidated out of near-identical copies that had
// accumulated across most files in tests/e2e (see
// docs/E2E_TEST_INFRASTRUCTURE_AUDIT.md) — every spec that authenticates or
// waits on a mutation should import from here instead of redefining these.
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { BrowserContext, Locator, Page, Response } from "@playwright/test";

export type SeedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
};

export type SeedResult = {
  userId: string;
  email: string;
  cookies: SeedCookie[];
};

const SEED_SCRIPT = path.join(__dirname, "seed-session.ts");

/**
 * Runs tests/e2e/seed-session.ts via `tsx` in its own process, never
 * imported directly into a spec file. Playwright's own test transform
 * cannot load the generated Prisma client (ESM-only, uses `import.meta`) or
 * resolve the "@/" path alias the way Next.js/vitest/tsx do — shelling out
 * sidesteps that entirely.
 */
export function seed(...args: string[]): string {
  return execFileSync("pnpm", ["exec", "tsx", SEED_SCRIPT, ...args], {
    encoding: "utf-8",
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      // Resolves `import "server-only"` to Next.js's Server-Component no-op
      // instead of its Client-Component-only throw (see server-only's own
      // package.json "exports" map) — scoped to this child process only,
      // so the webServer's own `next dev` process (which handles this
      // condition itself via webpack) is never affected.
      NODE_OPTIONS: "--conditions=react-server",
    },
  });
}

export function cleanup(userId: string): void {
  seed("cleanup", userId);
}

/**
 * Seeds one account and logs `context` into it via cookies, returning its
 * id/email. `withIntro` opts into the real first-run onboarding state
 * (seed-session.ts defaults to pre-completing it, since only
 * onboarding.spec.ts needs the real first-run modal). `name` distinguishes
 * multiple accounts seeded in the same test (e.g. a direct-sharing
 * sender/recipient pair) — it's what appears as "From {name}" in the
 * recipient's Received list.
 */
export async function login(
  context: BrowserContext,
  options: { withIntro?: boolean; name?: string } = {},
): Promise<SeedResult> {
  const args = ["login", options.withIntro ? "with-intro" : "no-intro"];
  if (options.name) {
    args.push(options.name);
  }
  const result = JSON.parse(seed(...args)) as SeedResult;
  await context.addCookies(
    result.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    })),
  );
  return result;
}

/**
 * GroceryCategoryManager, TasterManager, and other Server-Action-backed
 * mutations apply local state optimistically before their fetch resolves —
 * so a client-side visibility assertion right after a click can pass before
 * the mutation has actually reached the database. That's invisible
 * normally, but a subsequent `page.reload()` (or navigation away and back)
 * re-fetches server truth, so it must wait for the real round trip, not
 * just the optimistic render.
 *
 * The predicate is scoped to same-origin responses carrying a `next-action`
 * header, not just any POST: `<SpeedInsights />` (mounted app-wide in
 * `src/app/layout.tsx`) injects an external debug-script beacon in dev mode
 * that also POSTs shortly after page load. An unscoped `method() === "POST"`
 * predicate can resolve on that beacon instead of the Server Action's own
 * response, intermittently racing ahead of the real mutation.
 */
export function isSameOriginPost(page: Page, response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).origin === new URL(page.url()).origin &&
    Boolean(response.request().headers()["next-action"])
  );
}

/**
 * Runs `action` and waits for the Server Action POST it triggers to
 * resolve, registering the wait before `action` so the response can't
 * resolve and be missed before listening starts. Use this (or the
 * `clickAndWaitForServerAction` convenience below) before anything that
 * depends on the mutation having actually reached the database — a
 * `reload()`, a fresh navigation, or a follow-up assertion after one.
 */
export async function waitForServerAction<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<T> {
  const [, result] = await Promise.all([
    page.waitForResponse((response) => isSameOriginPost(page, response)),
    action(),
  ]);
  return result;
}

export async function clickAndWaitForServerAction(
  page: Page,
  locator: Locator,
): Promise<void> {
  await waitForServerAction(page, () => locator.click());
}

/**
 * `DisabledActionHint` (disabled-action-hint.tsx) wraps a disabled control
 * in its own `<span role="button" tabIndex={0}>` hover/tap-to-explain
 * trigger, sitting alongside the real (also disabled) `<button>` — both
 * match `getByRole("button", { name })`, so a plain role query on a
 * disabled action is a strict-mode violation between the two. Intersecting
 * with a bare `locator("button")` keeps only the real native element.
 */
export function nativeButton(
  scope: Page | Locator,
  name: string | RegExp,
): Locator {
  return scope.getByRole("button", { name }).and(scope.locator("button"));
}
