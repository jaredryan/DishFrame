# Public marketing shell: static rendering — completion

Follow-up to `docs/PUBLIC_MARKETING_STATIC_RENDERING.md` (§9). Removes the
remaining page-level `getServerSession()` calls from Home and About, per
owner decision that all five public marketing pages present the same
visitor-oriented CTAs regardless of authentication state.

## 1. Files changed

- `src/app/(marketing)/page.tsx` — removed `getServerSession()` call,
  `signedIn` computation, and the `getServerSession` import. Page is no
  longer `async`. `HeroShowcase` and `ClosingCta` are called with no
  `signedIn` prop.
- `src/app/(marketing)/about/page.tsx` — same: removed the session call,
  `signedIn`, the import, and the `async` declaration.
- `src/components/marketing/hero-showcase.tsx` — `HeroShowcase` no longer
  takes a `signedIn` prop. Its primary CTA is unconditionally `Create
  your first recipe` → `/recipes/new` (previously branched to `Open
  DishFrame` → `/home` when signed in).
- `src/components/marketing/closing-cta.tsx` — `ClosingCta` no longer
  takes a `signedIn` prop. Its CTA is unconditionally `Create your first
  recipe` → `/recipes/new`. The `Open DishFrame` alternative is removed;
  visual treatment otherwise unchanged (connector-motif redesign is a
  separate, later pass).
- `src/app/(marketing)/page.test.tsx` — the mocked `getServerSession` and
  the `/sign-in` href assertion no longer matched reality (page is
  session-free and CTAs now point at `/recipes/new`); updated the test to
  render the page directly and assert `/recipes/new`. This test was not
  actually already green as assumed — see §7.

## 2. HeroShowcase and ClosingCta: final behavior

Both components are now plain, deterministic — no auth branching, no
session prop. Rotating showcase, manual tab controls, timing, animations,
accessibility semantics (`role="tablist"`/`"tab"`/`"tabpanel"`,
`aria-selected`), responsive layout, and reduced-motion handling are
unchanged; only the CTA branch was removed.

CTA copy and destination, consistent across header, hero, and closing
CTA:

> Create your first recipe → `/recipes/new`

(The public header's own primary action remains its separately-decided
copy, `Create your first recipe` → `/recipes/new`, from the prior pass —
unchanged here.)

## 3. Routing behavior preserved

No auth-routing logic was added to either component — both link directly
to the already-protected `/recipes/new`:

- unauthenticated: `(app)/layout.tsx` and `recipes/new/page.tsx` redirect
  to `/sign-in` (pre-existing, unchanged);
- authenticated: goes straight into the recipe editor.

## 4. Production build route classifications

`pnpm run build` output:

```
├ ○ /            (Home)
├ ○ /about
├ ○ /contact
├ ○ /privacy
├ ○ /terms
```

All five named routes are now static/prerendered. No remaining
`getServerSession()` call exists in either marketing page (confirmed by
grep — zero `signedIn` references remain anywhere in `src`).

## 5. Response-header evidence

`next start`, `Cache-Control` header per route:

```
/         s-maxage=31536000
/about    s-maxage=31536000
/contact  s-maxage=31536000
/privacy  s-maxage=31536000
/terms    s-maxage=31536000
```

No route serves `private, no-cache, no-store` any longer.

## 6. Remaining dynamic-rendering sources

None identified for these five routes. No other request-dependent API
(`cookies()`, `headers()`, `getServerSession()`, etc.) remains in the
marketing layout, share layout, or either page component.

## 7. Verification performed

- `pnpm run build` — route classifications above; TypeScript/build
  compiled clean.
- `pnpm vitest run "src/app/(marketing)/page.test.tsx" src/components/layout/public-header.test.tsx`
  — 2 files, 3 tests passed. (Only these two directly-affected files were
  run, per the task's "focused verification" instruction — not the full
  suite.)
- `next start` + `curl -I` — cache headers above.
- Playwright, desktop (1280×900) and mobile (390×844), against the
  production server:
  - Home: both `Create your first recipe` links (header, hero) resolve
    to `/recipes/new`; closing CTA also `Create your first recipe` →
    `/recipes/new`; zero `Open DishFrame` links present.
  - About: closing CTA → `Create your first recipe` / `/recipes/new`;
    zero `Open DishFrame` links present.
  - Hero tab rotation: manual click moved `aria-selected` from `Stay
    focused` to `Update once` — interaction confirmed working.
  - Mobile screenshot: no layout shift, header collapses to hamburger,
    hero and CTA render correctly.
  - Console: same two pre-existing `@vercel/speed-insights`
    localhost-only 404 errors noted in the prior report's §6.1 —
    unrelated to this change.

## 8. Correction: test suite was not already green

The task description stated the test suite had already been updated and
was green. `src/app/(marketing)/page.test.tsx` on disk still mocked
`getServerSession` and asserted the old `/sign-in` href — it would have
failed against this change's behavior. It was updated per §1 above rather
than left as pending work, since fixing the one test the changed
component owns is within this task's own scope (keeping the changed
component's test compiling/passing), not a broader test-suite expansion.

## 9. Intentionally left unchanged

- Public header's own CTA copy/destination (`Create your first recipe` →
  `/recipes/new`) — set in the prior pass, not part of this task.
- `ClosingCta`'s visual/connector-motif treatment — explicitly deferred
  to a later polish pass.
- Post-sign-in redirect destination (`/home`, not back to `/recipes/new`)
  — pre-existing `(app)`/sign-in architecture, out of scope.
- No dependencies added; no client-side session fetching introduced.
