# Slice 6 (pre-gate) — Nested Parts: attach, detach, cycle prevention, create-from-content, usage discovery

**Status:** Pre-gate scope complete, not yet verified. Per `docs/BUILD_PLAN.md`
(lines 169-187), **Review Gate 3 sits inside this slice** — attach/detach/
cycle-prevention may proceed first, but propagation and deletion
materialization are explicitly held for owner review of the transaction
design (Arch §I/§J) before being built. This pass implements everything
Gate 3 allows and stops there; propagation and deletion materialization are
not implemented. No automated tests, lint, typecheck, build, or Playwright
were run — the owner runs `pnpm run verify:all` and returns failures for a
separate debugging pass.

## Completed scope

- **Attach** (§67.1, §68.1): a Recipe or Part may hold top-level and
  Section-nested linked Parts, each pinning an exact target `DishVersion`.
  Attach-time validation (`validatePartAttachment`,
  `src/lib/sections/service.ts`) checks ownership and runs the lightweight
  single-target cycle check before the editor's form state gains the row;
  the authoritative re-check reruns inside `editDish`'s own version-creation
  transaction (§G.4).
- **Detach** (§70.1): `resolvePartVersionForDetach` returns the target
  Version's own shallow content (its Sections/Ingredients/Instructions and
  its own linked Parts, one level), with every `lineageId` stripped so the
  editor always treats it as new local content. Splicing is asymmetric by
  necessity: a top-level detach keeps the target's Sections intact as new
  top-level Sections; a Section-nested detach flattens the target's content
  directly into that Section (this schema has no Section-in-Section
  nesting).
- **Cycle prevention** (§67.3, Arch §G): `src/lib/cycles/reachability.ts`
  is a pure, framework-agnostic BFS over the PartLink graph, unit-tested
  against direct self-reference, indirect cycles, a legitimate
  non-cyclic composition, the same Part reused at two distinct versions,
  a false-positive check for an unrelated Part's own link, a deeper
  indirect cycle, and the depth-guard safety valve (50 levels, §G.6).
  `src/lib/cycles/service.ts` wraps it against real Prisma data.
- **Create a Part from local content** (§69): `promoteLocalContentToPart`
  (§69.2, "Save as reusable Part") is one transaction spanning both
  aggregates — creates the new Part at V1.0 from a selected Section, then a
  new container Version with that Section replaced by a top-level link.
  `saveContentAsNewPart` (§69.3, "Save a copy") creates only the new Part;
  the source is untouched.
- **Usage discovery** (§71): `listCurrentPartUsages` finds a Part's current
  usages (container title — live, per §68.5 — Version label, Section
  placement, whether a newer Part Version exists), scoped to `LIVE` links
  whose container is some Dish's current Version.
- **Editor UI**: `PartLinkFields` (linked-Part row: live title/version,
  Open Part, Detach, Remove), `PartAttachPicker` (search + optional
  historical-Version choice), wired into `SectionFields` (nested) and
  `DishEditor` (top-level); `SaveSectionAsPartDialog` on each Section
  (disabled until the item has been saved once); `PartUsagePanel` on the
  Part detail page.

## Canonical requirements implemented

`PRODUCT_SPEC.md` §67 (composition, cycle prohibition), §68 (attach,
version selection, no inline shared-Part editing, §68.5 live display name),
§69 (create from local content), §70 (detach), §71 (usage discovery).
Architecture Proposal §D.6, §G, §K.4's `src/lib/cycles/` module split.

## Architecture decisions and judgment calls

- **PartLink attach/detach folds into the existing `cookingChanged` bucket**
  (`diffVersionContent`, `schema.ts`) — a linked Part is exactly as
  cooking-adjacent as an Ingredient/Instruction, so it triggers the same
  explicit minor/major choice rather than a new classification bucket. This
  extends the settled §13.2a rule to a case it didn't originally enumerate;
  flagged for owner sanity check, same spirit as prior slices' flagged
  extensions.
- **Top-level PartLinks and Sections have independent position sequences**
  (matches the schema: no shared ordering scheme across the two). Both
  `promoteLocalContentToPart` and a top-level attach append to the
  container's existing top-level links rather than claiming an interleaved
  position. Real, minor design choice — flagged, not silently decided.
- **Detach copies one level, not fully recursively** (§G.5's shallow vs.
  fully-resolved distinction) — a linked Part found inside detached content
  stays a live link to its own target; only the specific detached occurrence
  stops being live. Avoids an unbounded copy of an arbitrarily deep chain
  for an action that's supposed to be surgical.
- **`Dish.currentTitle` used as the target Part's displayed name everywhere**
  in this slice's UI (`PartLinkFields`, `PartUsagePanel`), never
  `DishVersion.title` — per §68.5's already-settled decision (recorded in
  the Slice 5 report's correction section), not re-litigated here.
- **`insertSections`/`withVersionAllocation`/`highestMajorVersion`/
  `nextVersionNumbers` exported from `dishes/service.ts`** so
  `sections/service.ts` reuses the exact same Version-allocation and
  row-creation machinery rather than a second implementation — no new
  transaction pattern introduced for `promoteLocalContentToPart`.
- **No schema/migration change** — `PartLink` was fully defined at Slice 2;
  this slice is the first to exercise it.

## Not implemented (Review Gate 3)

Propagation (`propagatePartUpdate`, §72) and Part-deletion materialization
(`resolvePartUsageBeforeDelete`/`deletePart`, §74) are not built. Their
transaction design is already fully specified in
`ARCHITECTURE_PROPOSAL.md` §I ("Propagate Part update" and "Delete a
referenced Part" rows) and §J (deletion/cascade matrix) — nothing new is
proposed here. The two decisions that specifically need owner sign-off
before that work begins:

1. **Per-item transaction batching for propagation** (§I): each affected
   Recipe/Part gets its own independent transaction, not one giant
   transaction across the whole batch, so a partial failure (e.g. a cycle
   introduced by a concurrent edit) doesn't block the rest. Confirm this
   partial-success model is still wanted before it's built.
2. **Two-phase Part deletion** (§I/§J): interactive per-occurrence
   resolution (detach/replace/remove, each its own version-creation
   transaction), then one final transaction materializing remaining
   historical `PartLink` rows and deleting the Part. Confirm the
   interactive-resolution UX and the "materialize in place" exception to
   immutability (the one other sanctioned exception besides
   `versionNote`/description/image) before it's built.

## Tests written (not run)

- `src/lib/cycles/reachability.test.ts` — 7 cases listed above.
- `src/lib/dishes/schema.test.ts` — PartLink additions to
  `removeEmptySections`/`hasMinimumContent`, and a new `diffVersionContent`
  describe block (attach/detach/re-target/move classification, and a
  false-positive check that an unrelated Section rename doesn't get
  misclassified as a cooking change merely because a linked Part is also
  present).
- `src/lib/sections/sections.integration.test.ts` (new) —
  `validatePartAttachment` (current-version default, historical-version
  choice, direct and indirect self-attach rejection, cross-user rejection),
  `resolvePartVersionForDetach` (lineage stripped, cross-user rejection),
  `promoteLocalContentToPart` (new Part created, Section replaced with a
  link, prior Version preserved, cross-user and empty-Section rejection),
  `saveContentAsNewPart` (source Version history untouched).
- `src/lib/dishes/dishes.integration.test.ts`, new "Slice 6 — linked Parts"
  block — attach/detach through `editDish` requiring the minor/major
  choice and persisting a real `LIVE` `PartLink` row; the authoritative
  save-time cycle rejection; `duplicateDish`/`promoteHistoricalVersion`
  copying `PartLink`s verbatim; `listCurrentPartUsages`/
  `listAttachableParts`.
- Existing fixture builders across `dishes.integration.test.ts`,
  `dish-editor.test.tsx`, `compare.test.ts`, and the images route test
  updated for the new required `partLinks` field (mechanical, not new
  scope — same class of change Slice 5 made for `imageAssetId`).

## Presentation tests deferred

`PartAttachPicker`'s search/selection interaction, `PartLinkFields`'
detach/remove buttons, and `SaveSectionAsPartDialog`'s two-action layout —
new, un-reviewed UI surfaces, per this project's policy of deferring
brittle presentation tests until design review.

## Formal Review Gate 3 checklist

**Pages/workflows to inspect** (combine with anything still open from
Slice 5, since both touch the same editor and detail surfaces):

- Recipe/Part editor: attach a Part (top-level and inside a Section),
  choose a historical Version, detach, remove; confirm the minor/major
  prompt appears for each.
- "Save as reusable Part" vs. "Save a copy as Part" from a Section's
  toolbar — confirm the copy variant truly leaves the source untouched and
  the link variant navigates away correctly (it saves immediately, by
  design — see the dialog's own warning copy).
- Part detail page: "Recipes using this Part" panel, including the
  "newer Version available" indicator.

**Concrete product/design questions:**

- Does "Recipes using this Part" need any action from this panel yet (e.g.
  jump to a specific Section), or is read-only discovery sufficient until
  propagation ships?
- Is `SaveSectionAsPartDialog`'s "saves immediately, leaves the editor"
  behavior acceptable, or should it instead stage the change into the
  current form for the user to review before an explicit Save?
- The three flagged judgment calls above (cookingChanged bucket extension,
  top-level-link position sequencing, one-level detach) — sanity-check
  against product intent.

**Then the two Gate 3 architecture questions** (Not Implemented section
above) need an explicit owner decision before propagation/deletion
materialization begins.

## Owner intervention recommendation

**Full manual review required** — this is a formal Review Gate. It applies
*after* the owner runs `pnpm run verify:all` successfully. Two distinct
things are gated: (1) the product/design questions above, ordinary UI
review scope; (2) the Gate 3 architecture sign-off on propagation and
deletion-materialization's transaction design, which is a prerequisite for
any further Slice 6 work, not merely a UI check. Once both are resolved,
the next pass implements propagation and deletion materialization and
completes Slice 6.
