# DishFrame — Build Plan

**Document status:** Technical planning output, produced per `CLAUDE_PLANNING_PROMPT.md`, derived directly from `ARCHITECTURE_PROPOSAL.md`.
**Scope:** Planning only. No application source, Prisma schema, migration, package, or configuration file was changed to produce this document.

Every slice below references the architecture proposal by section (e.g., "Arch §D.6") rather than re-deriving decisions already made there.

---

## A. Planning Principles

- Every slice ships something a user can actually see and use end-to-end — never "just the model layer" or "just the API" with no reachable UI.
- The working scaffold (auth, deployment, marketing pages, design tokens, CI) is preserved and extended, never rebuilt.
- Tier 1 remains usable at every intermediate milestone: a slice that would leave the app in a half-working state is split until it doesn't.
- Foundational Tier 2 needs (the unified `Dish`/`DishVersion` model, `PartLink.targetDishId`, `Dish` provenance fields, `GroceryList.mode`) are already built into the Tier 1 schema per `ARCHITECTURE_PROPOSAL.md` §A.3 — Tier 2 slices extend behavior, they do not retrofit schema.
- Tier 3 productization (public publication, AI parsing, custom tag groups, advanced social features) is not implemented in any slice below; where a slice's design choice happens to leave a cheap Tier 3 extension point (e.g., the share-snapshot mechanism reused by a future `Publication` table), that is noted, not built.
- Every slice includes tests as part of its own definition of done — testing is never a follow-up slice.
- Explicit stop-and-review checkpoints are placed before the highest-risk domain work, per §D below, matching the eight minimum gates required by the planning prompt.
- Every slice cites the `PRODUCT_SPEC.md` sections it implements, so acceptance criteria are traceable back to the canonical spec rather than to this plan's paraphrase of it.

### Testing cadence during implementation (owner-directed revision)

Testing is proportional to risk and to the size of the increment just built, not exhaustive after every file change:

- Do not re-run the full test suite after every small model, helper, component, or file edit.
- Build a slice coherently first, then run one focused verification pass at the end of that slice — not continuously throughout its construction.
- Run `pnpm check` (or the relevant subset — typecheck/build) once at the slice boundary, not repeatedly during implementation.
- For a new UI flow, run one focused Playwright path covering its primary behavior — not the full e2e suite.
- For backend/domain work, run the focused unit/integration tests needed to verify the specific invariant or transaction just implemented.
- Reserve broad regression suites and the full Playwright suite for the eight Review Gates (§D), the Tier 1 completion gate, the Tier 2 completion gate, or when a failure suggests a wider risk than the immediate change.
- Tests remain **required**, not optional, wherever correctness is high-risk — deletion, versioning, authorization, cycle prevention, snapshots, transaction behavior, the lineage-identity/comparison logic, and the Meal-Plan grocery-reconciliation logic all keep their dedicated coverage exactly as specified per slice below. What changes is *when* the broader suite runs, not *whether* the risky-path tests exist.
- The product owner will also manually inspect and test the product throughout implementation — this plan's "Manual QA targets" per slice are written with that in mind, not as a substitute for the owner's own hands-on testing.

---

## B–C. Slices and Sequence

### Deviation from the prompt's suggested broad sequence

The prompt's broad sequence lists item 3 ("Recipe and Part libraries, creation, detail, editing, archive, and duplication") before item 5 ("Sections, ingredients, quantities, substitutes, images, and scaling"). These cannot actually be built in that order: `PRODUCT_SPEC.md` §8.3 requires that a Recipe cannot be saved without "at least one meaningful local ingredient, local instruction, or linked Part" — meaning a Recipe editor genuinely capable of creating anything real already needs Sections/Ingredients/Instructions built. Item 3 and the structural (non-image, non-scaling) part of item 5 are therefore **one inseparable first vertical slice**, not two sequential ones.

This plan splits the original items 3, 4, and 5 into four slices instead of three, so that each remains an honest, independently completable vertical increment:

- **Slice 2** (was item 2): foundational schema + org metadata — unchanged in scope.
- **Slice 3** (merges the structural halves of items 3 and 5): a real, usable Recipe/Part editor — creation, Sections, Ingredients, Instructions, detail view, edit, archive, duplicate. This is the first slice where "create a Recipe and see it" is actually true.
- **Slice 4** (the rest of item 4): multi-Version behavior — small update vs. new version, historical majors, Version notes, comparison. Meaningfully separable now that single-Version editing already exists from Slice 3.
- **Slice 5** (the rest of item 5): images, quantity scaling/formatting, temporary scaling, unit conversion, preferred units. Meaningfully separable as an enhancement layer on top of the ingredient model Slice 3 already built.

All other items in the prompt's sequence map one-to-one onto a slice below, in the same relative order, and are not otherwise reordered.

### Migration grouping (owner-directed revision)

The product owner has confirmed Tier 1 and Tier 2 are both part of the immediate build (implemented over the following several days), so this plan does not artificially delay Meal Plan, Sharing, Cooking Session, or Grocery tables merely because `PRODUCT_SPEC.md` labels the *features* built on top of them Tier 2 — the schema for all of them is created together, up front, at Slice 2. The complete, literal schema and raw migration SQL are drafted in `prisma/schema.prisma`; the grouping used there is **four migrations, applied together at the Slice 2 boundary**, not one giant migration and not one migration per feature area:

1. **Core content & versioning** — `Dish`, `DishVersion`, `Section`, `Ingredient`, `Instruction`, `PartLink`, `ImageAsset`, `Tag`/`DishTag`, `FlavorProfileValue`/`DishFlavorProfile`, `UserPreference`, `GroceryCategory`, plus the `pg_trgm` extension and the `PartLink` state CHECK constraint.
2. **Cooking & feedback loop** — `CookingSession`, `CookingSessionUnit`, `CookingSessionChecklistItem`, `Timer`, `SessionReview`, `Rating`, `Taster`, `PreferredUnitOverride`, plus the one-active-session-per-Dish partial unique index.
3. **Planning & grocery** — `GroceryList`, `GroceryListSource`, `GroceryListItem`, `GroceryItemContribution`, `MealPlan`, `MealPlanEntry`, `PlannedMeal`, `IngredientCategoryMemory` (the middle three depend on `CookingSession` from migration 2 via `MealPlanEntry.linkedSessionId`; `IngredientCategoryMemory`'s only hard dependency is migration 1's `GroceryCategory`, but it's grouped here for domain cohesion — see `prisma/schema.prisma`).
4. **Sharing** — `ShareLink`, `DirectShare` — kept separate mainly because it is the most privacy/security-sensitive slice of schema (hashed tokens, revocation cascade) and benefits from being reviewable and appliable as one atomic, clearly-bounded unit, even though nothing about it is chronologically later than the others.

This groups by **domain cohesion and foreign-key dependency order**, not by Tier label, per the owner's explicit direction — see `prisma/schema.prisma` for the full rationale and the literal SQL. All four migrations are applied at once, before any Slice 3 UI work begins; Slice 2 below is updated accordingly.

---

### Slice 1 — Application shell extensions, navigation, shared editor foundation

*(prompt sequence item 1)*

- **Objective:** Establish the cross-cutting frontend foundations every later domain slice depends on, without building any domain feature yet.
- **User-visible outcome:** No new user-facing feature. This slice is infrastructure — verified by confirming the existing shell, navigation, and theming continue to work unchanged, plus a small internal component-library addition (empty states, form-field primitives) that later slices will visibly use.
- **Domain entities / schema changes:** None.
- **Migrations:** None.
- **Routes/pages:** None new; confirms existing route groups remain intact.
- **Major components:** Introduce shared form-field wrapper components (label/error/hint layout) and confirm the shadcn primitive set covers what the editor will need (checkbox, select, popover, combobox for tag/cuisine entry) — install any missing shadcn components now via the existing CLI convention.
- **Server Actions / Route Handlers:** None.
- **Validation/authorization:** None new.
- **Tests:** Component tests for the new shared field wrappers.
- **Dependencies:** None — this is the first slice.
- **Completion/acceptance criteria:** `pnpm check` passes; no visual regression on existing marketing/auth/app-shell pages; shared field components render correctly in both themes.
- **Manual QA targets:** Light/dark theme, phone/tablet/desktop breakpoints, keyboard navigation on the new field components.
- **Risks:** Low.
- **Review checkpoint required:** No.

---

### Slice 2 — Foundational domain schema and user-owned organizational metadata

*(prompt sequence item 2)*

- **Objective:** Stand up the full Prisma domain schema from `ARCHITECTURE_PROPOSAL.md` §D in one coherent migration, plus the organizational metadata (Tags, Favorite, Flavor Profiles, Tasters, Grocery Categories, UserPreference) that every later slice depends on.
- **User-visible outcome:** A new signed-in user sees a seeded, editable set of default Grocery Categories and a protected Favorite tag in Preferences; otherwise this slice is mostly invisible until Slice 3 gives it a UI. This is intentionally schema-heavy and UI-light — flagged as such rather than padded with premature UI.
- **Domain entities/schema changes:** The full model set from Arch §D and `prisma/schema.prisma` (validated against the installed Prisma 7.9.0 with `prisma format`/`prisma validate`), including all three Gate 1 review passes (see `ARCHITECTURE_PROPOSAL.md` §D's numbered "round 1/2/3 Correction N" annotations for the account of each pass): `Dish` (with a raw-SQL composite FK enforcing `currentVersionId` belongs to itself, round 3), `DishVersion`, `Section`/`Ingredient`/`Instruction` (`Ingredient`/`Instruction` each carry a denormalized `dishVersionId`, kept consistent with their `Section` via raw-SQL composite FK, so `lineageId` uniqueness can be scoped to the whole Version, round 3)/`PartLink` (each with a persistent, per-Version-unique `lineageId`; container-consistency and target-pairing are both raw-SQL composite FKs rather than Prisma relations, since Prisma cannot layer two relations onto one shared scalar field, round 3), `ImageAsset` (shared, `uploadedByUserId`-attributed rather than owner-scoped, `onDelete: Restrict` on the `DishVersion` side, round 2/3), `PreferredUnitOverride`, `IngredientCategoryMemory` (round 2 — extracted off `Ingredient`), `CookingSession` (with `updatedAt`; its `Dish` relation removed in favor of the composite `DishVersion` relation alone, round 3) + `CookingSessionUnit`/`CookingSessionChecklistItem` (both self-contained per round-1 Correction 3) + `Timer`, `SessionReview`, `Rating` (nullable `dishId`/`dishVersionId` + snapshot fields + pair-consistency CHECK, round 2/3), `Taster`, `Tag`/`DishTag`/`FlavorProfileValue`/`DishFlavorProfile` (all owner-scoped-unique, all with real `User`/`Dish` relations), `GroceryCategory`, `GroceryList` (its Meal-Plan relation is `onDelete: Restrict`, not `SetNull`, round 3)/`GroceryListSource`/`GroceryListItem`/`GroceryItemContribution` (with persisted sync-state tracking and deleted-source snapshots, round 2), `MealPlan`/`MealPlanEntry`/`PlannedMeal` (created now, unused until Slice 15, per Arch §A.3's foundational-Tier-2 principle), `ShareLink` (recoverable `tokenId` + HMAC, round-2 Correction 6; redesigned with separate `currentDishId`/`fixedDishId`+`fixedDishVersionId` field sets per mode, round 3)/`DirectShare` (created now, unused until Slices 16–17), `UserPreference`.
- **Migrations:** Four migrations, applied together at this slice's boundary — see "Migration grouping" above and `prisma/schema.prisma` for the complete literal SQL, including the `pg_trgm` extensions (title and combined search text), the `PartLink`/`Dish`/`GroceryList`/`MealPlan`/`ShareLink` CHECK constraints, the `Rating` value-range check, and the partial unique indexes (one active session per Dish, one owner Taster per user, one Favorite tag per user).
- **Routes/pages:** `/profile` gains a "Preferences" section (measurement system, fractions/decimals, primary rating display, timer sound, review prompt) backed by `UserPreference`; `/tasters` becomes a real page (create/rename/archive/restore/delete); Grocery Categories become editable from Preferences.
- **Major components:** Preference form, Taster list/management, Grocery Category management list.
- **Server Actions:** `preferences/actions.ts` (update), `tasters/actions.ts` (CRUD), `tags/actions.ts` (create/rename/merge/delete, with Favorite protected per Arch §D.10), `grocery/actions.ts` (category CRUD).
- **Validation/authorization:** Zod schemas per module; ownership guard functions introduced now (Arch §K.6) and used by every later slice.
- **Tests:** Unit tests for the Favorite-tag protection rule (cannot rename/merge/delete); integration tests for cascading `ON DELETE` behavior on the new schema (even though most cascades aren't reachable via UI yet, the DB-level behavior can and should be tested now); a new-user seed test (Favorite tag + default Grocery Categories + owner Taster "You" created exactly once).
- **Dependencies:** Slice 1.
- **Completion/acceptance criteria:** Migration applies cleanly to a fresh database and to the existing production schema (additive only, no data loss); every model from Arch §D exists; new-user seed logic verified.
- **Manual QA targets:** Sign in as a fresh user and confirm seeded Favorite tag, default categories, and "You" Taster all appear correctly.
- **Risks:** This is the highest schema-design risk point in the whole project — getting the unified `Dish`/`DishVersion` shape wrong here is expensive to unwind later (Arch §P.1). Mitigated by the review gate below.
- **Review checkpoint required: YES — Review Gate 1** (see §D): stop after the schema is fully drafted and the first migration is written, before applying it, so the schema itself gets a dedicated review pass independent of any UI.

---

### Slice 3 — Recipe and Part creation, detail, editing, archive, and duplication (with Sections/Ingredients/Instructions)

*(prompt sequence items 3 + 5's structural half)*

- **Objective:** Ship the first genuinely usable end-to-end domain feature: create a Recipe or Part with real structured content, view it, edit it, archive it, restore it, duplicate it, delete it.
- **User-visible outcome:** A user can replace a scrap of paper with a real DishFrame Recipe — full-page editor, Sections with Ingredients and Instructions, save creates `V1.0`, library shows it, detail page displays it, archive/duplicate/delete all work.
- **Domain entities/schema changes:** None beyond Slice 2 (schema already complete) — this slice is where it first gets exercised by real UI and Server Actions.
- **Migrations:** None.
- **Routes/pages:** `/recipes`, `/recipes/new`, `/recipes/[dishId]`, `/recipes/[dishId]/edit`, and the equivalent `/parts/*` routes, all built from the single shared `DishEditor` (Arch §C.6).
- **Major components:** `DishEditor` (React Hook Form-backed, Arch §C.6), Section/Ingredient/Instruction dynamic-array sub-forms with reorder, Dish card (grid + list view), unsaved-changes confirmation modal (§15.2 — "Keep editing" primary, "Discard changes" destructive secondary, no Save button in the modal), archive/duplicate/delete confirmation dialogs.
- **Server Actions:** `dishes/actions.ts` — `createDish`, `createDishWithInitialVersion` (Correction 9 naming fix — the `V1.0` case of Arch §F.5's `createNewVersion`, since there's no prior version to be "small" relative to; DishFrame has no draft model, per §15.1, so no function name should imply one), `updateDishMetadata` (Stage/archive), `duplicateDish`, `deleteDish` (**built from this slice onward to already include the share-revocation/pending-direct-share-cancellation step from Arch §I/§H.1** — the `ShareLink`/`DirectShare` tables exist from Slice 2's migrations even though no UI reaches them until Slices 16–17, so this step is a correct no-op today and does not need to be retrofitted later).
- **Validation/authorization:** Zod schema enforcing §8.3's minimum-save rule (title + Stage + at least one meaningful ingredient/instruction/linked-Part — linked Parts arrive in Slice 4, so this slice enforces "ingredient or instruction" as the practical minimum until then); ownership guards from Slice 2 applied to every action.
- **Tests:** Unit tests for the minimum-save validation; component tests for the editor's add/remove/reorder interactions and the unsaved-changes modal; integration test for `createDish` → `V1.0` → `Dish.currentVersionId` pointer set correctly; e2e golden path (create → view → edit → archive → restore → duplicate → delete).
- **Dependencies:** Slice 2 (schema), Review Gate 1 passed.
- **Completion/acceptance criteria:** Every "Recipe creation," "Recipe structure," and "Ingredients" acceptance-criterion bullet in `PRODUCT_SPEC.md` §20 is demonstrably true, except those explicitly depending on multi-Version behavior (deferred to Slice 4) or images/substitutes/scaling (deferred to Slice 5).
- **Manual QA targets:** Create a Recipe with only one ingredient and no instruction (must save); create one with only an unnamed default Section (heading must stay hidden per §9.1); attempt to leave the editor with unsaved changes via in-app navigation (modal must appear) and via a hard refresh (must be allowed to lose changes, per §15.3 — no browser unload prompt required).
- **Risks:** Introducing React Hook Form for the first time in this codebase (Arch §C.6) — moderate learning-curve risk, mitigated by scoping it to exactly one shared component.
- **Review checkpoint required: YES — Review Gate 2** (see §D): stop after this slice for a design-direction review of the editor and detail-page pattern, since every later domain screen (Parts, Cooking Setup, Meal Plans) extends this same visual language.

---

### Slice 4 — Immutable Version history, historical majors, Version notes, and comparison

*(prompt sequence item 4, remaining scope)*

- **Objective:** Add the "Save small update" vs. "Save new version" choice, historical major-line navigation, mutable Version notes, and structured Version comparison on top of the single-Version editing Slice 3 already built.
- **User-visible outcome:** Editing a Recipe now asks which kind of save this is; the Recipe Detail page gains a Version selector (latest-minor-per-major + prev/next, per §13.8) and a "Compare versions" view showing changed fields first.
- **Domain entities/schema changes:** None beyond Slice 2 — this slice exercises `DishVersion.majorVersion`/`minorVersion`/`sourceVersionId`/`versionNote` for the first time.
- **Migrations:** None.
- **Routes/pages:** `/recipes/[dishId]/versions/[versionId]`, `/recipes/[dishId]/compare` (+ Part equivalents).
- **Major components:** Save-choice modal ("Save small update" / "Save new version"), Version selector/pager, Version comparison view (changed-fields-first, grouped by metadata → Sections → linked Parts → ingredients → instructions → nutrition per §94.3's hierarchy). Linked-Part diffing itself only becomes meaningful once nested Parts exist (Slice 6); this slice's comparison view simply does not render a linked-Parts group when a Version has no `PartLink` rows to compare — no placeholder or "coming soon" row is added for a feature that doesn't exist yet (Correction 9), and the linked-Parts comparison group appears automatically, with no separate code path, once Slice 6 lands and real `PartLink` data exists to diff.
- **Server Actions:** `dishes/actions.ts` gains `createSmallUpdate`, `createNewVersion` (Arch §F.5), `promoteHistoricalVersion`, `updateVersionNote`.
- **Validation/authorization:** Version-numbering logic (Arch §F.2–F.5) implemented and unit-tested against the spec's literal examples.
- **Tests:** Unit tests for version-numbering (`V1.9→V1.10→V1.11`, `V5.3→V6.0`, historical-minor-does-not-become-current); integration test for the `Dish.currentVersionId` pointer only moving on a new-major save; comparison-view unit tests against constructed before/after Version pairs, **specifically covering the `lineageId`-based matching from Arch §D.-1** (an unchanged ingredient whose `lineageId` carried forward is a non-change even if its position shifted; a `lineageId` present in the old Version but absent from the new one is a removal, not a silent disappearance; a `lineageId` with no predecessor is an addition, never confused with an edited pre-existing row); e2e test walking a `V1.0→V1.1→V2.0` history and confirming the selector/pager behavior from §13.8.
- **Dependencies:** Slice 3, Review Gate 2 passed.
- **Completion/acceptance criteria:** Every "Versions" acceptance-criterion bullet in `PRODUCT_SPEC.md` §20 is true (except the Part-propagation-specific version note format, deferred to Slice 6); Version Comparison acceptance criteria in §96 are true for non-Part-link content.
- **Manual QA targets:** Edit a historical major line's small update and confirm it does not replace the current Version; promote a historical major and confirm it does; delete a Version note and confirm no other Version content changes.
- **Risks:** Low — this slice is additive logic on an already-correct schema.
- **Review checkpoint required:** No.

---

### Slice 5 — Images, quantity scaling, temporary scaling, and unit conversion

*(prompt sequence item 5, remaining scope)*

- **Objective:** Round out the content model with the one-image-per-Version behavior, substitutes, precise quantity handling, temporary/default-batch scaling, and safe unit conversion.
- **User-visible outcome:** Recipes/Parts can have a photo; ingredients can carry a substitute; a user can view a Recipe "for 9 servings" without cooking it, and save that as the new default batch presentation; compatible-unit suggestions appear (e.g., "16 tbsp → 1 cup").
- **Domain entities/schema changes:** None beyond Slice 2 (`ImageAsset`, `DishVersion.imageAssetId`, `substituteForIngredientId`, `defaultBatchQuantity/Unit`, `PreferredUnitOverride` all already exist) — this slice wires them up.
- **Migrations:** None.
- **Routes/pages:** No new routes; the existing editor and detail pages gain image upload, substitute fields, and a scaling control. A new `/api/images/[assetId]` Route Handler serves images (Correction 11 — private store; the route authorizes either an owning session or a valid, unrevoked `ShareLink` token for the relevant `dishId`, never a bare public Blob URL).
- **Major components:** Image upload widget (signed-URL flow against a **private** Vercel Blob store, Arch §L), substitute sub-field on the Ingredient row, temporary-scaling control + "Save as default" action, unit-conversion suggestion chip + "Save this unit for this ingredient" action (writing a `PreferredUnitOverride` row targeted at the specific `ingredientLineageId`, Correction 6 — not a blanket per-Dish setting).
- **Server Actions/Route Handlers:** `dishes/actions.ts` gains `requestImageUploadUrl` (issues the signed, ownership-validated Blob token; creates the `ImageAsset` row and sets `DishVersion.imageAssetId` inside the same version-save transaction, Arch §D.2a/§M), `setDefaultBatchScale`, `savePreferredUnitOverride` (Correction 6); a small `nutrition`-adjacent `units/` module implements the quantity-scaling and fraction-formatting pure functions from Arch §F.8/§P.1.
- **Validation/authorization:** Server-side MIME-type/size validation before issuing an upload token (Arch §M); substitute recursion guard (`substituteForIngredientId` cannot itself already be a substitute, Arch §D.4); the image-serving route's dual authorization path (owner session OR valid share token) is a dedicated test target given it is the one place private image data is exposed to a non-owner.
- **Tests:** Unit tests for quantity scaling (single values, ranges, approximate values, free-text fallback, counts producing fractional values) directly against the §52 examples; unit tests for unit-conversion simplification (`6 tsp → 2 tbsp`, `1,000 g → 1 kg`); integration test for image inheritance on new Versions (§12.2) via the `imageAssetId` FK and for the **query-based reference-counted cleanup** on delete/replace (Arch §D.2a — an `ImageAsset` referenced by two Versions must survive one of them being superseded, and must be deleted, with exactly one Blob-delete call, once the count truly reaches zero — this test should also be written or extended once duplication/sharing exists, Slices 6/16, to confirm an `ImageAsset` survives across the *account* boundary the same way it survives across Versions); component test for the substitute field; unit test for `PreferredUnitOverride` correctly targeting one ingredient lineage without affecting a different ingredient in the same unit family.
- **Dependencies:** Slice 3. **A private Vercel Blob store must be provisioned before this slice starts** (Correction 11 — an owner-approved Marketplace action, not something a prior slice performs; the choice of *which* store and *what access model* is already settled, only the provisioning action itself remains).
- **Completion/acceptance criteria:** "Images" acceptance criteria in §20 are true; §51/§52/§53's scaling and conversion behaviors are all demonstrable; a Recipe with no image remains fully usable and visually coherent (§12.3).
- **Manual QA targets:** Upload an image, create a new Version, confirm inheritance; remove an image on one Version and confirm historical Versions keep theirs *and* the underlying `ImageAsset`/Blob object is not deleted while the historical Version still references it; scale a Recipe with a free-text ingredient ("salt to taste") and confirm it does not change; confirm a logged-out viewer cannot fetch an image URL directly without a valid share token.
- **Risks:** First integration with an external storage provider in this codebase — moderate risk, isolated to the upload widget and two Server Actions.
- **Review checkpoint required:** No.

---

### Slice 6 — Nested Parts, Part usage, detaching, propagation, cycle prevention, and deletion materialization

*(prompt sequence item 6)*

- **Objective:** Implement the product's core differentiator — reusable Parts nested inside Recipes and other Parts, with safe propagation and safe deletion.
- **User-visible outcome:** A user can attach a saved Part to a Recipe Section (or top-level), see "Recipes using this Part," update a Part and choose to propagate that update, detach a Part into local content, convert local content into a new reusable Part, and permanently delete a Part with current usages safely resolved first.
- **Domain entities/schema changes:** None beyond Slice 2 — `PartLink` is exercised for the first time, including its cycle-prevention and materialization behavior (Arch §D.6/§G/§H).
- **Migrations:** None.
- **Routes/pages:** No new top-level routes; the editor gains "Attach a Part" / "Save as reusable Part" / "Open Part" actions; Part Detail gains a "Recipes using this Part" panel.
- **Major components:** Part-attach picker (with Version selection, defaulting to current per §68.1), "Recipes using this Part" list, propagation review flow ("Update everywhere" / "Choose Recipes and Parts to update" / "Do not update"), Part-deletion resolution flow (list of current usages with detach/replace/remove per occurrence).
- **Server Actions:** `sections/actions.ts` gains `attachPartLink` (creates a new `PartLink` with a fresh `lineageId` for a genuinely new attachment, `linkState = LIVE`), `detachPartLink`, `promoteLocalContentToPart` (Arch §I's "convert local content → reusable Part" transaction), `saveContentAsNewPart` (the "Save a copy as Part" variant, §69.3); `dishes/actions.ts` gains `propagatePartUpdate` (per-item transaction batch, Arch §I — targets specific `PartLink.lineageId` occurrences per Correction 1, so §72.5's "select every matching occurrence while allowing occurrences to be excluded individually" operates on stable occurrence identity rather than re-matching by position/content each time), `resolvePartUsageBeforeDelete`, `deletePart` (final materialize-then-delete transaction — **also performs the share-revocation/pending-direct-share-cancellation step from Arch §I/§H.1, same as `deleteDish` in Slice 3**, since a Part is deletable and shareable exactly like a Recipe).
- **Validation/authorization:** The cycle-prevention reachability check (Arch §G.3) is implemented here as its own unit-tested module (`src/lib/cycles/`) and wired into both the attach-time and save-time validation points (Arch §G.4); the "PartLink targets must be `kind = PART`, and only while `linkState = LIVE`" invariant (Correction 2, Arch §D.6) is enforced and tested.
- **Tests:** Unit tests for the cycle-detection function (direct self-reference, indirect cycles, and explicitly the "distinct versions, not actually a cycle" case that must be allowed — Arch §O); integration tests for propagation (minor update, major update, "choose items" partial selection, postponement, and specifically **occurrence-level selection when the same Part appears twice in one item, verified via distinct `lineageId`s**) and for the full Part-deletion flow (current-usage resolution → historical materialization → final delete, verifying (a) the `linkState` CHECK constraint accepts the materialized state and rejects a row with both live and materialized fields set, and (b) historical `PartLink` rows read correctly with `materializedContent` afterward and no dangling references); e2e test nesting a Part inside a Recipe, updating the Part, and propagating.
- **Dependencies:** Slices 3, 4, 5.
- **Completion/acceptance criteria:** Every "Parts," "Propagation," and "Part lifecycle" acceptance-criterion bullet in `PRODUCT_SPEC.md` §96 is true.
- **Manual QA targets:** Attempt to attach a Part to itself (must be rejected); attempt an indirect cycle (must be rejected); delete a Part currently used by two Recipes and confirm both are resolved before deletion proceeds and both retain intelligible historical content afterward.
- **Risks:** The single highest-complexity domain slice in Tier 1 (nested composition + propagation + the one sanctioned exception to immutability). This is exactly why the planning prompt calls for a dedicated gate here.
- **Review checkpoint required: YES — Review Gate 3** (see §D): stop before implementing propagation and deletion materialization specifically — Part attachment/detachment/cycle-prevention may proceed first, but propagation and deletion materialization are held for explicit review of the transaction design in Arch §I/§J before being built.

---

### Slice 7 — Cooking Setup and Cooking Session lifecycle

*(prompt sequence item 7)*

- **Objective:** Implement the mandatory pre-cook planning step and the full Cooking Session state machine (In progress / Completed / Ended early), without yet building the focused cooking-mode UI (that's Slice 8).
- **User-visible outcome:** "Prepare to cook" opens a real, prefilled setup (units, order, scale) that can be edited or canceled; "Start cooking" creates a real session; sessions can be edited while active, resumed, and ended (Finish / End early / Keep cooking).
- **Domain entities/schema changes:** None beyond Slice 2 — `CookingSession`/`CookingSessionUnit`/`CookingSessionChecklistItem`/`Timer` are exercised for the first time (timers get UI in Slice 8, but the schema and start/end lifecycle are built now).
- **Migrations:** None.
- **Routes/pages:** `/recipes/[dishId]/cook`, `/parts/[dishId]/cook` (Cooking Setup — transient client state, no persistence until submit, per Arch §D.7 note), `/cook` (active/recent sessions index), `/cook/[sessionId]` (session shell — minimal, without focused Cooking Mode UI yet).
- **Major components:** Cooking Setup screen (unit include/exclude/reorder, scale target, nested-Part independent selection per §23.4), session-conflict prompt (Resume/End/Cancel, §26.2), active-session index list with stale-session attention treatment (§26.6).
- **Server Actions:** `cooking/actions.ts` — `startCookingSession` (the one transaction from Arch §I creating `CookingSession` + all `CookingSessionUnit`/`CookingSessionChecklistItem` rows from the client-held setup selection, **populating each row's self-contained display fields — `label`, `sourceDishTitle`, `sourceDishVersionLabel`, `displayText`/`displayQuantity`/`displayUnit` per checklist item — at creation time, per Correction 3**, so the session remains fully readable even after its source is later edited or deleted), `editActiveSessionPlan` (add/remove/restore/reorder units, §27.1–27.3), `endCookingSession` (Finish/End early).
- **Validation/authorization:** The one-active-session-per-Dish partial unique index (raw migration SQL, already applied as part of Slice 2's migration 2, Correction 9) supplies the authoritative concurrency guard; this slice implements the friendly-error mapping that catches the resulting constraint violation and surfaces it as the resume/end/cancel prompt (§26.2) rather than a raw error; "removing the final unit" guard (§27.4 — offers Delete session / Keep editing, never silently deletes).
- **Tests:** Integration test for the one-active-session-per-Dish constraint (including the race-condition case — two near-simultaneous `startCookingSession` calls, one must fail cleanly on the partial unique index, not merely on an application-level check that a race could slip past); test for "removed after progress" evidence preservation (§27.3); **integration test proving a `CookingSessionUnit`/`CookingSessionChecklistItem` still renders correctly (label, quantities, source title/Version label all intact) after its source Section/Ingredient/Dish is deleted (Correction 3 — the whole point of self-contained history)**; e2e test for the full setup → start → edit-while-active → end-early path.
- **Dependencies:** Slices 3, 4, 6 (a session needs a real Dish/Version, and ideally at least one Part-containing Recipe to exercise nested-unit selection, though that's not a hard blocker).
- **Completion/acceptance criteria:** "Cooking entry and plan," "Cookable units," "Source integrity," "Lifecycle and concurrency," and "Active-session editing" acceptance-criteria groups in `PRODUCT_SPEC.md` §42 are all true.
- **Manual QA targets:** Start a session, attempt to start a second concurrent session for the same Recipe (must offer resume/end/cancel); remove a unit after checking some items, confirm the evidence survives in session history even though it's hidden from the active view.
- **Risks:** Moderate — the concurrency guard must be verified under genuine race conditions, not just sequential test calls.
- **Review checkpoint required: YES — Review Gate 4** (see §D): stop before this slice begins, to review the Cooking Session persistence model (Arch §D.7/§I) and confirm the transient-Cooking-Setup decision before it's built.

---

### Slice 8 — Cooking-mode focus, progress, scaling, and persistent timers

*(prompt sequence item 8)*

- **Objective:** Build the actual kitchen-facing Cooking Mode interface — the dedicated, larger, calmer layout described in Arch §C.8 — with checkoffs, unit-focus switching, mid-session scaling, and multi-timer support.
- **User-visible outcome:** A phone/tablet-first, focused interface: one unit at a time, ingredient/instruction checkoffs, quick switching between units, visible overall progress, and independently running named timers that survive navigation/refresh/device switch.
- **Domain entities/schema changes:** None beyond Slice 2.
- **Migrations:** None.
- **Routes/pages:** `/cook/[sessionId]` gains its dedicated layout (Arch §C.8) and full interactive implementation.
- **Major components:** Unit-focus panel/switcher, checklist item component, timer widget (create/name/start/pause/resume/reset/add-remove-time/complete-dismiss, multiple simultaneous), mid-session scale control (whole-session and per-unit, §24.4), scaling-conflict flag (completed items that no longer match a new scale, §24.5).
- **Server Actions:** `cooking/actions.ts` gains `toggleChecklistItem`, `completeUnit`, `updateTimer` (start/pause/resume/reset/adjust — last-write-wins per Arch §I, no cross-device real-time sync required), `updateSessionScale`.
- **Validation/authorization:** None beyond existing session-ownership guard.
- **Tests:** Component tests for checkoff toggling, timer controls, and unit-focus switching; integration test for timer persistence (target end time survives a simulated refresh/reload); unit test for the scale-conflict flagging logic (§24.5's upward/downward cases); e2e test running a session with two simultaneous timers across two units.
- **Dependencies:** Slice 7, Review Gate 4 passed.
- **Completion/acceptance criteria:** "Cooking mode," "Timers," and the scaling portions of §42's acceptance criteria are true.
- **Manual QA targets:** Start two timers on two different units, refresh the page, confirm both persist correctly; scale a session down mid-cook and confirm completed-but-now-excess quantities are clearly flagged without implying removal; verify the dedicated Cooking Mode layout on phone, tablet, and desktop.
- **Risks:** Timer persistence correctness (target-end-time math across refresh/timezone) is the main technical risk; mitigated by dedicated integration coverage.
- **Review checkpoint required:** No (already covered by Gate 4 before Slice 7).

---

### Slice 9 — Session Reviews, Cooking notes, Tasters, ratings, and the learning loop

*(prompt sequence item 9)*

- **Objective:** Close the "Save → cook → evaluate → revise" loop: Session Review, Cooking notes, Taster ratings, rating summaries, provisional ratings, and Stage-change suggestions after cooking.
- **User-visible outcome:** After ending a session, "Want to record how it went?" leads to a real Review form (What went well / What did not go well / Anything else, optional Taster ratings, optional actual-amount-made); ratings and summaries appear on Recipe/Part cards and detail pages; gentle Stage-progression suggestions appear after meaningful use.
- **Domain entities/schema changes:** None beyond Slice 2 — `SessionReview`/`Rating` exercised for the first time.
- **Migrations:** None.
- **Routes/pages:** `/cook/[sessionId]/review`.
- **Major components:** Session Review form, per-Taster star-rating input, rating summary badge (compact `★ 4.6/5` and provisional `~4.6/5` variants per §36.4–36.5), "Edit recipe / Change Stage / Done" post-review actions (§39.2), Stage-progression suggestion banner.
- **Server Actions:** `reviews/actions.ts` — `saveSessionReview` (the "only persist if meaningful" rule from Arch §D.8, transactionally covering `SessionReview` + `Rating` rows), `deleteSessionReview` (with the explicit ratings-will-be-removed warning, §33.6), `updateCookingNotes`.
- **Validation/authorization:** The "at most one rating per Taster per session per rated item" unique constraint (Arch §D.8) is exercised; the "empty Review is never stored" rule is enforced in the service function, not the client.
- **Tests:** Unit test for the "meaningful content" gate (text-only, rating-only, and duration/amount-only all count; nothing at all does not); integration test for rating-summary aggregate queries (session average, per-Taster average, all-time average, computed at read time per Arch §I) directly against §36.3's list; unit test for provisional-rating display/sort behavior (`~4.2/5` sorting between `4.3/5` and `4.1/5`, §48.4); e2e test for the full end-session → review → rate → see summary path.
- **Dependencies:** Slices 7, 8.
- **Completion/acceptance criteria:** "Notes and Reviews," "Tasters and ratings," and "Learning loop" acceptance-criteria groups in `PRODUCT_SPEC.md` §42 are true.
- **Manual QA targets:** Save a Review with only a Taster rating and no text (must be stored, must not be a "draft"); delete a Review and confirm the session log, checklist progress, timers, and Cooking notes all survive; confirm a duplicated Recipe with no sessions yet shows the correct provisional/starting-point rating distinction from §19.4.
- **Risks:** Low-moderate — the main subtlety is the "meaningful content" gate and provisional-rating sort behavior, both directly unit-testable against spec examples.
- **Review checkpoint required:** No.

---

### Slice 10 — Search, filtering, sorting, tags, Favorite, cuisine, and Flavor profiles

*(prompt sequence item 10)*

- **Objective:** Make the libraries genuinely usable at scale: search, multi-category filters, sorting, tag management UI, Favorite toggle, cuisine entry with suggestions, and Flavor-profile selection.
- **User-visible outcome:** `/recipes` and `/parts` gain a real search box, filter chips (Stage/tags/cuisine/Flavor profiles/rating), sort control, and visible active-filter state with per-criterion and clear-all controls.
- **Domain entities/schema changes:** None beyond Slice 2 — this is where the denormalized `Dish.currentTitle`/`Dish.currentStructuralSearchText` fields and their trigram indexes (Arch §D.1/§N, round-3 Correction 6) are actually populated and queried for the first time. Search checks `currentTitle` for rank tiers 1–3 (exact/prefix/partial title), then a **live** query against `Dish.cuisine` (tier 4), then a **live** join against `DishTag`/`Tag` (tier 6) and `DishFlavorProfile`/`FlavorProfileValue` (tier 5), then `currentStructuralSearchText` (tier 7, structural — Section names + the exact linked Part-Version titles the current Version actually references). Cuisine/tag/Flavor-profile matching is never denormalized, specifically so no mutation elsewhere in the product (cuisine edit, tag rename, Flavor-profile merge) needs to remember to refresh a search field.
- **Migrations:** None — the `pg_trgm` extension and both trigram indexes were already applied as part of Slice 2's Migration 1.
- **Routes/pages:** No new routes; `/recipes` and `/parts` gain full interactive filtering.
- **Major components:** Search input, filter-chip bar, sort dropdown, Favorite toggle (one-tap, backed by the protected Tag), cuisine combobox with per-user suggestions, Flavor-profile multi-select.
- **Server Actions:** Extends `dishes/queries.ts` with the full filter/sort/search query builder (AND across categories, OR within a category except tags/Flavor-profiles which use match-all per §47.6–47.7).
- **Validation/authorization:** None beyond existing ownership scoping (search/filter queries are always additionally scoped by `ownerId`).
- **Tests:** Unit tests for filter-combination logic (AND across categories, OR within Stage/cuisine, match-all for tags and Flavor profiles) directly against §47's examples; unit tests for sort behavior (unrated-last on rating sorts, never-cooked-first on "Least recently cooked," provisional ratings participating numerically per §48.4); unit test for the search ranking hierarchy (round-3 Correction 6 — an exact title match ranks above a cuisine match even when the cuisine match is also a substring of the title, confirming `currentTitle` is genuinely checked before the live cuisine/tag/Flavor-profile queries and the `currentStructuralSearchText` fallback); integration test confirming a cuisine edit, a tag rename, and a Flavor-profile merge are all immediately reflected in search with no explicit "refresh search" step, since none of the three is denormalized; e2e test exercising a multi-criterion filter and confirming the visible active-filter chips match §47.8's example.
- **Dependencies:** Slices 3, 6, 9 (rating/Flavor-profile/tag data must exist to filter/sort against meaningfully).
- **Completion/acceptance criteria:** "Library," "Search," "Tags and cuisine," and "Filters and sorting" acceptance-criteria groups in `PRODUCT_SPEC.md` §65 are true.
- **Manual QA targets:** Confirm archived items never appear except via explicit Stage=Archived filter; confirm ingredient names are never searchable (§44.3); confirm a no-results state is visually distinct from an empty library.
- **Risks:** Low.
- **Review checkpoint required:** No.

---

### Slice 11 — Deterministic import, Recipe Gallery migration, export, and backup

*(prompt sequence item 11)*

- **Objective:** Let the product owner actually migrate off their prior recipe system, and let any user get a full private backup or a single-item export.
- **User-visible outcome:** `/recipes/import` accepts pasted text and proposes a structured Recipe for review before saving; a dedicated one-time Recipe Gallery migration path exists; `/profile` gains "Export my data" (full backup) and each Dish gains an "Export" action (standard / detailed / full-private-history tiers per §55.3–55.5).
- **Domain entities/schema changes:** None beyond Slice 2.
- **Migrations:** None.
- **Routes/pages:** `/recipes/import`, a one-time `/import/gallery` utility route; `/api/export/account`, `/api/export/dish/[dishId]` Route Handlers (Arch §K.2/§L).
- **Major components:** Paste-and-review importer (raw text → proposal → review/correct → confirm, Arch §L's swappable-first-stage pipeline), Recipe Gallery migration preview screen, export-tier picker with the required privacy warnings (§55.1/§55.5).
- **Server Actions/Route Handlers:** `importExport/actions.ts` — `proposeImportFromPaste`, `confirmImport` (funnels into the normal `createDish`/`createNewVersion` path, never bypassing it, per Arch §L); `importExport/routes` — the two export Route Handlers, backed by the field-whitelisting DTO builder from Arch §M.5 that excludes secrets by construction.
- **Validation/authorization:** Import confirmation always requires the same minimum-save validation as ordinary creation (§56.1); export DTOs are unit-tested to guarantee no auth/session/token field can ever appear in output.
- **Tests:** Unit tests for the deterministic paste parser against a range of realistic pasted formats (headings, ingredient lines, numbered steps); unit test proving the export DTO cannot serialize a password/session/token field even if one is accidentally added to the underlying query (a "poison field" regression test); e2e test for paste → review → correct a misparsed field → confirm → see it in the library; integration test for full-account backup covering every model in Arch §D.
- **Dependencies:** Slices 3, 6 (import must be able to produce Sections/Ingredients/Instructions and, ideally, recognize existing Parts for DishFrame-to-DishFrame import, though Part-recognition is best-effort).
- **Completion/acceptance criteria:** "Export and import" acceptance-criteria group in `PRODUCT_SPEC.md` §65 is true.
- **Manual QA targets:** Cancel an import before confirmation and verify nothing was created; export a full account backup and confirm no secrets appear anywhere in the file; import content with a likely-duplicate title and confirm the warning appears without blocking.
- **Risks:** The deterministic paste parser's accuracy is inherently limited by input variety — mitigated by the mandatory review step (§56.1), which the architecture treats as non-negotiable, not a nice-to-have.
- **Review checkpoint required:** No.

---

### Slice 12 — Standalone grocery lists and grocery categories

*(prompt sequence item 12 — final Tier 1 slice)*

- **Objective:** Generate a grocery list from one or more Recipes/Parts, with safe combination, category grouping, and full list-management behavior.
- **User-visible outcome:** `/grocery-lists` and `/grocery-lists/[id]` let a user select source items and quantities, generate a categorized, editable, checkable list; combined items show their source breakdown and can be uncombined; completing a list freezes it as history.
- **Domain entities/schema changes:** None beyond Slice 2 — `GroceryList`/`GroceryListSource`/`GroceryListItem`/`GroceryItemContribution` (Correction 4) exercised for the first time, in `STANDALONE` mode only (`MEAL_PLAN_LINKED` arrives in Slice 15).
- **Migrations:** None.
- **Routes/pages:** `/grocery-lists`, `/grocery-lists/[id]`.
- **Major components:** Source-selection screen (pick Recipes/Parts + target amount per source), generated-list view (category groups, checkoffs, manual-item add, combined-item expandable breakdown backed by real `GroceryItemContribution` rows rather than a JSON blob, uncombine/keep-separate controls), list completion/reopen/duplicate/delete actions.
- **Server Actions:** `grocery/actions.ts` — `generateGroceryList` (the one transaction from Arch §I: `GroceryList` + `GroceryListSource` (with its durable `sourceDishTitleSnapshot`/`sourceDishKindSnapshot`/`sourceDishVersionLabelSnapshot`, round-2 Correction 4) + `GroceryListItem` + one `GroceryItemContribution` row per source ingredient occurrence, values denormalized at generation time per Arch §H so later Recipe/Part edits never silently rewrite the list — combination groups matching contributions under one displayed `GroceryListItem`, and assigns each item's category by first checking `IngredientCategoryMemory` for that normalized ingredient name (round-2 Correction 8) before falling back to "Other"), `refreshGroceryListSource` (same-major-only prompt per §60.4, with a diff preview before confirming per §60.5), `toggleGroceryItem`, `combineItems`/`uncombineItem` (re-partitions `GroceryItemContribution` rows across `GroceryListItem`s, per Arch §D.11), `recategorizeItem` (updates the displayed item's category **and** upserts the corresponding `IngredientCategoryMemory` row — never touches any Dish/Version, so it never creates a Recipe/Part Version), `completeGroceryList`.
- **Validation/authorization:** The "safe combination only" matching logic (name equivalence + compatible units) is implemented as its own unit-tested pure function, deliberately conservative per §61.2's examples (does not combine `1 can tomatoes` with `400 g tomatoes`, or `2 onions` with `1 cup diced onion`).
- **Tests:** Unit tests for the combination-matching function directly against §61's examples (both the "should combine" and "should not combine" cases); integration test proving a generated list's items do not change when the source Recipe is later edited (§60.3), and specifically that a `GroceryListSource`/`GroceryListItem` remains fully readable from its own snapshot fields even after the source Recipe/Part is *permanently deleted*, not just edited (round-2 Correction 4); integration test for uncombine correctly re-partitioning `GroceryItemContribution` rows back into separate `GroceryListItem`s without losing any contribution; unit test confirming `recategorizeItem` updates `IngredientCategoryMemory` without touching any `DishVersion` row; e2e test for generate → check off → complete → confirm it's frozen and unaffected by later source edits.
- **Dependencies:** Slices 3, 5 (optional ingredients/substitutes must exist to test §62's grocery-specific behavior).
- **Completion/acceptance criteria:** "Grocery lists" acceptance-criteria group in `PRODUCT_SPEC.md` §65 is true. **This is the last Tier 1 slice** — at its completion, every Tier 1 acceptance-criteria section in `PRODUCT_SPEC.md` (§20, §42, §65, and the Parts/propagation portions of §96) should be independently verifiable.
- **Manual QA targets:** Generate a list from two Recipes sharing an ingredient in compatible units (must combine, with source breakdown visible); generate one with an optional ingredient (must appear, marked optional, removable); confirm a deleted source Recipe does not break an already-generated list (§60.6).
- **Risks:** Low — the combination logic is the only nontrivial algorithm, and it is deliberately conservative by spec design, not something this plan needs to make more ambitious.
- **Review checkpoint required: YES — Review Gate 5** (see §D: "at Tier 1 completion before beginning Tier 2"). This gate sits at the end of this slice.

---

## Tier 2

### Slice 13 — USDA FoodData Central nutrition lookup and expanded nutrients

*(prompt sequence item 13)*

- **Objective:** Add sourced nutrition lookup on top of the manual nutrition fields Slice 3/5 already support.
- **User-visible outcome:** While editing nutrition, a user can search FDC (generic or branded foods), select a result, see it populate calories/macros plus an expandable "More nutrients" area, edit any value afterward, and detach it back to fully manual data at any time.
- **Domain entities/schema changes:** None — `nutritionSourceProvider`/`nutritionSourceId`/`moreNutrients` already exist on `DishVersion` (Arch §D.2).
- **Migrations:** None.
- **Routes/pages:** No new routes; the editor's nutrition section gains FDC search.
- **Major components:** FDC search-and-select combobox, "More nutrients" expandable panel, "Detach from source" action.
- **Server Actions:** `nutrition/actions.ts` — `searchFdc` (proxies to `src/lib/nutrition/fdc-client.ts`, Arch §L — reads the server-only `FDC_API_KEY` env var, already configured; never reaches the client), `applyFdcResult` (free to edit while the Version is still unsaved — no persistence yet), `detachNutritionSource` (Correction 5 — **not** an in-place update to an already-saved `DishVersion`; while composing an unsaved edit it simply clears the pending form's source fields, and if invoked as an action against an already-saved current Version it goes through the ordinary `createSmallUpdate` path from Slice 4, exactly like any other content edit).
- **Validation/authorization:** FDC responses are shaped/whitelisted server-side before returning to the client (never pass through raw FDC payloads with unrelated fields).
- **Tests:** Unit test for the FDC response-shaping function (only recognized, labeled nutrients surface, per §54.6); integration test proving `detachNutritionSource` against an already-saved Version creates a new Version rather than mutating the existing row (Correction 5 — this is the one test in this slice most worth getting right, since it's guarding against silently reintroducing a second immutability exception); component test for the search-and-select flow with a mocked FDC client (no live network calls in CI).
- **Dependencies:** Slice 5. The FDC API key is already registered and configured (`FDC_API_KEY`, both locally and in Vercel) — no external setup step remains before this slice starts.
- **Completion/acceptance criteria:** The FDC-related bullets in "Nutrition" (§65) and §54.4/§54.6 are true.
- **Manual QA targets:** Search a generic food, apply it, edit the calorie value afterward, confirm it stays editable; detach and confirm the item becomes indistinguishable from manually-entered nutrition.
- **Risks:** External API reliability/rate limits — mitigated by keeping FDC entirely optional and non-blocking (manual entry always remains available, per §54.4).
- **Review checkpoint required:** No.

---

### Slice 14 — Optional barcode lookup

*(prompt sequence item 14)*

- **Objective:** Add camera-based UPC/EAN scanning as a convenience path into the same FDC branded-food search from Slice 13.
- **User-visible outcome:** An optional "Scan barcode" action requests camera access, decodes a retail barcode client-side, and looks up the matching branded FDC result; falls back to text search on any failure.
- **Domain entities/schema changes:** None.
- **Migrations:** None.
- **Routes/pages:** None new; an additional entry point into the Slice 13 nutrition search.
- **Major components:** Camera-permission-gated scanner component (client-side decoding only, Arch §L).
- **Server Actions:** Reuses `searchFdc` from Slice 13 with a GTIN/UPC parameter.
- **Validation/authorization:** Camera access requested only after explicit user action, never on page load.
- **Tests:** Unit test for the decode-to-FDC-lookup handoff (mocked decoder); component test for the permission-denied/unsupported-browser fallback path.
- **Dependencies:** Slice 13.
- **Completion/acceptance criteria:** §54.7's barcode bullets are true, including graceful fallback to text search.
- **Manual QA targets:** Deny camera permission and confirm the fallback to text search is smooth, not a dead end; test on at least one browser without reliable camera API support and confirm no broken state.
- **Risks:** Cross-browser camera/decoding quality is the spec's own named risk (§54.7) — if implementation or QA cost proves disproportionate, the spec explicitly permits deferring this specific slice to Tier 3 without touching the nutrition data model. This plan recommends attempting it here first and making that call based on real browser testing, not before.
- **Review checkpoint required:** No.

---

### Slice 15 — Meal Plans, planned meals, recommendations, and live grocery synchronization

*(prompt sequence item 15)*

- **Objective:** The most algorithmically intricate Tier 2 slice — batch-oriented Meal Planning with explainable recommendations and a grocery list that stays synchronized with the plan while active.
- **User-visible outcome:** `/meal-plans` and `/meal-plans/[id]` let a user build a date-range plan from Recipe/Part entries, allocate expected yield to planned meals, see explainable suggestions, track entry status (Planned/In progress/Cooked/Skipped) linked to real Cooking Sessions, and generate a grocery list that stays live-synced to the plan until completed.
- **Domain entities/schema changes:** None — `MealPlan`/`MealPlanEntry`/`PlannedMeal` and `GroceryList.mode = MEAL_PLAN_LINKED` already exist (Arch §D.12/§A.3).
- **Migrations:** None.
- **Routes/pages:** `/meal-plans`, `/meal-plans/[id]`.
- **Major components:** Plan builder (date range, entry add/remove, planned-meal allocation blocking over-allocation per §77.2 rather than merely warning about it), recommendation panel (explainable priority ordering per §80.1–80.2), entry-status tracking wired to Cooking Session start/end, linked grocery-list view.
- **Server Actions:** `mealplans/actions.ts` — full CRUD + `startSessionFromEntry` (links a `CookingSession`, flips status to In progress; `MealPlanEntry`'s durable `sourceDishTitleSnapshot`/`sourceDishKindSnapshot`/`sourceDishVersionLabelSnapshot` are captured at entry-creation time, round-2 Correction 4), `adoptNewerVersionInEntry`, `deleteMealPlan` (**round-3 Correction 2** — must, in one transaction, first `UPDATE` every linked `GroceryList` to `mode = 'STANDALONE'` with `linkedMealPlanId` cleared in the same statement, *then* delete the `MealPlan` row; `GroceryList.linkedMealPlan` is `onDelete: Restrict`, so the database physically refuses the Meal Plan delete until that first step has actually run — this ordering is not optional, and getting it backwards fails loudly with a foreign-key-violation error rather than silently corrupting a list's mode); `grocery/actions.ts` gains `resyncGroceryListFromMealPlan` (the explicit reconciliation function from Arch §H/§I — runs inside the same transaction as every mutating Meal Plan action, diffing the current set of `GroceryItemContribution` rows a live Meal Plan's entries would produce against the stored set, matched by `mealPlanEntryId` + `ingredientLineageId` (Correction 4, Arch §D.11); **round-2 Correction 5** — the diff outcome is persisted, not just acted on transiently: an unchanged contribution stays `ACTIVE`; a changed one is set to `CHANGED` with its prior quantity/unit preserved on `previousQuantityDecimal`/`previousQuantityText`/`previousUnit`; a disappeared one is set to `REMOVED` rather than deleted, and its owning `GroceryListItem.syncFlag` is set to `REMOVED` (with `checkedAt` left untouched) rather than the item vanishing — the user acknowledges the flag via `flagAcknowledgedAt`/`acknowledgedAt`; **per round-3 Correction 10, acknowledged `REMOVED` rows are retained indefinitely for now — no automatic pruning is designed or built in this slice**), preserving `GroceryListItem.checkedAt` wherever a matching contribution survives, per §81.4).
- **Validation/authorization:** Recommendation ranking logic (Stage → recency → rating → Flavor profiles, §80.1–80.2) implemented as a pure, unit-tested function.
- **Tests:** Unit tests for the recommendation ordering directly against §80's priority list and Favorite tie-breaking rule (§80.3 — Favorite never overrides Stage); **the most important integration test in this slice**: the grocery-resync function, covering add/remove/change-yield/change-Version entry mutations and asserting `GroceryItemContribution` matching, checkoff preservation, and correct persisted-state transitions (`ACTIVE`/`CHANGED`/`REMOVED`) in each case — **specifically including a dedicated test that a checked item whose only contribution disappears is flagged `REMOVED` with `checkedAt` intact, never silently deleted** (round-2 Correction 5, the exact failure mode this correction exists to prevent); integration test proving list completion freezes the list against further plan edits (§81.5); integration test for `deleteMealPlan` specifically — an active linked `GroceryList` is converted to `STANDALONE` (mode and `linkedMealPlanId` both cleared) before the `MealPlan` row is removed, and a deliberately-reordered variant (attempting the `MealPlan` delete first) fails with a foreign-key violation rather than succeeding with a corrupted list (round-3 Correction 2); e2e test for a full plan → generate synced list → check off items → edit plan → confirm sync → complete → confirm frozen.
- **Dependencies:** Slices 3, 4, 6, 7, 9, 10, 12. This is intentionally the most dependency-heavy slice in Tier 2, since Meal Plans reference nearly everything else in the domain.
- **Completion/acceptance criteria:** The "Meal Planning" acceptance-criteria group in `PRODUCT_SPEC.md` §96 is true.
- **Manual QA targets:** Check off several grocery items, then edit the linked Meal Plan (add an entry, change a yield) and confirm existing checkoffs survive where the equivalent item still exists, and are clearly flagged where it doesn't; delete a Meal Plan with an active linked list and confirm the list is preserved as a standalone frozen list rather than silently destroyed (Arch §J).
- **Risks:** Explicitly the highest-complexity Tier 2 slice (Arch §P.1) — the grocery-resync reconciliation logic is the single piece of this entire plan most likely to have a subtle bug that silently loses user data (a checked-off item disappearing without explanation). This is exactly why the planning prompt requires a gate here.
- **Review checkpoint required: YES — Review Gate 6, positioned before this slice** (see §D).

---

### Slice 16 — Read-only share links and independent copies

*(prompt sequence item 16)*

- **Objective:** Let a user share a Recipe or Part via an unlisted link, in both fixed-snapshot and current-content modes, and let a signed-in viewer save an independent copy.
- **User-visible outcome:** `/share` (sharing management) plus a per-Dish "Share" action generating a link; the new public `(share)/s/[token]` page renders a read-only view (fixed or live, clearly labeled which); "Save to My Recipes/Parts" creates a fully independent copy, recursively copying any linked Parts exactly once each.
- **Domain entities/schema changes:** None — `ShareLink` already exists (Arch §D.13).
- **Migrations:** None.
- **Routes/pages:** `/share`, `(share)/s/[token]` (new public route group, Arch §C.9).
- **Major components:** Share-link creation/management UI (mode toggle, expiration, revoke/regenerate), public read-only Dish view (excluding everything §83.5 excludes — Taster identities, individual ratings, Cooking notes, Reviews, session history, private Version history), "Save to My Recipes/Parts" flow with auth-prompt-if-logged-out.
- **Server Actions/caching:** `sharing/actions.ts` — `createShareLink` (generates a random `tokenId`, stores it in plaintext as the public lookup key, and returns the client the full `tokenId + "." + HMAC-signature` URL token — round-2 Correction 6, superseding round 1's hash-only design; writes to `currentDishId` for `CURRENT` mode or to `fixedDishId`/`fixedDishVersionId`/`frozenSnapshot` for `FIXED_SNAPSHOT` mode — **round-3 Correction 1: these are two entirely separate field sets, never the same column used two ways**, and `dishTitleSnapshot` is written regardless of mode), `getShareLinkUrl` (**new this round** — recomputes the same `tokenId + "." + HMAC-signature` token on demand from the stored `tokenId` and the server-only `SHARE_LINK_HMAC_SECRET`, so the owner can revisit sharing management and copy an already-active link at any time, which hash-only storage could never support), `revokeShareLink`/`regenerateShareLink` (regenerate assigns a fresh `tokenId`, invalidating the old link because it becomes unfindable at lookup time, not because its old signature stops verifying; calls `updateTag('share:' + tokenId)` per Arch §K.8), `saveSharedCopy` (the recursive, all-or-nothing, cross-owner-copy transaction from Arch §I). **Note:** the *automatic* revocation that fires when a source Dish is permanently deleted is not new code introduced by this slice — it was already built into `deleteDish`/`deletePart` from Slices 3/6 onward (Arch §H.1), precisely so it did not need to be retrofitted here.
- **Validation/authorization:** The public share page performs **zero** session-based authorization (it is intentionally public) but strictly whitelists which fields it ever queries/renders (never a raw Dish/DishVersion fetch) — tested with the same "poison field" discipline as the Slice 11 export DTOs; the resolve path splits the incoming URL token into `tokenId` + signature, recomputes the HMAC signature server-side, and only proceeds to look up `ShareLink` by `tokenId` if the signature verifies (constant-time comparison) — a request with a valid-looking `tokenId` but a forged or missing signature is rejected before any database lookup happens at all.
- **Tests:** Unit test proving a revoked/expired token never resolves, **and specifically that a token whose source Dish was permanently deleted (via Slice 3/6's `deleteDish`/`deletePart`) is unresolvable, closing the loop on the owner-confirmed share-deletion behavior**; unit test proving the mode-consistency CHECK constraint's field requirements (round-3 Correction 3) — an active `CURRENT` link requires `currentDishId` alone, an active `FIXED_SNAPSHOT` link requires both `fixedDishId`/`fixedDishVersionId`/`frozenSnapshot`, and a revoked link (either mode) may have any of those cleared without violating the constraint, since `revokedAt` relaxes the mode-specific requirement; unit test proving a `tokenId` paired with a forged or mismatched signature is rejected before any database lookup, and that `getShareLinkUrl` reliably reproduces the exact same working token from a stored `tokenId` on demand (round-2 Correction 6); integration test proving a `FIXED_SNAPSHOT` link's rendered content does not change after the source Dish is merely *edited* (but is correctly revoked once the source is *deleted* — the two are deliberately different outcomes, per Arch §H.1); integration test for the recursive Part-copy transaction (a Recipe with two levels of nested Parts, each copied exactly once even if referenced twice); integration test confirming an accepted copy's `DishVersion.imageAssetId` points at the **same** `ImageAsset` row as its source (round-2 Correction 7 — no Blob bytes duplicated), and that the image survives both a subsequent edit to the sender's copy *and* the sender later deleting their own original or their entire account; e2e test for create-link → view while logged out → save copy after signing in.
- **Dependencies:** Slices 3, 4, 6.
- **Completion/acceptance criteria:** The "Sharing" acceptance-criteria group in `PRODUCT_SPEC.md` §96 is true (excluding direct account-to-account sharing, Slice 17).
- **Manual QA targets:** Confirm a `CURRENT`-mode link reflects a subsequent edit to the source, while a `FIXED_SNAPSHOT`-mode link's *content* does not; confirm a saved copy has zero live reference back to the sender's data (delete the sender's original afterward and confirm the copy is entirely unaffected); **confirm that permanently deleting the shared source itself makes the link unresolvable (owner-confirmed behavior — this is not the same case as merely editing the source, and both must be verified separately).**
- **Risks:** The recursive cross-owner copy transaction is the main technical risk here — mitigated by the "copied exactly once" test and by bounding realistic nesting depth (Arch §G.6).
- **Review checkpoint required: YES — Review Gate 7, positioned before this slice** (see §D: "before implementing cross-account copying and sharing").

---

### Slice 17 — Direct account-to-account sharing

*(prompt sequence item 17)*

- **Objective:** Let a user send a Recipe/Part directly to another DishFrame account, reusing the exact same independent-copy mechanism Slice 16 built.
- **User-visible outcome:** A "Send to another DishFrame user" action; the recipient sees sender identity, a preview, an optional note, and Accept/Decline; the sender can cancel a pending share; accepting produces the same independent copy as a share link.
- **Domain entities/schema changes:** None — `DirectShare` already exists (Arch §D.13).
- **Migrations:** None.
- **Routes/pages:** No new top-level routes; `/share` gains "Pending" and "Received" sections.
- **Major components:** Recipient-lookup input, pending-share list (sender side), received-share list with Accept/Decline (recipient side).
- **Server Actions:** `sharing/actions.ts` gains `sendDirectShare`, `cancelDirectShare`, `respondToDirectShare` (Accept reuses the exact `saveSharedCopy` transaction from Slice 16 — no new copy logic).
- **Validation/authorization:** Recipient lookup must not leak whether an email/identifier corresponds to an existing account beyond what's operationally necessary (a privacy-conscious lookup response, not a full account-existence oracle).
- **Tests:** Integration test confirming Accept produces an identical result to a share-link save-copy (same underlying function); integration test confirming a `PENDING` `DirectShare` is automatically set to `CANCELED` when its source Dish is permanently deleted (again, exercising the step already built into `deleteDish`/`deletePart` since Slices 3/6, per Arch §H.1); e2e test for send → cancel-before-response and send → accept and send → decline.
- **Dependencies:** Slice 16.
- **Completion/acceptance criteria:** The direct-sharing bullets in `PRODUCT_SPEC.md` §85/§96 are true.
- **Manual QA targets:** Cancel a pending share and confirm the recipient never sees it; decline a share and confirm nothing is created on either side.
- **Risks:** Low — this slice is thin by design, deliberately reusing Slice 16's mechanism rather than introducing a second copy pathway.
- **Review checkpoint required:** No (already covered by Gate 7 before Slice 16).

---

### Slice 18 — Print/PDF presentation

*(prompt sequence item 18)*

- **Objective:** A simplified, printable Recipe/Part view.
- **User-visible outcome:** A "Print" action opens a chrome-free, readable layout suitable for browser printing and Save-as-PDF.
- **Domain entities/schema changes:** None.
- **Migrations:** None.
- **Routes/pages:** A print-optimized rendering of the existing Detail page (e.g., a print stylesheet + a minimal-chrome route variant), not a new domain route.
- **Major components:** Print layout (no navigation, no editing controls, full ingredients/instructions/basic metadata).
- **Server Actions:** None — purely presentational, reads the same data as the ordinary Detail page.
- **Validation/authorization:** Confirms the print view never reveals private history unless the user separately used the Slice 11 full-private-history export (§87).
- **Tests:** Component/visual test for the print stylesheet; a quick manual Playwright check that `window.print()` produces the expected content (Playwright can assert the print media query renders correctly without needing an actual printer).
- **Dependencies:** Slices 3, 4, 5, 6, 9 (needs the full content model, images, ratings to render a complete printable page).
- **Completion/acceptance criteria:** §87's bullets are true.
- **Manual QA targets:** Print preview on both light and dark application theme (the print output itself should be light/ink-friendly regardless of app theme); confirm Save-as-PDF works in at least two browsers.
- **Risks:** Low.
- **Review checkpoint required:** No.

---

### Slice 19 — Profile/security refinements, authentication-session management, sharing management

*(prompt sequence item 19)*

- **Objective:** Round out account-level controls before considering the product broadly share-ready.
- **User-visible outcome:** `/profile` gains real authentication-session management (list/revoke other devices, reusing Better Auth's existing session APIs, Arch §M), a comprehensive account-deletion flow (confirmation, reauthentication, export-first prompt, full cascading delete per Arch §J), and a consolidated sharing-management view (already begun in Slices 16/17, finalized here).
- **Domain entities/schema changes:** None new.
- **Migrations:** None.
- **Routes/pages:** `/profile` extended; no new top-level routes.
- **Major components:** Session list (device/browser description, approximate last-active time — never raw IPs or tokens, per §89), account-deletion confirmation flow.
- **Server Actions:** `preferences/actions.ts` (or a new `account/actions.ts`) — `listAuthSessions`/`revokeAuthSession` (thin wrappers over Better Auth's existing APIs), `deleteAccount` (the cascading-delete + best-effort blob-cleanup flow from Arch §I/§J).
- **Validation/authorization:** Account deletion requires recent reauthentication and explicit destructive confirmation (§91).
- **Tests:** Integration test for full account deletion verifying every aggregate in the Arch §J deletion matrix behaves exactly as tabled, **specifically including that every `ShareLink`/`DirectShare` the account owns is hard-deleted (not soft-revoked/canceled — the distinct behavior account deletion uses compared to a single Dish's deletion, Correction/§H.1 point 6)**, and that other users' independent copies of this user's shared content survive with `sourceDishId` nulled and no personally-identifying link remaining (§91); component test for the session list/revoke UI.
- **Dependencies:** Slices 2, 16, 17.
- **Completion/acceptance criteria:** The "Account and onboarding" (account portion) acceptance-criteria group in `PRODUCT_SPEC.md` §96 is true.
- **Manual QA targets:** Revoke a session from a second device/browser and confirm it's signed out; delete an account that has shared content accepted by another test user, and confirm that other user's copy still displays correctly afterward.
- **Risks:** Account deletion is inherently high-stakes/irreversible — mitigated by the dedicated deletion-matrix integration test and by requiring reauthentication + explicit confirmation at the UI layer.
- **Review checkpoint required:** No (deletion behavior was already designed and reviewed as part of Arch §I/§J; this slice implements against an already-agreed design).

---

### Slice 20 — Progressive onboarding and Help

*(prompt sequence item 20)*

- **Objective:** Teach the product's non-obvious concepts (Versions, Parts especially) contextually, without gating ordinary use behind a mandatory tour.
- **User-visible outcome:** A brief, skippable initial introduction; an early compact preference-setup step; contextual teaching moments at first Recipe creation, first meaningful edit, first Parts visit, first cook, first review, etc.; a permanent `/help` area with FAQs, terminology, and replayable guides.
- **Domain entities/schema changes:** None — `UserPreference.onboardingState` (Arch §D.14) already exists to track completed/dismissed/incomplete guides.
- **Migrations:** None.
- **Routes/pages:** `/help` extended significantly beyond its Milestone 1 placeholder.
- **Major components:** Skippable intro overlay, contextual tooltip/coach-mark system keyed off `onboardingState`, temporary fictional demo-data component (explicitly never persisted to the user's real library, per §92.4), Help content browser.
- **Server Actions:** `preferences/actions.ts` gains `markOnboardingGuideState`.
- **Validation/authorization:** The temporary demo-data path is tested to guarantee it can never write to real `Dish`/`DishVersion` tables under any circumstance (a dedicated negative test, since accidentally leaking fictional "example" content into a real library would be a visible, embarrassing bug).
- **Tests:** Component tests for the coach-mark system's dismiss/complete persistence; the demo-data isolation negative test above; e2e test walking a brand-new account through the initial introduction and confirming it does not reappear on next login.
- **Dependencies:** Effectively all prior slices (onboarding references nearly every concept in the product) — built last for exactly the reason `PRODUCT_SPEC.md` §92.1 states: "implemented after core product language and workflows stabilize."
- **Completion/acceptance criteria:** The onboarding/Help portions of `PRODUCT_SPEC.md` §96 are true.
- **Manual QA targets:** Dismiss the initial introduction and confirm it never auto-reappears; complete a guide, sign in on a second device, and confirm the completion state is shared (server-persisted, not per-device local storage).
- **Risks:** Low-moderate — the main risk is scope creep (turning "brief and skippable" into a mandatory tour); mitigated by testing dismissal/skip paths as first-class, not an afterthought.
- **Review checkpoint required:** No.

---

### Slice 21 — Desktop cooking-mode refinement and final cross-product polish

*(prompt sequence item 21 — final Tier 2 slice)*

- **Objective:** A dedicated pass making Cooking Mode use larger screens well (it has been functional-but-phone/tablet-optimized since Slice 8), plus a final cross-product consistency and accessibility pass.
- **User-visible outcome:** Cooking Mode on a desktop/large-tablet viewport uses available width meaningfully (e.g., multiple units visible side-by-side, a persistent timer rail) without changing the phone/tablet interaction model that remains primary.
- **Domain entities/schema changes:** None.
- **Migrations:** None.
- **Routes/pages:** No new routes — layout refinement of `/cook/[sessionId]` at wider breakpoints.
- **Major components:** Wide-viewport Cooking Mode layout variant.
- **Server Actions:** None new.
- **Validation/authorization:** None new.
- **Tests:** Responsive component tests at desktop breakpoints; a full accessibility pass (keyboard navigation, focus order, contrast, `prefers-reduced-motion`) across the domain surfaces built in Slices 3–20, extending the accessibility bar Milestone 1 already established for the shell.
- **Dependencies:** Slice 8, and effectively everything, since this is a cross-cutting final pass.
- **Completion/acceptance criteria:** Desktop Cooking Mode is demonstrably better than a naively-stretched phone layout; `pnpm check` and the full Playwright suite pass; a manual accessibility audit finds no regressions against Milestone 1's established bar.
- **Manual QA targets:** Full-suite manual QA across phone/tablet/laptop/wide-desktop, light/dark themes, exactly as Milestone 1's own final-verification checklist already modeled.
- **Risks:** Low.
- **Review checkpoint required: YES — Review Gate 8** (see §D: "at Tier 2 completion before considering Tier 3"). This gate sits at the end of this slice.

---

## D. Review Gates

The eight required gates, each mapped to a specific point in the sequence above:

| # | Gate | Position |
|---|---|---|
| 1 | After the foundational Prisma schema and first migration plan, before applying it | End of Slice 2, before its migration is applied |
| 2 | After the first coherent Recipe/Part library and editor design direction | End of Slice 3 |
| 3 | Before implementing nested-Part propagation and deletion materialization | Inside Slice 6, after attach/detach/cycle-prevention, before propagation/deletion work begins |
| 4 | Before implementing Cooking Session persistence and timers | Before Slice 7 begins |
| 5 | At Tier 1 completion, before beginning Tier 2 | End of Slice 12 |
| 6 | Before implementing Meal Plan-linked grocery synchronization | Before Slice 15 begins |
| 7 | Before implementing cross-account copying and sharing | Before Slice 16 begins |
| 8 | At Tier 2 completion, before considering Tier 3 | End of Slice 21 |

No additional gates are introduced beyond these eight; every other slice boundary is a natural stopping point but not a mandated review pause, so day-to-day implementation can proceed without waiting on review at every step.

---

## E. Definition of Done

### E.1 Tier 1 definition of done

Directly from `PRODUCT_SPEC.md` §95.1, restated as a checklist this plan's slices are designed to satisfy by Slice 12:

- Private ownership; Recipe and Part creation, editing, archive, deletion, and duplication (Slices 2–3).
- Immutable content Versions; Version history and comparison (Slice 4).
- Libraries, search, tags, Favorite, cuisine, and Flavor profiles (Slices 2, 10).
- Scaling and compatible units (Slice 5).
- Manual nutrition (Slice 3/5).
- Import and Recipe Gallery migration (Slice 11).
- Cooking setup and Cooking Sessions (Slice 7).
- Cooking mode and timers (Slice 8).
- Session Reviews, Tasters, and ratings (Slice 9).
- Grocery lists (Slice 12).
- Complete reusable-Part behavior and propagation (Slice 6).

### E.2 Tier 2 definition of done

Directly from `PRODUCT_SPEC.md` §95.2, satisfied by Slice 21:

- USDA FoodData Central nutrition lookup; optional barcode lookup (Slices 13–14).
- Batch-oriented Meal Planning; Meal Plan-linked grocery synchronization (Slice 15).
- Optional Part ratings inside Recipe Session Reviews (delivered as part of Slice 9's rating engine, since the unified rating model already supports rating any `dishId` reachable from a session — see Arch §D.8; the UI surfacing of this as an explicit secondary "Rate individual Parts" control is finished in Slice 15's review of the full cooking loop, or may be pulled forward into Slice 9 at implementation time if trivial once the engine exists).
- Read-only sharing links; independent shared copies; direct account-to-account sharing (Slices 16–17).
- Print/PDF presentation (Slice 18).
- Share-readiness account controls; authentication-session management (Slice 19).
- Desktop cooking refinement (Slice 21).
- Onboarding and Help (Slice 20).

### E.3 Deferred Tier 3 list

Not implemented by any slice above; explicitly out of scope for this build plan, per `PRODUCT_SPEC.md` §95.3:

- Public Recipe and Part publication, public directories, moderation (schema extension point identified in Arch §D.15, not built).
- AI-assisted paste parsing (the Slice 11 importer's pipeline is designed to accept this as a swappable first stage later, per Arch §L, but no AI integration is built now).
- Custom arbitrary user-created tag groups (Tag schema does not block adding this later, per Arch §A.4, but it is not built now).
- Pantry inventory, retailer-specific aisle mapping, ordering, price comparison.
- Semantic/AI Recipe search, AI Recipe generation or revision.
- Advanced social/engagement features.
- Installable PWA / offline access / native mobile apps (already flagged in `docs/TODO.md` as dependent on a future cooking-mode specification).

### E.4 Proposed release/verification checklist

At both the Tier 1 completion gate (Gate 5) and the Tier 2 completion gate (Gate 8):

1. `pnpm check` (format:check → lint → typecheck → test → build) passes, extending the existing scaffold convention.
2. Full Playwright e2e suite passes, including every golden-path flow named in Slices 3–21's test sections.
3. A manual QA pass across phone/tablet/laptop/wide-desktop breakpoints and both themes, exercising real domain screens.
4. The deletion-matrix integration-test suite (Arch §J) passes in full — this is the single most consequential correctness surface in the product (irreversible, user-data-destroying operations) and deserves an explicit named checkmark at each release gate, not just "tests passed."
5. A fresh-user walkthrough (sign in for the first time, no seed data beyond what Slice 2 creates automatically) confirms onboarding, empty states, and default metadata all behave as designed.
6. Confirm no secrets, tokens, or unrelated users' data can be reached through any export, share link, or public route — the "poison field" tests from Slices 11 and 16 passing is necessary but a final manual spot-check of actual exported/shared output is also recommended given the sensitivity of getting this wrong.
7. Update `README.md` and `docs/TODO.md` to reflect the domain functionality now live in production.

### E.5 Recommended first implementation slice after plan approval

**Slice 2 — Foundational domain schema and user-owned organizational metadata**, immediately following Review Gate 1's approval of the schema design in `ARCHITECTURE_PROPOSAL.md` §D. This is the correct starting point because every other slice in this plan depends on it, and because the unified `Dish`/`DishVersion` model is the single highest-leverage (and highest-cost-to-reverse) decision in the entire project — worth getting a dedicated, focused review pass before any line of domain UI is written.

---

## F. Final Implementation Updates

This plan's Slices 1–13 executed largely as originally sequenced. Slices 14–21 executed against a **revised order**, agreed mid-build and superseding the linear B–C sequence above for that range:

14 (barcode nutrition lookup) → 15 (Meal Plans + Meal-Plan-linked grocery sync) → a representative seed-data update and broad functional verification pass → **21A** (comprehensive design audit of the completed personal-workflow product, run after Slice 15) — this closed out **Milestone 1, "complete personal product"** (§95.1). Then: Gate 7 preflight → 16 (read-only unlisted sharing) → 17 (direct account-to-account sharing) → 18 (print/Save-as-PDF) → 19 (account/session/security/deletion), with 21A's findings corrected in parallel batches alongside 16–19 → 20 (onboarding, Help, public-page revisit) → **21B** (final whole-product polish) → final release verification — closing out **Milestone 2, "DishFrame finished"** (§95.2).

Slice 21 was split into 21A/21B (rather than run as one pass) because a design review is most valuable once the central personal workflow is complete, and because interrupting feature work for isolated polish findings was judged worse than batching corrections in parallel — only correctness/privacy/ownership/destructive-data issues were treated as gate-worthy enough to interrupt feature work mid-track.

Gates 5 and 6 (originally "at Tier 1 completion" and "before Meal-Plan-linked grocery sync") were consolidated into the post-Slice-15 seed/verification/21A review rather than run as two separate stops — only a narrow, code-aware architecture preflight (not a full owner review) preceded Slice 15 itself. Gate 7's owner/product decision (sharing architecture) was completed early and is recorded in full in `ARCHITECTURE_PROPOSAL.md`; only a technical preflight ran immediately before Slice 16. Gate 8 remained the final release gate, run after 21B.

A **Slice 22 — Multi-Recipe direct sharing** was added after the original Gate-8-closing scope, extending Slice 17's single-item direct-share flow to a batch send/accept flow (`DirectShareCollection`) — see `PRODUCT_SPEC.md` §85.1 and `ARCHITECTURE_PROPOSAL.md`'s `DirectShareCollection` model for the settled design.

A recurring, expected risk confirmed across many slices (2, 8, 9, 12, 13, 16, 17, and others): `prisma migrate dev --create-only`'s shadow-database diff proposes spurious `DROP CONSTRAINT`/`DROP INDEX` statements against pre-existing hand-authored raw-SQL objects it has no schema representation for. Every migration generated against this repo's history must be checked against a fresh diff and hand-corrected before being trusted — this is standing practice, not a one-off incident (see `CLAUDE.md`'s "Database migrations" section).

For genuinely still-open/deferred work carried out of these later slices (public-page contrast/design items, `/home` real-content scope, production QA checklists, etc.), see `docs/TODO.md` rather than the individual slice reports, which have been removed.

---

*End of `BUILD_PLAN.md`.*
