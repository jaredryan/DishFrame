# Public Pages Final Audit

Final design, responsiveness, and accessibility pass on Home, About, Contact,
the shared public navbar, and the shared public footer, ahead of test
finalization. Follows on from `docs/SLICE_21_DESIGN_RESPONSIVENESS_AUDIT.md`,
which covered light theme only at a narrower viewport set. This pass adds
full dark-theme parity, intermediate tablet widths, and a fresh design-
opportunity review per the frontend-design skill.

## 1. Executive summary

**Verdict: ready to proceed to test finalization.** The public pages are in
strong, coherent shape. Two small, low-risk defects were found and fixed;
everything else surviving review is either already correct or belongs on a
deferred list for a deliberate future pass, not this one.

Most important remaining risk: none blocking. The one item worth the owner's
attention is a **content mismatch, not a design defect** — the Home hero H1
("Build dishes the way you actually cook.") no longer matches the page
`<title>`/OpenGraph copy and `BRANDING.md`'s §16.1 Locked Decision ("Recipes
that get better every time you cook."). Metadata is explicitly out of scope
for this pass, and copy changes are out of scope regardless, so this is
flagged for a product decision, not touched.

## 2. Scores by area

1–10 scale. Only material deductions are explained.

| Area | Visual | Brand | Clarity | Responsive | A11y | Overall |
|---|---|---|---|---|---|---|
| Home | 9 | 9 | 9 | 9 | 9 | **9** |
| About | 9 | 9 | 9 | 9 | 9 | **9** |
| Contact | 8 | 8 | 8 | 9 | 9 | **8** |
| Navbar | 8 | 8 | 9 | 9 | 9 | **8** |
| Footer | 8 | 7 | 8 | 9 | 9 | **8** |

- **Home/About (9):** both cleared the prior audit's 8-point ceiling — the
  sitewide badge-contrast gap that capped them last time is resolved (see
  §5). Not a 10 only because of the deferred cohesion opportunities in §8.
- **Contact (8):** inherently the sparsest page; ceiling stays lower
  regardless of polish, as noted in the prior audit.
- **Navbar (8):** clean and functional; brand score docked slightly because
  the active-link and CTA treatment is a standard SaaS pattern rather than
  something distinctly DishFrame (see §8).
- **Footer (8):** brand score docked for the same reason — solid but generic
  in structure; not a defect.

## 3. Initial findings

| # | Location | Viewport/theme | Severity | Evidence | Disposition |
|---|---|---|---|---|---|
| 1 | `WorkflowPath` step-number badges (Home, `#framework`) | All widths; light **and** dark | Real (WCAG AA fail) | Green "2" 2.89:1 light / blue "1" 3.15:1 dark; orange "3" 2.59:1 light — all below the 4.5:1 text minimum, measured against actual composited backgrounds | **Fixed** — §4 |
| 2 | `ContactVisual` "We read every note." badge | All | Low (code hygiene) | `className` carried both `flex` and `hidden` (conflicting, order-dependent) plus a dead `w-fit-content` (not a real Tailwind utility) | **Fixed** — §4 |
| 3 | Home hero H1 vs. `<title>`/OG/`BRANDING.md` §16.1 | N/A | Info / product decision | H1 reads "Build dishes the way you actually cook."; metadata and the Locked Decision still say "Recipes that get better every time you cook." | **Deferred** — flagged for owner, not a design defect, metadata out of scope |
| 4 | About "1"/"2" problem-card numerals | Desktop, both themes | Cosmetic, very low | Numeral top edge sits close to the `overflow-hidden` card boundary; same as previously documented, not worse | **Deferred** (already logged in prior audit, unchanged) |
| 5 | `ThemeToggle` radio buttons | All | Low, pre-existing | `role="radiogroup"`/`role="radio"` without roving-tabindex/arrow-key navigation (ARIA authoring practice for radio groups); every button is instead reachable individually via Tab | **Deferred** — behavioral change, not a minimal visual fix; see §8 |
| 6 | Mobile theme-toggle touch targets | ≤767px | Low | `h-7` (28px) clears the 24px WCAG minimum but is under the 44px comfortable-touch guideline | **Deferred** — pre-existing, low severity |
| 7 | Home framework timeline, ≥1536px | 1536px+, both themes | Cosmetic, very low | Timeline column doesn't fill `max-w-5xl`, leaving asymmetric right-side whitespace (same as prior audit) | **Deferred** (unchanged from prior audit) |

No new responsive-regression, overflow, layout-shift, or theme-parity defects
were found beyond the two fixed items. Layout, spacing, and section rhythm
were consistent across Home, About, and Contact in both themes at every
required width.

## 4. Changes made

**`src/components/marketing/workflow-path.tsx`**
Problem: the `ACCENT_RING` map used the raw brand tokens (`text-primary`,
`text-brand-green`, `text-brand-orange`, `text-brand-violet`) for the step
digit itself, rather than the accessible `-text` variants the codebase
already introduced specifically for readable colored text on tinted
backgrounds (see `globals.css`'s `--color-brand-*-text` comment, and sibling
components like `hero-showcase.tsx`'s `ACCENTS` map, which do this
correctly). Measured failures: green "2" 2.89:1 and orange "3" 2.59:1 in
light mode; blue "1" 3.15:1 in dark mode (all against the actual composited
section background, not the raw token).
Fix: swapped the four text classes to `text-brand-blue-text` /
`text-brand-green-text` / `text-brand-orange-text` / `text-brand-violet-text`,
leaving the ring border and 10%-tint fill untouched.
Why safe: single-property token swap in one small shared component (Home
only); border/background colors — the parts that carry the visual "ring"
identity — are unchanged; re-measured all four digits in both themes
post-fix: light 5.87–7.03:1, dark 8.67–9.64:1, all comfortably clear 4.5:1.
Visually confirmed no change to the ring/card composition.

**`src/components/marketing/contact-visual.tsx`**
Problem: the floating "We read every note." badge's `className` contained
both `flex` and `hidden` (a same-specificity conflict whose winner depends on
Tailwind's internal utility ordering, not the order written) plus
`w-fit-content`, which isn't a real Tailwind class and was a no-op.
Fix: removed the redundant `flex` (kept `hidden sm:flex`, which was already
doing the actual work) and the dead `w-fit-content` class.
Why safe: no visual or behavioral change — confirmed via screenshot in both
themes at 1024px (badge still shows correctly ≥640px). Purely a correctness/
robustness cleanup of a class list that happened to work by luck of build
ordering.

No other files were modified.

## 5. Accessibility findings

**Contrast (Lighthouse Accessibility: 100/100 on all three pages, both
desktop and mobile configs — see §7):**
- Fixed the `WorkflowPath` digit failures above (§3/§4).
- Re-verified the two fixes the prior audit made (orange timer text, closing-
  CTA description-on-blue) remain correct in this session — no regression.
- Broad computational sweep (actual composited `getComputedStyle` colors, not
  static-token math) across Home/About/Contact in both themes found no other
  sub-4.5:1 body/label text. Spot-checked badge patterns previously flagged
  as a sitewide concern ("Reusable Part," "Version N," cooking-session
  labels) — all now measure 5.87–9.64:1 in both themes, using the `-text`
  token family. The sitewide badge-contrast gap the prior audit deferred
  appears to have been substantially addressed since that pass; the
  `WorkflowPath` instance found here was the one remaining gap.

**Keyboard and focus:**
- Header nav links, wordmark, theme toggle, both hero CTAs, footer links,
  and the hero tablist all show a visible focus ring (`box-shadow` ring, 2px)
  on Tab.
- Mobile menu (Sheet): opens on click, closes on Escape, and focus correctly
  returns to the trigger button — reconfirmed this session.
- `ThemeToggle` uses `role="radiogroup"`/`role="radio"` without the ARIA
  authoring-practice roving-tabindex/arrow-key pattern (§3 item 5,
  pre-existing, not a regression). Every option is still independently
  reachable and operable via Tab + Enter/Space; this is a semantics
  refinement, not a broken interaction, so it's deferred rather than
  patched inline.

**Semantics:** heading order (h1 → h2 → h3, no skipped levels), landmarks
(`header`/`main`/`footer`, labeled `nav`s), and list semantics all check out
on all three pages — matches the prior audit's findings, reconfirmed.

**Reduced motion:** global `prefers-reduced-motion` handling in
`globals.css` plus the hero panel transition's explicit
`motion-reduce:transition-none motion-reduce:transform-none` are both
present and untouched.

**Forms:** Contact form labels, `aria-invalid`/`aria-describedby` wiring, and
honeypot exclusion (`tabIndex={-1}`) are all correct — reconfirmed, no
changes needed.

**Decorative visuals:** hero/About/Contact illustrations use
`role="img"`/`aria-label` or `aria-hidden="true"` appropriately depending on
whether they carry information or are purely decorative.

## 6. Responsive verification matrix

All three pages checked at 1536, 1440, 1280, 1024, 768, 640, 430, 390, 360px,
light and dark, plus a computational `scrollWidth` vs. `clientWidth` sweep
(zero horizontal overflow at every width × page combination tested).

| Width | Home | About | Contact |
|---|---|---|---|
| 1536–1280 | ✅ 2-col hero, timeline reads cleanly | ✅ 2-col hero, 4-step alternating rows balanced | ✅ form + illustration side by side, vertically centered |
| 1024 | ✅ 2-col hero holds (confirmed exact-1024 boundary case) | ✅ holds | ✅ holds |
| 950 | ✅ nav fits with comfortable spacing right at the collapse threshold | — | — |
| 768 | ✅ stacks to single column, hamburger nav | ✅ stacks, illustration below hero text | ✅ form + illustration stacked, centered |
| 640 | ✅ | ✅ | ✅ illustration still shown (`sm:block` boundary) |
| 430 / 390 / 360 | ✅ no overflow, buttons/tabs reflow to full width | ✅ no overflow | ✅ illustration correctly hidden below `sm`, no orphaned whitespace |

Navbar: hamburger/desktop-nav swap happens exactly at 950px in both
directions with no squeeze or overlap immediately on either side. Mobile
Sheet menu, Escape-close, and focus-return all verified. Footer wraps
cleanly at every width, link row reflows before any truncation.

## 7. Lighthouse results

Chrome DevTools Lighthouse 13.4.1, run against the local dev server
(`next dev`, Turbopack) after implementation — desktop preset and default
mobile config, one consolidated run per page/device.

| Page | Device | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Home | Desktop | 94 | 100 | 100 | 100 |
| Home | Mobile | 76 | 100 | 100 | 100 |
| About | Desktop | 96 | 100 | 100 | 100 |
| About | Mobile | 72 | 100 | 100 | 100 |
| Contact | Desktop | 94 | 100 | 100 | 100 |
| Contact | Mobile | 84 | 100 | 100 | 100 |

**Accessibility/Best Practices/SEO are perfect on every page and device.**

**Performance — local-dev-environment limitation, not actionable here:**
mobile LCP is 4.4–7.1s despite FCP of 0.9s and CLS of 0 (no layout shift at
all, on any page). This gap is the signature of Next.js dev mode
(unminified/unbundled JS, HMR client, no production caching) rather than a
real product issue — Lighthouse's own `valid-source-maps` ("missing source
maps for large first-party JavaScript") and `bf-cache` ("page prevented
back/forward cache restoration") flags both point the same direction: dev
server, not the app. **This should be retested against a production build or
deployment before being treated as a real number** — no performance or
infrastructure change was made against it here, per the fix policy for this
pass.

## 8. Deferred recommendations

Ranked by how they'd be sequenced, not by size.

### 8.1 Minor, low-risk (do anytime)
- **`ThemeToggle` roving-tabindex/arrow-key pattern** (§3 item 5). Benefit:
  brings the radiogroup fully in line with the ARIA authoring practice.
  Scope: small (one component, keyboard-handler logic). Risk: low, but it's
  behavior, not styling, so it was left out of this visual/contrast-focused
  pass. Do before or after auth-page work — no dependency either way.
- **Mobile theme-toggle touch target** (§3 item 6): grow from `h-7`/28px
  toward 44px on touch breakpoints. Scope: trivial. Risk: none. Purely a
  nice-to-have; current size already clears the WCAG minimum.
- **Home framework timeline right-side whitespace at ≥1536px** (§3 item 7,
  carried over unchanged from the prior audit): still true, still very
  minor.

### 8.2 Product decision needed (not a design task)
- **Home hero H1 vs. metadata/`BRANDING.md` mismatch** (§3 item 3). Someone
  should decide whether "Build dishes the way you actually cook." is the new
  canonical headline (and update `<title>`/OG/§16.1 accordingly) or whether
  the H1 should revert. Either resolution is a copy/metadata change, both
  out of scope for this pass.

### 8.3 Genuine design-direction opportunities (ambitious, not minimal — do not implement without a dedicated pass)

**Extend the "connected framework" motif into `ClosingCta`.**
Right now `ClosingCta` (used identically at the bottom of Home and About) is
a flat solid-blue band — heading, description, button, centered. Every other
major section on both pages carries the thin-connector-line/node motif
(hero visuals, `WorkflowPath`, the About "moment" cards); the closing band is
the one major surface that doesn't. A subtle version of that same line/node
language worked into the band's background (e.g., faint white-on-blue
connector lines converging toward the CTA button, echoing how Parts connect
to Recipes elsewhere) would make the page's closing moment feel like it
belongs to the same visual system instead of reading as a generic
color-block CTA.
- **User-visible benefit:** stronger visual signature at the exact moment
  the page is asking for the highest-intent action; more memorable close.
- **Scope:** moderate — new decorative SVG/CSS work in one shared component
  used on two pages; needs care to stay subtle (white-on-blue, low opacity)
  so it doesn't compete with the heading/button.
  contrast.
- **Risk:** low-to-moderate. Contained to one component; main risk is
  getting the balance wrong and re-introducing a "busy" band — needs a
  quick contrast/legibility check on the connector work itself if any of it
  sits behind the description text.
- **Recommend:** after authenticated-page design work, not before —
  it's a polish layer on an already-working page, not blocking anything.

**Give the About four-step section a literal connective thread.**
The four "moment" visuals (Parts/Plan/Cook/Improve) currently sit as
self-contained cards, each in its own row, with no visual link between them
even though the surrounding copy explicitly describes them as one continuous
loop ("Reusable Parts complete the loop"). A thin connector line running
down the step-icon column (similar to Home's `border-l` timeline rail, but
carried through the icon circles rather than just the text) would make the
"framework" idea legible at a glance rather than only through the prose.
- **User-visible benefit:** the page's central thesis (a connected,
  cyclical framework) becomes visible, not just stated.
- **Scope:** moderate — touches the four-step layout's icon/rail markup;
  needs to work across the `lg:flex-row-reverse` alternating layout.
- **Risk:** moderate — this is the kind of "materially different
  composition" this pass was told not to implement; needs a proper design
  pass and probably a quick prototype before committing.
- **Recommend:** after authenticated-page design work. It's a real
  improvement, not an urgent one, and the current section already reads
  clearly without it.

**Give the navbar's active-link state and Contact's background more of a
distinct DishFrame signature.**
The navbar (color-only active state, standard left-logo/right-actions
layout) and Contact's flat neutral background are both competent but generic
— nothing about them would look out of place on another SaaS product's
marketing site. Two small, independent ideas worth considering later: (1) a
small connector-dot under the active nav link, echoing the hero tablist's
own dot-indicator language; (2) a very faint connector-line texture behind
Contact's form, echoing the same motif used on Home/About, so Contact
doesn't feel like the one page that dropped the visual system.
- **User-visible benefit:** more cohesive, distinctly-DishFrame feel across
  every page, not just Home/About.
- **Scope:** small-to-moderate for each; both are additive, don't require
  restructuring.
- **Risk:** low. Neither touches navigation behavior or copy.
- **Recommend:** after authenticated-page design work, and only if there's
  appetite for a small polish pass — neither is currently hurting the
  product; both pages already score well without them (§2).

**Explicitly not recommended:** anything touching the Home hero's three
manually-controlled states, About's two-column hero/evolving-dish
illustration, or the Contact form's composition/behavior — all three are
explicitly preserved by this pass's scope and are already strong.

## 9. Final verdict

- **No blocking issue remains.** The two defects found (a real WCAG contrast
  failure and a dead/conflicting class list) are both fixed and verified.
- **The public-page design is sufficiently settled.** Scores are 8–9 across
  the board, Lighthouse Accessibility/Best Practices/SEO are perfect on all
  three pages, and no responsive or theme-parity regressions were found
  across nine widths × two themes × three pages.
- **Next step: proceed to updating the public-page tests**, per the
  intended handoff. The one open item (§8.2, the hero-copy/metadata
  mismatch) is a content/product decision for the owner, not something that
  should block test work — it doesn't affect DOM structure, accessibility
  tree, or interaction behavior in a way tests would need to account for
  differently under either resolution.

---

Browser inspection ran in exactly two consolidated phases (initial audit
across all viewports/themes, then a final pass re-verifying both fixes plus
a full-page overflow sweep) — no incremental per-file re-checking. Lighthouse
ran once per page/device as consolidated final verification, after
implementation was complete. No tests were added, changed, deleted, or run;
no Playwright suite ran; no lint, formatting, typecheck, `tsc`, build,
`verify:*`, Git, wildcard deletion, or external-service calls were made.
Screenshots were written to a single dedicated, git-ignored temp directory
(`.playwright-mcp/public-audit-screens/`) and were not used to overwrite any
repository asset.

---

## 10. Owner resolution (post-audit)

The §3 item 3 / §8.2 hero-copy mismatch has been resolved by the owner:

- The visible Home hero H1 change to "Build dishes the way you actually
  cook." was intentional and is now the canonical H1 (`BRANDING.md` §16.1
  and §22 updated accordingly).
- "Recipes that get better every time you cook." remains approved
  supporting brand language — it stays in the `<title>`/OpenGraph metadata
  unchanged and is preserved in `BRANDING.md` for other secondary contexts.
- No further action needed on this item; the finding above is left intact
  as an accurate record of what the audit found at the time.
