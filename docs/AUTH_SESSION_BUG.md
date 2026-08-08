# Auth/session investigation — local ECONNREFUSED and production login failure

Investigated 2026-08-08. Two independent problems, confirmed unrelated. Both
are fixed; production required a live database change, done with explicit
owner sign-off mid-investigation.

## 1. Local failure — `ECONNREFUSED` from `prisma.session.findFirst()`

**Root cause:** Docker Desktop was not running. `docker ps` failed with
"Cannot connect to the Docker daemon" — no container was listening on
`localhost:5432` at all, which is exactly what `ECONNREFUSED` reports.
Nothing about the database's *data* was broken.

**Why `db:reset` appeared to fix it:** it doesn't, and never did — confirmed
by reading `scripts/db-reset.ts`. It only runs `pnpm db:clear` (→
`prisma migrate reset --force`) then `pnpm db:seed`; it never starts Docker
and never touches `db:docker:up`. With the daemon down, `db:reset` fails at
its very first step with the same `ECONNREFUSED`, no differently than any
other Prisma command would. The historical "fix" was starting Docker
Desktop (or running `pnpm db:docker:up`) around the same time as reaching
for `db:reset` — that step restored connectivity; the reset itself did
nothing but wipe and reseed data that didn't need to be touched.

**Evidence:**
- `docker ps -a` → `Cannot connect to the Docker daemon at unix:///Users/jaredryan/.docker/run/docker.sock`.
- `docker-compose.yml` uses a named, persistent volume
  (`dishframe-postgres`) — only `db:docker:reset` (`down -v`) removes it;
  plain `down`/restart preserves data. Confirmed live: stopped the
  container (`db:docker:down`), restarted it (`db:docker:up`), and
  `prisma migrate status` still reported "Database schema is up to date"
  with all 20 migrations applied — nothing was lost.
- `scripts/db-reset.ts` / `db-clear.ts` / `seed.ts` never invoke Docker.

**Changes made:**
- `src/lib/db/local-guard.ts`: added `assertLocalDatabaseReachable()` — a
  fast preflight TCP/auth check (via `pg.Client`, 3s timeout) that runs
  before any local DB script does real work. On failure it throws one
  clear message: *"could not reach the local Postgres (…). Start it with
  `pnpm db:docker:up` (safe — preserves existing data), then retry. This
  does not require db:reset."* Handles Node's `AggregateError` (empty
  top-level `.message` when a refused connection is attempted on multiple
  resolved addresses) by falling back to `.code`/nested error.
- Wired into `scripts/db-reset.ts`, `scripts/db-clear.ts`, `scripts/seed.ts`
  — all three now fail fast with that message instead of a raw Prisma
  stack trace, and (for `db-reset`/`db-clear`) fail *before*
  `prisma migrate reset --force` ever runs, so a connectivity problem can
  never be mistaken for a reason to wipe data.
- `src/lib/auth/session.ts`: `getServerSession()` now catches errors from
  `auth.api.getSession()` instead of letting them propagate. Better Auth's
  own `getSession` endpoint wraps *any* internal failure (dead DB
  connection, broken session-store query) as a thrown
  `FAILED_TO_GET_SESSION` `APIError` rather than returning `null` — see
  `node_modules/.../better-auth/dist/api/routes/session.mjs` lines
  256–259. Better Auth's own internal callers (`getSessionFromCtx`)
  already treat that failure as "no session" via `.catch(() => null)`;
  our code now does the same at the application boundary. Previously, a
  DB hiccup during a session check crashed the entire page (client-side
  `error.tsx`) instead of just showing "not signed in." This is a general
  resilience fix, not solely a production fix (see §2 for why it doesn't
  fully explain production on its own).

**Verification:**
- Live-reproduced end to end: stopped the container, ran `db:clear` → got
  the new clear message (`… (ECONNREFUSED). Start it with pnpm
  db:docker:up …`), confirmed via the command's own exit that
  `prisma migrate reset --force` never ran. Restarted the container,
  confirmed schema/data intact (`prisma migrate status`), started
  `pnpm dev`, confirmed `/api/health` → `{"status":"ok","database":"connected"}`,
  `/sign-in` → 200, `/api/auth/get-session` → 200, and
  `POST /api/auth/sign-in/social` returned a correct Google authorize URL
  with a `better-auth.state` cookie set. Local login is fully functional
  with a healthy database.
- New tests (not run by me — hook policy routes all test execution to
  you; see "What to run yourself" below):
  - `src/lib/db/local-guard.test.ts` — added a `describe("assertLocalDatabaseReachable")`
    block (mocks `pg.Client`): resolves on a successful connect; throws a
    message containing `db:docker:up` on a rejected connect; always calls
    `client.end()` even after a failed connect.
  - `src/lib/auth/session.test.ts` (new file) — `getServerSession()`
    returns the session on success, returns `null` (not a throw) when the
    underlying lookup rejects; `requireUserId()` still throws
    `AuthorizationError` in that case (never silently authorizes).

## 2. Production failure — missing schema, not an auth/session bug

**Root cause:** the production Neon database had only ever received the
very first migration (`20260722200916_init` — Better Auth's own tables).
The other 19 migrations, covering essentially the entire feature set built
since Milestone 1 (Dish, UserPreference, GroceryCategory, Taster,
CookingSession, ShareLink, …), had never been deployed. The app code and
generated Prisma Client matched the *current* schema, so any authenticated
page touching one of those newer tables threw `relation "…" does not
exist`.

This surfaced as a login failure because of the specific symptom you
described: clicking sign-in never reached Google at all, landing
immediately on the generic "Something went wrong / Try again or return
home" page (`src/app/error.tsx`). Sequence: your desktop/phone still held
a valid, unexpired session cookie from before (session/user/account tables
*did* exist, so `getServerSession()` succeeded) → `src/app/(auth)/sign-in/page.tsx`'s
`if (session) redirect(redirectTo)` fired → the destination page (or the
`(app)` shell's `initializeNewUser` retry logic, which touches
`UserPreference`/`GroceryCategory`/`Taster`) queried a table that didn't
exist → uncaught exception → client-side error boundary. You never saw
the Google button because you were never shown the sign-in form at all —
you were being silently redirected into a broken authenticated app.

This is *not* the same bug as §1. `getSession()` itself only ever touches
`sessions`/`users`/`accounts` (present since `init`), so it never threw in
production; the crash was one hop downstream, in code that assumed tables
`init` never created.

**Evidence:**
- `curl` against `https://dish-frame.vercel.app/api/health` → `{"status":"ok","database":"connected"}`
  (a bare `SELECT 1`, which is why it didn't catch this).
- `POST /api/auth/sign-in/social` on production returned a correctly
  formed Google authorize URL with the right `client_id`/`redirect_uri` —
  ruled out redirect-URI/client misconfiguration.
- Read-only `prisma migrate status` against the production `DATABASE_URL`
  (from `.env.production-access.local`) reported 19 of 20 migrations
  unapplied.
- Read-only `information_schema.tables` query confirmed exactly 5 tables
  present before the fix (`accounts`, `sessions`, `users`, `verifications`,
  `_prisma_migrations`).
- `pnpm db:scan-migrations` (static file scan, no DB connection) found no
  unallowed removal of a protected object across all 20 migration files —
  the pending migrations were additive-only.
- You confirmed you click "Sign in" and land directly on the "Try
  again/Go back" page without ever reaching Google — matching the
  redirect-then-crash sequence above, not a Google-side error.

**Changes made (production, run with your explicit go-ahead):**
- Ran `pnpm db:deploy:upgrade` (`prisma migrate deploy` +
  `db:backfill:part-usage`) against production. All 19 pending migrations
  applied cleanly; the backfill scanned 0 rows (no prior data — matches
  your note that the site has no real usage yet).
- Re-checked: `prisma migrate status` → "Database schema is up to date!";
  table count went from 5 → 39, matching `schema.prisma`.
- `/api/health` still returns `{"status":"ok","database":"connected"}`
  post-migration.

**Verification:**
- Confirmed via the read-only checks above (migration status, table count,
  health endpoint). I did not drive a real Google OAuth handshake (needs
  your actual Google account/browser).
- **What you need to do:** try signing in for real on both desktop and
  phone. If either still fails, capture the exact error text/URL and any
  Vercel Runtime Log entry for that request — that would point to a
  second, independent issue rather than this one, since the schema gap is
  now closed.
- The `getServerSession()` hardening from §1 also applies here as defense
  in depth: a future transient production DB error will now degrade to
  "please sign in" instead of a hard crash, but note it did *not* cause or
  fix this specific incident — the schema gap did.

## 3. Environment isolation — local vs. production

No interference is possible between local and production, by construction:

- **Separate databases.** Local: Docker Postgres via `DATABASE_DRIVER=pg`,
  `postgresql://…@localhost:5432/dishframe` (`.env.local`). Production:
  Neon via `DATABASE_DRIVER=neon`, a distinct host
  (`ep-aged-math-afpqujnm-pooler.c-2.us-west-2.aws.neon.tech`). Session
  tokens are DB-backed row lookups (`Session.token`), not stateless JWTs —
  even a token valid in one environment's cookie has nothing to match in
  the other environment's database.
- **Guarded local scripts.** `assertLocalDatabaseEnv()` (`src/lib/db/local-guard.ts`)
  refuses to run any local script (`db:clear`/`db:seed`/`db:reset`/etc.)
  against anything but a recognized local hostname, and explicitly refuses
  a `neon.tech` host even if `DATABASE_DRIVER` were misconfigured. Guarded
  production access (`scripts/dev-production-db.mjs`, gated by
  `CONFIRM_PRODUCTION_DATABASE=yes`) is a separate, deliberate opt-in path,
  never loaded by ordinary `pnpm dev`.
- **Separate cookies, both by domain and by name.** `BETTER_AUTH_URL` is
  `http://localhost:3000` locally vs. `https://dish-frame.vercel.app` in
  production — browsers already isolate cookies by domain regardless of
  anything else. Better Auth additionally names the cookie differently
  per scheme: confirmed live that local issues a plain
  `better-auth.state`/`better-auth.session_token` cookie (no `Secure`),
  while production issues `__Secure-better-auth.state` (the `__Secure-`
  prefix is meaningless — and Better Auth won't set it — over plain HTTP).
- **Separate `BETTER_AUTH_SECRET`.** `.env.local` has its own value;
  production's lives in Vercel's dashboard only (not visible from this
  environment). Irrelevant to interference either way, given the
  database separation above, but confirmed structurally separate by
  configuration (`.env.example`'s guidance, README's env-var list).

**One related-but-distinct gap, not part of this incident:** per
`POST_LAUNCH_TODO.md` §G ("Preview/environment isolation," not yet done),
Vercel *Preview* deployments (not local) currently share the *same*
production Neon database — there's no separate Preview branch/database
yet. That's worth closing before relying on preview deploys for anything
that writes data, but it's unrelated to local dev and wasn't a factor in
either failure investigated here.

## 4. Multi-session behavior

Reviewed the schema and revoke implementation; no single-session
assumption found.

- `Session` (`prisma/schema.prisma`) has no unique constraint on `userId`
  — nothing prevents or collapses multiple concurrent sessions per user.
  `auth.ts`'s `session` config sets no device limit, matching the comment
  already there ("Better Auth allows multiple concurrent sessions per
  user by default — no per-device restriction is configured here on
  purpose").
- `revokeAuthSession(requesterId, sessionId)` (`src/lib/account/service.ts`)
  looks up the target session, verifies `target.userId === requesterId`
  *before* calling Better Auth's `revokeSession`, and only ever revokes
  the one token passed in.
- `revokeOtherAuthSessions()` calls Better Auth's own `revokeOtherSessions`,
  which is scoped to the *current* authenticated session's user
  server-side — it can't reach another account's sessions.
- Existing tests (`src/lib/account/account.integration.test.ts`) already
  cover the cross-account authorization boundary (can't revoke someone
  else's session; revoking a nonexistent id is rejected).

**New test added:** `account.integration.test.ts` →
`"deleting one of an account's own sessions leaves its other sessions
intact"` — creates two `Session` rows for the same user, deletes one
directly, asserts the other is untouched. This is the one gap the
existing suite didn't cover: same-account multi-session coexistence,
which is the actual invariant this task asked to protect ("creating or
destroying one normal session should not corrupt unrelated sessions").

**Verification:** not run by me (see below). Desktop, phone, another
browser, and local dev are four independent `Session` rows scoped to
different (`userId` unchanged) or the same user depending on which Google
account signs in where — nothing in the schema or code collapses them.

## What to run yourself

A hook in this environment routes all test/verification commands to you
rather than letting me run them, so none of the above was executed by me
beyond the manual `curl`/`docker`/`prisma` commands shown inline. Please
run, in a fresh session:

```
pnpm test src/lib/db/local-guard.test.ts src/lib/auth/session.test.ts
pnpm test:integration -- account.integration.test.ts
```

or your usual `verify:frontend`/`verify:backend` if you'd rather just run
the full suite.

## Owner intervention recommendation

**Focused manual review.** Two things need your eyes, not a generic
walkthrough:

1. Try signing in on production (desktop and phone) now that the
   migrations are applied — this is the one step I couldn't verify
   myself (no way to drive a real Google OAuth consent screen from here).
2. Skim the new `assertLocalDatabaseReachable` error message and the
   `getServerSession` catch-and-log behavior — both are small, deliberate
   scope; confirm they match what you'd want surfaced rather than silently
   swallowed.

No other manual UI review needed — everything else in this pass was either
a read-only diagnostic or a narrowly scoped defensive fix with the
production remediation already confirmed via `prisma migrate status` and
a direct table count.
