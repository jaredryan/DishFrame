# Manual QA seed system

A deterministic, idempotent fixture set for manual review — not general
seed data. It builds a compact set of Recipes and Parts under one
dedicated QA account, covering the lifecycle, versioning, composition,
propagation, and deletion states that would otherwise take a long time to
hand-build for every review gate.

## Setup

Set in `.env.local` (see `.env.example`):

- `SEED_USER_EMAIL` (required) — the email of a dedicated QA account.
  Never point this at a real personal account; both commands below own
  every `[QA]`-prefixed row under it completely and wipe/recreate them on
  every run.
- `SEED_USER_NAME` (optional) — defaults to `"QA Seed Owner"`.
- `BLOB_READ_WRITE_TOKEN` (optional) — when set, the seed attaches a real
  deterministic image fixture (see "Image fixture" below). Without it, the
  seed skips the image step and stays fully functional otherwise.

## Commands

- `pnpm db:seed` — idempotent. Deletes and recreates only `[QA]`-titled
  Dish rows owned by `SEED_USER_EMAIL`; safe to rerun any time to restore
  the fixture set, including after destructive manual testing (see
  below). Prints a catalog of what it created.
- `pnpm db:reset` — destructive. Resets the entire local database, applies
  migrations, regenerates the Prisma Client, then runs `pnpm db:seed`.

## Safety

Both commands refuse to run unless `DATABASE_DRIVER=pg` and both
`DATABASE_URL`/`DIRECT_URL` resolve to a local host
(`localhost`/`127.0.0.1`/`::1`) — never Neon, never production. This is a
real code guard (`src/lib/db/local-guard.ts`), not just a warning.

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

## Restoring after destructive testing

Propagation and deletion testing mutate real rows. To restore the fixture
set afterward, rerun `pnpm db:seed` — it deletes and rebuilds only
`[QA]`-titled Dishes owned by the seed user, so it's fast and doesn't
touch anything else in the local database. Use `pnpm db:reset` only when
you need a genuinely clean database (e.g. after a migration change).

## Image fixture

When `BLOB_READ_WRITE_TOKEN` is set, the seed uploads a small deterministic
generated image (a solid-color PNG, not a real photo) to a fixed Blob
pathname and attaches it to `[QA] Sunday Ramen Project`'s current Version
— real enough to review the display/replace/remove/logged-out-access
paths. Re-running `pnpm db:seed` overwrites the same pathname rather than
creating a new Blob each time. `[QA] Weeknight Stir-Fry` intentionally
stays image-less for a side-by-side comparison.

Without `BLOB_READ_WRITE_TOKEN`, the seed skips this step (logs a message,
doesn't fail) and stays otherwise fully functional — in that case, sign in
as the QA owner and manually attach an image to `[QA] Sunday Ramen
Project` via the editor to review those flows instead.
