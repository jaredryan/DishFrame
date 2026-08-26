# DishFrame — Authenticated App Design/UX/Accessibility Audit

**Scope:** the logged-in product only (public marketing/auth pages were audited separately and are excluded here).
**Method:** Playwright against a `pnpm start` production build (port 3000), authenticated as the QA-seeded account (`jryantennis@gmail.com`) via a minted session cookie, against the local Docker Postgres QA fixture (recipes, parts, meal plans, grocery lists, cooking sessions, ratings, tags/flavor profiles all populated). Viewports: 1440×900 (desktop), 820×1180 (tablet), 540×900 (narrow). Both light and dark theme. Automated accessibility scanning via axe-core 4.9.1 injected per page, supplemented by manual review, computed-style spot checks, and keyboard-focus checks.

---

## 1. Executive summary

DishFrame's authenticated app is a **functionally mature, thoughtfully composed product** that is closer to design-complete than to "needs a redesign." The information architecture is consistent and deliberate — Recipe and Part detail pages share a nearly identical structural language, list pages (Recipes, Parts, Cook sessions, Meal Plans) follow the same patterns, and dense utility screens (Settings, Grocery List detail) are organized rather than merely dumped onto the page. Responsive behavior is a genuine strength: across three viewports and every audited route, no clipping, overflow, or broken layout was found, and several screens (most notably Cooking Mode) have deliberate, non-generic per-breakpoint adaptations rather than a naive stack-everything approach.

The most consequential finding was **not visual** — it was a single systemic accessibility defect: interactive controls built on the app's shared Select, Checkbox, and Switch primitives were rendering without a screen-reader-discoverable name almost everywhere they appeared (recipe/part editing, list filters, the Tags & Flavors picker, the Cooking Mode ingredient/instruction checklist, Share/Publish toggles, and every Settings preference control). This was confirmed at 15+ independent call sites across the app, including the core recipe-execution screen. **This has been fixed during this audit pass** (see §10) — every instance actually observed failing was corrected and re-verified at the source level. A handful of real, small color-contrast and semantic-color gaps were also found and fixed or recommended.

Nothing found rises to "needs a redesign." The recommendations below are refinements to an already-solid foundation, not corrections to a broken one.

---

## 2. Overall scorecard

| Area | Score | Notes |
|---|---|---|
| Visual design | 8/10 | Clean, restrained, consistent card/chip/typography system; a few semantic-color gaps |
| UX / interaction design | 8/10 | Clear action hierarchy, strong modal/dialog patterns; Cooking Mode underuses available screen space |
| Consistency | 7/10 | Strong structural parity (Recipe↔Part, list managers in Settings) undercut by a few real gaps (stage-chip coloring, status-chip coloring, one inline-link asymmetry) |
| Responsive design | 9/10 | No clipping/overflow anywhere audited; several screens have bespoke, well-judged breakpoint behavior |
| Accessibility | 7/10 (post-fix) | A widespread unlabeled-control pattern was found and fixed at every confirmed site; likely recurs in a few untested corners (see §11) |
| Information hierarchy | 8/10 | Clear headings/breadcrumbs; one real heading-order bug found and fixed |
| **Overall polish** | **8/10** | Strong production-quality work with identifiable, non-urgent polish opportunities |

**Overall authenticated-app score: 8/10.**

---

## 3. Major strengths

- **Recipe/Part structural parity.** Detail pages, edit forms, More-actions menus, version history, and compare-versions all follow the same shape for Recipes and Parts, right down to icon choice. A user who learns one learns the other.
- **Grocery List detail is the standout screen.** Plan-changed vs. no-longer-in-plan vs. optional badges, Acknowledge/Show sources/Uncombine actions, section grouping, and checked-item strikethrough — all in one screen — read as organized, not overwhelming. Red is reserved specifically for "this needs your attention," which is exactly the restraint a warning color needs.
- **Help page is a model for the rest of the app.** Its "Jump to" anchor nav for a long, multi-section page is a pattern the app already knows how to build — it just isn't applied to Settings yet (see §11).
- **Responsive engineering is genuinely strong.** Every audited page reflows cleanly at 540px, including the densest ones (Grocery List rows, Share's per-link cards with long truncated URLs). Cooking Mode in particular has a bespoke 3-column → rail+footer → disclosure+footer transformation across breakpoints, not a generic collapse.
- **Destructive-action treatment is consistent and correct** where it appears: the "session already in progress" dialog (Resume vs. red-outlined End) and the Profile page's Delete Account danger zone (red-tinted card, explicit "cannot be undone" copy) are good references.
- **Keyboard focus is visible** (confirmed via Tab) and semantic roles are used correctly in several places that are easy to get wrong — the recipe-view toggle and theme picker are real `radiogroup`s, not styled buttons.

## 4. Major remaining weaknesses

- **A systemic unlabeled-control pattern** (now fixed — see §10) affected nearly every Select, Checkbox, and Switch in the authenticated app, including the Cooking Mode ingredient/instruction checklist — the single highest-traffic interactive surface in the product.
- **Semantic status-chip coloring is inconsistent.** Meal Plan statuses (Planned/In progress/Cooked/Skipped) and Share link statuses (Pending/Snapshot/Disabled/Expired) mostly render in the same neutral gray regardless of meaning, even though the app clearly knows how to do this well elsewhere (Stage chips, Grocery List's red "no longer in plan" badge).
- **Settings is a single long flat-scroll page** with no in-page navigation, despite Help already establishing the exact pattern (a sticky "Jump to" nav) that would fix it.
- **Cooking Mode underuses available screen space** on desktop — a real usability opportunity given it's a screen typically viewed at a distance or with messy hands, not just a cosmetic gap.

---

## 5. Route/group audit

### Home — 8/10
Clean 2×2 dashboard grid (Continue cooking / Recently updated / Meal plans / Grocery lists), consistent card heading + primary action + list + footer-link structure. Minor: card heights aren't visually balanced when list lengths differ between the two cards in a row.

### Recipes & Parts — list, detail, create/edit — 8.5/10
Strong, matched IA between Recipes and Parts: search + Stage/Tags/Cuisine/Flavor/rating filters, Grid/Compact view toggle (a real `radiogroup`), sort. Detail pages compose nested Part cards cleanly; Part detail additionally shows an inline Nutrition card and a "Recipes using this Part" reverse-reference list — a strong provenance feature. One real inconsistency: Part detail shows an inline "View cooking history" quick-link that Recipe detail lacks (both have it in the More-actions menu). Edit/create forms are clean, single-column, well-grouped, with good progressive disclosure for composition (Add section / Add section from text / Attach a part / Create part).

### Version history & Compare versions — 8/10
Version-detail view is well designed (stepper + dropdown, "this is the current version" notice, clear action row). Compare-versions is a genuinely good diff UI once there are ≥2 real versions to compare (grouped by field, green "Added:", before→after arrows); the same-version-vs-itself edge case is sparse but not wrong.

### Cook session list — 8/10
Clean Active/Completed two-column layout, per-row rating and Notes disclosure. No issues found.

### Pre-cook setup — 8.5/10
Whole-session scale plus per-unit "Make (optional)" cards with reorder/delete; the "session already in progress" 3-way choice (Cancel / red End / blue Resume) is a good reference for a destructive-vs-safe decision.

### Cooking Mode — 8/10 (high-value screen)
The core execution UI (section rail, ingredient/instruction checklist, big green "Mark complete," Timers panel) is clear and functionally strong, and its responsive adaptation across breakpoints is the best in the app. Two real issues found and fixed during this pass: every checklist checkbox was unlabeled to assistive tech (§10), and the running-timer chip showed a redundant "Name · Name" label when the timer's name matched its section (§10). Remaining opportunity: on desktop the step-through content fills only the top ~60% of the frame, leaving real space unused on a screen meant to be glanced at from across a kitchen (§11).

### Meal Plans — list, detail, create — 8/10
Detail page is one of the best-composed pages in the app (2-col meal cards, status chip + contextual actions, linked grocery lists). The 4-state status chip (Planned/In progress/Cooked/Skipped) mostly collapses to the same gray — a real, fixable color-system gap (§11).

### Grocery Lists — list, detail — 9/10
Detail page is the strongest screen in the product (§3). No issues found beyond a Playwright-only interaction flakiness note that isn't confident enough to call a real bug (§7).

### Share / Send / Publish — 8/10
Feature-complete: Received/Sent direct-share tracking, Public links with Always-up-to-date vs. Snapshot modes, Disabled/Expired states. Send and Publish dialogs have clear, reassuring copy about what each action actually does. Same status-chip color gap as Meal Plans (Expired reads identically to purely descriptive chips despite being paired with actionable warning copy). Accessibility issues found and fixed (§10).

### Settings — 7.5/10
Excellent internal consistency: Tasters/Tags/Flavor Profiles/Grocery Categories all share one reorderable-list-manager pattern. Let down by being a single ~3100px flat-scroll page with no in-page navigation, and by the same unlabeled-control pattern (fixed, §10).

### Profile — 8.5/10
Well-organized account page; the Delete Account section is a good reference for destructive-action treatment elsewhere.

### Help — 9/10
The best-organized page in the app — see §3.

---

## 6. Light vs. dark theme observations

Dark theme is well executed overall: sensible surface hierarchy (sidebar reads subtly lighter than the page background), cards and chips keep good contrast, and no layout differences were found between themes.

One real, high-reach issue was found and fixed: the "Frame" half of the sidebar wordmark rendered at **2.62:1 contrast in dark mode** (`text-primary` on the sidebar background) against a 4.5:1 requirement — a meaningful shortfall, not a marginal one, and visible on **every single authenticated page** since it's in the persistent sidebar header. Fixed by switching to the app's existing `brand-blue-text` token (already used correctly elsewhere for accessible blue text), which is specifically designed with a lighter dark-mode value for this purpose. Re-verified in both themes with no visual regression.

## 7. Responsive observations

No horizontal clipping or overflow was found on any audited page at any viewport. Specific notes:

- **Tablet (820):** sidebar correctly disappears below the `lg` breakpoint in favor of a hamburger-triggered drawer with a dimmed backdrop and correct active-state highlighting.
- **Narrow (540):** Cooking Mode's section rail collapses into a "Recipe contents" disclosure and the Timers panel becomes a full-bleed sticky footer bar, tinted amber when a timer needs attention — a deliberate, screen-specific adaptation, not a generic stack.
- Recipes/Parts Grid view renders large square card photos at 540px, making a long list fairly scroll-heavy — not a bug (a dense "Compact" view already exists as an alternative, correctly implemented as a `radiogroup`), just an optional consideration (§13).
- **Methodology note:** `fullPage` Playwright screenshots on pages with a `position: sticky; bottom: 0` action bar can visually stack that bar mid-document in the captured image. This produced two apparent "overlap" bugs during this audit (recipe edit desktop, recipe create narrow) that were both false alarms once verified via a live scrolled-viewport screenshot — worth knowing if this pattern recurs in future automated visual review.

## 8. Accessibility observations

- **Systemic unlabeled-control pattern (CRITICAL, fixed):** Select-trigger buttons, Checkbox items, and Switch toggles built on the app's shared Radix-based primitives were not exposing an accessible name at 15+ confirmed call sites — despite most having a visibly correct adjacent `<label>`. This is a known real-world gotcha (label-wrapping/`for` association doesn't reliably produce an accessible name for ARIA-role-overridden controls like `role="checkbox"`/`role="combobox"` on a `<button>` in every accessibility-tree implementation) rather than a visual bug — nothing looked wrong on screen. Confirmed via axe-core and fixed with explicit `aria-label`s at every site this audit actually exercised. See §10 for the full list and §11 for what wasn't exercised.
- **Heading order (fixed):** a Part-card's title used `<h4>` while an equivalent plain Section used `<h2>` with identical visual styling — a real semantic skip (H1→H4→H2) on every recipe/part detail and version page. Fixed by matching the existing Section heading level.
- **Color contrast (fixed):** three instances found and fixed — a stale-session "days ago" badge (light+dark), the selected recipe chip in Cooking Mode's left rail, and the dark-mode wordmark (§6).
- **Keyboard focus** is visible throughout (spot-checked via Tab); no focus traps encountered.
- **Semantic roles** are used correctly in several non-obvious places (theme picker, recipe-view toggle as real `radiogroup`s).

## 9. Consistency/system observations

- Cuisine tags (French/Italian/Japanese/etc.) are consistently green across Recipes and Parts — good.
- Difficulty chips are consistently orange regardless of level (Easy/Moderate) — categorical rather than severity-graded, which is a reasonable and consistent choice.
- Stage chips (Active/Proven/Idea) render identically in blue; only "Experimental" gets a distinct color — a minor incomplete-application of the same color system that works well for Cuisine.
- Status-chip coloring on Meal Plans and Share is the most concrete system gap — see §11.
- The More-actions menu (10 items: History group, Distribute group, Archive, Delete) works but is a flat list with only one separator — grouping would help scannability without changing any behavior (§12).

---

## 10. Automatic fixes applied

All of the following were small, objective, low-risk, and verified (axe-core: violation → 0, or visual re-check) against a fresh `pnpm dev` build after editing. Counted as **16 fixes** across the criteria the audit brief allows for auto-fix.

| # | Fix | File(s) | Verified |
|---|---|---|---|
| 1 | Part-card title `<h4>` → `<h2>` (heading-order fix, matches Section heading) | `part-link-tree-view.tsx` | ✅ 0 violations on recipe/part/version detail |
| 2 | Version-stepper disabled prev/next button now gets `aria-label` | `version-picker-field.tsx` | ✅ 0 violations on version detail |
| 3 | Recipe/Part stage Select gets `aria-label` | `dish-editor.tsx` | ✅ 0 violations on edit form |
| 4 | Difficulty Select gets `aria-label` | `dish-editor.tsx` | ✅ |
| 5 | Nutrition Basis Select gets `aria-label` | `nutrition-fields.tsx` | ✅ |
| 6 | Photo-upload hidden file input gets `aria-label` | `image-field.tsx` | ✅ |
| 7 | Tags & Flavor-profile checkboxes get `aria-label`; popover gets `aria-label` | `dish-tag-flavor-editor.tsx` | ✅ 0 violations on Tags & Flavors popover |
| 8 | Filter-popover checkboxes get `aria-label`; popover gets `aria-label` (fixes every Recipes/Parts/meal-modal filter at once — shared component) | `filter-popover.tsx` | ✅ 0 violations on Recipes/Parts filter dropdowns |
| 9 | Cooking Mode ingredient/instruction checklist checkboxes get `aria-label` from the row's own visible text | `checklist-sections.tsx` | ✅ 0 violations inside a cooking section |
| 10 | "Show my name on shared page" Switch gets `aria-label` (Share page + Publish dialog) | `share-link-list.tsx`, `share-dialog.tsx` | ✅ 0 violations on Share page and Publish dialog |
| 11 | Publish dialog Mode Select gets `aria-label` | `share-dialog.tsx` | ✅ |
| 12 | Settings: Measurement system / Quantities / Primary rating Selects and Timer sound / Review prompt Switches all get `aria-label` | `preferences-form.tsx` | ✅ 0 violations on Settings |
| 13 | Stale-session "days ago" badge switched from a one-off `text-orange-600 dark:text-orange-400` to the app's existing accessible `brand-orange-text` token | `cook-sessions-view.tsx` | ✅ 0 violations on Home; visually unchanged |
| 14 | Cooking Mode selected-chip background lightened (`bg-primary/10` → `bg-primary/5`) to clear 4.5:1 against `text-primary` | `cooking-mode-desktop-layout.tsx` | ✅ 0 violations on Cooking Mode landing state |
| 15 | Dark-mode sidebar wordmark switched from `text-primary` (2.62:1) to the app's existing `brand-blue-text` token, which has a lighter dark-mode value for exactly this purpose | `wordmark.tsx` | ✅ 0 violations in dark theme; visually unchanged in both themes |
| 16 | Running-timer label no longer shows a redundant "Name · Name" when the timer's name matches its section | `timer-row.tsx` | ✅ confirmed via live timer: suppressed when equal, still shown when different |

**Note:** `wordmark.tsx` is a shared component also rendered on public marketing pages (out of scope for this audit). The change is a straightforward swap to an already-established, already-used-elsewhere accessible-text token, not a new color decision, so it should be a pure improvement there too — but flagging it explicitly since it does touch a file outside this audit's own scope.

All fixes were made directly in source and re-verified against a `pnpm dev` server (the `pnpm start` production server on :3000 still reflects the pre-fix build — **a rebuild is needed for these fixes to reach it**).

---

## 11. High-value recommendations

1. **Audit remaining Select/Checkbox/Switch call sites for the same unlabeled-control pattern.** This audit fixed every instance it actually exercised (§10), but did not click through every dialog in the app (e.g., the bulk-publish dialog, meal-plan/grocery-list create-edit flows weren't individually opened). Given how consistently the pattern recurred everywhere it *was* checked, a quick sweep of any remaining `Select`/`Checkbox`/`Switch` usages for a missing `aria-label` is worth doing. *Small, low-risk, mechanical — same fix, just needs someone to find the remaining sites.*
2. **Give Meal Plan and Share status chips distinct colors.** Both currently collapse most states into the same neutral gray, even though the app already does this well for Grocery List item badges and Recipe Stage chips. Concretely: Meal Plans' Planned/In-progress/Cooked/Skipped, and Share's Pending/Snapshot/Disabled/Expired (Expired in particular, since it's paired with actionable "this link stopped working" copy). *Medium risk — touches a color decision, should be reviewed rather than auto-applied, but the pattern to copy already exists in the codebase.*
3. **Add an in-page "Jump to" nav to Settings**, mirroring the pattern Help already uses successfully for a similarly long page. *Low risk, no new pattern to invent.*

## 12. Medium-value polish

- Group the Recipe/Part More-actions menu into History / Distribute / Destructive sections with separators (currently one flat 10-item list with a single separator before Delete).
- Add the same inline "View cooking history" quick-link to Recipe detail that Part detail already has (or remove it from Part detail), for parity.
- Give Cooking Mode's desktop layout something to do with the unused vertical space below the checklist — larger touch targets, a more prominent timer, or a persistent "next section" affordance, given this screen is often used at a distance or with messy hands.
- Balance card heights on Home when list lengths differ between paired cards in a row.

## 13. Optional/subjective ideas

- Consider defaulting Recipes/Parts list to Compact view below a width threshold, or capping image height in Grid view at narrow widths — current behavior (large square photos, with Compact as an opt-in alternative) is a reasonable, deliberate-looking tradeoff either way.
- Consider whether "Prep time" should get the same colored-pill treatment "Cook time" and "Makes N servings" already have on Recipe/Part detail — currently prep time is plain text while the other two are pills. Low-stakes either way.
- Consider a gentle "still cooking?" nudge for a Cooking Session left open unusually long, surfaced by the (accurate, not buggy) "269h elapsed" readout on stale sessions.

---

## 14. Final assessment

DishFrame's authenticated app is **close to design-complete**. The information architecture is sound, the component system is applied consistently in the overwhelming majority of places, responsive behavior has no functional gaps, and the two most product-critical screens (Recipe/Part detail, Cooking Mode) are well-executed. The one systemic defect serious enough to matter — a widespread accessibility labeling gap — was real and worth finding, but was narrow in *kind* (one wiring mistake repeated across many call sites) rather than broad in *severity*, and has been fixed and verified as part of this pass. What remains is refinement: a few semantic-color gaps, one missing navigation affordance on a long settings page, and a genuine but non-blocking opportunity to make better use of screen space in Cooking Mode. None of the findings in this report call for a redesign or a re-architecture — they're the kind of polish pass appropriate for a nearly-finished product heading toward release.
