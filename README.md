# DishFrame

A private-first recipe-management and recipe-development app built around
the complete lifecycle of a dish:

> **Save → organize → prepare → cook → evaluate → revise → reuse**

DishFrame is for home cooks who repeatedly make familiar dishes, refine
them over time, and want one dependable place to organize recipes, reuse
recurring preparations ("Parts" — reusable sauces, sides, and staples),
track how a dish evolves across versions, plan meals, generate grocery
lists, and share what they've built with the people they feed.

Production: **https://dish-frame.vercel.app**

## What's built

The full Tier 1 + Tier 2 product from `docs/PRODUCT_SPEC.md` is
implemented and live, including:

- **Recipes and Parts** — a shared editor for both, with Sections,
  Ingredients (amount modes, substitutes, optional flags), Instructions,
  and nested reusable Parts linked into a parent Recipe/Part.
- **Versioning** — every meaningful content change creates an immutable,
  numbered (major.minor) Version; edit from any historical Version,
  compare two Versions field-by-field, and see how a dish evolved.
- **Cooking Mode** — a dedicated cooking interface with per-unit
  checklists, persistent multi-timer support, mid-session scaling, and a
  post-session Review (ratings from named Tasters, notes, duration).
- **Search, tags, Flavor Profiles, and Favorites** across separate Recipe
  and Part libraries.
- **Nutrition** — manual entry plus USDA FoodData Central lookup
  (including barcode-scan-assisted search).
- **Meal Plans** with recommendations, and **Grocery Lists** that can
  stand alone or stay live-synced to a Meal Plan.
- **Sharing** — read-only unlisted/fixed-snapshot links, direct
  account-to-account sharing (single or multi-Recipe collections), and
  independent, fully-owned copies on accept.
- **Print / Save-as-PDF** for recipes, parts, and shared content.
- **Account tools** — data export, session/device management, and full
  account deletion.
- **Onboarding** — a skippable first-run intro plus contextual,
  replayable guides.

See `docs/PRODUCT_SPEC.md` for full product behavior and
`docs/TODO.md` for what's still open or deferred.

## Stack

- **Runtime:** Node.js 24 LTS, pnpm
- **Framework:** Next.js 16 (App Router, Server Components, Turbopack), React 19.2, TypeScript (strict)
- **Styling:** Tailwind CSS 4, shadcn/ui (Radix primitives), next-themes, Lucide icons
- **Fonts:** Manrope (headings), Inter (body) via `next/font`
- **Database:** PostgreSQL via Neon (production) or local Docker Postgres (development), Prisma ORM 7 (custom client output, `@prisma/adapter-neon` / `@prisma/adapter-pg`)
- **Auth:** Better Auth with Google OAuth and the official Prisma adapter
- **Images:** Vercel Blob (private store), server-side normalization via `sharp`
- **Forms:** React Hook Form (Recipe/Part editor)
- **Drag and drop:** `@dnd-kit` (Sections, Ingredients, Instructions, Grocery Categories, Tasters)
- **Barcode scanning:** `@zxing` (nutrition lookup convenience entry point)
- **Email:** Resend (contact form only — not persisted to the database)
- **Validation:** Zod
- **Testing:** Vitest + Testing Library (unit/component/integration), Playwright (e2e)
- **CI:** GitHub Actions

## Prerequisites

- Node.js 24.x (see `.nvmrc`)
- pnpm (`corepack enable` will pick up the version pinned in `package.json`)
- Docker Desktop, for local Postgres (see [Local database](#local-database) below)
- A Google Cloud OAuth client, for sign-in

## Getting started

```bash
pnpm install
cp .env.example .env.local      # then fill in the values below
pnpm db:generate                # generate the Prisma client
pnpm db:docker:up               # start local Postgres (Docker)
pnpm db:migrate:local            # apply migrations to it
pnpm dev
```

The app runs at http://localhost:3000. Public marketing pages and the
sign-in page work as soon as the dev server starts; signing in and any
database-backed page require the environment variables below.

## Environment variables

Copy `.env.example` to `.env.local` and fill in — `.env.example` has the
full annotated list; the essentials:

| Variable                                    | Required             | Notes                                                                              |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_DRIVER`                           | Yes                  | `"pg"` locally (local Docker Postgres), `"neon"` in deployed environments          |
| `DATABASE_URL` / `DIRECT_URL`               | For sign-in / data   | Local Docker Postgres by default; Neon pooled/direct URLs in deployed environments |
| `BETTER_AUTH_SECRET`                        | Yes                  | `openssl rand -base64 32`                                                          |
| `BETTER_AUTH_URL`                           | Yes                  | `http://localhost:3000` locally                                                    |
| `SHARE_LINK_HMAC_SECRET`                    | Yes                  | Signs public share-link tokens — `openssl rand -base64 32`                         |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For sign-in          | From Google Cloud Console                                                          |
| `NEXT_PUBLIC_APP_URL`                       | Yes                  | `http://localhost:3000` locally                                                    |
| `BLOB_READ_WRITE_TOKEN`                     | For image upload     | Private Vercel Blob store token                                                    |
| `RESEND_API_KEY` / `CONTACT_TO_EMAIL`       | For the contact form | Resend dashboard                                                                   |
| `FDC_API_KEY`                               | For nutrition lookup | USDA FoodData Central API key                                                      |
| `SEED_USER_EMAIL`                           | For `pnpm db:seed`   | Dedicated QA account email — see `.env.example`                                    |

Without `DATABASE_URL` the app still builds and runs — public pages and
`/sign-in` render normally, `/api/health` reports `degraded`, and any page
that needs a session redirects to sign-in. Without `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, the sign-in page renders with the Google button
disabled and a setup notice instead of a broken flow. Without
`BLOB_READ_WRITE_TOKEN`, everything works except image upload.

### Local database

Ordinary local development uses a disposable local Postgres via Docker
Compose, never Neon directly:

```bash
pnpm db:docker:up        # start Postgres (creates both the dev and shadow databases)
pnpm db:migrate:local     # apply migrations
pnpm db:seed              # optional — populate deterministic QA fixtures under SEED_USER_EMAIL
```

`docker-compose.yml` runs `postgres:16-alpine`; `docker/init-db/` creates
the required shadow database on first start. `pnpm db:reset` wipes,
re-migrates, and reseeds in one step; `pnpm db:clear` does the same
without reseeding (useful for empty-state testing).

Real Neon credentials are never used for ordinary local development.
For the rare case of intentionally running the local app (not tests,
seeds, or migrations) against production data, see the guarded
`pnpm dev:production-db` path documented in `.env.example` and
`scripts/dev-production-db.mjs`.

### Neon setup (deployed environments)

1. Create a project at [neon.tech](https://neon.tech).
2. In the Neon console, go to **Connect** and copy the **pooled**
   connection string into `DATABASE_URL`, and the **direct** connection
   string into `DIRECT_URL`.
3. Apply the schema — see [Migrations](#migrations) below. The Prisma CLI
   only auto-loads `.env`, not `.env.local` — `prisma.config.ts` loads
   `.env.local` first (falling back to `.env`) so `pnpm db:migrate` /
   `pnpm db:deploy` see the same `DATABASE_URL` the app uses.
4. `/api/health` reports `database: "connected"` as soon as Prisma can
   reach Postgres — that only proves connectivity, **not** that the
   schema exists. Confirm with `pnpm exec prisma migrate status`.

### Migrations

```bash
pnpm db:migrate          # prisma migrate dev — local/dev database only.
                          # Creates + applies a migration from schema changes.
pnpm db:deploy            # prisma migrate deploy — production-safe.
                          # Applies committed migrations, no shadow DB, no prompts.
pnpm db:deploy:upgrade    # prisma migrate deploy, then the idempotent
                          # CookingSessionPartUsage backfill.
                          # This is the command production deployment should
                          # invoke, not the bare `db:deploy` above.
```

`pnpm db:deploy:upgrade` must be run by hand (or as a deploy-time hook)
against Neon whenever `prisma/migrations/` changes — **Vercel builds do
not run it automatically**. This repo's own migration history mixes
Prisma-generated and hand-authored raw SQL; see `CLAUDE.md`'s "Database
migrations" section before generating a new one.

### Google OAuth setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth 2.0 Client ID (Web application).
2. Add both authorized JavaScript origins and both redirect URIs — one
   pair per environment, on the same client:

   ```
   Authorized JavaScript origins:
     http://localhost:3000
     https://dish-frame.vercel.app

   Authorized redirect URIs:
     http://localhost:3000/api/auth/callback/google
     https://dish-frame.vercel.app/api/auth/callback/google
   ```

3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` — locally in `.env.local`, and in Vercel under
   **Project Settings → Environment Variables**.

`BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must match the environment
they run in, since Better Auth builds the Google redirect URI from
`BETTER_AUTH_URL`.

## Scripts

```bash
pnpm dev                # start the dev server
pnpm build               # production build
pnpm start               # run the production build
pnpm lint                # eslint
pnpm typecheck           # tsc --noEmit
pnpm test:frontend       # vitest (unit/component)
pnpm test:watch          # vitest, watch mode
pnpm test:e2e            # playwright (starts its own dev server)
pnpm format              # prettier --write
pnpm format:check        # prettier --check
pnpm check               # format + lint + typecheck + build
pnpm db:generate         # generate the Prisma client
pnpm db:migrate          # create/apply a migration in development
pnpm db:deploy           # apply pending migrations only (CI)
pnpm db:deploy:upgrade   # apply pending migrations, then the Part-usage backfill
pnpm db:studio           # Prisma Studio
pnpm db:deploy:production # db:deploy:upgrade against production Neon — see
                          # Production deployment below
pnpm release:production  # the full production release workflow — see
                          # Production deployment below
```

`pnpm check` does not run the test suites or Playwright. The composed
`verify:*` scripts (`verify:frontend`, `verify:backend`, `verify:e2e`,
`verify:fullstack`, `verify:feature`, `verify:all` — defined in
`package.json`) run the fuller combinations, including database-backed
integration tests and a single-worker Playwright pass; see `CLAUDE.md`
for what each composes and when to run them.

## Route map

**Public** (`(marketing)`, fully static)

- `/` — marketing home
- `/about`
- `/contact`
- `/privacy`, `/terms`

**Auth**

- `/sign-in`

**Signed in** (redirect to `/sign-in` if signed out)

- `/home`, `/recipes`, `/parts`, `/cook`, `/meal-plans`, `/grocery-lists`,
  `/share`, `/tasters`, `/tags`, `/flavor-profiles`, `/settings`,
  `/profile`, `/help`
- Recipe/Part detail, edit, versions, and compare sub-routes under
  `/recipes/[dishId]` and `/parts/[dishId]`
- `/cook/[sessionId]` (+ `/review`) — Cooking Mode, its own route group
  with no sidebar

**Public share and print** (unauthenticated, tokenized)

- `/s/[token]` — a public share view
- `/print/recipes/[dishId]`, `/print/parts/[dishId]`, `/print/s/[token]`

**API**

- `/api/auth/[...all]` — Better Auth
- `/api/health` — liveness + database connectivity
- `/api/images/upload`, `/api/images/[assetId]`
- `/api/export/account`, `/api/export/dish/[dishId]`

## Documentation

- `docs/PRODUCT_SPEC.md` — canonical product behavior, terminology, and acceptance criteria
- `docs/BRANDING.md` — visual identity, voice, and design guardrails
- `docs/PRODUCT_ROADMAP.md` — product vision and tiered roadmap (context; superseded by `PRODUCT_SPEC.md` on conflict)
- `docs/ARCHITECTURE_PROPOSAL.md` — data model and technical architecture
- `docs/BUILD_PLAN.md` — how the product was sequenced and built, slice by slice
- `docs/TODO.md` — current open work: product decisions pending owner input, known gaps, deployment follow-ups

## Production deployment

Production runs on Vercel at **https://dish-frame.vercel.app**, deployed
automatically by **Vercel's Git integration** on push to `main` — there is
no `vercel.json`, no custom build command, and no production-only
pre-deploy hook in this repository. That means the database upgrade step
**cannot be enforced automatically**; the release workflow below runs it
explicitly, before the push, so Vercel never deploys application code
against a schema it doesn't match yet.

Both commands below read Neon credentials from a git-ignored
`.env.production-access.local` file (see `.env.example`'s "Option C" and
`scripts/dev-production-db.mjs`) — you never need to paste `DATABASE_URL`
/ `DIRECT_URL` into the terminal by hand.

Neither command requires a `CONFIRM_PRODUCTION_DATABASE=yes` prefix. That
flag exists on `pnpm dev:production-db` (see [Local database](#local-database))
because it opens a live dev server that can issue arbitrary writes through
normal app code. `db:deploy:production` and `release:production` only ever
run `prisma migrate deploy` plus the idempotent, additive Part-usage
backfill — never a destructive operation — so an extra per-run
confirmation flag on top of the credentials-file/`DATABASE_DRIVER=neon`
checks and the git-safety checks below added typing without adding real
safety. Genuinely destructive commands (`db:clear`, `db:reset`, which run
`prisma migrate reset --force`) can't reach production at all, confirmed
or not — `assertLocalDatabaseEnv` (`src/lib/db/local-guard.ts`) hard-blocks
them unless `DATABASE_DRIVER=pg` and both database URLs resolve to
`localhost`/`127.0.0.1`/`::1`, explicitly rejecting any `neon.tech` host.

**Recommended: the full release workflow, one command:**

```bash
pnpm release:production
```

Runs, strictly in order, stopping immediately on the first failure:

1. verify the current branch is exactly `main` and the working tree is
   clean;
2. `pnpm run verify:all`;
3. re-check the working tree is still clean (verification's
   formatting/build steps can modify files — if anything changed, this
   stops here and asks you to review and commit before touching
   production; nothing is committed automatically);
4. `pnpm db:deploy:production` (below) — migrates production and runs the
   Part-usage backfill;
5. `git push origin main`, which triggers Vercel's Git-integration
   deploy.

Migration happens before the push deliberately — production's schema must
already be compatible before Vercel builds and deploys the new code.

**Standalone: production database migration only:**

```bash
pnpm db:deploy:production
```

Applies `db:deploy:upgrade` (`prisma migrate deploy`, then the idempotent
Part-usage backfill — see [Migrations](#migrations)) against the
production Neon database, without touching application code or git.
Useful for intentionally applying a migration ahead of a code release.
Refuses to run without `.env.production-access.local`, without
`DATABASE_DRIVER=neon` in that file, or with `DATABASE_URL`/`DIRECT_URL`
missing from it — see `scripts/db-deploy-production.mjs`. Verify
afterward with `pnpm exec prisma migrate status` against the same
database.

- Environment variables live in Vercel under **Project Settings →
  Environment Variables** (Production + Preview) — see
  [Environment variables](#environment-variables) above for the full
  list.
- `/api/health` proves Postgres connectivity, not schema correctness —
  a missing-table error only surfaces when an actual query runs (e.g.
  sign-in), as a `500` from `/api/auth/*`. Check `vercel logs` /
  the deployment's Runtime Logs for the underlying Prisma error, which
  names the missing table directly.

See `docs/TODO.md` for post-launch follow-ups (custom domain, search
console, security hardening, monitoring) that are tracked but not yet
done.

## SEO, metadata & security

- **Metadata** — `src/app/layout.tsx` sets `metadataBase`, the title
  template, description, Open Graph, and Twitter card metadata from
  `src/lib/site.ts` (which reads `NEXT_PUBLIC_APP_URL`). Public pages
  each set a canonical URL; private routes and `/sign-in` set
  `robots: { index: false, follow: false }`.
- **Sitemap/robots** — `src/app/sitemap.ts` / `robots.ts`, served at
  `/sitemap.xml` / `/robots.txt`, list only the public marketing pages
  and disallow the signed-in app and `/api/*`.
- **Public marketing pages are fully static** — no session-dependent
  rendering, so they prerender and CDN-cache. Public share (`/s/[token]`)
  and print (`/print/s/[token]`) routes instead carry a scoped
  `Referrer-Policy: no-referrer` (their bearer token lives in the URL
  path, not a cookie).
- **Security headers** — `next.config.ts` disables `X-Powered-By` and
  adds `X-Content-Type-Options`, `Referrer-Policy`, and a restrained
  `Permissions-Policy` to every route. No enforcing
  Content-Security-Policy yet — see `docs/TODO.md`.
- **Error/loading states** — branded `not-found.tsx`, `error.tsx`, and
  `global-error.tsx`; `loading.tsx` covers the authenticated shell and
  `/sign-in`, where a real server-side session lookup happens before the
  page renders.

## Known external setup

The app is fully configured to run without a database or Google OAuth
credentials (see [Environment variables](#environment-variables) above)
for local scaffolding/CI purposes — public pages, the sign-in page, and
the build all work regardless. Sign-in and any database-backed page
additionally require:

1. Local Postgres via Docker (`pnpm db:docker:up` + `pnpm db:migrate:local`)
   for development, or a Neon project with `DATABASE_URL`/`DIRECT_URL`
   set and `pnpm db:deploy:upgrade` applied for production — see
   [Migrations](#migrations).
2. A Google OAuth client with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   set, and both origins/redirect URIs registered — see
   [Google OAuth setup](#google-oauth-setup).
