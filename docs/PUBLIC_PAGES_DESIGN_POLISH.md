# Public Pages Design Polish

Visual-design pass on Home, About, Contact, and the public shell: container
centering, a ClosingCta connector motif, a navbar leading-dot state, and a
prototype connective thread through About's framework steps.

## Files changed

- `src/app/(marketing)/page.tsx` — framework section container fix.
- `src/app/(marketing)/about/page.tsx` — hero container fix; thread wiring.
- `src/components/marketing/legal-page.tsx` — container fix (Privacy/Terms).
- `src/components/marketing/closing-cta.tsx` — motif wiring.
- `src/components/marketing/closing-cta-motif.tsx` — new.
- `src/components/marketing/about-framework-thread.tsx` — new, prototype.
- `src/components/layout/public-header.tsx` — nav dot (desktop + drawer).

## 1. Container centering

**Root cause.** Several top-level page sections are direct children of
`<main>` (`flex flex-col` in `layout.tsx`, default `align-items: stretch`).
An element that is itself a flex item and sets only `mx-auto` + `max-w-*`
(no `width`) hits a real CSS flex rule: auto cross-axis margins disable
stretch, so the browser sizes the box to shrink-to-fit content instead of
the intended `max-width`. Whether this was visible depended on whether that
element's content happened to be wide enough to fill the max-width anyway —
which is why it only showed up as an obvious bug at very wide viewports.

Confirmed via direct measurement (not eyeballing): Home's framework
container measured 673px at a 1600px viewport instead of the intended
1024px (`max-w-5xl`); About's hero measured 942.5px instead of 1024px.
`Contact` already avoided this by using `w-full` alongside `mx-auto
max-w-5xl`, and About's "Two problems" / "Detailed framework" sections
avoid it structurally (plain full-width `<section>` wrapping an `mx-auto`
inner `div`, so the inner div's parent isn't a flex container at all).
`HeroShowcase` (Home hero) turned out to already measure exactly right —
its grid's own max-content width happens to meet `max-w-6xl` — so it was
left untouched per "apply changes only where the current structure does
not already satisfy this principle."

**Fixes applied** (all one-line, no DOM restructuring):

- Home framework section (`page.tsx`): removed the unnecessary
  `flex flex-col items-center` from the outer `<section>` (it wasn't doing
  anything but triggering the bug) and changed the inner div from `mx-4` to
  `mx-auto w-full`, matching the section's own already-correct pattern used
  elsewhere on the page.
- About hero (`about/page.tsx`): added `w-full` alongside the existing
  `mx-auto max-w-5xl`.
- `LegalLayout` (Privacy/Terms): same `w-full` addition.

All three now measure their full intended `max-width`, centered
symmetrically, confirmed at 1600px via `getBoundingClientRect`. Verified
visually at 1600px, 768px (tablet), and 390px (mobile) — no regressions,
existing left-aligned text within the centered containers is unchanged per
the brief.

**Left alone (already correct):** `HeroShowcase`, `ClosingCta`, Contact's
grid, About's "Two problems"/"Bridge"/"Detailed framework" sections.

## 2. ClosingCta connector motif

New `ClosingCtaMotif`: two mirrored corner flourishes (`ConnectorFlourish`
SVG, fixed geometry — a diagonal chain of 4 circles shrinking as they
recede toward the corner, same visual grammar as WorkflowPath's dots and
the PartsMoment/AboutHeroVisual connector lines). Rendered top-left and
bottom-right (the second is the first rotated 180°), `text-primary-foreground/15`,
absolutely positioned behind the content (`ClosingCta` gained `relative
overflow-hidden`; the content wrapper gained `relative z-10`).

Fixed-pixel geometry (no `preserveAspectRatio` stretching) was a deliberate
choice over a single full-bleed responsive SVG: a stretch-to-cover approach
either distorts circles into ellipses (`preserveAspectRatio="none"`) or, at
narrow/tall mobile aspect ratios, crops out most of a wide pattern
(`slice`). Fixed corner flourishes scale down via Tailwind breakpoints
(`w-24` → `sm:w-36` → `lg:w-44`) instead, so they render identically
undistorted at every width and stay clear of the centered text column by
construction (checked at 1600px and 390px, light and dark).

No motion — static by design, so there's nothing to gate behind
`prefers-reduced-motion`. Marked `aria-hidden="true"`.

## 3. Navbar leading-dot state

Shared `NavDot` (in `public-header.tsx`) — a `size-1.5 rounded-full
bg-current` span, `aria-hidden`. Space is always reserved (it renders at
every state; only `opacity`/`scale` toggle), so nothing shifts.

- Resting: `opacity-0 scale-50`.
- Hover / `focus-visible` (via `group-hover`/`group-focus-visible` on the
  `<Link>`): `opacity-100 scale-100`.
- Active route: `opacity-100 scale-100`, unconditionally.
- Transition is `opacity,transform` only, `duration-150`,
  `motion-reduce:transition-none`.
- `aria-current="page"` handling unchanged on desktop; added to the mobile
  drawer links too (it had none before) since it's free and correct.
- Color: `bg-current` — inherits whatever color rule already applied to
  the link text (`text-primary` when active, `text-muted-foreground` /
  `hover:text-foreground` otherwise), so no separate color logic needed.

**Mobile drawer:** kept, after checking the rendered result. The drawer's
active item already has a strong `bg-accent` fill, so the dot doesn't have
to carry the "what's active" signal alone — it reads as a small
reinforcement, not clutter, and doesn't disturb the drawer's existing
indentation. Same `NavDot`, same reveal logic (`group-hover` still applies
since the drawer can render at tablet widths with a mouse).

## 4. About framework connective thread (prototype)

**Approach:** rather than chasing each icon badge's exact pixel position
(which varies with wrapped-text row height and wouldn't be robust across
breakpoints without JS measurement), `AboutFrameworkThreadSegment` draws a
short vertical gradient line that lives entirely inside the *existing*
`gap-20` (80px) space between consecutive steps — never over the step's
own text or visual column. Each row wrapper gets `relative`; the segment
is `absolute top-full left-1/2 h-20 w-px -translate-x-1/2` (`top-full` =
the row's own bottom edge; `h-20` is pinned to match `gap-20` exactly — if
that gap value ever changes, this needs to change with it, noted in the
component's comment). Because it hangs off each row's own bottom edge
rather than the outer container, it's automatically correct regardless of
each row's rendered height, alternating `lg:flex-row-reverse`, or
mobile's stacked `flex-col` — no per-breakpoint logic needed.

Color: a `linear-gradient` between the current and next step's brand color
(blue→green→orange→violet, the same sequence as `WorkflowPath`), each
stop baked to ~40% strength via `color-mix(in srgb, <color> 40%,
var(--background) 60%)` — the same "bake opacity against the page
background" convention already used by `PartsMoment`/`AboutHeroVisual`'s
connector lines, so it doesn't introduce a new pattern and stays correct
in both themes without a separate dark-mode override.

**Verified:** desktop 1600px (both row orientations — the segment sits at
the row's true horizontal center regardless of which side text/visual land
on, since both are `flex-1` and split the row evenly), mobile 390px
(confirmed the line starts below the visual and ends above the next
step's icon, never touching wrapped body text), dark theme.

**Candid comparison:** it's a genuine improvement, not just a decoration —
at desktop widths it reads as a subtle spine running down the section's
center gutter, giving the four steps a visible "one continuous thing"
quality the previous version only implied through prose and repeated
layout. At mobile it's more understated (a single vertical hairline
between stacked steps), which is arguably the right restraint for a
narrow column but does mean most of its benefit is a desktop effect. It
does not, on its own, make the alternating-row layout read as more
obviously sequential than before — the win is "connected system" over
"process flow," which matches the brief's constraint. Worth keeping, but
it's a genuinely close call and the owner's read on it should govern.

**Rollback** (isolated by design):
1. Delete `src/components/marketing/about-framework-thread.tsx`.
2. In `src/app/(marketing)/about/page.tsx`: remove the
   `AboutFrameworkThreadSegment`/`ThreadAccent` import and the
   `THREAD_ACCENTS` constant; remove the `{index < STEPS.length - 1 && (...)}`
   block; revert the row `className` from `"relative flex flex-col gap-8 ..."`
   back to `"flex flex-col gap-8 ..."`.

No other file touches this component; nothing else depends on it.

## 5. Contact — unchanged by design

No connector motif added (per brief — insufficient content-driven reason,
and repeating the motif everywhere would flatten it into wallpaper).
Contact's own container (`mx-auto grid w-full max-w-5xl ...`) already had
`w-full` and centers correctly; no change was needed there.

## Accessibility & reduced motion

- All new decorative elements (`ClosingCtaMotif`, `AboutFrameworkThreadSegment`,
  `NavDot`) are `aria-hidden="true"` and `pointer-events-none` where
  applicable.
- Nav dot transition respects `motion-reduce:transition-none` explicitly;
  the ClosingCta motif and About thread are static (no transitions/animation
  to gate). The repo's existing global `prefers-reduced-motion` rule in
  `globals.css` (killing all animation/transition durations) covers
  everything else already.
- `aria-current="page"` semantics preserved on desktop nav, added to mobile
  drawer nav.

## Left unchanged

Hero states, About's hero illustration, Contact's form/illustration/
behavior, footer, broad navbar structure, all copy, all routes, all
existing interactions and responsive breakpoints not called out above.

## 6. Follow-up refinement — thread height and ClosingCta background swap

**About thread.** `AboutFrameworkThreadSegment`'s connector shortened from
`h-20` (80px, filling the full `gap-20` row spacing) to `h-16` (64px) with
`mt-2` (8px), centering the shorter line in the 80px gap so it now has 8px
of breathing room at both ends instead of touching each row's edge exactly.

**ClosingCta background.** Removed `ClosingCtaMotif` (mirrored corner
`ConnectorFlourish` SVGs) — too subtle to register at desktop widths.
Replaced with `ClosingCtaDotPattern`: a static, full-bleed CSS
radial-gradient dot grid (`28px` spacing, `1.5px` dots,
`text-primary-foreground/15`) instead of fixed-geometry SVGs, so it scales
correctly at every width with no breakpoint logic. Masked with a top/bottom
`linear-gradient` feather (transparent → opaque by 18% → opaque to 82% →
transparent) so the pattern doesn't cut off abruptly at the section edges.
Low opacity keeps it quiet behind the centered heading/description/button
while still reading as a distinct textured surface against the flat
`bg-primary` background it replaces the flourishes on. Static/decorative,
`aria-hidden="true"`, `pointer-events-none` — same accessibility posture as
what it replaces.

**Files changed (this pass):**
- `src/components/marketing/about-framework-thread.tsx` — `h-20` → `mt-2 h-16`.
- `src/components/marketing/closing-cta-dot-pattern.tsx` — new, replaces the motif.
- `src/components/marketing/closing-cta-motif.tsx` — deleted (no longer used).
- `src/components/marketing/closing-cta.tsx` — swapped import/usage.

## 7. Follow-up refinement — thread and row spacing restored/increased

**About thread.** Reverted the §6 shortening and went further: connector
back from `h-16` to `h-20` (80px), and row spacing increased from `gap-20`
(80px) to `gap-28` (112px). Centered via `mt-4` (16px), giving 16px of
breathing room at both ends of the 80px line within the larger 112px gap
(vs. §6's 8px within an 80px gap). Width also increased from `w-px` (1px)
to `w-0.5` (2px) for better legibility at the taller height.
`ClosingCtaDotPattern` (§6) is approved and untouched by this pass.

**Files changed (this pass):**
- `src/components/marketing/about-framework-thread.tsx` — `mt-2 h-16 w-px` → `mt-4 h-20 w-0.5`.
- `src/app/(marketing)/about/page.tsx` — `gap-20` → `gap-28` on the steps list.
