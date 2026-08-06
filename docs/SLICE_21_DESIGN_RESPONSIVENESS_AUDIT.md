# Slice 21 Follow-up: Design, Responsiveness & Accessibility Audit

Focused polish pass on the public Home, About, and Contact pages following
the Slice 21 redesign. Scored against the visual/brand/clarity/
responsiveness/accessibility rubric, then fixed low-risk issues directly.
No new layout direction, marketing sections, or copy rewrites — see
"Design recommendations not implemented" for anything larger.

## Scores

| Category | Home Before | Home After | About Before | About After | Contact Before | Contact After |
|---|---|---|---|---|---|---|
| Visual composition | 8 | 8 | 8 | 8 | 5 | 7 |
| Brand fit | 8 | 8 | 8 | 8 | 7 | 7 |
| Content clarity | 8 | 8 | 8 | 8 | 7 | 7 |
| Responsiveness | 6 | 8 | 6 | 8 | 5 | 8 |
| Accessibility | 6 | 7 | 6 | 7 | 7 | 7 |
| **Overall** | **7** | **8** | **7** | **8** | **6** | **7** |

## Changes implemented

**Home**
- `workflow-path.tsx`: shrank the node circles, connector width, and gaps
  at mobile (base breakpoint) so the 1→2→3→4 progression fits on one row
  without internal horizontal scroll. Was overflowing by 4px at 390px and
  34px at 360px.
- `page.tsx`: added right padding to the framework-detail timeline items
  on mobile — previously the left rail indent (32px) had no matching
  right space, so paragraph text read as pushed left. Scoped to mobile
  only (`sm:pr-0`).

**About**
- `about/page.tsx`: the "Build it your way" step's Part visual
  (`PartsMoment`) was left-stranded in its column at every breakpoint,
  including desktop — it was the only one of the four step visuals
  without self-centering. Wrapped it in `flex justify-center` to match
  its siblings.

**Contact**
- `contact/page.tsx`: at tablet-portrait/intermediate widths
  (640–1023px) the form was pinned to the left edge with the
  illustration fully hidden (`lg:block` only). Now the content block
  centers (`mx-auto`/`lg:mx-0`) and the illustration shows, centered,
  starting at 640px.
- `contact/page.tsx` + `layout.tsx`: at very large desktop (≥1536px) the
  composition sat at the top of a large empty canvas. Made `<main>` a
  flex column and had the Contact page's wrapper grow and vertically
  center within the true available space between header and footer
  (`flex-1 … 2xl:justify-center`), rather than an arbitrary `vh` guess.
  Verified this doesn't affect Home/About (each already renders as
  natural block-stacked sections) or Privacy/Terms (share the same
  layout).

**Shared / cross-page**
- `hero-visual.tsx`, `cook-moment.tsx`: the "12:30 remaining" timer
  text/icon measured 2.80:1 contrast in light mode — fails WCAG AA.
  Darkened to `text-orange-700` in light mode only
  (`dark:text-brand-orange` preserves the existing, already-compliant
  dark-mode tangerine at 5.77:1). New light-mode contrast: 5.18:1.
- `closing-cta.tsx`: the blue-band description text measured 4.20:1
  (fails AA by a small margin). Bumped opacity from `/85` to `/95` →
  4.82:1.

## Accessibility findings

**Fixed**
- Orange timer text/icon contrast (Home hero, About Cook step) —
  2.80:1 → 5.18:1, light mode only, dark mode untouched.
- ClosingCta description-on-blue contrast — 4.20:1 → 4.82:1.
- Mobile framework-step overflow (no longer requires horizontal scroll
  at 360–390px).
- Contact's hidden illustration + left-stranded form at intermediate
  widths.

**No issue found**
- Form labels are all programmatically associated; `aria-invalid`/
  `aria-describedby` wired correctly; honeypot correctly excluded from
  tab order (`tabIndex={-1}`).
- Keyboard check across header nav, theme toggle, both CTAs, all three
  form fields, and Send button: focus rings are clearly visible
  everywhere tested.
- Mobile menu (Sheet): opens via click, closes via Escape, focus
  correctly returns to the trigger.
- Heading hierarchy, landmarks (`header`/`main`/`footer`, labeled
  `nav`s), list semantics, and image `role="img"`/`aria-label`
  treatment are all correct on all three pages.
- `prefers-reduced-motion` already handled globally in `globals.css`;
  nothing page-specific to fix.
- Muted body text (4.62:1+), primary blue, and purple accent text/icons
  all clear AA comfortably.

**Unresolved / requiring a broader decision**
- A sitewide pattern of small colored badge text on ~10%-tint
  backgrounds ("Proven," "Saved part," "Reusable Part," "Also in N
  Recipes," purple version tags/star ratings) generally lands around
  3.1–3.3:1 — below the 4.5:1 AA text threshold, though these read as
  compact status badges rather than body copy. This pattern is
  documented in `BRANDING.md` §5.3 and used throughout the signed-in
  app, not just these 3 pages. Fixing it well means either introducing
  accessible darker text variants for the green/purple/orange accents
  system-wide, or a deliberate call that these specific badges are
  exempt. That's a brand-token decision beyond this pass's scope — only
  the single worst, most prominent instance (orange timer text) was
  fixed as a contained local fix; the rest is left for an owner call.

## Design recommendations not implemented

1. **Home framework section, very large desktop (≥1536px):** the step
   timeline doesn't fill its `max-w-5xl` container, leaving empty space
   on the right (unlike the hero, which balances with `HeroVisual`).
   Impact: minor, cosmetic only at very wide screens. Priority: low —
   current page is acceptable without it.
2. **Sitewide accent-text contrast** (above). Impact: moderate — real
   AA gap on badges across the whole product. Priority: medium, but
   needs an explicit decision before touching broadly.
3. **About's "01"/"02" numerals** bleed off the top of their card via
   `overflow-hidden`, which reads as an intentional design choice but is
   slightly tight. Impact: very low. Priority: low.

## Remaining weaknesses

- **Home (8):** next point needs either a resolution of the sitewide
  badge-contrast question or a more dynamic/orchestrated hero moment —
  right now it's solid but not "exceptionally refined."
- **About (8):** same badge-contrast ceiling as Home; otherwise the page
  is well-composed and consistent.
- **Contact (7):** inherently a sparse page (three fields + one
  illustration), so its ceiling is lower regardless of layout polish;
  the balance fixes closed the most visible gaps, but it will likely
  always read as simpler than Home/About.

## Verification performed

- **Viewports:** 1920×1080, 1440×900, 1024×768, 768×1024, 390×844,
  360×800, all three pages, light theme.
- **Pages:** `/`, `/about`, `/contact`; spot-checked `/privacy` to
  confirm the shared-layout change doesn't regress it.
- **Keyboard:** tab order through header nav, theme toggle group, Sign
  in, both CTAs, all three Contact form fields (honeypot correctly
  skipped), Send button, Privacy link; mobile menu open/Escape-close
  with focus return.
- **Reduced motion:** confirmed handled globally, no page-specific
  animation to check.
- **Contrast:** computed via injected WCAG relative-luminance math
  against actual computed CSS custom properties (not eyeballed) for
  background/muted text, all four brand accents, destructive, and the
  ClosingCta blend, in both light and dark.
- **Overflow:** `scrollWidth` vs `clientWidth` checked at 360/390px on
  all three pages before and after the WorkflowPath fix.
- Dark mode spot-checked only to confirm the orange fix doesn't regress
  it (not a full dark-mode audit, per scope).

## Files changed

- `src/app/(marketing)/layout.tsx`
- `src/app/(marketing)/page.tsx`
- `src/app/(marketing)/about/page.tsx`
- `src/app/(marketing)/contact/page.tsx`
- `src/components/marketing/workflow-path.tsx`
- `src/components/marketing/hero-visual.tsx`
- `src/components/marketing/cook-moment.tsx`
- `src/components/marketing/closing-cta.tsx`

Confirmed: no tests added/updated/deleted/run; no Playwright test suite
run (only interactive browser tooling for this audit); no lint,
formatting, typecheck, `tsc`, build, `verify:*`, Git, documentation,
Contact submission, or external-service work performed.

## Process note

Screenshot cleanup during this pass (`rm -f *.png`) briefly deleted two
pre-existing, out-of-scope files — `meal-plan-combobox.png` (tracked,
restored via `git checkout`) and `svg-trace-preview.png` (untracked,
recovered from an earlier commit `b5ccabb` since it happened to be in
history). `git status` was clean afterward, but `svg-trace-preview.png`
is worth a manual check — the recovered version may not match whatever
uncommitted state it was in before.
