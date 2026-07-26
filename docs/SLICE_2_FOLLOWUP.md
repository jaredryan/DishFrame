# Slice 2 Follow-up — Results

**Status:** Complete and locally verified against a freshly reset Docker
PostgreSQL database. Nothing has been applied to Neon; nothing has been
pushed, merged, or deployed. Docker Desktop was available in this session
and used directly (unlike Slice 2 itself, which had to substitute a
Homebrew Postgres — that substitution is no longer needed).

**Scope authorized:** a bounded foundation correction to Slice 2 — local
Postgres as the default database, guarded production access, full Docker
verification, migration-safety tooling, recoverable account
initialization, a formalized owner Taster and a new protected fallback
Grocery Category, moving Preferences/Grocery Categories from `/profile` to
a new `/settings`, and updated tests/docs. Recipe/Part work, Cooking Mode,
Meal Plans, sharing, Blob storage, and USDA FoodData Central remain
untouched and out of scope, per the authorizing instructions.

---

## 1. Local PostgreSQL vs. guarded Neon access

- `.env.local` now defaults `DATABASE_DRIVER=pg` with `DATABASE_URL` /
  `DIRECT_URL` pointing at the local Docker Postgres (`dishframe` /
  `dishframe_shadow` — two distinct databases; `prisma migrate dev`
  requires the shadow database to be separate from the dev database).
  Ordinary `pnpm dev` now runs against local Postgres, not Neon.
- The real Neon credentials formerly in `.env.local` were moved, values
  unchanged, into a new **`.env.production-access.local`** (git-ignored —
  already covered by the repo's existing `.env*` gitignore pattern,
  confirmed via `git check-ignore` and `git ls-files`; no database
  credential is tracked by git). No secret value from that file was
  printed in any command output, diff, or this document.
- A new guarded command, **`scripts/dev-production-db.mjs`**
  (`pnpm dev:production-db`), loads that file and runs `next dev` against
  it — but only when invoked as
  `CONFIRM_PRODUCTION_DATABASE=yes pnpm dev:production-db`. It refuses to
  run otherwise, refuses to run if the file is missing or doesn't declare
  `DATABASE_DRIVER=neon`, prints a prominent warning banner, and never
  prints the connection strings themselves. It only ever launches `next
  dev` — no test, seed, reset, or migration shortcut exists for this path.
- `.env.example` documents all three modes (local Docker, deployed Neon,
  guarded production access) with safe placeholders.

## 2. Docker Desktop PostgreSQL setup and verification

Docker Desktop was already running in this session (checked once via
`docker info`, not polled). `docker-compose.yml` now also mounts
`docker/init-db/01-create-shadow-db.sql`, which creates the
`dishframe_shadow` database on first container start (Postgres only
creates the `POSTGRES_DB` database itself). The named volume
(`dishframe-postgres`) and `pg_isready` health check were already present
from Slice 2 and are unchanged.

New/updated package scripts, all pg-only (each hardcodes
`DATABASE_DRIVER=pg` and a `localhost` connection string, so they can never
touch Neon regardless of `.env.local`'s contents):

```
db:docker:up      docker compose up -d --wait
db:docker:down    docker compose down
db:docker:reset   docker compose down -v && docker compose up -d --wait
db:migrate:local  prisma migrate dev      (dev + shadow db)
db:deploy:local   prisma migrate deploy   (dev + shadow db)
db:status:local   prisma migrate status   (dev + shadow db)
db:verify:local   scripts/verify-db-objects.ts (refuses unless DATABASE_DRIVER=pg)
db:scan-migrations  scripts/scan-migrations.ts (static, no DB connection)
test:integration  vitest --config vitest.integration.config.mts (refuses unless DATABASE_DRIVER=pg)
dev:production-db scripts/dev-production-db.mjs (guarded Neon access, see §1)
```

`db:docker:reset` only runs `docker compose` commands — it has no
mechanism to load `.env.production-access.local` and cannot touch Neon.

### Fresh-database verification performed this session

1. Confirmed Docker Desktop running (`docker info`).
2. Confirmed no pre-existing DishFrame container/volume (`docker compose ps
   -a`, `docker volume ls`) — nothing to remove.
3. `docker compose up -d --wait` → container reached `Healthy`.
4. Confirmed both `dishframe` and `dishframe_shadow` databases exist
   (`psql -l`).
5. `pnpm db:deploy:local` — all 5 migrations (the pre-existing `init` +
   the 4 Slice 2 migrations, edited per §7) applied cleanly to the fresh
   database.
6. `pnpm db:status:local` → "Database schema is up to date!"
7. `pnpm db:scan-migrations` → OK, no unallowed removal of a protected
   object across all 5 migration files.
8. `pnpm db:verify:local` → OK, all 15 protected constraints and 7
   protected indexes present (see §3).
9. `pnpm test:integration` → 36/36 passing.
10. **Repeated end-to-end** for the final verification pass: `pnpm
    db:docker:reset` (destroyed and recreated the volume), then steps 4–9
    again — identical results, confirming the migration history is
    reproducible from a genuinely empty volume, not just idempotent.
11. `pnpm dev` (via a background smoke start against the Docker database) →
    `next dev` started cleanly, `GET /` returned `200`.
12. Every command above used `DATABASE_DRIVER=pg` and a `localhost`
    connection string — none contacted Neon.

`prisma migrate diff` against the live (freshly migrated) database shows
**zero unexpected drift** — the only difference from `schema.prisma` is
the same 4 raw-SQL objects from Migration 1 (2 composite FKs, the
container-consistency FK, and the 3 trigram indexes count as separate
lines but same categories) that Slice 2 already documented as
intentionally invisible to Prisma's diffing. The new `isFallback` field,
`defaultsInitializedAt` field, and `one_fallback_category_per_user` index
introduced no new drift — they either match `schema.prisma` exactly or are
partial-unique-index objects Prisma's diff tool already treats the same
way as the other pre-existing partial unique indexes (none of which show
up as drift either).

## 3. Migration-safety tooling

- **`AGENTS.md`** (loaded into `CLAUDE.md` via `@AGENTS.md`) gained a
  "Database migrations" section with the durable rule requested: always
  generate against local Postgres with `--create-only`, inspect generated
  SQL, reject unexpected drops of protected objects (now backed by a real
  tool, not just a written reminder), verify via `migrate diff` +
  `db:verify:local`, and never touch Neon for migration development.
- **`scripts/scan-migrations.ts`** (`pnpm db:scan-migrations`) — static
  scanner, no database connection. Scans every
  `prisma/migrations/*/migration.sql` for a `DROP CONSTRAINT` / `DROP
  INDEX` / `ALTER TABLE ... DROP` targeting one of the 21 protected object
  names (the 18 from Slice 2's approved schema doc, plus the new
  `one_fallback_category_per_user`). Supports an explicit allowlist via a
  `-- migration-safety-allow-drop: <name>` comment for a genuinely
  intentional future removal; nothing is silently ignored otherwise. Wired
  into CI as its own step, before migrations are applied.
- **`scripts/verify-db-objects.ts`** (`pnpm db:verify:local`) — runtime
  counterpart. Queries `pg_constraint` / `pg_indexes` for the same 22
  names (15 constraints + 7 indexes) and lists any that are missing.
  Refuses to run unless `DATABASE_DRIVER=pg`; never logs the connection
  string. Wired into CI immediately after `prisma migrate deploy`.
- `src/test/integration-setup.ts` (new Vitest setup file for
  `vitest.integration.config.mts`) throws immediately if
  `DATABASE_DRIVER !== "pg"`, so a bare `vitest --config
  vitest.integration.config.mts` (without the wrapping npm script's inline
  env vars) fails loudly instead of silently trying Neon.

## 4. Recoverable account initialization

- `UserPreference.defaultsInitializedAt DateTime?` added (Migration 1,
  where `UserPreference` itself is created — see §7).
- `src/lib/account/init.ts` rewritten: `ensureFavoriteTag`,
  `ensureOwnerTaster`, and the new `ensureFallbackGroceryCategory` are
  repaired on **every** call regardless of the marker. The ordinary
  one-time seed data (starter Grocery Categories, starter Flavor Profiles)
  runs only when `defaultsInitializedAt` is unset. The marker is set only
  after every required step for that run succeeds; any thrown error
  (simulated in tests via mocking) leaves it `null`.
- `src/app/(app)/layout.tsx` (the protected app shell) now checks the
  marker on every request and retries `initializeNewUser` if it's still
  unset — recovery no longer depends solely on Better Auth's one-shot
  `user.create.after` hook. This is a single indexed lookup once
  initialization has actually completed, so it adds negligible cost to the
  common case.
- New integration tests (`src/lib/account/init.integration.test.ts`):
  marker set on success; marker left unset on a simulated partial failure
  (mocked rejection mid-run); a subsequent call fills in the missing data
  and sets the marker; concurrent calls stay safe (one owner Taster, one
  fallback category, one preference row); an intentionally deleted
  ordinary default is **not** resurrected by a later call once the marker
  is set.

## 5. Owner Taster (formalized, not changed)

Behavior was already correct from Slice 2 and is unchanged: exactly one
per account, initial name "You", renameable, never archivable or
deletable, enforced by the existing `one_owner_taster_per_user` partial
unique index. `docs/PRODUCT_SPEC.md` §34.4 gained a short "Formalized in
the Slice 2 follow-up" note removing the ambiguity flagged in Slice 2's
own deviation log (§5.6 of `docs/SLICE_2.md`).

## 6. Protected fallback Grocery Category (new)

- `GroceryCategory.isFallback Boolean @default(false)` + the raw-SQL
  partial unique index `one_fallback_category_per_user` (`ON
  "GroceryCategory" ("ownerId") WHERE "isFallback" = true`) — added to
  Migration 3 (planning/grocery), per explicit instruction, even though
  the `GroceryCategory` table itself is created in Migration 1 (a
  later migration adding a column to an earlier migration's table is
  valid Postgres and was verified end-to-end from a fresh volume — see
  §7 for why a 5th migration wasn't created instead).
- Identity is behavioral (`isFallback`), never based on the literal name
  "Other" — confirmed by a test that renames the fallback and checks it
  remains protected.
- `src/lib/account/init.ts`'s `ensureFallbackGroceryCategory` creates it
  (named "Other") on first run and repairs a missing one on any later
  call, including upserting the flag onto an existing same-named row from
  a partially-initialized account.
- `src/lib/grocery/service.ts`'s `deleteGroceryCategory` now rejects
  deleting the fallback (`ConflictError`), and for an ordinary category,
  transactionally moves its `GroceryListItem`s to the owner's fallback
  category before deleting it (rather than relying on the schema's
  `onDelete: SetNull`, which would instead leave them uncategorized).
  `IngredientCategoryMemory` rows for the deleted category still
  cascade-delete at the database level, unchanged from Slice 2, so
  categorization can be relearned.
- `docs/PRODUCT_SPEC.md` §63.2/§63.4 gained short formalization notes.
- New integration tests (`src/lib/grocery/grocery.integration.test.ts`,
  plus one direct-insert test in
  `src/lib/db/constraints.integration.test.ts`): exactly one fallback per
  owner; a direct database insert of a second fallback is rejected;
  deleting the fallback is rejected; renaming and reordering the fallback
  both work and it remains the fallback; deleting an ordinary category
  moves its items to the fallback and removes its category-memory rows;
  one user cannot rename or delete another user's fallback.

## 7. Migration history changes (no 5th migration)

Per instruction, the four Slice 2 migrations were edited in place rather
than adding a new one — none had been applied anywhere but this session's
disposable database, which was reset and replayed from zero (§2) to
verify this is safe:

- **Migration 1** (`20260726050213_core_content_and_versioning`):
  `UserPreference`'s `CREATE TABLE` gained `"defaultsInitializedAt"
  TIMESTAMP(3)`. A one-line comment was added above `GroceryCategory`'s
  `CREATE TABLE` noting that its `isFallback` column arrives later, in
  Migration 3.
- **Migration 3** (`20260726050449_planning_and_grocery`): gained `ALTER
  TABLE "GroceryCategory" ADD COLUMN "isFallback" BOOLEAN NOT NULL DEFAULT
  false;` and the `one_fallback_category_per_user` partial unique index,
  appended to that migration's existing hand-added-raw-SQL section.

No genuine technical conflict arose — Postgres allows a later migration to
`ALTER TABLE` a table an earlier migration created, and the fresh-volume
replay (§2) confirms the full 5-migration history still applies cleanly
and produces a database matching `schema.prisma` (modulo the same
documented raw-SQL objects as before).

## 8. `/profile` vs. `/settings`

- New route **`/settings`** (`src/app/(app)/settings/page.tsx`): the
  Preferences section (measurement system, fractions/decimals, primary
  rating display, timer sound, review prompt) and Grocery Category
  management, moved from `/profile`. Both `PreferencesForm`'s and
  `GroceryCategoryManager`'s Server Actions now `revalidatePath("/settings")`
  instead of `/profile`.
- `/profile` is now name/email/avatar plus the existing `ProfileActions`
  (theme, sign out, disabled delete-account placeholder) — no duplicate
  controls remain on both pages.
- `/tasters` is unchanged as its own route; its "back" link and Settings'
  own "Manage Tasters" link connect the two.
- Navigation: `/settings` added to `APP_NAV_ITEMS` (used by both the
  desktop sidebar and the mobile sheet nav) and to the account dropdown
  menu, alongside the existing `/profile` link.

## 9. Grocery Category management UI (`/settings`)

`GroceryCategoryManager` was rewritten to support the full set required:
create, rename (inline edit, mirroring the existing Taster manager
pattern), reorder (up/down buttons — keyboard- and mobile-friendly by
construction, no drag-and-drop gesture required), delete for ordinary
categories, a "Fallback" badge identifying the protected category, and no
delete control rendered for it at all. Duplicate-name validation surfaces
the service's `ConflictError` message inline for both create and rename.
Create/rename/delete/reorder each show pending (disabled controls while a
transition is in flight) and failure feedback (an inline `role="alert"`
message, with optimistic local state rolled back on a server error);
persistence after reload is covered by the Playwright path (§10).

## 10. Tests and commands run

Implementation was done coherently first; the broad checks below were run
in one pass at the end, per the testing-cadence instructions.

1. `pnpm exec prisma format` / `pnpm exec prisma validate` — pass.
2. `pnpm db:scan-migrations` — pass (0 findings across 5 files).
3. Fresh Docker-volume migration deployment (`pnpm db:docker:reset` →
   `pnpm db:deploy:local`) — all 5 migrations applied cleanly.
4. `pnpm db:status:local` — "Database schema is up to date!"
5. `pnpm db:verify:local` — all 15 constraints + 7 indexes present.
6. `pnpm test:integration` — **36/36 passing**, across
   `account/init.integration.test.ts`,
   `grocery/grocery.integration.test.ts`,
   `tasters/tasters.integration.test.ts`, `tags/tags.integration.test.ts`,
   and `db/constraints.integration.test.ts` (covering initialization
   recovery, initialization concurrency, fallback invariants, category
   deletion reassignment, owner scoping, and the environment guard).
7. One focused Playwright path,
   `tests/e2e/preferences-tasters-grocery.spec.ts` (rewritten for
   `/settings`): navigate to `/settings` → change and persist a
   preference → confirm the fallback category is protected (badge
   present, no delete control) → create/rename/reorder/delete an ordinary
   category → navigate to Tasters and confirm the owner Taster — **1/1
   passing**.
8. `pnpm run check` (format:check + lint + typecheck + unit tests +
   production build) — **all green**: 48 unit tests across 15 files;
   `next build` succeeded with `/settings` (and `/profile`, `/tasters`)
   correctly rendered as dynamic (`ƒ`) routes.
9. Confirmed `DATABASE_DRIVER=neon` is rejected by
   `test:integration`/`db:verify:local`/`seed-session.ts` (each either
   hardcodes `pg` inline or throws immediately if it isn't set) — the
   local/CI-only scripts never had a code path that could reach Neon
   during this session's verification.

## 11. Deviations / blockers

- None. Docker Desktop was available this session (unlike Slice 2), so
  the Homebrew-Postgres substitution documented there is no longer
  needed — `docker-compose.yml` and every `db:*:local`/`test:integration`
  script were exercised directly, including a full destroy-and-reset
  cycle.
- One pre-existing gap surfaced and fixed while verifying end-to-end (not
  a deviation from this task's scope, but worth noting): neither
  `vitest.config.mts`/`vitest.integration.config.mts` nor
  `tests/e2e/seed-session.ts` previously loaded `.env.local` themselves,
  so `BETTER_AUTH_SECRET` and friends were only ever present via whatever
  the invoking shell happened to have exported. Both now load
  `.env.local`/`.env` the same way `prisma.config.ts` already did (never
  overriding a var the shell/CI already set), so `pnpm test`, `pnpm
  test:integration`, and `pnpm test:e2e` all work from a clean shell.

## 12. Exact next proposed milestone

Unchanged from `docs/SLICE_2.md` §7: **Slice 3 — Recipe and Part
creation, detail, editing, archive, and duplication**, gated on this
follow-up's own review. Still explicitly not started: the Recipe/Part
editor, multi-Version behavior, nested Parts, Cooking Sessions,
nutrition/FDC, images/Blob storage, sharing UI, or Meal Plans/grocery-list
generation UI.
