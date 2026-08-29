# Frontend Interaction-Architecture Audit (2026-08-28)

Focused audit of repeated frontend interaction patterns across the authenticated
app: for each, which shared primitive exists, which callers use it, which
bypass/reimplement it, and whether the difference is genuine domain need or
drift. High-confidence systemic fixes were implemented in this same pass.
Scope: frontend interaction architecture only — not a repeat of the prior
backend/database/security audit.

## 1. Shared Version picker — root-caused and fixed

**Canonical component:** `VersionLineRow` (`version-picker-field.tsx`), wrapped
by `RichVersionPickerField` / `RichDishVersionPicker` (dialog contexts) and
`VersionSelector` (routed Version History page). Every caller already used it
— Send, Publish, Cooking Setup, Attach-a-Part, grocery-source-picker, Grocery
List "Add/Edit meal", Meal Plan "Add/Edit meal", Version History. So this
wasn't a "some callers bypass it" case — the shared component itself was
broken.

**Root cause:** the Select only ever listed one row per *major* version line
(`latestPerMajor`), and that row's rendered label was always the line's latest
minor — fixed regardless of which Version was actually active. Since ordinary
saves are minor bumps (major bumps are the rare, deliberate case —
PRODUCT_SPEC §13), a real Recipe/Part's history is typically one major line
with several minors: the dropdown showed exactly one "current" row, and
clicking Previous/Next changed the active Version internally but the Select's
displayed text never changed (Radix `Select.Value` renders the *matched
item's* static children, and the item's value/children were keyed by major
line, not by the specific active Version) — so navigation looked like a no-op.

**Fix:** the Select now lists every saved Version individually (keyed by
Version id, newest first), and `onValueChange` navigates straight to the
picked Version. This satisfies PRODUCT_SPEC §13.8, whose "selector shows only
the latest minor per major line" pattern is explicitly non-mandatory ("This is
an example, not a mandatory control design"). Simplified the component in the
process (dropped the `latestPerMajor`/`majorLines` grouping entirely).
Verified against every caller's data contract (`listDishVersionOptions`,
`listGrocerySourceVersionOptions`, both backed by an equivalent
`listDishVersionYieldOptions` that already returns the full, correctly
ordered history — the bug was purely in the picker UI, not the query layer).

**Tests:** `version-picker-field.test.tsx` (new) pins the display-tracks-active
and prev/next-by-id behavior directly, without needing to open the Radix
Select popover (no jsdom Select-interaction polyfill exists in this repo yet).

## 2. Generic post-mutation success screens → shared loading + toast

**Product rule applied:** operation-level async failures → toast; field
validation stays inline; success toasts only where success wouldn't otherwise
be obvious; don't replace a screen that has a real next-step decision.

- **`DirectShareSingleItemDialog`** and **`DirectShareCollectionDialog`**
  ("Direct Send", single-item and multi-item): both had a dedicated `"sent"`
  step (`submit → "Sent." screen → Done`). Replaced with
  `submit → shared Button loading → success toast → dialog closes`; failure
  now shows an error toast and leaves the dialog open on the review/configure
  step with selections intact (previously an inline `role="alert"` paragraph).
  Toast infrastructure (`useToast`) existed but had only 2 adopters
  app-wide before this pass.
- **`BulkPublishDialog`**'s `"result"` step was *not* migrated — it's a
  genuine completion screen: each published item gets its own real public URL
  with a per-item Copy action and per-item success/failure reporting. Migrating
  this would destroy real functionality, so it was left as-is (only its
  `Publish` button's `isPending ? "Publishing…" : "Publish"` label-swap was
  migrated to `loading`).

**Tests:** updated `direct-share-single-item-dialog.test.tsx` and
`direct-share-collection-dialog.test.tsx` (now wrapped in `ToastProvider`),
added success-closes-with-toast and failure-stays-open-with-toast cases for
both.

## 3. Loading-state sweep

Migrated every clear-cut `isPending ? "X…" : "Y"` / disabled-only button to
the shared `Button loading` prop (preserves label/width, `aria-busy`,
prevents double-submit): `sign-in-card`, `cooking-setup` (Start cooking, End
current session), `session-review-form` (Add taster), `fdc-search-picker`
(Search), `paste-import-flow` (Parse), `promote-version-button` (Promote),
`grocery-list-detail-view` (Add meal, Add item, Apply refresh),
`grocery-source-picker` (Generate), `meal-plan-view` (Generate),
`bulk-publish-dialog` (Publish).

**Originally deliberately not migrated — one shared `isPending` covered
several independent actions.** `tag-manager`, `flavor-profile-manager`,
`taster-manager`, `grocery-category-manager`, `auth-session-manager` (and
several row-list components — `share-link-list`, `grocery-list-rows`,
`direct-share-sent-list`, `direct-share-received-list`) each used one
`useTransition()` for multiple distinct buttons (create *and* delete *and*
merge, or several actions per row). Applying `loading` naively would have
spun the *wrong* button while a different action was in flight. **Resolved
in the 2026-08-28 follow-up pass — see §9.1.**

**Not touched, correctly:** `dish-detail-actions.tsx`'s `"Loading…" : "Show
earlier versions…"` is a `SelectItem` inside a listbox, not a `Button` — the
shared spinner-overlay treatment doesn't apply there; the existing text swap
is a reasonable, different affordance for that context.

No bespoke bare `Loader2`/`animate-spin` usage was found anywhere outside
`button.tsx` itself — that anti-pattern is already fully consolidated.

## 4. Shared SearchInput focus-ring clipping — root-caused and fixed

**Root cause, traced through the full chain:** `SearchInput`'s own
`-m-0.5 p-0.5` (2px) inset only helps if it reaches the *actual* scrolling
ancestor. `RecipePartPicker` (the canonical Recipe/Part search-and-select
picker — Send, Publish, Attach-a-Part, Start Cooking, grocery-source-picker,
Grocery "Add meal") never owned its own scroll container; every caller wrapped
it individually, and drifted: 4 of 6 added a dedicated
`-mx-1 ... overflow-y-auto ... px-1` wrapper (horizontal-only, and
inconsistently applied), the other 2 relied on an ancestor wrapper shared with
sibling fields. None reserved *vertical* room — the sticky search header sits
at `top-0` inside the scroll container, so its focus ring's top edge had zero
clip-safe space regardless of the horizontal patches.

**Fix:** `RecipePartPicker` now owns its own scroll container directly, with a
uniform `-m-1 p-1` inset on every edge (margin/padding canceling out
visually, no layout shift) — centralizing the exact trick `SearchInput`
already used locally, but at the level that actually matters. Removed the 3
now-redundant dedicated wrapper divs (`start-cooking-button`,
`part-attach-picker`, `grocery-list-detail-view`'s Add-meal dialog),
passing `className="flex-1"` through instead so sizing is unchanged. The 2
callers whose wrapper is shared with sibling fields
(`direct-share-collection-dialog`, `grocery-source-picker`) were left as-is —
a harmless nested scroll region, not worth restructuring those dialogs for.
Updated `SearchInput`'s own comment to describe its inset as defense-in-depth
now that the real fix lives at the scroll-container level.

Not a presentation-only change worth a snapshot test per this repo's
test-value policy — no test added.

## 5. Multi-step modal scrolling — new shared `useStepScrollReset` hook

No shared multi-step-dialog component exists; four dialogs
(`DirectShareCollectionDialog`, `BulkPublishDialog`, `GrocerySourcePickerPanel`,
grocery-list-detail-view's Add-meal dialog) and one modal
(`meal-plan-editor`'s Add/Edit meal) each hand-roll their own `step`/selection
state and render every step inside one persistent scrollable element — so
advancing (e.g. a long Recipe/Part list → the much shorter Version/yield
step) kept the previous scroll position.

Added a small, focused hook — `src/components/ui/use-step-scroll-reset.ts` —
rather than a new "multi-step dialog" component (would be over-generalized
for 5 structurally-different call sites): `useStepScrollReset(step)` returns a
ref; attach it to whichever element actually scrolls for that dialog. Wired
into all 5 call sites above (`DialogContent` itself for the two whose
`DialogContent` is the scrolling element; the inner wrapper div for the
others). Instant `scrollTo({ top: 0 })`, keyed only on the step/selection
value — never fires for unrelated re-renders.

## 6. Part Detail responsive usage layout

`PartUsagePanel`'s "Recipes using this Part" list (`part-usage-panel.tsx`) was
a single-column `flex flex-col` regardless of viewport. Changed to
`grid gap-2 md:grid-cols-2 md:items-start` — the same breakpoint/pattern
already used by every other authenticated card grid (`cook-sessions-view`,
`grocery-list-rows`, `meal-plan-list-view`, `meal-plan-view`). Content and
interaction unchanged.

## 7. Destructive-confirmation sweep

No shared confirm-dialog primitive exists; ~15 destructive actions each
hand-roll the same `Dialog` + title + description + footer shape
independently (genuine duplication, but not incorrect — every one of them,
bar one, does confirm). **Found and fixed one real gap:** `share-link-list.tsx`
"Disable link" — styled `variant="destructive"` like every other confirmed
destructive action in the app, but fired `revokeShareLink` directly on click
with no confirmation at all, unlike its peers (delete grocery list, delete
meal plan, delete tag, archive/delete Recipe/Part, etc.). Added the same
Dialog-based confirm step used everywhere else. "Replace link"
(`regenerateShareLink`, also effectively destructive — the old URL stops
working) was deliberately left alone: it's styled `variant="outline"`, not
`destructive`, which reads as an intentional product choice, not an oversight
— flagging rather than guessing.

**Originally left as an architectural finding, not fixed:** the ~15-way
duplication of the confirm-dialog shape itself. **Resolved in the
2026-08-28 follow-up pass — see §9.2.**

**Tests:** added a `share-link-list.test.tsx` case proving Disable link no
longer revokes without confirmation, and that confirming still calls
`revokeShareLink`/refreshes as before.

## 8. Reviewed, no action needed

- **Touch targets:** already centralized. `Button`'s `xs`/`sm`/icon-size
  variants already grow to 44px under `pointer-coarse`; `Checkbox`/`Switch`
  already use the `after:-inset-x-3 after:-inset-y-2` hit-area trick. No gaps
  found.
- **`meal-plan-editor`'s own Recipe/Part candidate list** doesn't use the
  shared `RecipePartPicker` — confirmed this is a genuine domain difference,
  not drift: it supports Stage/Kind/Tag/Cuisine/Flavor/Rating filters and
  sort that `RecipePartPicker` doesn't, and its own scroll container already
  has generous (16px) padding, so it isn't a site of the reported clipping
  bug. No change made.
- **Toast adoption** was otherwise still minimal (2 call sites before this
  pass, 4 after). **A deliberate follow-up sweep was done on 2026-08-28 —
  see §9.3.**

## 9. Follow-up pass (2026-08-28, same day) — the three owner-decision items

The three items §3/§7/§8 flagged for an explicit owner decision were
resolved in a same-day follow-up, while this frontend context was still
warm.

### 9.1 Per-action pending state

Added `src/components/ui/use-pending-action.ts` — a small hook, not a
generic state-management abstraction: `usePendingAction<T extends
string>()` returns `{ pendingAction, isPending, run }`. `run(key, task)`
sets `pendingAction` to the caller-defined key before starting the async
task and clears it in a `finally`, so `pendingAction === key` is only ever
true for the control that actually started that specific action;
`isPending` (`pendingAction !== null`) still gates `disabled` everywhere,
preserving double-submit protection. Callers key actions by type alone
(`"create"`, `"delete"`) when only one instance can ever be in flight, or
by type+id (`` `revoke-${sessionId}` ``, `` `move-${unitId}-${direction}` ``)
when several rows/entries can each independently trigger the same action.

**Migrated:** `tag-manager`, `flavor-profile-manager`, `taster-manager`,
`grocery-category-manager` (create/rename/delete/reorder, each its own key),
`auth-session-manager` (per-session revoke + revoke-others),
`share-link-list` (replace/disable/toggle-attribution),
`direct-share-received-list` (accept/decline). Also extended to two files
discovered mid-pass with the same shared-flag pattern that weren't in the
original §3 list: `cooking-plan-manager` (move/remove/restore/add, each
keyed by unit id, plus delete-session) and `meal-plan-view` (per-entry
start-session/mark-cooked/mark-skipped, plus delete-plan) — both had
several coexisting per-row or per-entry buttons sharing one `isPending`,
the exact risk §3 described.

**`TooltipIconButton`** (`reorder-buttons.tsx`, the shared icon-button-plus-
tooltip wrapper used for most row actions app-wide) gained an optional
`loading` prop forwarding to the underlying `Button`'s loading treatment —
it had no way to show the shared loading state at all before this, which is
why the icon-button row actions in `cooking-plan-manager` couldn't
previously get real per-action loading feedback.

**Re-verified as actually already safe** (excluded from the rewrite,
correcting §3's original list): `grocery-list-rows.tsx`'s `isPending` was
single-purpose (only `confirmDelete` used it) — not a shared-flag case.
`direct-share-sent-list.tsx`'s `isPending` per card was likewise
single-purpose (one Cancel button per card instance). `meal-plan-list-view`,
`dish-detail-actions`, and `part-usage-panel` share one `isPending` across
several dialogs, but those dialogs are mutually exclusive and modal
(`openDialog`-style single-value state, or Radix's own overlay blocking the
background) — verified there is no click path that leaves a stale
`isPending` visible when a different dialog opens, so no `loading` there is
actually misleading.

**Tests:** `use-pending-action.test.tsx` (new) pins that only the action
actually run is reported pending.

### 9.2 Shared `ConfirmDialog`

Added `src/components/ui/confirm-dialog.tsx`: `open`, `onOpenChangeAction`,
`title`, `description?`, `confirmLabel?`, `cancelLabel?`, `destructive?`,
`loading?`, `error?` (rendered between description and footer — the
"confirm failed, dialog stays open" case), `onConfirmAction`. Deliberately
covers only the common shape — a single decision with an optional inline
error, nothing else in the body. Prop names end in `Action` per this
codebase's existing convention for client-component function props (see
`version-picker-field.tsx`'s `onChangeAction`/`onNavigateAction`).

**Migrated** (title/description/wording preserved exactly; button order
normalized to Cancel-then-Confirm where a caller had reversed it, e.g.
`meal-plan-editor`'s discard-changes dialog — a deliberate consistency fix,
not a wording change):

- `tag-manager` — Delete tag (destructive) and the rename→merge confirmation
  (ordinary styling — proof the API isn't destructive-only).
- `grocery-list-rows`, `meal-plan-list-view`, `meal-plan-view` — delete
  card/plan.
- `session-card-shell` — End session, Delete session.
- `session-review-form` — Delete Review.
- `dish-detail-actions` — Archive, Duplicate, Permanently delete.
- `cooking-plan-manager` — "last active unit" guard (Keep editing / Delete
  session).
- `share-link-list` — Disable link (the confirmation added in the prior
  pass now uses the shared primitive instead of a one-off hand-rolled
  version).
- `grocery-list-detail-view` — Remove this meal, Delete this grocery list.

**Deliberately not forced through it** — each has its own form fields, a
list to review, or more than two actions, matching the primitive's own
stated scope: `dish-detail-actions`' Restore (a Select) and Export
(Version + privacy tiers); `part-usage-resolution-dialog` (a usage list to
resolve); `meal-plan-view`'s Reuse (name/date-range form) and Generate
(item selection); `grocery-list-detail-view`'s Add/Edit meal, Add item,
Edit list, Refresh source (each has real fields or a diff to show);
`delete-account-dialog` (a type-to-confirm field); `cooking-setup`'s
session-conflict dialog (three actions, not two).

**Tests:** `confirm-dialog.test.tsx` (new) covers title/description
rendering, confirm firing `onConfirmAction`, Cancel firing
`onOpenChangeAction(false)` without confirming, and the loading/disabled
states. Updated `share-link-list.test.tsx`'s existing disable-confirmation
case to match (no behavior change, so no new cases needed there).

### 9.3 Toast adoption pass

Migrated every inline `role="alert"` mutation-failure message identified as
operation-level (not tied to a specific field, would otherwise be easy to
miss or duplicated wording of `ConfirmDialog`'s own `error` slot) to
`useToast`'s error variant, removing the local `error` state entirely where
nothing else used it:

- `dish-detail-actions` — Archive/Restore/Duplicate/Delete failures (Export's
  own Version-list *loading* failure was left inline — that's the dialog's
  only content when it fails, not a mutation result).
- `grocery-list-rows`, `meal-plan-list-view`, `meal-plan-view` (top-level
  banner covering mark-cooked/skipped/start-session/delete-plan),
  `session-card-shell`, `cooking-plan-manager` (move/remove/restore/add/
  delete-session banner), `share-link-list`, `direct-share-received-list`
  (including the non-error "you previously accepted this, but that copy was
  deleted" notice, now a default-variant toast), `direct-share-sent-list`.
- `grocery-list-detail-view` — by far the largest single surface: the
  top-level bucket covering toggle/reopen/complete/duplicate/sync/reorder/
  recategorize/edit-item/remove-item/uncombine/select-variant/acknowledge-
  sync, plus Remove-meal and Delete-list (both already keyed via §9.1's
  `usePendingAction`, so their `ConfirmDialog` `loading` now correctly
  reflects only that action too — the two `loading={isPending}` uses added
  in this same follow-up pass would otherwise have gone stale/misleading
  the moment a checkbox toggle or another action left `isPending` true while
  an unrelated dialog opened), and the Add-meal/Edit-meal/Add-item/Edit-list/
  Apply-refresh dialogs' own save failures. Each dialog's own *content*-load
  failure (Version-list fetch for Add/Edit-meal, the refresh preview fetch)
  was kept inline, same reasoning as Export above.

**Left inline, not migrated — genuinely field-adjacent or content-loading,
not operation-level:** every Version-list/content-loading error noted above;
form-field validation (image upload, paste-import parsing, FDC search);
`meal-plan-view`'s Reuse/Generate dialogs (their own local form state, error
shown right beside the fields being filled in — left as an intentional
exception, not swept for consistency's sake alone).

**Left inline deliberately — a distinct, pre-existing pattern, not the
"dialog stays open" case this pass targeted:** `tag-manager`,
`flavor-profile-manager`, `taster-manager`, `grocery-category-manager`.
These already apply the mutation optimistically (the list updates, the row's
edit state closes) and show a success-or-error `feedback` banner below the
form afterward, reverting the optimistic change on failure. That's a
different, self-consistent interaction model from "keep the dialog open,
toast the failure" — converting it would be a product decision about
whether optimistic-update banners should become toasts app-wide, not a
mechanical migration, so it was left alone rather than guessed at.

**Tests:** added a `dish-detail-actions.test.tsx` case for the Archive
failure path (toast shown, dialog stays open); other migrations reuse
existing success-path test coverage, which was unaffected.

### 9.4 Toast adoption, round two — the remaining files

§9.3 covered the files touched elsewhere in this pass. A dedicated read-only
classification of the ~26 remaining files with inline `role="alert"`
mutation messages (applying the same rule: field-validation stays inline;
operation-level failure not tied to a field → toast; genuinely mixed or
ambiguous → leave alone) found 12 more high-confidence cases, migrated the
same way as §9.3:

`delete-account-dialog` (the delete-account server failure — separate from
the type-to-confirm field, which stays a disabled-button gate, not an inline
message); `cook-sessions-view`'s `ActiveCookSessionCard` (a near-duplicate of
`session-card-shell`'s End-session confirm that hadn't been migrated to
`ConfirmDialog` in §9.2 either — done now, alongside its toast); `cooking-setup`
(start-session failure); `part-attach-picker` (the attach-validation failure,
separate from the picker's own content-load `loadError`); `promote-version-button`
(migrated to `ConfirmDialog` too, missed in §9.2); `grocery-source-picker`
(generate-list failure); `meal-plan-editor` (the planned-meal add/remove
banner — `serverError`, the sticky-footer save failure, was left inline: it's
the form's own guaranteed-visible save-result slot, not a scroll-away risk);
`bulk-publish-dialog` (the publish-call failure, distinct from each
published item's own per-item result already shown in the kept "result"
step); `direct-share-collection-review-dialog` (the partial-failure summary
after processing a batch of accept/decline calls — its own content-load
error stays inline); `save-shared-copy-button` (both the failure and the
non-error "previously saved, copy deleted" notice); `share-dialog` (the
create-link failure, distinct from the kept result screen showing the new
URL).

**Found and fixed a second, independent duplicate toast system:**
`session-review-form.tsx` had its own self-contained `useToast`/`ReviewToast`
implementation (a fixed-position bottom banner, `role="status"`,
auto-dismissing after 4s) — predating the shared toast system per its own
comment ("no app-wide toast system exists yet"). Removed it entirely and
moved its two call sites (Stage-update success/failure) plus the form's
separate inline `error` state (Save/Delete-review failures) onto the shared
`useToast`. This is the same "shared primitive exists, an older caller
reimplements the responsibility itself" pattern the rest of this audit is
about, just found via the toast sweep rather than the initial pass.

**Left inline, not migrated — same reasoning as §9.3:** every remaining
content-loading error (recipe-part-picker's item list, direct-share-preview,
FDC search); field-tied validation (image upload, paste-import,
`dish-editor`'s sticky-footer `serverError`, `preferences-form`).

**Left ambiguous, not guessed at — a single display slot mixes genuinely
different concerns, and splitting it is a real fix, not a mechanical
migration:** `start-timer-dialog` and `convert-section-to-part-dialog` (one
slot serves both client-side field validation and a server failure);
`dish-tag-flavor-editor` (a popover save failure tightly coupled to its own
open/close lifecycle — a legitimate style choice either way);
`fdc-search-picker` (the apply-result sub-case is arguably operation-level
but shares a slot with the content-loading search error); `part-link-fields`
(one derived `error` mixes a detach-operation result with a content-load
result); `part-usage-resolution-dialog` (one slot serves an initial
content-load and two different operation results across a 2-phase workflow);
`paste-import-flow` (the parse failure sits under the pasted-text field —
defensible as either field-tied or operation-level, no clear signal).

**Tests:** updated render helpers across the touched files' existing test
suites to wrap `ToastProvider`/`Toaster` where a bare `render()` would
otherwise throw once the component under test calls `useToast()`; no
behavior assertions needed new cases beyond what already existed, since none
of these files had a pre-existing test exercising their failure path except
where noted.

## Owner intervention recommendation

**Brief sanity check.** After the owner's own verification run: open the
Grocery "Add meal" and Meal Plan "Add/Edit meal" flows against a Recipe/Part
with several saved Versions under one major line and confirm Previous/Next
and the dropdown now select and display the correct Version; open Send
(single item and multi-item) and confirm the success toast + auto-close and
the failure-keeps-dialog-open-with-toast path; open one of the 6
`RecipePartPicker` flows in a narrow/mobile viewport and confirm the search
field's focus ring is no longer clipped on any edge; open Part Detail on a
Part used by 2+ Recipes and confirm the two-column layout at tablet+ width;
exercise a few of the newly-`ConfirmDialog`-backed destructive actions (§9.2)
and a couple of the per-action loading spots (§9.1 — e.g. reordering two
Cooking-plan units in quick succession) to confirm only the clicked control
shows loading; trigger a couple of the newly-toasted failures (§9.3/§9.4,
e.g. Archive a Recipe with the network blocked) to confirm the toast appears
and the dialog stays open with state intact; open a Cooking Session review
(`/cook/[id]` post-cook flow) and change its stage to confirm the
newly-shared toast fires correctly now that `session-review-form`'s own
duplicate toast implementation is gone.

**No further owner decisions pending from this audit.** All three items
raised in the original pass were resolved above (§9.1–§9.4). The dozen
ambiguous cases named in §9.4's last paragraph are deliberately left
unresolved — each needs a specific product/design call (how to split a
mixed field-validation-plus-operation-result display) rather than a
mechanical migration, and none blocks anything else in the app.
