# DishFrame

A framework for organizing, preparing, cooking, evaluating, and improving
the dishes you cook: keep recipes organized, reuse the sauces and staples
you make often, and carry ratings and notes forward into the next meal.

**This repository currently contains Milestone 1: the technical foundation
and application shell.** Recipes, reusable parts, versions, cooking
sessions, and meal planning are intentionally not built yet — see
[Milestone 1 scope](#milestone-1-scope) below.

## Stack

- **Runtime:** Node.js 24 LTS, pnpm
- **Framework:** Next.js 16 (App Router, Server Components, Turbopack), React 19.2, TypeScript (strict)
- **Styling:** Tailwind CSS 4, shadcn/ui (Radix primitives), next-themes, Lucide icons
- **Fonts:** Manrope (headings), Inter (body) via `next/font`
- **Database:** PostgreSQL via Neon, Prisma ORM 7 (custom client output, Neon serverless driver adapter)
- **Auth:** Better Auth with Google OAuth and the official Prisma adapter
- **Validation:** Zod (environment variables)
- **Testing:** Vitest + Testing Library (unit/component), Playwright (e2e)
- **CI:** GitHub Actions

## Prerequisites

- Node.js 24.x (see `.nvmrc`)
- pnpm (`corepack enable` will pick up the version pinned in `package.json`)
- A [Neon](https://neon.tech) Postgres project (or another Postgres 14+ database)
- A Google Cloud OAuth client, for sign-in

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values below
pnpm db:generate              # generate the Prisma client
pnpm db:migrate                 # apply migrations (needs DATABASE_URL)
pnpm dev
```

The app runs at http://localhost:3000. Public marketing pages and the
sign-in page work as soon as the dev server starts; signing in and any
database-backed page require the environment variables below.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable                                    | Required           | Notes                             |
| ------------------------------------------- | ------------------ | --------------------------------- |
| `DATABASE_URL`                              | For sign-in / data | Neon **pooled** connection string |
| `DIRECT_URL`                                | For migrations     | Neon **direct** connection string |
| `BETTER_AUTH_SECRET`                        | Yes                | `openssl rand -base64 32`         |
| `BETTER_AUTH_URL`                           | Yes                | `http://localhost:3000` locally   |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For sign-in        | From Google Cloud Console         |
| `NEXT_PUBLIC_APP_URL`                       | Yes                | `http://localhost:3000` locally   |

Without `DATABASE_URL` the app still builds and runs — public pages and
`/sign-in` render normally, `/api/health` reports `degraded`, and any page
that needs a session redirects to sign-in. Without `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, the sign-in page renders with the Google button
disabled and a setup notice instead of a broken flow.

### Neon setup

1. Create a project at [neon.tech](https://neon.tech).
2. In the Neon console, go to **Connect** and copy the **pooled** connection
   string into `DATABASE_URL`, and the **direct** connection string into
   `DIRECT_URL`.
3. Run `pnpm db:migrate` to apply the initial migration
   (`prisma/migrations/20260722200916_init`), which creates the `users`,
   `sessions`, `accounts`, and `verifications` tables Better Auth needs.

### Google OAuth setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an OAuth 2.0 Client ID (Web application).
2. Add this authorized redirect URI (adjust the host for production):

   ```
   http://localhost:3000/api/auth/callback/google
   ```

3. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

## Scripts

```bash
pnpm dev            # start the dev server
pnpm build           # production build
pnpm start           # run the production build
pnpm lint            # eslint
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest (unit/component)
pnpm test:watch      # vitest, watch mode
pnpm test:e2e        # playwright (starts its own dev server)
pnpm format          # prettier --write
pnpm format:check    # prettier --check
pnpm db:generate     # generate the Prisma client
pnpm db:migrate      # create/apply a migration in development
pnpm db:deploy       # apply pending migrations (CI/production)
pnpm db:studio       # Prisma Studio
```

## Route map

**Public**

- `/` — marketing home
- `/about`
- `/contact`
- `/sign-in`

**Signed in** (redirect to `/sign-in` if signed out)

- `/home`
- `/recipes`
- `/parts`
- `/help`
- `/profile`

**API**

- `/api/auth/[...all]` — Better Auth
- `/api/health` — liveness + database connectivity

## Milestone 1 scope

This milestone is the durable foundation and application shell — it
intentionally does **not** include recipe data, reusable parts, cooking
sessions, versions, meal planning, grocery lists, or any other domain
model. The only database models are the ones Better Auth requires (users,
sessions, accounts, verifications). See `docs/MILESTONE_1.md` for the full
brief and `docs/BRANDING.md` for the visual and voice reference.

## Known external setup still required

No live Neon database or Google OAuth credentials were available while
scaffolding this project. To reach full functionality:

1. Create a Neon project and set `DATABASE_URL` / `DIRECT_URL`.
2. Run `pnpm db:migrate` to apply the initial migration.
3. Create a Google OAuth client and set `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET`.

Everything else — the app shell, marketing pages, sign-in UI, theming, and
tests — works without those credentials.
