# Manual QA seed system

A deterministic, idempotent fixture set for manual review — not general
seed data. It builds a compact set of Recipes and Parts under one
dedicated QA account, covering the lifecycle, versioning, composition,
propagation, and deletion states that would otherwise take a long time to
hand-build for every review gate. As of Slice 16/17 it also maintains a
second, dedicated counterparty account so cross-account sharing has
someone real to share with — see "QA accounts" below.

This file covers setup/safety and the Slice 1–6 Recipe/Part/Version/
propagation/deletion fixture catalog. `docs/SEED_REVIEW_GUIDE.md` covers
everything Slices 7–20 added on top of it (nutrition, sessions, grocery
lists, Meal Plans, sharing, print, account/security, onboarding) — read
both for the full picture.

## QA accounts

- **Primary** — `SEED_USER_EMAIL` (below). Sign in with this account to
  review nearly everything; the fixture catalog throughout both docs is
  from this account's point of view.
- **Counterparty** — `qa-counterparty@dishframe.invalid`, display name
  `[QA] Counterparty`. A second, fully independent local account that
  exists only so cross-account sharing (Slice 16/17) has a real
  counterparty to share with/from. `.invalid` is an IANA-reserved TLD
  (RFC 2606) that can never resolve to a real registrable domain, so this
  can never collide with an owner's actual personal account. **You never
  need to sign in as this account during ordinary review** — the seed
  script itself performs every send/accept/decline/cancel through the
  real sharing services, so both accounts' resulting state is already
  correct before you open the app. It's recreated/repaired deterministically
  on every `pnpm db:seed` run, same as the primary account. See
  `docs/SEED_REVIEW_GUIDE.md`'s "Sharing fixtures" section for what it
  owns and what's been shared with/by it.

## Setup

Set in `.env.local` (see `.env.example`):

- `SEED_USER_EMAIL` (required) — the email of a dedicated QA account.
  Never point this at a real personal account; both commands below own
  every `[QA]`-prefixed row under it completely and wipe/recreate them on
  every run.
- `SEED_USER_NAME` (optional) — defaults to `"QA Seed Owner"`.
- `BLOB_READ_WRITE_TOKEN` (optional, image-enabled mode only) — used only
  when `SEED_UPLOAD_BLOB_IMAGES=true` is also set (i.e., only by `pnpm
  db:seed-images`). Its mere presence in `.env.local` has no effect on
  `pnpm db:seed` — see "Image fixtures" below.

## Commands

- `pnpm db:seed` — idempotent, **fully offline** (never contacts Vercel
  Blob, USDA, or any other external service, regardless of what's
  configured in `.env.local`). Deletes and recreates every `[QA]`-titled/
  named row (Dishes, GroceryLists, MealPlans, and the seed's own Tasters)
  owned by `SEED_USER_EMAIL` **and** by the counterparty account, plus
  every `ShareLink`/`DirectShare` either of them owns/sent/received
  (Slice 16/17 — these don't cascade away with a wiped Dish, so they get
  their own explicit cleanup pass); safe to rerun any time to restore the
  fixture set, including after destructive manual testing (see below).
  Prints a catalog of what it created.
- `pnpm db:seed-images` — the same seed, plus the opt-in image fixtures
  (sets `SEED_UPLOAD_BLOB_IMAGES=true`). Requires `BLOB_READ_WRITE_TOKEN`
  to actually be configured; see "Image fixtures" below.
- `pnpm db:reset` — destructive. Resets the entire local database, applies
  migrations, regenerates the Prisma Client, then runs `pnpm db:seed`
  (offline — run `pnpm db:seed-images` afterward if you also want images).
  Internally, this is `pnpm db:clear` followed by `pnpm db:seed`.
- `pnpm db:clear` — destructive. Resets the entire local database, applies
  migrations, and regenerates the Prisma Client, but **does not seed** —
  it leaves the database empty (no users, no `[QA]` fixtures, no
  application records of any kind), fully migrated and schema-current.
  Like `pnpm db:seed`, it never contacts Vercel Blob, USDA, or any other
  external service. Use it when you specifically need an empty-but-
  migrated database — e.g. auditing empty/zero-state UI (no-account,
  no-Recipe, no-GroceryList views) — rather than `pnpm db:reset`, which
  always leaves the QA fixtures in place. Safe to rerun repeatedly.

## Safety

All three commands (`db:seed`, `db:clear`, `db:reset`) refuse to run
unless `DATABASE_DRIVER=pg` and both `DATABASE_URL`/`DIRECT_URL` resolve
to a local host (`localhost`/`127.0.0.1`/`::1`) — never Neon, never
production. This is a real code guard (`src/lib/db/local-guard.ts`), not
just a warning.

## Signing in

After either command, sign in with `SEED_USER_EMAIL` via Google to see the
seeded records. The seed sets that user's `emailVerified` to `true` up
front — Better Auth's account-linking only attaches a new Google account
to an existing user row when it's already verified, so this is required
for sign-in to work at all, not optional polish.

## Fixture catalog

**Parts:**

| Title | Purpose |
|---|---|
| `[QA] Steamed White Rice` | Simple leaf Part, 2 Versions, historical-Version selection |
| `[QA] All-Purpose Seasoning Blend` | Simple nested leaf, no children, concise |
| `[QA] Peanut Dipping Sauce` | 2 Versions, nests the Seasoning Part, shallow-detach source |
| `[QA] Cauliflower Rice` | Replace-flow candidate — never attached anywhere by the seed |
| `[QA] Garlic Confit` | The deletion target — see below |
| `[QA] Toasted Sesame Oil Drizzle` | Unused — zero parent usages, sparsest metadata |

**Recipes:**

| Title | Purpose |
|---|---|
| `[QA] Simple Garden Salad` | Sections-only baseline, archived |
| `[QA] Rice Bowl Base` | Parts-only, non-1× multiplier, already-current Rice parent |
| `[QA] Weeknight Stir-Fry` | Mixed unified order (Part/Section/Part/Section), outdated Rice + current Sauce parent |
| `[QA] Peanut Noodle Salad` | Directly includes Sauce (nested Seasoning) — shallow-detach fixture |
| `[QA] Rice Side Dish` | Outdated on both Rice and Sauce, differing multipliers/positions |
| `[QA] Sunday Ramen Project` | Version-comparison fixture + materialized-snapshot host |
| `[QA] Confit Toast Plate` | Deletion-target usage #2 + the historical pinned-Version fixture |

## What to open for each review flow

| Flow | Open |
|---|---|
| Propagation | `[QA] Weeknight Stir-Fry` / `[QA] Rice Side Dish` (outdated) vs `[QA] Rice Bowl Base` (already current) |
| Deletion (Detach/Replace/Remove) | Delete `[QA] Garlic Confit`; use `[QA] Cauliflower Rice` as the Replace candidate |
| Historical deleted-Part snapshot | `[QA] Sunday Ramen Project` → Version history → V2.0 |
| Full version-comparison sweep | `[QA] Sunday Ramen Project`'s full Version history |
| Shallow nested detach | `[QA] Peanut Noodle Salad` (detach Sauce, then separately detach the nested Seasoning) |
| Unified multi-Recipe direct sharing (Slice 22) | `/share`'s "Sent/Received Recipe collections" sections — pending multi-Recipe, partially accepted/declined, and unclaimed-invitation fixtures on five dedicated `[QA] Collection Recipe …` Recipes; full detail in `docs/SEED_REVIEW_GUIDE.md`'s "Direct Share Collection fixtures" section |

## Restoring after destructive testing

Propagation and deletion testing mutate real rows. To restore the fixture
set afterward, rerun `pnpm db:seed` — it deletes and rebuilds only
`[QA]`-titled Dishes owned by the seed user, so it's fast and doesn't
touch anything else in the local database. Use `pnpm db:reset` only when
you need a genuinely clean database (e.g. after a migration change). Use
`pnpm db:clear` instead of `pnpm db:reset` when you want that clean,
fully migrated database to stay empty (no seed run afterward) — e.g. for
an empty-account/empty-state audit.

## Image fixtures

**`pnpm db:seed` never contacts Vercel Blob**, even if `BLOB_READ_WRITE_TOKEN`
is present in `.env.local` — a correction after an earlier pass
accidentally uploaded during ordinary seed runs on a machine that happened
to have the token configured for unrelated app development. Image upload
is opt-in only: `pnpm db:seed-images` sets `SEED_UPLOAD_BLOB_IMAGES=true`,
which is the one thing that turns it on.

When run with `SEED_UPLOAD_BLOB_IMAGES=true` **and** `BLOB_READ_WRITE_TOKEN`
configured, the seed attaches a real local food photo — not a generated
placeholder — to each of 11 seeded Recipes/Parts. Source files live in
`prisma/seed-assets/food/` and are mapped to their Recipe/Part
deterministically by descriptive filename (e.g.
`peanut-noodle-salad.jpg` → `[QA] Peanut Noodle Salad`,
`garlic-confit-toast.webp` → `[QA] Confit Toast Plate`). Source formats are
deliberately mixed (`.jpg`/`.jpeg`/`.webp`) across files to prove seeding
isn't brittle to a specific image format. Each file is routed through the
same real validation/normalization pipeline a user upload goes through
(`src/lib/images/processing.ts#normalizeImageBuffer` — format sniffing,
EXIF-orientation correction, resize, WebP conversion), then uploaded to a
stable, deterministic Blob pathname per item (`images/qa-seed/{slug}.webp`)
and attached to that Recipe/Part's current Version — real enough to review
the display/replace/remove/logged-out-access paths. `[QA] Toasted Sesame
Oil Drizzle` (Part) and `[QA] Weeknight Stir-Fry` (Recipe) deliberately stay
image-less so the image-empty UI states stay reviewable. Full
attached/empty list and file mapping: `docs/SEED_REVIEW_GUIDE.md`.

**Licensing/ownership of the files under `prisma/seed-assets/food/` is the
repository owner's responsibility** — this seed does not verify licenses
or provenance.

Rerunning `pnpm db:seed-images` reuses each item's same stable Blob
pathname/`ImageAsset` row (upsert by `storageKey`) rather than uploading a
duplicate, and reference-counts + deletes (via the same
`deleteImageAssetIfOrphaned`/`bestEffortDeleteBlob` helpers
`deleteDish`/`editDish` already use) any `ImageAsset` the *previous* run's
now-wiped QA Dishes referenced but the current run no longer does — repeated
image-enabled runs don't accumulate abandoned Blob objects. That cleanup
step itself only runs in image-enabled mode, so switching back to plain
`pnpm db:seed` never triggers a Blob delete call either; any orphaned rows
from a prior image-enabled run just persist harmlessly (unreferenced,
invisible in the app) until the next `pnpm db:seed-images` run.

If an expected local fixture under `prisma/seed-assets/food/` is missing or
unreadable, `pnpm db:seed-images` fails clearly with the exact file path it
tried to read rather than silently skipping that item.

Without `SEED_UPLOAD_BLOB_IMAGES=true` (i.e., under ordinary `pnpm
db:seed`), every Recipe/Part stays image-less and the seed remains fully
functional otherwise — sign in as the QA owner and manually attach an
image via the editor if you need to review those flows without running
`pnpm db:seed-images`.
