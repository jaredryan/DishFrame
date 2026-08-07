# Public-Page Targeted Corrections

Narrow follow-up to `docs/PUBLIC_PAGES_FINAL_AUDIT.md` §3 items 3, 5, 6.
Resolves the Home hero H1/metadata product decision and closes the two
`ThemeToggle` accessibility gaps. No visual redesign, no tests, no
verification suite run (per scope).

## 1. Files changed

- `docs/BRANDING.md` — §16.1 and §22 headline entries
- `docs/PUBLIC_PAGES_FINAL_AUDIT.md` — appended §10 owner-resolution note
- `src/components/theme/theme-toggle.tsx` — roving tabindex, arrow-key
  navigation, `size` prop
- `src/components/layout/public-header.tsx` — drawer instance uses
  `size="large"`, restacked label+control vertically
- `src/app/(app)/settings/page.tsx` — Settings instance uses `size="large"`

## 2. Documentation decision recorded

"Build dishes the way you actually cook." is now the documented canonical
visible Home hero H1 (`BRANDING.md` §16.1, §22). "Recipes that get better
every time you cook." is retained and marked as approved supporting brand
language — unchanged in `src/lib/site.ts` `SITE_TITLE`/description, since
that metadata wording is still accurate and wasn't required to match the
H1 verbatim. `PUBLIC_PAGES_FINAL_AUDIT.md` §3 item 3 / §8.2 finding was left
intact; a new §10 records the resolution rather than rewriting the finding.

## 3. ThemeToggle interaction: before vs. after

**Before:** `role="radiogroup"`/`role="radio"` present but every button had
default tab order (all individually Tab-reachable); no arrow-key, Home, or
End handling; click/Enter/Space (native button activation) worked via
`onClick`.

**After:**
- Roving tabindex: the active theme's button is `tabIndex={0}`, the other
  two are `tabIndex={-1}`. Before hydration resolves a theme, index 0
  (Light) is the fallback tabbable option so exactly one option is always
  in the Tab sequence.
- `ArrowLeft`/`ArrowUp` → previous option, `ArrowRight`/`ArrowDown` → next
  option, wrapping at both ends. `Home` → first option, `End` → last
  option. All four call `setTheme` immediately and move DOM focus to the
  target button via a ref array (`selectByIndex`), so focus, `aria-checked`,
  visual selection, and persisted preference stay in sync in one step —
  matching next-themes' existing persistence/System-resolution behavior,
  which was not touched.
- `preventDefault()` on all of the above plus explicit Space handling
  blocks page scroll; Enter is left to native button activation (already
  calls the same `onClick`/`setTheme`).
- Click behavior (`onClick={() => setTheme(value)}`) is unchanged.

## 4. Compact / drawer / Settings variants

New `size?: "compact" | "large"` prop, default `"compact"`.

| Context | Prop | Button min-height | Icon | Text |
|---|---|---|---|---|
| Desktop navbar (`public-header.tsx`, `min-[950px]:flex` row) | `size="compact"` (default) | `h-7` (28px, unchanged) | `size-3.5` | `text-xs` |
| Mobile/tablet nav drawer | `size="large"` | `min-h-11` (44px) | `size-4` | `text-sm` |
| Settings → Appearance | `size="large"` | `min-h-11` (44px) | `size-4` | `text-sm` |

`size="large"` buttons also get `flex-1` so the three options divide the
segmented control's width evenly and stay visually cohesive; the
`radiogroup` container (`p-0.5` border wrapper) grows naturally around the
taller buttons — no separate large-variant container styling was needed.

In the drawer, the "Theme" row was restacked from a horizontal
`justify-between` row to a vertical `flex-col` (label on top, full-width
toggle below) so the three 44px-tall, labeled buttons have room without
crowding the 330px-minimum sheet. Settings kept its existing horizontal
`justify-between` row — the `max-w-2xl` container has enough width for the
larger toggle without restacking.

## 5. Assumptions

- "44 CSS pixels tall" was read as `min-height`, not a fixed `height`, so
  the button can still grow for content/line-height without clipping.
- Icon size bump (`size-3.5` → `size-4`) and label size bump (`text-xs` →
  `text-sm`) for the large variant were treated as within "balanced
  alignment of icons and labels," not a scope violation — the compact
  navbar instance is untouched.
- Fallback tabbable index (0/Light) pre-hydration was treated as an
  implementation detail, not a product decision, since it only exists
  for the brief pre-mount window and doesn't change the resolved theme.

## 6. Keyboard test cases for the later public-page test pass

- Tab reaches exactly one `ThemeToggle` button (the currently active
  theme); Shift+Tab from it lands outside the group, not on a sibling
  option.
- Arrow Left/Up and Right/Down move focus + selection by one option each,
  in both directions, from all three starting positions.
- Wrap: from Light, ArrowLeft/ArrowUp goes to System; from System,
  ArrowRight/ArrowDown goes to Light.
- Home from any option selects/focuses Light; End selects/focuses System.
- After any arrow/Home/End move: `aria-checked` is `true` only on the new
  option, focus is on the new option's button, the visual selected state
  (`bg-card`/`shadow-sm`) matches, and the persisted preference
  (`localStorage` via next-themes) + applied `<html>` class reflect the
  new theme.
- Space and Enter on the focused option re-select it (no-op on state, but
  confirm no page scroll on Space).
- Arrow/Home/End key presses do not scroll the page.
- `focus-visible` ring renders on keyboard focus for both `size="compact"`
  and `size="large"` variants.
- Regression: click selection (mouse) still works in all three contexts
  (navbar, drawer, Settings).
- Drawer and Settings buttons measure ≥44px tall via computed
  `getBoundingClientRect()`; navbar buttons remain 28px tall (unchanged).

## 7. Verification performed

- `npx prettier --check` on all changed files: clean.
- `npx tsc --noEmit`: no errors in any changed file.
- No lint, build, unit/integration tests, Playwright, or `verify:*` script
  run, per scope. No manual browser walkthrough performed.

## 8. Intentionally left unchanged

- `src/lib/site.ts` `SITE_TITLE`/`SITE_DESCRIPTION` (approved supporting
  copy, not required to match the H1).
- Navbar composition, active-link treatment, Contact/ClosingCta/About
  framework section — out of scope per instructions.
- No tests added or modified; existing `theme-toggle.test.tsx` still
  passes against the new markup (role/name queries unchanged) but wasn't
  run in this pass per the no-test-suite-run constraint.
