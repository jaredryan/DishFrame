# Public marketing shell: static rendering

Removes session-dependent rendering from the public marketing header, per
owner decision to make `PublicHeader` intentionally visitor-oriented
rather than session-personalized (resolves the tradeoff flagged in
`docs/PUBLIC_PAGES_PRODUCTION_LIGHTHOUSE.md` §6.2).

## 1. Files changed

- `src/app/(marketing)/layout.tsx` — removed `getServerSession()` call and
  the `signedIn` prop passed to `PublicHeader`. Layout is now a plain
  (non-async) server component with no request-dependent API calls.
- `src/components/layout/public-header.tsx` — `PublicHeader` no longer
  takes a `signedIn` prop. Always renders the visitor-oriented action set
  (desktop bar and mobile drawer): `Sign in` → `/sign-in`, primary CTA
  `Create your first recipe` → `/recipes/new`.
- `src/app/(share)/layout.tsx` — also passed `signedIn` into
  `PublicHeader` (used for shared-recipe-link pages, a different route
  group from the five marketing pages this task names). Since the prop no
  longer exists, this would not compile; removed the same
  `getServerSession()` call and prop pass here to keep it building. Out of
  the named task scope but a required, minimal side effect of narrowing
  `PublicHeader`'s public API.
- `src/components/layout/public-header.test.tsx` — updated the CTA
  assertion from `Create your first recipe` (old signed-out copy) to
  `Create your first recipe`, and added an `href="/recipes/new"` check.
- `docs/PUBLIC_PAGES_PRODUCTION_LIGHTHOUSE.md` — appended an owner-
  resolution note under §6.2 pointing here; original observations left
  untouched.

## 2. CTA copy and destination

Primary action reads **"Create your first recipe"** and links to
`/recipes/new` everywhere it appears (desktop bar, mobile drawer). This
route already has its own auth handling:

- unauthenticated: both `(app)/layout.tsx` and `recipes/new/page.tsx`
  redirect to `/sign-in` (no `redirectTo`, so post-sign-in lands at the
  default `/home`, not back at `/recipes/new` — pre-existing behavior,
  unchanged);
- authenticated: goes straight into the recipe editor.

No auth-routing logic was duplicated in the header — it just links to the
existing protected route.

`Sign in` → `/sign-in` is preserved as a separate action in both desktop
and mobile layouts.

## 3. Behavior for unauthenticated vs. authenticated visitors

Identical header for both — no personalization. An authenticated user who
navigates back to a public page now sees the same visitor CTA; clicking
it goes straight into `/recipes/new` (no friction, since they're already
signed in).

## 4. What stayed unchanged

- Home hero (`HeroShowcase`) rotation/manual tab control — verified
  working (tab click moves `aria-selected`).
- Home/About hero and closing-CTA copy (`Create your first recipe` /
  `Open DishFrame`, driven by their own `signedIn` prop) — left as-is;
  changing it was out of scope ("change page copy outside the named
  header CTA").
- No client-side session fetching added; no navbar redesign; no changes
  to Home/About/Contact composition.

## 5. Static-rendering evidence

`pnpm run build` output (Route column, `○` = static/prerendered,
`ƒ` = dynamic):

```
├ ƒ /            (Home)
├ ƒ /about
├ ○ /contact
├ ○ /privacy
├ ○ /terms
```

**Contact, Privacy, and Terms are now static/prerendered.** Confirmed via
`next start` response headers:

```
/contact  Cache-Control: s-maxage=31536000
/privacy  Cache-Control: s-maxage=31536000
/terms    Cache-Control: s-maxage=31536000
```

No more `private, no-cache, no-store` on these three routes — the cause
diagnosed in §6.2 (the marketing layout's `getServerSession()` call) is
gone for them.

**Home and About remain dynamic**, still serving
`Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.
This is *not* the marketing-layout session call (removed above) — it's a
separate, page-level cause: `src/app/(marketing)/page.tsx` and
`src/app/(marketing)/about/page.tsx` each call `getServerSession()`
directly to compute a `signedIn` boolean passed to `HeroShowcase` /
`ClosingCta`, unrelated to the header. Removing that was out of this
task's scope (guardrails: don't change Home/About composition, don't
change page copy outside the header CTA, don't move components across
server/client boundaries). Flagging per the task's own instruction not to
assume the transition is complete — if full static rendering for Home/
About is wanted, that requires a separate, explicitly-scoped decision
about the hero/closing-CTA `signedIn` branching.

## 6. Manual verification performed

Via production build + `next start` + Playwright:

- Desktop (1280×800): header renders `Sign in` and `Create your own
  recipe` (→ `/recipes/new`), no `signedIn`-branching artifacts.
- Mobile (390×844): header collapses to a hamburger; drawer shows the
  same `Sign in` / `Create your first recipe` actions and destination.
- Home hero: tab rotation control still functional (verified
  `aria-selected` moves on click).
- No layout shift observed at either width.
- Two console errors present on `/` are the pre-existing, documented
  `@vercel/speed-insights` localhost-only 404 artifact (§6.1 of the
  Lighthouse audit) — unrelated to this change.

## 7. Tests that should be updated later (not done here, per scope)

- `src/app/(marketing)/page.test.tsx` and any About-page equivalent still
  test the `HeroShowcase`/`ClosingCta` `signedIn` branching — untouched,
  since that behavior is unchanged.
- No test currently exercises `(share)/layout.tsx` directly; if one is
  added later it should not assume a `signedIn` prop on `PublicHeader`.

## 8. Owner intervention recommendation

**Proceed without manual UI review** for this change — verified above via
build output, response headers, and a Playwright pass at both widths. The
one open product question, already flagged in §5, is whether Home/About
should also be pushed to static rendering by revisiting their own
`signedIn`-driven hero/closing CTAs — that's a distinct scope decision,
not a defect in this pass.

## 9. Owner resolution (follow-up)

The open question in §5/§8 was resolved: Home and About's remaining
`getServerSession()` calls and `signedIn`-driven `HeroShowcase`/
`ClosingCta` branches were intentionally removed. All marketing pages
(Home, About, Contact, Privacy, Terms) now present the same
visitor-oriented CTAs regardless of authentication state, and all five
became eligible for static prerendering. Final build output and
response-header evidence for this completion pass is recorded in
`docs/PUBLIC_MARKETING_STATIC_RENDERING_COMPLETION.md` — this report's
original observations above are left as-written.
