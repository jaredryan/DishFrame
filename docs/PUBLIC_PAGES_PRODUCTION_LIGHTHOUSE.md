# Public Pages — Production Lighthouse Audit

Audit of Home (`/`), About (`/about`), Contact (`/contact`) against the
owner's already-running production build. Chrome DevTools Lighthouse
13.4.1 (`npx lighthouse`), headless Chrome, mobile (3 runs/page, median
reported) and desktop (1 run/page) presets. Raw JSON/HTML reports saved to
`.lighthouse-tmp/` (git-ignored — see `.gitignore` addition below).

## 1. Environment confirmation

- Server: `next-server (v16.2.11)` process (`next start`), **not**
  `next dev` — confirmed via `ps aux`, the immutable `.next/BUILD_ID`
  (`jH4nbgkGrmfn2OSnretOB`), hashed static chunk filenames
  (`_next/static/chunks/0tl3vztcdds2o.css`, etc.), and
  `package.json`'s `"start": "next start"`.
- All three routes returned `200`.
- Server was not started, stopped, or rebuilt during this pass.

## 2. Scores

| Page | Device | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Home | Mobile (median of 3) | 93 | 100 | 96 | 100 |
| Home | Desktop | 100 | 100 | 96 | 100 |
| About | Mobile (median of 3) | 94 | 100 | 96 | 100 |
| About | Desktop | 100 | 100 | 96 | 100 |
| Contact | Mobile (median of 3) | 92 | 100 | 96 | 100 |
| Contact | Desktop | 100 | 100 | 96 | 100 |

Mobile Performance run-to-run spread (all within normal simulated-throttle
variance, no anomalies):

| Page | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| Home | 93 | 94 | 92 | **93** |
| About | 92 | 94 | 94 | **94** |
| Contact | 92 | 92 | 92 | **92** |

Accessibility, Best Practices, and SEO were identical across all three
mobile runs per page (100/96/100) — no variance to median.

## 3. Core metrics (median mobile run; desktop is a single run)

| Page | Device | FCP | LCP | TBT | CLS | SI | TTI |
|---|---|---|---|---|---|---|---|
| Home | Mobile | 0.9 s | 3.3 s | 60 ms | 0 | 0.9 s | 3.3 s |
| Home | Desktop | 0.2 s | 0.7 s | 0 ms | 0 | 0.2 s | — |
| About | Mobile | 0.9 s | 3.1 s | 10 ms | 0 | 0.9 s | 3.2 s |
| About | Desktop | 0.2 s | 0.7 s | 0 ms | 0 | 0.2 s | — |
| Contact | Mobile | 0.9 s | 3.3 s | 20 ms | 0 | 0.9 s | 3.5 s |
| Contact | Desktop | 0.2 s | 0.7 s | 0 ms | 0 | 0.2 s | — |

CLS is 0 on every page/device, every run — no layout shift anywhere.

## 4. LCP element and phase breakdown

All three pages' LCP element is a **text node**, not an image or SVG —
there is no above-the-fold image/SVG on any of these pages.

| Page | LCP element | Selector |
|---|---|---|
| Home | H1 "Build dishes the way you actually cook." | `main.flex > section.mx-auto > div.flex > h1.font-heading` |
| About | `<p>` "Timing changes. Ingredients get adjusted…" | `main.flex > div.mx-auto > div.mx-auto > p.text-muted-foreground` |
| Contact | `<p>` "Found a bug, ran into friction…" | `div.flex > div.mx-auto > div.mx-auto > p.text-muted-foreground` |

Lighthouse's own **observed** (real, unthrottled trace) LCP timing —
distinct from the simulated/scored metric above — is effectively instant
on every page:

| Page | Device | Observed LCP (real trace) | TTFB (real) | Element render delay (real) |
|---|---|---|---|---|
| Home | Mobile | 145 ms | 39 ms | 106 ms |
| About | Mobile | ~127 ms | 26 ms | 101 ms |
| Contact | Mobile | ~126 ms | 22 ms | 104 ms |
| Home | Desktop | ~260 ms | 35 ms | 226 ms |

The gap between this ~130–260 ms real timing and the 3.1–3.3 s
**scored** mobile LCP is explained in §6.

## 5. Failed audits (all pages, both devices)

Only two audits failed anywhere, and both are identical across every
page/device combination:

1. **`errors-in-console`** (Best Practices, scored) — one console error +
   one failed network request, both from the same source: see §6.1.
2. **`bf-cache`** ("Page prevented back/forward cache restoration") —
   fails with 2 reasons, both explicitly labeled `"Not actionable"` by
   Lighthouse itself. This audit carries **zero weight** in every
   category (confirmed via each report's `categories.*.auditRefs`) —
   it does not affect any of the four scores. See §6.2 for root cause.

No Accessibility or SEO audit failed on any page/device — both
categories are perfect (100/100) everywhere, consistent with the prior
`next dev` audit (§8).

## 6. Diagnosis of every deduction

### 6.1 Best Practices 96/100 — `errors-in-console` (identical on all 6 page/device combinations)

Console/network detail (identical on every page):

```
network 404: http://localhost:3000/_vercel/speed-insights/script.js
security: Refused to execute script … MIME type ('text/html') is not
          executable, and strict MIME type checking is enabled.
```

**Root cause:** `<SpeedInsights />` from `@vercel/speed-insights/next` is
mounted in the root layout (`src/app/layout.tsx:74`). That component
requests `/_vercel/speed-insights/script.js`, an endpoint **served only
by Vercel's edge network on an actual Vercel deployment**. A plain
`next start` on localhost has no such route, so it 404s and returns the
Next.js HTML 404 page, which the browser then refuses to execute as a
script (correct browser behavior) — producing exactly one console error
and one network failure.

**Classification: local-testing artifact, not a real production issue.**
This is documented, expected `@vercel/speed-insights` behavior — on the
actual Vercel deployment this request resolves with a real `200`
JavaScript response and the analytics beacon works normally. No code
change is warranted; making one would require weakening or
conditionally disabling Speed Insights, which is real, valuable
functionality the task's guardrails direct against removing.
**No fix applied.**

### 6.2 `bf-cache` failure (unweighted, all pages/devices — informative only)

Both reported reasons:
- `MainResourceHasCacheControlNoStore`
- `JsNetworkRequestReceivedCacheControlNoStoreResource`

Confirmed via response headers: `Cache-Control: private, no-cache,
no-store, max-age=0, must-revalidate` on the document response.

**Root cause (real, not a localhost artifact):**
`src/app/(marketing)/layout.tsx` calls `await getServerSession()` to
decide the header's signed-in vs. signed-out state
(`<PublicHeader signedIn={Boolean(session)} />`). Reading the session
cookie per-request forces Next.js to render the entire marketing route
group (Home, About, Contact, Privacy, Terms) dynamically per-request,
which is why Next.js emits `no-store` — and `no-store` is what disables
bfcache eligibility. This is real, present-in-production behavior, not a
Lighthouse or `next start`-only artifact.

**This does not affect any Lighthouse score** (bf-cache is weight-0 in
every category), so it is not a blocker for the "100 across all
categories" objective. It is, however, a genuine architectural tradeoff:
personalizing the marketing header requires giving up static/cacheable
rendering (and CDN caching, and bfcache) for these pages. Resolving it
would mean moving the signed-in check to a small client-side boundary
(optimistic "Sign In" state that swaps client-side once hydrated) or
accepting a brief flash of the wrong header state — a product/UX
decision, not a "smallest reliable correction." Per this project's
"deviating from a canonical document" policy, that call is flagged here
for the owner rather than implemented silently.
**No fix applied — flagged as an owner decision, not a defect.**

**Owner resolution (see `docs/PUBLIC_MARKETING_STATIC_RENDERING.md`):**
the owner resolved this tradeoff by making the public header
intentionally visitor-oriented for everyone, rather than personalizing it
per-session. `(marketing)/layout.tsx` no longer calls
`getServerSession()`, and `PublicHeader` no longer takes a `signedIn`
prop. Contact, Privacy, and Terms are now free of this cause of dynamic
rendering; Home and About still call `getServerSession()` directly at
the page level (for the hero/closing CTA buttons, unrelated to the
header) and remain dynamic for that separate reason — see the
resolution doc for detail.

### 6.3 Performance: mobile 92–94, desktop 100 (all pages)

**The only weighted deduction is `largest-contentful-paint`**
(FCP/TBT/CLS/SI all score 1.0/1.0/1.0/1.0 on every mobile run; LCP scores
0.69–0.75 out of the category's 25-point weight — this alone accounts
for the full gap to 100).

Diagnosis, using the real vs. simulated LCP split from §4:

- Real (observed, unthrottled) LCP is ~130–150 ms on mobile and ~260 ms
  on desktop — i.e., the actual page paints its text content almost
  immediately once the document and its one CSS bundle arrive. No image
  or SVG is involved, no font-swap flash, no animation or hidden initial
  state (`font-display: swap` is already set for both `next/font/google`
  faces; CLS is 0 everywhere, so nothing is being hidden and revealed).
- The **scored** mobile LCP (3.1–3.3 s) comes from Lighthouse's
  "simulate" throttling method (Lantern), which models Slow-4G-like
  conditions regardless of the server's real speed: `rttMs: 150`,
  `throughputKbps: 1638`, `requestLatencyMs: 562.5` (connection-setup
  cost), `cpuSlowdownMultiplier: 4` — read directly from each report's
  `configSettings.throttling`. Under that model, Lantern's LCP estimate
  accounts for the full resource graph needed to reach a quiescent main
  thread (document + 1 CSS bundle + ~18 JS chunks, 322 KB / 28 requests
  total on Home), not just the literal bytes needed to paint the H1 —
  this is Lighthouse's intended, standard behavior for representing a
  real mobile user on a slow connection, and it is applied identically
  to every Next.js app tested this way.
- **Desktop confirms this is a throttle-model artifact, not a code
  defect:** with desktop's much lighter throttle profile, all three
  pages score **Performance 100** with LCP at 0.7 s — the identical
  code, identical bundle, identical server.
- One real, if very small, contributor was found and is reported for
  completeness: `render-blocking-insight` flags the single global CSS
  chunk (`0tl3vztcdds2o.css`, 17 KB) as blocking ~150 ms of the
  simulated LCP/FCP (present the same way on mobile and desktop). This
  is Next.js App Router's standard single-stylesheet output; eliminating
  it would require enabling `experimental.optimizeCss`, which pulls in
  an additional dependency (`critters`/`beasties`) for an estimated
  ~150 ms out of a 3,100 ms simulated total. Per the task's guardrails
  ("do not add dependencies without a demonstrated need," "do not chase
  meaningless micro-optimizations"), this was evaluated and **not
  implemented** — the ROI does not justify a new build dependency.
- Two purely informative (unweighted, `metricSavings` shown but not
  scored) diagnostics were also inspected and traced to Next.js's own
  framework runtime chunk (not application code): `unused-javascript`
  (27.5 KB unused in `1yxpu9pr03lh2.js`, confirmed by inspecting the
  chunk directly — it is Next.js's client bootstrap/hydration runtime,
  not app code) and `legacy-javascript-insight` (13.8 KB — an
  `Array.prototype.at` polyfill from Next's default build target). Both
  are controlled by Next.js's own build system defaults, not by any
  DishFrame source file, and neither carries scoring weight. No project
  `browserslist` override exists today; adding one to shave this would
  change the transpile target for the **entire app**, including
  authenticated pages, which is out of this pass's scope and not
  justified by an unweighted diagnostic.

**Conclusion:** mobile Performance (92–94) and desktop Performance (100)
both reflect a page that is, in reality, already about as fast as
static/minimal-JS text content can be — the mobile gap is Lighthouse's
simulated-throttle model doing its job, not a fixable regression.

### 6.4 Accessibility (100/100, all pages/devices) and SEO (100/100, all pages/devices)

No failing or manual-review audits on any page/device. Matches the prior
`next dev` audit (§8) exactly — no regression, no work needed.

## 7. Files changed

- `.gitignore` — added `/.lighthouse-tmp/` so this audit's raw
  JSON/HTML reports don't get committed.

**No application code was changed.** Every deduction found was either a
local-testing-only artifact (§6.1), a real but unweighted/non-blocking
architectural tradeoff flagged for an owner decision (§6.2), or a
throttle-modeling characteristic confirmed by desktop's clean 100 score
and the real observed LCP timings (§6.3). None met the bar for "smallest
reliable correction" without either adding an unjustified dependency,
changing app-wide (not just public-page) build config, or making a
product/UX call unilaterally.

## 8. Comparison with the previous `next dev` audit

From `docs/PUBLIC_PAGES_FINAL_AUDIT.md` §7 (Lighthouse 13.4.1 against
`next dev`, one run per page/device):

| Page | Device | Perf (dev) | Perf (prod, this audit) |
|---|---|---|---|
| Home | Desktop | 94 | **100** |
| Home | Mobile | 76 | **93** |
| About | Desktop | 96 | **100** |
| About | Mobile | 72 | **94** |
| Contact | Desktop | 94 | **100** |
| Contact | Mobile | 84 | **92** |

This confirms the prior report's own hypothesis (§7 of that document):
the earlier low mobile scores (72–84) and sub-100 desktop scores
(94–96) were dev-server artifacts (unminified/unbundled JS, HMR client,
no production caching) — desktop is now a clean 100 on the production
build, and mobile improved by 10–22 points purely from building for
production, with no code changes. Accessibility/Best Practices/SEO were
already 100/100/100 in dev mode for A11y and SEO; Best Practices was
100 in dev (the Speed Insights 404 either didn't occur the same way
under `next dev`'s dev-only script handling, or wasn't present at the
time of that audit) and is 96 here purely due to the artifact in §6.1.

## 9. Limitations of this pass

The running server was built before this session and was correctly left
untouched — no rebuild/restart was performed, per scope. Since no code
changes were made, there is nothing pending a rebuild to re-verify; the
scores above already reflect the code as it exists on disk.

## 10. Final verdict

**The public pages (Home, About, Contact) are production-ready.**

- Accessibility: 100/100 everywhere.
- SEO: 100/100 everywhere.
- Best Practices: 96/100 everywhere, solely due to a documented
  localhost-only Vercel Speed Insights artifact that will not occur on
  the actual Vercel deployment.
- Performance: 100/100 on desktop everywhere; 92–94/100 on mobile,
  driven entirely by Lighthouse's simulated slow-4G throttle model
  against pages whose real (observed) LCP is ~130–260 ms — not a code
  defect, confirmed by desktop's clean 100 and by the render-timing
  breakdown.

One non-blocking item is flagged for an owner decision rather than
silently resolved: `src/app/(marketing)/layout.tsx`'s
`getServerSession()` call forces `no-store` (and disables bfcache) on
every public page in exchange for an accurate signed-in/signed-out
header state (§6.2). This does not affect any Lighthouse score and
requires no immediate action.
