# QA Seed System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DishFrame-specific adaptation:** this repo's own AGENTS.md forbids self-initiated `git commit`/`git push` — every "Commit" step from the standard template is replaced with "mark the task's checkboxes done and move on." Do not commit unless the owner explicitly asks. Also: do not run `pnpm run verify:all`, lint, typecheck, build, or Playwright at any point in this plan — the task's own "Verification" section (Task 15) is the complete, owner-approved list of commands to run, explicitly overriding DishFrame's normal "don't self-run verification" default for this one task.

**Goal:** build a deterministic, idempotent, reusable QA seed system (`pnpm db:seed`, `pnpm db:reset`) that populates a dedicated QA owner account with a compact but comprehensive set of Recipe/Part fixtures covering every major DishFrame lifecycle, versioning, composition, propagation, and deletion state — so manual review (current Slice 5/6A gate and future gates) doesn't require hand-building test data.

**Architecture:** two new `tsx` entry points (`scripts/seed.ts`, `scripts/db-reset.ts`) reuse the existing framework-agnostic domain services in `src/lib/dishes/service.ts` (`createDish`, `editDish`, `propagatePartUpdate`, `resolvePartUsageOccurrence`, `archiveDish`) rather than raw Prisma inserts, so every fixture obeys real invariants (lineage IDs, unified position ordering, cycle/duplicate-target checks, version diffing). One raw-Prisma exception is documented and isolated: the "already-materialized" fixture, which hand-authors a `PartLink` row in the exact shape `deletePart` itself writes, because producing it via the real destructive delete flow is explicitly out of scope. A shared local-database guard (`src/lib/db/local-guard.ts`) protects both entry points from ever running against Neon/production.

**Tech Stack:** TypeScript, `tsx`, Prisma 7 (`pg` driver adapter), Vitest (guard unit test only — everything else is a manual/scripted verification pass per Task 15).

## Global Constraints

- `server-only`-guarded domain modules (`service.ts`, `queries.ts`, `sections/service.ts`, `cycles/service.ts`, `images/service.ts`, `account/init.ts`) throw under plain Node/tsx unless the process sets Node's `react-server` export condition. Every script that imports them must be invoked with `NODE_OPTIONS="--conditions=react-server"` (verified working; see Task-0 reconnaissance in this plan's originating conversation — do not re-derive, just apply it).
- Static imports of `server-only`-guarded modules must not appear at the top of `scripts/seed.ts`/`scripts/db-reset.ts` — load `.env.local`/`.env` first (mirrors `tests/e2e/seed-session.ts`), then `await import(...)` everything else inside `main()`, exactly like that file already does.
- Local-only guard: `DATABASE_DRIVER === "pg"` AND `DATABASE_URL`/`DIRECT_URL` hostnames are in `{"localhost", "127.0.0.1", "::1"}` AND neither URL contains `neon.tech`. Never rely on `NODE_ENV` alone (explicit product requirement).
- No Vercel Blob writes from the seed script — `BLOB_READ_WRITE_TOKEN` isn't part of `.env.example`/local dev setup today, and generating one is out of scope. Every fixture ships with `imageAssetId: null`; one designated Recipe gets a documented manual-upload step instead.
- Nutrition/macro fields (`calories`/`protein`/`carbs`/`fat`/`nutritionBasis`) have **no writer path** anywhere in current application code (confirmed by repo-wide grep — only `compare.ts`/the compare page read them). Per the task's own "do not seed fields... not yet implemented" rule, macros are skipped entirely, not stubbed.
- Every fixture title is prefixed `"[QA] "`. Every fixture Dish gets the `qa-seed` Tag. Internal terms (`MATERIALIZED`, `PartLink`, `lineageId`) never appear in any user-facing title/description.
- `pnpm run verify:all`, lint, typecheck, build, Playwright, `verify:e2e`, deployment commands, and Git commands are explicitly out of scope for this plan's own execution — only the commands listed in Task 15.

---

## Fixture Design (read before starting any task)

This section is the single source of truth for exact fixture content — later tasks reference it by name instead of repeating it.

### Parts (6)

| Key | Title | Stage | Versions | Content | Notes |
|---|---|---|---|---|---|
| `rice` | `[QA] Steamed White Rice` | ACTIVE | V1.0 → V1.1 (MINOR) | Ingredients: rice (2 cups), water (3 cups), salt (0.5 tsp, optional). Instructions: rinse rice; combine in pot; simmer covered 18 min; rest 5 min then fluff. V1.1 adds a 5th instruction ("Fluff with a fork before serving.") | yieldQuantity 4, yieldUnit "servings", prepTime 5, cookTime 20, difficulty Easy |
| `seasoning` | `[QA] All-Purpose Seasoning Blend` | PROVEN | V1.0 only | Ingredients: salt, black pepper, garlic powder, paprika (no quantities on garlic powder/paprika — "approximate", `isApproximate: true`). Instructions: 1 step ("Combine all in a small jar and shake to mix.") | no yield/prep/cook fields set (all null) — sparse metadata coverage |
| `sauce` | `[QA] Peanut Dipping Sauce` | ACTIVE | V1.0 → V1.1 (MINOR) | Ingredients: peanut butter, soy sauce, lime juice, water. Instructions: whisk together; thin with water to taste. Top-level PartLink → `seasoning`@V1.0, multiplier 0.5. V1.1 adds instruction "Stir in chili flakes for heat." | cuisine "Southeast Asian", difficulty Easy |
| `replacement` | `[QA] Cauliflower Rice` | EXPERIMENTAL | V1.0 only | Ingredients: riced cauliflower, olive oil, salt. Instructions: pulse cauliflower in food processor; sauté 5 min. | visibly different from `rice` — used only as a Replace-flow candidate, never attached anywhere by the seed itself |
| `deleteme` | `[QA] Garlic Confit` | ACTIVE | V1.0 → V1.1 (MINOR) | Ingredients: garlic cloves, olive oil, thyme. Instructions: peel garlic; submerge in oil; roast low and slow 90 min. V1.1 adds "Store covered in the fridge up to 2 weeks." | this is the Part the deletion-resolution fixtures (Task 10) delete |
| `unused` | `[QA] Toasted Sesame Oil Drizzle` | IDEA | V1.0 only | Ingredients: toasted sesame oil (1 tbsp). Instructions: "Drizzle over the finished dish just before serving." | no description, no cuisine, no difficulty — sparsest fixture in the set; zero parent usages |

### Recipes (7)

| Key | Title | Stage | Structure |
|---|---|---|---|
| `salad` | `[QA] Simple Garden Salad` | created ACTIVE, then `archiveDish`'d → ARCHIVED | 2 Sections ("Salad", "Dressing"), ordinary ingredients/instructions, no linked Parts, no image. Baseline/simplest fixture. |
| `ricebowl` | `[QA] Rice Bowl Base` | ACTIVE | Parts-only: top-level PartLink → `rice`@**current (V1.1)** multiplier 1, top-level PartLink → `seasoning`@V1.0 multiplier **2** (non-1×). No Sections. Already-current parent for Rice propagation. |
| `stirfry` | `[QA] Weeknight Stir-Fry` | ACTIVE, cuisine "Asian Fusion" | Unified order: [0] PartLink → `rice`@**V1.0 (outdated)** mult 1, [1] Section "Prepare vegetables", [2] Section "Cook protein", [3] PartLink → `sauce`@**current (V1.1)** mult 1.5, [4] Section "Assemble". Outdated Rice parent #1; already-current Sauce parent. |
| `noodlesalad` | `[QA] Peanut Noodle Salad` | PROVEN | Directly includes `sauce`@**V1.0 (outdated)** top-level, mult 1, plus a "Noodles" Section with its own ingredients/instructions. `sauce`@V1.0 itself nests `seasoning` — shallow-detach fixture. Outdated Sauce parent #1. |
| `ricesidedish` | `[QA] Rice Side Dish` | EXPERIMENTAL | Parts-only: PartLink → `rice`@V1.0 (outdated #2) mult 1 position 0, PartLink → `sauce`@V1.0 (outdated #2) mult 2 position 1 — deliberately different multiplier/position than `stirfry`/`noodlesalad` use, so propagation-preservation is actually visible. Single version, never propagated by the seed — left outdated for the owner to test. |
| `ramen` | `[QA] Sunday Ramen Project` | ACTIVE, cuisine "Japanese" | The Version-comparison fixture — see the dedicated timeline below. Also a current `deleteme` usage (parent #1) and the container for the already-materialized fixture. |
| `toastplate` | `[QA] Confit Toast Plate` | PROVEN | Deletion-resolution dedicated parent. V1: PartLink → `deleteme`@V1.0 mult 1 position 0, plus one ordinary Section "Toast". Then, after `deleteme` is bumped to V1.1, `propagatePartUpdate` retargets this Recipe (MINOR) to `deleteme`@V1.1 — its own V1 becomes the required "historical parent Version pinned to the exact older target Version" fixture. Current `deleteme` usage parent #2. |

Plus one throwaway Part, never listed in the final catalog as a real fixture (it gets deleted by the end of seeding): `[QA] Pickled Ginger Garnish` — kind PART, one Version, one ingredient ("pickled ginger", quantity 2, unit "tbsp"), one instruction ("Slice thin before serving."). Used only to produce a real, valid PartLink row that Task 11 then converts to a `MATERIALIZED` snapshot.

### `ramen`'s version timeline (Task 9)

1. **V1.0** (`createDish`): Section "Broth" — ingredients (stock, soy sauce, mirin), instruction ("Simmer 20 minutes.").
2. **V1.1** (auto-MINOR — `editDish` with only a Section rename/guidance-note change, no ingredient/instruction/PartLink change): rename "Broth" → "Broth Base", add `guidanceNote: "Use a rich homemade stock if you have it."`. Demonstrates `sectionOrganizationChanged`-only auto-minor.
3. **A stable-field-only edit, no new Version** (`editDish` changing only `cuisine`, e.g. from unset to `"Japanese"`, everything else identical to V1.1's content): demonstrates the "metadata differences that do not themselves trigger a Version" bullet directly — assert the returned version id equals V1.1's id.
4. **V2.0** (MAJOR — `editDish`): add Section "Noodles" (ingredients: ramen noodles, instruction: "Cook per package, drain."), attach `[QA] Pickled Ginger Garnish` top-level, multiplier **1.5**, position after the new Section. This occurrence is what Task 11 later materializes.
5. **V2.1** (MINOR): content payload **omits** the Pickled Ginger Garnish occurrence (implicit detach/removal — the row created at V2.0 stays historical, referenced by no later Version) and **attaches `deleteme`@V1.0** top-level, multiplier 1.
6. **V2.2** (MINOR): retarget the `deleteme` occurrence's `targetDishVersionId` from `deleteme`@V1.0 to `deleteme`@**V1.1** (ordinary manual retarget via `editDish`, not `propagatePartUpdate` — demonstrates "pinned Part Version change" as a distinct, single-recipe scenario from the batch-propagation fixtures).
7. **V2.3** (MINOR): change the `deleteme` occurrence's multiplier 1 → 2.
8. **V2.4** (MINOR, `sectionOrganizationChanged`): reorder the top-level sequence — move the `deleteme` PartLink before the "Noodles" Section. Stays current.

---

## File Structure

- `src/lib/db/local-guard.ts` — create. Pure env-parsing guard, no `server-only`, importable from both scripts and Vitest.
- `src/lib/db/local-guard.test.ts` — create. Unit tests.
- `scripts/qa-seed/owner.ts` — create. QA user upsert + `initializeNewUser` + prior-fixture wipe.
- `scripts/qa-seed/parts.ts` — create. Builds the 6 Part fixtures, returns their ids/version ids.
- `scripts/qa-seed/recipes.ts` — create. Builds `salad`, `ricebowl`, `stirfry`, `noodlesalad`, `ricesidedish`.
- `scripts/qa-seed/ramen.ts` — create. Builds `ramen`'s full version timeline (kept separate from `recipes.ts` — it's the single largest, most narratively distinct fixture).
- `scripts/qa-seed/deletion-fixtures.ts` — create. Builds `toastplate` + the `propagatePartUpdate` call that produces its historical Version.
- `scripts/qa-seed/materialized-fixture.ts` — create. Builds the throwaway "Pickled Ginger Garnish" Part, attaches/detaches it inside `ramen`'s timeline (called from `ramen.ts`), then (a separate exported function, called after all versioning is done) hand-authors the `MATERIALIZED` row and deletes the throwaway Part's Dish.
- `scripts/qa-seed/catalog.ts` — create. Prints the completion summary.
- `scripts/seed.ts` — create. Orchestrator entry point.
- `scripts/db-reset.ts` — create. Guarded reset entry point.
- `package.json` — modify. Add `db:seed`, `db:reset` scripts.
- `.env.example` — modify. Document `SEED_USER_EMAIL`/`SEED_USER_NAME`.
- `docs/MANUAL_QA_SEED.md` — create.

---

### Task 1: Local-database guard

**Files:**
- Create: `src/lib/db/local-guard.ts`
- Test: `src/lib/db/local-guard.test.ts`

**Interfaces:**
- Produces: `assertLocalDatabaseEnv(vars: { DATABASE_URL?: string; DIRECT_URL?: string; DATABASE_DRIVER?: string }): void` — throws `Error` with a clear message if the env doesn't look like the local disposable Postgres. Called by both `scripts/seed.ts` and `scripts/db-reset.ts` with `process.env` directly.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/db/local-guard.test.ts
import { describe, it, expect } from "vitest";
import { assertLocalDatabaseEnv } from "@/lib/db/local-guard";

const LOCAL = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/dishframe",
  DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/dishframe_shadow",
  DATABASE_DRIVER: "pg",
};

describe("assertLocalDatabaseEnv", () => {
  it("accepts the standard local docker-compose configuration", () => {
    expect(() => assertLocalDatabaseEnv(LOCAL)).not.toThrow();
  });

  it("accepts 127.0.0.1 and ::1 as local hosts", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/dishframe",
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL: "postgresql://postgres:postgres@[::1]:5432/dishframe",
      }),
    ).not.toThrow();
  });

  it("rejects DATABASE_DRIVER=neon even with a localhost URL", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_DRIVER: "neon" }),
    ).toThrow(/DATABASE_DRIVER/);
  });

  it("rejects a missing DATABASE_DRIVER", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_DRIVER: undefined }),
    ).toThrow(/DATABASE_DRIVER/);
  });

  it("rejects a remote Neon hostname even if DATABASE_DRIVER were forced to pg", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL:
          "postgresql://user:pw@ep-example-pooler.us-east-2.aws.neon.tech/dishframe?sslmode=require",
      }),
    ).toThrow(/neon\.tech/);
  });

  it("rejects a non-local hostname that isn't neon.tech either", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DATABASE_URL: "postgresql://user:pw@db.example.com:5432/dishframe",
      }),
    ).toThrow(/local/i);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_URL: undefined }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects DIRECT_URL pointing somewhere non-local even if DATABASE_URL is local", () => {
    expect(() =>
      assertLocalDatabaseEnv({
        ...LOCAL,
        DIRECT_URL: "postgresql://user:pw@db.example.com:5432/dishframe_shadow",
      }),
    ).toThrow(/local/i);
  });

  it("rejects an unparseable URL", () => {
    expect(() =>
      assertLocalDatabaseEnv({ ...LOCAL, DATABASE_URL: "not-a-url" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/db/local-guard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/local-guard'` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/db/local-guard.ts
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

type LocalDatabaseEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  DATABASE_DRIVER?: string;
};

/**
 * Refuses to proceed unless the environment unambiguously targets the
 * disposable local/CI Postgres (docker-compose.yml) — never Neon,
 * production, or an unrecognized remote database. Checked on both
 * DATABASE_URL and DIRECT_URL, and never on DATABASE_DRIVER alone: a
 * misconfigured .env.production-access.local override could otherwise
 * set DATABASE_DRIVER=pg while pointing at a real Neon host.
 */
export function assertLocalDatabaseEnv(vars: LocalDatabaseEnv): void {
  if (vars.DATABASE_DRIVER !== "pg") {
    throw new Error(
      `Refusing to run: DATABASE_DRIVER is "${vars.DATABASE_DRIVER ?? "unset"}", not "pg". ` +
        "This command only ever runs against the disposable local Postgres — see docker-compose.yml.",
    );
  }

  for (const [name, value] of [
    ["DATABASE_URL", vars.DATABASE_URL],
    ["DIRECT_URL", vars.DIRECT_URL],
  ] as const) {
    if (!value) {
      throw new Error(`Refusing to run: ${name} is not set.`);
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Refusing to run: ${name} is not a valid connection URL.`);
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

    if (hostname.toLowerCase().includes("neon.tech")) {
      throw new Error(
        `Refusing to run: ${name} points at a neon.tech host. This command must never run against Neon.`,
      );
    }

    if (!LOCAL_HOSTNAMES.has(hostname)) {
      throw new Error(
        `Refusing to run: ${name}'s host ("${hostname}") is not a recognized local database host ` +
          `(${[...LOCAL_HOSTNAMES].join(", ")}). This command only ever runs against the disposable local Postgres.`,
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/db/local-guard.test.ts`
Expected: PASS, all 9 cases.

- [ ] **Step 5:** mark done, move to Task 2.

---

### Task 2: `.env.example` documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1:** Add a new section after the "Database" block (before "Better Auth"):

```
# --- QA seed system (pnpm db:seed / pnpm db:reset) --------------------
# Required: the email of a dedicated QA account these commands own
# completely — every "[QA]"-prefixed Recipe/Part row is created under it
# and wiped/recreated on every run. Never point this at a real personal
# account. After `pnpm db:reset`, sign in with this exact email via
# Google to see the seeded fixtures.
SEED_USER_EMAIL=""
# Optional — defaults to "QA Seed Owner" if unset.
SEED_USER_NAME=""
```

- [ ] **Step 2:** mark done.

---

### Task 3: QA owner resolution + prior-fixture wipe

**Files:**
- Create: `scripts/qa-seed/owner.ts`

**Interfaces:**
- Consumes: `@/lib/db/prisma` (`prisma`), `@/lib/account/init` (`initializeNewUser`).
- Produces: `resolveSeedOwner(email: string, name: string): Promise<{ id: string; email: string }>`, `wipeExistingFixtures(ownerId: string): Promise<{ deletedDishCount: number }>`, `SEED_TITLE_PREFIX = "[QA] "`, `SEED_TAG_NAME = "qa-seed"`, `ensureSeedTag(ownerId: string): Promise<string>` (returns the Tag id).

- [ ] **Step 1: Implement**

```typescript
// scripts/qa-seed/owner.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { initializeNewUser } from "@/lib/account/init";

export const SEED_TITLE_PREFIX = "[QA] ";
export const SEED_TAG_NAME = "qa-seed";

/**
 * Better Auth's implicit-account-linking check (oauth2/link-account.mjs)
 * requires the EXISTING local user row's emailVerified to already be true
 * before it will attach a new Google account to it — otherwise sign-in
 * fails with "account not linked". Seeding a user with emailVerified:
 * false would make the whole "sign in and see the seeded records"
 * requirement silently impossible. Verified directly against the
 * installed better-auth package, not assumed.
 */
export async function resolveSeedOwner(
  email: string,
  name: string,
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { name, emailVerified: true },
    create: {
      id: randomUUID(),
      email: normalizedEmail,
      name,
      emailVerified: true,
    },
  });

  // Idempotent (src/lib/account/init.ts docstring) — safe to call on every
  // seed run, repairs anything missing without duplicating protected
  // singletons (Favorite tag, owner Taster, fallback Grocery Category).
  await initializeNewUser(user.id);

  return { id: user.id, email: user.email };
}

export async function ensureSeedTag(ownerId: string): Promise<string> {
  const normalizedName = SEED_TAG_NAME.toLowerCase();
  const tag = await prisma.tag.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: {
      ownerId,
      normalizedName,
      displayName: SEED_TAG_NAME,
      isFavorite: false,
    },
  });
  return tag.id;
}

/**
 * Scoped by BOTH ownerId and the "[QA] " title marker (not just ownerId)
 * per the task's own "marked with the QA seed convention" requirement —
 * if the owner ever creates non-QA content under this same dedicated
 * account, it survives a reseed. Cascades (schema.prisma's onDelete:
 * Cascade on Dish.owner) take DishVersion/Section/Ingredient/
 * Instruction/PartLink-as-container with it; the `qa-seed` Tag row
 * itself is untouched (only its DishTag join rows cascade away), so it
 * doesn't need re-creating every run.
 */
export async function wipeExistingFixtures(
  ownerId: string,
): Promise<{ deletedDishCount: number }> {
  const result = await prisma.dish.deleteMany({
    where: { ownerId, currentTitle: { startsWith: SEED_TITLE_PREFIX } },
  });
  return { deletedDishCount: result.count };
}
```

- [ ] **Step 2:** mark done, move to Task 4.

---

### Task 4: Part fixtures

**Files:**
- Create: `scripts/qa-seed/parts.ts`

**Interfaces:**
- Consumes: `createDish`, `editDish` from `@/lib/dishes/service` (both dynamically imported by the caller — this module receives them as constructor-injected params so it never has its own top-level `server-only`-guarded import, keeping every static import in this file plain); `DishContentInput`, `SectionInput` types from `@/lib/dishes/schema`.
- Produces:

```typescript
export type PartFixtureVersions = {
  dishId: string;
  v1Id: string;
  currentId: string; // v1Id if only one version exists
};

export type PartFixtureIds = {
  rice: PartFixtureVersions;
  seasoning: PartFixtureVersions;
  sauce: PartFixtureVersions;
  replacement: PartFixtureVersions;
  deleteme: PartFixtureVersions;
  unused: PartFixtureVersions;
};

export async function buildPartFixtures(
  services: {
    createDish: typeof import("@/lib/dishes/service").createDish;
    editDish: typeof import("@/lib/dishes/service").editDish;
  },
  ownerId: string,
  tagId: string,
): Promise<PartFixtureIds>;
```

This constructor-injection pattern (services passed as a parameter, not imported at module top level) is used in every `scripts/qa-seed/*.ts` file in this plan — it's how each file stays free of `server-only` imports while still calling the real domain functions, and it's what makes `local-guard.test.ts` (Task 1) able to run under plain Vitest with zero special config while `scripts/seed.ts` itself still needs the `--conditions=react-server` flag.

- [ ] **Step 1: Implement**

A representative section builder (reused by every simple single-Section Part):

```typescript
// scripts/qa-seed/parts.ts
import { prisma } from "@/lib/db/prisma";
import type {
  DishContentInput,
  SectionInput,
} from "@/lib/dishes/schema";

function section(
  overrides: Partial<SectionInput> & Pick<SectionInput, "ingredients" | "instructions">,
): SectionInput {
  return {
    name: null,
    guidanceNote: null,
    partLinks: [],
    position: 0,
    ...overrides,
  };
}

async function attachTag(dishId: string, tagId: string) {
  await prisma.dishTag.create({ data: { dishId, tagId } });
}

type Services = {
  createDish: typeof import("@/lib/dishes/service").createDish;
  editDish: typeof import("@/lib/dishes/service").editDish;
};

export async function buildPartFixtures(
  { createDish, editDish }: Services,
  ownerId: string,
  tagId: string,
) {
  // --- Rice ---------------------------------------------------------
  const riceContent: DishContentInput = {
    title: "[QA] Steamed White Rice",
    stage: "ACTIVE",
    cuisine: null,
    description: "A basic pot of steamed white rice.",
    yieldQuantity: 4,
    yieldUnit: "servings",
    prepTimeMinutes: 5,
    cookTimeMinutes: 20,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          { name: "White rice", quantity: 2, unit: "cups", isApproximate: false, isOptional: false },
          { name: "Water", quantity: 3, unit: "cups", isApproximate: false, isOptional: false },
          { name: "Salt", quantity: 0.5, unit: "tsp", isApproximate: false, isOptional: true },
        ],
        instructions: [
          { text: "Rinse rice until the water runs mostly clear." },
          { text: "Combine rice, water, and salt in a covered pot." },
          { text: "Bring to a boil, then reduce to a simmer, covered, 18 minutes." },
          { text: "Remove from heat and rest, covered, 5 minutes." },
        ],
      }),
    ],
    partLinks: [],
  };
  const riceDishId = await createDish(ownerId, "PART", riceContent);
  await attachTag(riceDishId, tagId);
  const riceV1 = await prisma.dish.findUniqueOrThrow({
    where: { id: riceDishId },
    select: { currentVersionId: true },
  });
  const riceV2Id = await editDish(
    ownerId,
    riceDishId,
    riceV1.currentVersionId!,
    {
      ...riceContent,
      sections: [
        {
          ...riceContent.sections[0],
          instructions: [
            ...riceContent.sections[0].instructions,
            { text: "Fluff with a fork before serving." },
          ],
        },
      ],
    },
    "MINOR",
    "PART",
  );

  // ... seasoning / sauce / replacement / deleteme / unused follow the
  // same two-call (createDish, then editDish for a second version where
  // the fixture table calls for one) pattern, using the exact content
  // from the Fixture Design table above. `sauce`'s createDish call sets
  // `partLinks: [{ targetDishId: riceDishId... }]` — no: targets
  // `seasoning`'s dish/version ids, so `seasoning` MUST be built before
  // `sauce` in this function's body. Build order: rice, seasoning,
  // sauce, replacement, deleteme, unused.

  return {
    rice: { dishId: riceDishId, v1Id: riceV1.currentVersionId!, currentId: riceV2Id },
    // ...same shape for the other five, each attachTag'd once.
  };
}
```

Implement the remaining five Parts (`seasoning`, `sauce`, `replacement`, `deleteme`, `unused`) following this exact pattern and the Fixture Design table's content — `sauce`'s `partLinks` array needs `{ targetDishId: seasoning.dishId, targetDishVersionId: seasoning.v1Id, position: <after its ingredients-derived section position>, multiplier: 0.5 }`; since `sauce` has no Sections config with array-index positions to conflict with, its Section holding the ingredients is position 0 and the top-level PartLink to `seasoning` is position 1 (top-level PartLinks and Sections share one counter — see `schema.ts`'s `sectionInputSchema.position` doc comment, already read during reconnaissance).

- [ ] **Step 2:** mark done, move to Task 5.

---

### Task 5: Recipe fixtures — `salad`, `ricebowl`, `stirfry`, `noodlesalad`, `ricesidedish`

**Files:**
- Create: `scripts/qa-seed/recipes.ts`

**Interfaces:**
- Consumes: `PartFixtureIds` (Task 4's return type), `archiveDish` (for `salad`).
- Produces: `buildRecipeFixtures(services, ownerId, tagId, parts: PartFixtureIds): Promise<RecipeFixtureIds>` where `RecipeFixtureIds` has one `{ dishId, currentVersionId }` entry per key (`salad`, `ricebowl`, `stirfry`, `noodlesalad`, `ricesidedish`).

- [ ] **Step 1: Implement**

Each Recipe is one `createDish` call using the exact content from the Fixture Design table (Sections built with the same `section()` helper from Task 4, PartLinks referencing `parts.<key>.dishId`/`.v1Id`/`.currentId` per the table's "outdated" vs "current" column). `salad` additionally calls `archiveDish(ownerId, salad.dishId, "RECIPE")` after creation. Every created Dish gets `attachTag`'d with `tagId`. Verify while implementing: `stirfry`'s and `ricesidedish`'s top-level `position` values must form one contiguous 0..N-1 sequence together with their Sections (per `sectionInputSchema.position`'s shared-counter rule) — assign positions in authored order, not by array index.

- [ ] **Step 2:** mark done, move to Task 6.

---

### Task 6: `ramen` version timeline (Version-comparison + materialization host)

**Files:**
- Create: `scripts/qa-seed/ramen.ts`
- Create: `scripts/qa-seed/materialized-fixture.ts`

**Interfaces:**
- Consumes: `PartFixtureIds`, `createDish`, `editDish`.
- `materialized-fixture.ts` produces: `createThrowawayGarnishPart(services, ownerId, tagId): Promise<PartFixtureVersions>` (Task 4's builder pattern, one Section, no tag needed on the final catalog since it's deleted before printing — attach the tag anyway for consistency, it'll cascade away with the Dish delete), and `materializeAndDeleteGarnish(garnish: PartFixtureVersions, ramenV2_0PartLinkLineageId: string): Promise<void>`.
- `ramen.ts` produces: `buildRamenFixture(services, ownerId, tagId, parts: PartFixtureIds): Promise<{ dishId: string; currentVersionId: string; garnishOccurrenceLineageId: string }>` — implements the 8-step timeline from the Fixture Design section verbatim, one `editDish`/plain-Dish-update call per numbered step. Step 4 (V2.0, attaching the throwaway Garnish Part) must capture the new occurrence's `lineageId` to return — after that `editDish` call, query it back:

```typescript
const v2_0Content = await prisma.dishVersion.findUniqueOrThrow({
  where: { id: v2_0Id },
  include: { partLinks: partLinkContentInclude },
});
const garnishOccurrence = v2_0Content.partLinks.find(
  (link) => link.targetDishId === garnish.dishId,
);
if (!garnishOccurrence) {
  throw new Error("[qa-seed] Expected Garnish PartLink occurrence not found after attach.");
}
```

(`partLinkContentInclude` imported from `@/lib/dishes/queries`.) Return `garnishOccurrence.lineageId` as `garnishOccurrenceLineageId` — Task 11's caller passes it straight into `materializeAndDeleteGarnish`, which uses it (plus `v2_0Id`, threaded through the same return value) to find the exact historical row.

Step 3 (the no-new-Version metadata edit) must assert its own postcondition inline:

```typescript
const afterMetadataEdit = await editDish(ownerId, ramenDishId, v1_1Id, metadataOnlyContent, undefined, "RECIPE");
if (afterMetadataEdit !== v1_1Id) {
  throw new Error(
    "[qa-seed] Expected the cuisine-only edit to stay on V1.1 (no new Version) but got a different version id — " +
      "editDish's stable-field-only branch may have changed; re-check service.ts before trusting this fixture.",
  );
}
```

This assertion is the load-bearing check that the fixture actually demonstrates what it claims to.

- [ ] **Step 2:** mark done, move to Task 7.

---

### Task 7: Deletion-resolution fixture (`toastplate`)

**Files:**
- Create: `scripts/qa-seed/deletion-fixtures.ts`

**Interfaces:**
- Consumes: `PartFixtureIds`, `createDish`, `propagatePartUpdate`, `listCurrentPartUsages` (from `@/lib/dishes/queries`).
- Produces: `buildToastPlateFixture(services, ownerId, tagId, parts: PartFixtureIds): Promise<{ dishId: string; historicalVersionId: string; currentVersionId: string }>`.

- [ ] **Step 1: Implement**

```typescript
// scripts/qa-seed/deletion-fixtures.ts
export async function buildToastPlateFixture(
  services: {
    createDish: typeof import("@/lib/dishes/service").createDish;
    propagatePartUpdate: typeof import("@/lib/dishes/service").propagatePartUpdate;
    listCurrentPartUsages: typeof import("@/lib/dishes/queries").listCurrentPartUsages;
  },
  ownerId: string,
  tagId: string,
  parts: PartFixtureIds,
) {
  const content: DishContentInput = {
    title: "[QA] Confit Toast Plate",
    stage: "PROVEN",
    cuisine: null,
    description: "Toast points topped with garlic confit.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 10,
    cookTimeMinutes: 5,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        position: 1,
        name: "Toast",
        ingredients: [{ name: "Sourdough bread", quantity: 4, unit: "slices", isApproximate: false, isOptional: false }],
        instructions: [{ text: "Toast until golden." }],
      }),
    ],
    partLinks: [
      { targetDishId: parts.deleteme.dishId, targetDishVersionId: parts.deleteme.v1Id, position: 0, multiplier: 1 },
    ],
  };
  const dishId = await services.createDish(ownerId, "RECIPE", content);
  await attachTag(dishId, tagId);

  const historicalVersionId = (
    await prisma.dish.findUniqueOrThrow({ where: { id: dishId }, select: { currentVersionId: true } })
  ).currentVersionId!;

  // parts.deleteme.currentId must already be V1.1 by the time this runs —
  // buildPartFixtures (Task 4) creates both deleteme Versions before any
  // recipe fixture task runs, so this is always true given seed.ts's
  // build order (Task 12).
  const usages = await services.listCurrentPartUsages(ownerId, parts.deleteme.dishId);
  const occurrence = usages.find((usage) => usage.containerDishId === dishId);
  if (!occurrence) {
    throw new Error("[qa-seed] Expected a current deleteme usage on toastplate before propagating.");
  }

  const [outcome] = await services.propagatePartUpdate(
    ownerId,
    parts.deleteme.dishId,
    parts.deleteme.currentId,
    [{ containerDishId: dishId, lineageId: occurrence.lineageId }],
    "MINOR",
  );
  if (outcome.status !== "updated") {
    throw new Error(`[qa-seed] Expected toastplate propagation to succeed, got: ${outcome.status} (${"reason" in outcome ? outcome.reason : ""})`);
  }

  return { dishId, historicalVersionId, currentVersionId: outcome.newVersionId };
}
```

- [ ] **Step 2:** mark done, move to Task 8.

---

### Task 8: Already-materialized snapshot

**Files:**
- Modify: `scripts/qa-seed/materialized-fixture.ts` (finish the second half started in Task 6)

**Interfaces:**
- Consumes: `Prisma.InputJsonValue` shape confirmed during reconnaissance (`{ sections: [...], partLinks: [...] }`, `SectionInput`/`IngredientInput`/`InstructionInput`/`PartLinkInput` field names verbatim).

- [ ] **Step 1: Implement `materializeAndDeleteGarnish`**

```typescript
// scripts/qa-seed/materialized-fixture.ts (continued)
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";

export async function materializeAndDeleteGarnish(
  garnish: { dishId: string; v1Id: string },
  garnishOccurrenceLineageId: string,
  ramenDishId: string,
  ramenV2_0Id: string,
) {
  const occurrence = await prisma.partLink.findFirstOrThrow({
    where: {
      containerVersionId: ramenV2_0Id,
      lineageId: garnishOccurrenceLineageId,
      linkState: "LIVE",
    },
  });

  const content = {
    sections: [
      {
        lineageId: randomUUID(),
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            lineageId: randomUUID(),
            name: "Pickled ginger",
            quantity: 2,
            quantityEnd: null,
            isApproximate: false,
            unit: "tbsp",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ lineageId: randomUUID(), text: "Slice thin before serving." }],
        partLinks: [],
      },
    ],
    partLinks: [],
  };

  await prisma.partLink.update({
    where: { id: occurrence.id },
    data: {
      linkState: "MATERIALIZED",
      targetDishId: null,
      targetDishVersionId: null,
      materializedTitle: "Pickled Ginger Garnish",
      materializedVersionLabel: "V1.0",
      materializedContent: content,
      // multiplier (1.5, set when this occurrence was created in Task 6
      // step 4) is deliberately left untouched — deletePart's own
      // behavior, per reconnaissance, and exactly what the task asks
      // this fixture to preserve.
    },
  });

  // Mirrors deletePart's real end state: the retired Part's own Dish row
  // is gone, so it can never show up as a live, attachable Part anywhere
  // else in the app.
  await prisma.dish.delete({ where: { id: garnish.dishId } });
}
```

- [ ] **Step 2:** mark done, move to Task 9.

---

### Task 9: Catalog printer

**Files:**
- Create: `scripts/qa-seed/catalog.ts`

**Interfaces:**
- Consumes: every fixture-id shape returned by Tasks 4–8.
- Produces: `printCatalog(input: { ownerEmail: string; parts: PartFixtureIds; recipes: RecipeFixtureIds; ramen: {...}; toastplate: {...} }): void`.

- [ ] **Step 1: Implement**

```typescript
// scripts/qa-seed/catalog.ts
export function printCatalog(input: {
  ownerEmail: string;
  parts: PartFixtureIds;
  recipes: RecipeFixtureIds;
  ramen: { dishId: string };
  toastplate: { dishId: string; historicalVersionId: string };
}) {
  const lines = [
    "",
    "===== DishFrame QA seed catalog =====",
    `QA owner: ${input.ownerEmail}`,
    "",
    "Parts:",
    "  [QA] Steamed White Rice",
    "  [QA] All-Purpose Seasoning Blend",
    "  [QA] Peanut Dipping Sauce",
    "  [QA] Cauliflower Rice",
    "  [QA] Garlic Confit  <- deletion target (Task 10 flows)",
    "  [QA] Toasted Sesame Oil Drizzle",
    "",
    "Recipes:",
    "  [QA] Simple Garden Salad",
    "  [QA] Rice Bowl Base",
    "  [QA] Weeknight Stir-Fry",
    "  [QA] Peanut Noodle Salad",
    "  [QA] Rice Side Dish  <- propagation targets (outdated Rice + Sauce)",
    "  [QA] Sunday Ramen Project  <- version comparison + materialized-snapshot history",
    "  [QA] Confit Toast Plate  <- current deletion-target usage #2, holds the historical pinned-Version fixture",
    "",
    "Propagation: [QA] Rice Bowl Base is already current on Rice; [QA] Weeknight Stir-Fry, [QA] Rice Side Dish are outdated on Rice; [QA] Weeknight Stir-Fry is already current on Sauce; [QA] Peanut Noodle Salad, [QA] Rice Side Dish are outdated on Sauce.",
    "Deletion target: [QA] Garlic Confit — current usages in [QA] Sunday Ramen Project and [QA] Confit Toast Plate.",
    "Materialized/deleted-Part snapshot: open [QA] Sunday Ramen Project's Version history and view V2.0.",
    "",
    "======================================",
    "",
  ];
  console.log(lines.join("\n"));
}
```

- [ ] **Step 2:** mark done, move to Task 10.

---

### Task 10: `scripts/seed.ts` orchestrator

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Implement**

```typescript
// scripts/seed.ts
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { assertLocalDatabaseEnv } = await import("@/lib/db/local-guard");
  assertLocalDatabaseEnv(process.env);

  const seedUserEmail = process.env.SEED_USER_EMAIL;
  if (!seedUserEmail) {
    console.error(
      "[qa-seed] SEED_USER_EMAIL is required. Set it in .env.local or export it before running — see .env.example.",
    );
    process.exit(1);
  }
  const seedUserName = process.env.SEED_USER_NAME || "QA Seed Owner";

  const { prisma } = await import("@/lib/db/prisma");
  const dishService = await import("@/lib/dishes/service");
  const dishQueries = await import("@/lib/dishes/queries");
  const { resolveSeedOwner, wipeExistingFixtures, ensureSeedTag } = await import(
    "./qa-seed/owner"
  );
  const { buildPartFixtures } = await import("./qa-seed/parts");
  const { buildRecipeFixtures } = await import("./qa-seed/recipes");
  const { buildRamenFixture } = await import("./qa-seed/ramen");
  const { createThrowawayGarnishPart, materializeAndDeleteGarnish } = await import(
    "./qa-seed/materialized-fixture"
  );
  const { buildToastPlateFixture } = await import("./qa-seed/deletion-fixtures");
  const { printCatalog } = await import("./qa-seed/catalog");

  const services = {
    createDish: dishService.createDish,
    editDish: dishService.editDish,
    propagatePartUpdate: dishService.propagatePartUpdate,
    archiveDish: dishService.archiveDish,
    listCurrentPartUsages: dishQueries.listCurrentPartUsages,
  };

  const owner = await resolveSeedOwner(seedUserEmail, seedUserName);
  const wiped = await wipeExistingFixtures(owner.id);
  console.log(`[qa-seed] Wiped ${wiped.deletedDishCount} prior QA Dish row(s) for ${owner.email}.`);
  const tagId = await ensureSeedTag(owner.id);

  const parts = await buildPartFixtures(services, owner.id, tagId);
  const recipes = await buildRecipeFixtures(services, owner.id, tagId, parts);

  const garnish = await createThrowawayGarnishPart(services, owner.id, tagId);
  const ramen = await buildRamenFixture(services, owner.id, tagId, parts, garnish);
  await materializeAndDeleteGarnish(garnish, ramen.garnishOccurrenceLineageId, ramen.dishId, ramen.v2_0Id);

  const toastplate = await buildToastPlateFixture(services, owner.id, tagId, parts);

  printCatalog({ ownerEmail: owner.email, parts, recipes, ramen, toastplate });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[qa-seed] Failed:", error);
  process.exit(1);
});
```

(`buildRamenFixture`'s real signature, per Task 6, needs to also return `v2_0Id` — update Task 6's interface note accordingly when implementing; this orchestrator is written assuming that field exists.)

- [ ] **Step 2:** mark done, move to Task 11.

---

### Task 11: `scripts/db-reset.ts` + `package.json` wiring

**Files:**
- Create: `scripts/db-reset.ts`
- Modify: `package.json`

- [ ] **Step 1: Implement `scripts/db-reset.ts`**

```typescript
// scripts/db-reset.ts
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { assertLocalDatabaseEnv } = await import("@/lib/db/local-guard");
  assertLocalDatabaseEnv(process.env);

  console.log("[db-reset] Local database confirmed. Resetting...");

  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
    if (result.status !== 0) {
      console.error(`[db-reset] Command failed: ${command} ${args.join(" ")}`);
      process.exit(result.status ?? 1);
    }
  }

  run("pnpm", ["exec", "prisma", "migrate", "reset", "--force", "--skip-seed"]);
  run("pnpm", ["exec", "prisma", "generate"]);
  run("pnpm", ["run", "db:seed"]);

  console.log("[db-reset] Done.");
}

main().catch((error) => {
  console.error("[db-reset] Failed:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Add `package.json` scripts** (alongside the existing `db:*:local` scripts, same inline-env convention):

```json
"db:seed": "NODE_OPTIONS=--conditions=react-server DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe DIRECT_URL=postgresql://postgres:postgres@localhost:5432/dishframe_shadow DATABASE_DRIVER=pg tsx scripts/seed.ts",
"db:reset": "NODE_OPTIONS=--conditions=react-server DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe DIRECT_URL=postgresql://postgres:postgres@localhost:5432/dishframe_shadow DATABASE_DRIVER=pg tsx scripts/db-reset.ts"
```

`db:reset` also needs the `--conditions=react-server` flag on its own invocation because `scripts/db-reset.ts` imports `@/lib/db/local-guard` — that module itself has no `server-only` guard, but leaving the flag off would be an easy footgun the moment anyone adds one. Cheap to set unconditionally.

- [ ] **Step 3:** mark done, move to Task 12.

---

### Task 12: `docs/MANUAL_QA_SEED.md`

**Files:**
- Create: `docs/MANUAL_QA_SEED.md`

- [ ] **Step 1: Write it.** Target 80–150 lines. Required sections, in order:
  1. **What this is** (2–3 sentences — deterministic QA fixture set, not general seed data).
  2. **Setup** — `SEED_USER_EMAIL` (required) / `SEED_USER_NAME` (optional) in `.env.local`, pointing at `.env.example`.
  3. **Commands** — `pnpm db:seed` (idempotent, safe to rerun anytime to restore the fixture set) and `pnpm db:reset` (destructive — full local DB reset + migrate + seed).
  4. **Safety** — both commands refuse to run unless `DATABASE_DRIVER=pg` and both connection URLs resolve to a local host; never touches Neon/production.
  5. **Signing in** — after either command, sign in with `SEED_USER_EMAIL` via Google; note that Better Auth requires the seeded user's `emailVerified` to already be true for account-linking to succeed on first sign-in (already handled by the seed, not something the owner needs to do).
  6. **Fixture catalog** — one line per Part/Recipe from the Fixture Design table above (name + one-clause purpose), grouped Parts/Recipes.
  7. **What to open for each review flow** — a short table: propagation → `[QA] Weeknight Stir-Fry` / `[QA] Rice Side Dish` (outdated) vs `[QA] Rice Bowl Base` (current); deletion (Detach/Replace/Remove) → delete `[QA] Garlic Confit`, use `[QA] Cauliflower Rice` as the Replace candidate; historical deleted-Part snapshot → `[QA] Sunday Ramen Project` Version history, V2.0; version comparison → `[QA] Sunday Ramen Project`'s full history; shallow nested detach → `[QA] Peanut Noodle Salad`.
  8. **Restoring after destructive testing** — rerun `pnpm db:seed` (not `db:reset`) to restore the fixture set without a full DB wipe; explain it deletes and rebuilds only `[QA]`-titled Dishes owned by the seed user.
  9. **Manual image step** — no ImageAsset fixture is seeded (no `BLOB_READ_WRITE_TOKEN` in local dev by default). To review image upload/replace/remove/logged-out-access flows, manually attach an image to `[QA] Sunday Ramen Project` via the editor once signed in as the QA owner; `[QA] Weeknight Stir-Fry` intentionally stays image-less for a side-by-side comparison.

- [ ] **Step 2:** mark done, move to Task 13.

---

### Task 13: Verification

Per the task's own explicit instructions (which override the repo's normal "don't self-run verification" default for this task only — see Global Constraints): no lint/typecheck/build/Playwright/`verify:all`/Git.

- [ ] **Step 1:** `pnpm exec vitest run src/lib/db/local-guard.test.ts` — confirm Task 1's tests pass.
- [ ] **Step 2:** Confirm Docker's local Postgres is up: `pnpm run db:docker:up`.
- [ ] **Step 3:** `pnpm db:seed` — first run. Watch for the catalog printout; confirm no thrown error.
- [ ] **Step 4:** `pnpm db:seed` — second run, immediately after. Confirm identical catalog output, confirm the log line reports wiping exactly the Dish count the first run created (proves delete-then-recreate idempotency, not accumulation).
- [ ] **Step 5:** Spot-check counts directly against Postgres, e.g.:
  ```
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe psql -c \
    "SELECT kind, count(*) FROM dishes d JOIN users u ON u.id = d.\"ownerId\" WHERE u.email = '<SEED_USER_EMAIL>' AND d.\"currentTitle\" LIKE '[QA]%' GROUP BY kind;"
  ```
  Expect `PART` = 6 (the throwaway Garnish Part is deleted by the end of the run, so it must NOT appear here), `RECIPE` = 7. Confirm no duplicate `currentTitle` values among them.
- [ ] **Step 6:** Confirm `assertLocalDatabaseEnv` is genuinely wired into both entry points by a quick negative test: `DATABASE_DRIVER=neon pnpm exec tsx scripts/seed.ts` (no other env needed) should fail fast with the guard's error message, not attempt any database work.
- [ ] **Step 7:** `pnpm db:reset` — run once. Confirm it: resets, migrates, and reseeds without manual intervention; confirm the final catalog printout appears.
- [ ] **Step 8:** Re-run the Step 5 count query to confirm the post-reset dataset matches the post-seed dataset exactly.

- [ ] **Step 9:** mark done.

---

## Self-Review Notes (completed during plan authoring, not a separate pass)

- **Spec coverage:** every bullet in the originating task prompt maps to a task above except macro/nutrition fields and a real uploaded image — both explicitly out of scope per the prompt's own "don't seed unimplemented fields" / "document a manual step" escape hatches, called out in Global Constraints.
- **No placeholders:** every fixture's exact title, stage, quantities, and structural role is fixed in the Fixture Design table; no task says "similar to the above" without the concrete diff.
- **Type consistency:** `PartFixtureVersions`/`PartFixtureIds`/`RecipeFixtureIds` are defined once (Task 4) and referenced by identical name in every later task's Interfaces block.
