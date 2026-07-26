# Slice 2 — Results

**Status:** Complete and locally verified. Stopped for review per Gate 1's instructions. Nothing has been applied to Neon; nothing has been pushed, merged, or deployed.

**Scope authorized:** Foundational Tier 1 + Tier 2 database schema, environment-specific Prisma adapters, a disposable local Postgres setup, CI wiring, idempotent new-user initialization, and the limited Slice 2 Preferences/Taster/Grocery Category UI — per `docs/BUILD_PLAN.md` Slice 2 and the approved `docs/PRISMA_SCHEMA_PROPOSAL.md` schema.

---

## 1. What was implemented

### Database foundation
- The complete, approved Prisma schema from `docs/PRISMA_SCHEMA_PROPOSAL.md` §2 copied verbatim into `prisma/schema.prisma` — all Tier 1 + Tier 2 models (`Dish`, `DishVersion`, `Section`/`Ingredient`/`Instruction`, `PartLink`, `ImageAsset`, `Tag`/`DishTag`, `FlavorProfileValue`/`DishFlavorProfile`, `UserPreference`, `GroceryCategory`, `PreferredUnitOverride`, the full Cooking/Rating/Taster set, the full Grocery/MealPlan set, `ShareLink`/`DirectShare`), matching the existing Better Auth models unchanged.
- `@prisma/adapter-pg` + `pg` added as dependencies. Adapter selection is now explicit and environment-driven, never inferred from the connection string's shape:
  - `src/lib/env/server.ts` — new `DATABASE_DRIVER: "neon" | "pg"` env var, defaulting to `"neon"` (so a deployed environment that forgets to set it still gets the already-working production adapter).
  - `src/lib/db/adapter.ts` (new) — `createPrismaAdapter()` picks `PrismaNeon` or `PrismaPg` based on `DATABASE_DRIVER`.
  - `src/lib/db/prisma.ts` — now calls `createPrismaAdapter()` instead of constructing `PrismaNeon` unconditionally. Same singleton/hot-reload behavior preserved.
  - `.env.example` documents the new var; `.env.local` (git-ignored, untouched otherwise) now sets `DATABASE_DRIVER="neon"` explicitly, matching its real Neon credentials.
- `docker-compose.yml` (new) — a `postgres:16-alpine` service on port 5432 for local migration work and integration testing, matching the schema's CI equivalent.
- `.github/workflows/ci.yml` — added a `postgres:16-alpine` service container, `DATABASE_DRIVER=pg`/`DATABASE_URL`/`DIRECT_URL` pointed at it, a `prisma migrate deploy` step, and an integration-test step. Never touches Neon.
- New `package.json` scripts: `db:docker:up`, `db:docker:down`, `db:migrate:local`, `db:deploy:local`, `test:integration`.
- `vitest.integration.config.mts` (new) — separate Vitest project for `src/**/*.integration.test.ts`, run against a real Postgres (never jsdom). The ordinary unit-test config now excludes that glob.

### Account initialization
- `src/lib/account/defaults.ts` — seed constants: the protected `Favorite` tag name, the owner Taster name (`You`), the default Grocery Categories (`Produce, Meat and Seafood, Dairy, Pantry, Frozen, Bakery, Other` — `PRODUCT_SPEC.md` §63.1's example list), and the starter Flavor-profile values (`Sweet, Savory, Spicy, Tangy, Smoky, Rich, Fresh, Umami` — §79.1's example list, used as the "useful starter set" §79.3 calls for since the spec doesn't pin an exact list).
- `src/lib/account/init.ts` — `initializeNewUser(userId)`: idempotent, concurrency-safe (see §5, deviation). Seeds `UserPreference`, the protected `Favorite` `Tag`, the default `GroceryCategory` rows, the starter `FlavorProfileValue` rows, and the built-in owner `Taster` ("You").
- `src/lib/auth/auth.ts` — wired via Better Auth's `databaseHooks.user.create.after` hook, so initialization runs automatically the moment a real account is created (Google sign-in), mirroring "account initialization" from the authorized scope.

### Domain modules (service + actions, per `ARCHITECTURE_PROPOSAL.md` §K.4)
Each has a framework-agnostic `service.ts` (testable without a Next.js request context) and a thin `"use server"` `actions.ts` wrapper that resolves the session and delegates:
- `src/lib/preferences/` — `updatePreferences`.
- `src/lib/tasters/` — `createTaster`, `renameTaster`, `archiveTaster`, `restoreTaster`, `deleteTaster`. The built-in owner Taster can be renamed but never archived or deleted (`ConflictError`); this is a deviation, documented in §5.
- `src/lib/tags/` — `createTag` (idempotent by normalized identity), `renameTag` (merges into an existing tag when the target name collides, per §45.6), `deleteTag`. The protected `Favorite` tag can never be renamed/merged/deleted. No dedicated tag-management UI ships in this slice (none was in scope) — this exists for the later Recipe/Part editor and for `initializeNewUser`.
- `src/lib/grocery/` — `createGroceryCategory`, `renameGroceryCategory`, `deleteGroceryCategory`, `reorderGroceryCategories`. No protected/default item — the spec doesn't call for one, and deleting a category simply falls back items to "Other" display via `GroceryListItem.category`'s `SetNull`.
- `src/lib/errors.ts` (new) — typed domain errors (`NotFoundError`, `AuthorizationError`, `ValidationError`, `ConflictError`) and `toActionErrorMessage()`, per `ARCHITECTURE_PROPOSAL.md` §K.10.
- `src/lib/auth/session.ts` — added `requireUserId()`, the shared ownership-guard entry point every Server Action now uses (two-layer authorization per §K.6: this check, plus every query scoping by `ownerId` directly).

### UI
- `/profile` — extended with a "Preferences" section (measurement system, fractions/decimals, primary rating display, timer sound, review prompt — autosaving `Select`/`Switch` controls) and a "Grocery Categories" section (add/reorder/delete). Two new shadcn components installed (`select`, `switch`).
- `/tasters` (new route) — list/create/rename/archive/restore/delete, with the owner Taster shown with a "You" badge and its archive/delete controls hidden.

---

## 2. Migration files created

Four new migrations, applied in this order after the pre-existing `20260722200916_init` (Better Auth tables, unchanged):

1. `20260726050213_core_content_and_versioning`
2. `20260726050345_cooking_and_feedback_loop`
3. `20260726050449_planning_and_grocery`
4. `20260726050519_sharing`

Each was generated with `prisma migrate dev --create-only` against a temporarily-trimmed subset of `schema.prisma` (only that migration's models + their dependencies), matching the exact model grouping specified in `PRISMA_SCHEMA_PROPOSAL.md` §3/§4, then hand-augmented with that document's raw SQL for the same migration (extension, trigram indexes, `CHECK` constraints, composite FKs, partial unique indexes). See §5 for why the generation had to be staged this way, and a migration-generation issue this staging surfaced.

## 3. Local migration verification results

All performed against a disposable **local Homebrew Postgres 16** instance (`localhost:5433`, dev/shadow databases created solely for this session) — **Docker itself is not installed in this sandbox**, so `docker-compose.yml` and the CI service container are provided and match the schema, but could not be exercised directly in this environment. See §5 for this deviation.

- `prisma format` / `prisma validate` — pass, no errors.
- All 5 migrations (init + the 4 new ones) applied cleanly, in order, to the existing session database.
- **Fresh-database verification (twice):** dropped and recreated a database from scratch, ran `prisma migrate deploy` — all 5 migrations applied with no errors, `prisma migrate status` reports "Database schema is up to date!", table count matches exactly (36 = 4 Better Auth + 31 domain models + `_prisma_migrations`).
- `prisma migrate diff` between the live database and `schema.prisma` shows **zero unexpected drift** — the only diff is the four raw-SQL objects from Migration 1 that are intentionally invisible to Prisma's schema (by design, since Prisma has no representation for them — see `PRISMA_SCHEMA_PROPOSAL.md` §1).
- All 15 hand-added `CHECK`/composite-FK constraints and all 3 special indexes (partial-unique + trigram) confirmed present in `pg_constraint`/`pg_indexes` after all 4 migrations — none were silently dropped (this was a real risk; see §5).

## 4. Tests and commands run

**Focused domain/integration tests** (`pnpm test:integration`, against the local disposable Postgres) — 27 tests across 5 files, all passing, run 3 times consecutively to rule out flakiness on the concurrency-sensitive one:
- `src/lib/account/init.integration.test.ts` — seeds all five account defaults; idempotent across repeated calls; **idempotent under real concurrent calls** (`Promise.all` of 3 concurrent `initializeNewUser` calls still leaves exactly one owner Taster); account deletion cascades preferences/tags/tasters/categories/flavor-profiles.
- `src/lib/tasters/tasters.integration.test.ts` — owner Taster can be renamed but not archived/deleted; a direct database insert of a second owner Taster is rejected by the partial unique index; ordinary Tasters support the full archive/restore/delete lifecycle; Tasters are owner-scoped (cross-user rename attempt throws `NotFoundError`).
- `src/lib/tags/tags.integration.test.ts` — exactly one Favorite tag seeded; Favorite cannot be renamed or deleted; a direct database insert of a second Favorite tag is rejected by its partial unique index; tag creation is idempotent by normalized name; renaming into an existing tag's name merges them (`DishTag` rows reassigned, source deleted).
- `src/lib/grocery/grocery.integration.test.ts` — default categories seeded in the spec's order; categories are owner-scoped; deleting a category reassigns (`SetNull`s) its `GroceryListItem`s rather than orphaning them; reordering persists.
- `src/lib/db/constraints.integration.test.ts` — directly provokes and confirms 7 of the hand-added raw-SQL constraints reject invalid data: `rating_value_range`, `part_link_state_consistency`, `one_active_session_per_dish`, `grocery_list_mode_consistency`, `meal_plan_date_order`, `nutrition_basis_consistency`, `dish_archived_state_consistency`.

**One focused Playwright golden path** (`tests/e2e/preferences-tasters-grocery.spec.ts`), run twice against the local Postgres, both passing: signs in via a seeded session (see §5 — sign-in is Google-OAuth-only, so this uses Better Auth's own `testUtils` plugin rather than a real OAuth flow) → changes a preference and confirms it persists across reload → adds a Grocery Category → navigates to Tasters, confirms the owner Taster is present → adds, renames, archives, restores, and deletes an ordinary Taster.

**Full verification pass** (`pnpm run check` — format:check, lint, typecheck, unit tests, production build), run once at this milestone boundary, against the local Postgres: **all green**. 48 unit tests passed; `next build` succeeded with `/profile` and `/tasters` both correctly rendered as dynamic (`ƒ`) routes.

Per the testing-cadence instructions, the full Playwright suite (the 4 pre-existing marketing/theme/SEO specs) was **not** re-run — none of this slice's changes touch those pages, and a broad e2e re-run is reserved for Review Gates.

## 5. Deviations from the approved plan

1. **Docker is not installed in this environment.** The task asked for "a disposable local PostgreSQL setup, preferably Docker Compose." `docker-compose.yml` was written and matches the schema/CI exactly, but since Docker itself isn't available here, all local generation/verification in this session used a Homebrew-installed Postgres 16 instance on a non-default port instead, dropped/recreated as needed. This is functionally equivalent (a disposable, non-Neon local Postgres) but is a different tool than specified. **The `docker-compose.yml` file itself has not been run.** Recommend the next session (or the user, locally) run `pnpm db:docker:up` once to confirm it behaves identically — I expect it to, since it's the same Postgres major version and the same migrations, but it hasn't been physically exercised.

2. **Migration-generation issue (documented inline in the migration files too):** hand-added raw-SQL objects (trigram indexes, `CHECK` constraints, raw composite FKs) from Migration 1 have no Prisma-schema representation. Because `prisma migrate dev`'s shadow-database diffing reconstructs "before" state by replaying prior `migration.sql` files — including that raw SQL — every subsequent `--create-only` generation proposed spurious `DROP` statements for those objects (they look like "unmanaged objects" the target schema doesn't ask for). Each of Migrations 2–4's generated SQL had these erroneous drops removed before adding that migration's own real raw-SQL additions. This was caught by manually inspecting every generated file (never blindly applied) and confirmed absent from the final database via direct `pg_constraint`/`pg_indexes` queries after all 4 migrations were applied. No schema or approved-design change resulted — this is a Prisma tooling behavior to be aware of if this schema is ever regenerated from scratch the same staged way.

3. **`initializeNewUser` concurrency bug found and fixed during testing.** The first implementation wrapped all the idempotent upserts in one shared `prisma.$transaction`. A test that called `initializeNewUser` concurrently (`Promise.all` of 3 calls for the same new user) failed: a unique-constraint race on the first upsert aborts the *entire* Postgres transaction, which silently discards every later statement in that same transaction when it "commits" (Postgres converts a commit of an aborted transaction into a rollback with no error surfaced). Fixed by making each step its own independent statement, each wrapped in a small helper that treats a unique-constraint violation as "someone else already did this" rather than an error. Re-tested and confirmed stable. This wasn't strictly required by the milestone (the real trigger, Better Auth's `user.create.after` hook, only ever fires once per user) but is exactly the kind of latent bug the required idempotency test coverage is supposed to catch, so it's fixed rather than left in.

4. **No dedicated Grocery Category "protected/default item" logic exists**, unlike the Favorite tag and owner Taster. `PRODUCT_SPEC.md` §63 never calls for one — categories, including the seeded "Other", are ordinary user-owned rows a user may freely rename/reorder/delete, matching §63.2 exactly. This is a confirmed reading of the spec, not a gap.

5. **`FAVORITE_TAG_DISPLAY_NAME`/`OWNER_TASTER_DISPLAY_NAME`/default Grocery Categories/starter Flavor profiles are literal English strings**, not i18n-ready — matching the rest of the current codebase, which has no localization layer yet.

6. **The built-in owner Taster can be renamed but not archived or deleted.** `PRODUCT_SPEC.md` §34.2 says only that "the profile may supply a more specific display name where appropriate," and §34.4/§34.5 describe rename/archive/delete generically for all Tasters without an explicit owner-Taster exception. This implementation reads the *uniqueness* requirement (§34.2, "the authenticated owner appears as a built-in personal Taster") as implying the owner Taster must always remain selectable, and blocks archive/delete accordingly while permitting rename (directly supported by the "more specific display name" language). Flagging this as an interpretation, not an explicit spec quote, in case Gate 2 review disagrees.

7. **The Playwright e2e spec needed unplanned test-infrastructure work** beyond application code: `src/lib/auth/test-auth.ts` (a test-only Better Auth instance using Better Auth's own `testUtils` plugin, per that plugin's documented recommendation, to mint a session without a real Google OAuth flow), and `tests/e2e/seed-session.ts` run via a new `tsx` dev dependency in a separate child process — Playwright's own test transform cannot load the generated Prisma client (it's ESM-only and uses `import.meta`, which Playwright's bundler doesn't resolve) or the project's `@/` path alias the way Next.js/Vitest/tsx do. The seed script refuses to run (loud error, exit 1) unless `DATABASE_DRIVER=pg` is explicitly set, specifically so this spec can never accidentally create/delete rows against the real Neon database if someone runs `pnpm test:e2e` without first exporting the local-Postgres env vars — verified this guard actually triggers.

## 6. Blockers / risks

- **Docker-compose path is unverified**, per deviation §5.1 — low risk (standard, minimal compose file; same Postgres version already proven to work), but worth a quick confirmation run before relying on it.
- **`prisma migrate dev --create-only`'s spurious-drop behavior** (deviation §5.2) means any future hand-edit to a migration file must be re-checked against a fresh `prisma migrate diff` before trusting a generated migration, not just visually skimmed — this is now a standing gotcha for this repo's migration history, not a one-time issue.
- No other blockers. Every acceptance criterion in the authorized scope (schema, adapters, local disposable DB, CI, idempotent init, Slice 2 UI, focused tests) is met and locally verified.

## 7. Exact next proposed milestone

**Slice 3 — Recipe and Part creation, detail, editing, archive, and duplication (with Sections/Ingredients/Instructions)**, per `docs/BUILD_PLAN.md`, gated on Review Gate 1 (this document) being approved. Slice 3 is the first slice where "create a Recipe and see it" becomes real: the shared `DishEditor` component, `createDish`/`createDishWithInitialVersion`/`updateDishMetadata`/`duplicateDish`/`deleteDish` Server Actions, the minimum-save validation (title + Stage + at least one meaningful ingredient/instruction — linked Parts arrive in Slice 4), and the Recipe/Part library + detail pages. It depends only on Slice 2 (schema, now complete) and this Review Gate.

Per Slice 2's own scope boundary, explicitly **not** started: the Recipe/Part editor itself, multi-Version behavior, nested Parts, Cooking Sessions, nutrition/FDC, images/Blob storage, sharing UI, or Meal Plans/grocery-list generation UI — all schema for these already exists from this slice's migrations (per `BUILD_PLAN.md`'s foundational-Tier-2 principle) but no application code beyond what's described in §1 above was built for them.
