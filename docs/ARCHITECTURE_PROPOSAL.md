# DishFrame — Architecture Proposal

**Document status:** Technical planning output, produced per `CLAUDE_PLANNING_PROMPT.md`
**Scope:** Planning only. No application source, Prisma schema, migration, package, or configuration file was changed to produce this document.
**Authority order followed:** `PRODUCT_SPEC.md` (canonical) → `BRANDING.md` → `PRODUCT_ROADMAP.md` (context only, superseded on conflict) → `MILESTONE_1.md` / `MILESTONE_2.md` (scaffold history).

---

## A. Executive Recommendation

### A.1 Summary

DishFrame should be built as a single cohesive **Next.js 16 App Router monolith** on the already-deployed stack (Neon Postgres, Prisma 7, Better Auth, Vercel), with one central architectural move that determines almost everything downstream:

> **Recipe and Part are the same underlying entity, differentiated by a `kind` discriminator, not two parallel schemas.**

`PRODUCT_SPEC.md` §66.1 states plainly that "a Part behaves like a smaller Recipe in nearly every important respect," and enumerates stable-item and Version-owned properties for Parts that are, field-for-field, identical to Recipes. `BRANDING.md` §14 explicitly sanctions this: "the codebase may use precise technical model names" while the interface uses "Part," "Recipe," "Section," etc. Building two parallel schemas (`Recipe`/`RecipeVersion`/`RecipeSection`/... and `Part`/`PartVersion`/`PartSection`/...) would duplicate every versioning rule, every cooking-session code path, every rating rule, and every deletion rule, and would require constant vigilance to keep the two copies behaviorally identical — exactly the kind of duplication the spec's own language ("a Part behaves like a smaller Recipe") argues against.

Instead, this proposal centers on one unified pair of tables — `Dish` (stable identity, `kind: RECIPE | PART`) and `DishVersion` (immutable content) — with a single Section/Ingredient/PartLink/CookingSession/Rating engine shared by both kinds. Recipe-only behavior (e.g., "Recipes cannot be nested inside other Recipes") is enforced by a narrow application-level invariant on top of the shared model, not by separate tables. This single decision is why the rest of this proposal reads as unusually decisive: nearly every other domain concept (versioning, nested composition, cooking, rating, deletion, sharing) is one engine, not two.

### A.2 Major architectural principles

1. **Immutability by construction, mutation by exception.** Every `DishVersion` column is write-once after creation, with exactly one documented exception (`versionNote`, deliberately mutable per §14) and exactly one documented, deliberate, deletion-time exception (Part-deletion materialization, §74.3, sanctioned by the spec itself in §20's acceptance criteria). No other historical mutation path exists anywhere in the domain layer.
2. **Stable identity vs. version content is a hard architectural line**, not a naming convention — see §E below for the exhaustive field-by-field mapping this proposal commits to.
3. **Cycles are prevented by construction where possible, and by an explicit reachability check where the product's mental model requires it even though raw infinite recursion is already impossible** — see §G.
4. **Snapshots exist only at the specific freeze points the spec names** (duplication, share-fixed, publish, Part-deletion materialization, completed grocery lists) — everywhere else, live normalized references to immutable rows are used instead of speculative denormalization. See §H.
5. **A cohesive monolith, not services.** One Postgres database, one Prisma client, one Next.js deployment. No queues, no microservices, no containers — the personal/family-scale data volumes in play here (thousands, not millions, of rows per user) do not justify that complexity, and `PRODUCT_SPEC.md` repeatedly warns against inventing operational overhead the product doesn't need.
6. **Server Components read, Server Actions write, Route Handlers are reserved for non-page HTTP concerns** (auth callback, health check, streaming exports, public share resolution where genuinely useful as a cached route). This matches the existing scaffold exactly and requires no new data-fetching library.

### A.3 Tier 1 and Tier 2 support

The unified `Dish`/`DishVersion` model, the PartLink graph, and the CookingSession engine are designed against the **complete** Tier 1 + Tier 2 feature set from the start — not against Tier 1 alone with a hope that Tier 2 will fit later. Concretely:

- `PartLink.targetDishId` (stable) alongside `targetDishVersionId` (exact) exists from the first migration, even though "eligible for update" propagation UI (Tier 1) and optional per-Part ratings (Tier 2, §75) both depend on it.
- `Dish.sourceDishId`/`sourceDishVersionLabel`/`sourceAggregateRating` provenance fields exist from the first migration, because duplication (Tier 1, §18–19) and accepted shares (Tier 2, §84) use the identical snapshot shape.
- `ShareLink` (Tier 2) and the eventual Tier 3 `Publication` table both reuse the same "freeze a JSON snapshot at an explicit user action" pattern already required for duplication provenance — nothing new has to be invented for sharing or publication.
- `MealPlan`/`GroceryList` linkage (Tier 2) is modeled from the start as a `GroceryList.mode` discriminator (`STANDALONE` vs `MEAL_PLAN_LINKED`) rather than retrofitted later, because standalone grocery lists (Tier 1) and Meal-Plan-synced lists (Tier 2) are the same table with different reconciliation behavior, not different tables.

### A.4 Tier 3 extension points accommodated without being built now

- **Public publication**: a future `Publication` table (`dishId`, frozen JSON snapshot, `publishedVersionId`, status) slots in next to `ShareLink` using the identical freeze/update/unpublish lifecycle already built for Tier 2 sharing. No schema rework required.
- **AI-assisted paste parsing**: the paste-and-review importer (Tier 1, deterministic) is architected as a pipeline — `raw text → structured proposal → review UI → confirm → normal Dish creation service` — where the first stage is swappable. A future AI parser would replace only the "raw text → structured proposal" stage, never touching the review/confirm/creation stages. This is called out explicitly in §K/§L so implementers don't couple the parser to the UI.
- **Custom tag groups**: `Tag` is deliberately flat now (per §45.8) but is a normal owner-scoped table with no schema property that would block adding an optional `tagGroupId` later.
- **Pantry inventory / retailer aisle mapping**: explicitly out of scope; `GroceryCategory` is a simple user-owned reorderable list, not a hardcoded retailer taxonomy, so it does not need to be redesigned if aisle-mapping is ever pursued — it would be an additive optional field, not a rework.

---

## B. Existing Scaffold Assessment

Verified directly from the repository (not inferred from placeholder copy).

| Area | Verified state |
|---|---|
| Framework | Next.js `16.2.11`, App Router, React `19.2.4`, TypeScript strict, Turbopack dev |
| Styling | Tailwind CSS 4, shadcn/ui (`style: radix-nova`, `baseColor: neutral`), `next-themes`, Lucide icons, Manrope/Inter via `next/font` |
| Database | Neon Postgres via `@neondatabase/serverless` + `@prisma/adapter-neon`; Prisma `7.9.0`, custom generated client at `src/generated/prisma`, ESM config via `prisma.config.ts` (not the legacy `schema.prisma` datasource-block URL pattern) |
| Schema today | Only Better Auth's required models exist: `User`, `Session`, `Account`, `Verification` (mapped to `users`/`sessions`/`accounts`/`verifications`). Zero domain models. This is a genuine greenfield for the recipe domain. |
| Auth | Better Auth `1.6.24`, Google OAuth only, Prisma adapter, 30-day sessions with 1-day refresh, multiple concurrent sessions explicitly allowed (no device cap), session read server-side via `getServerSession()` (`src/lib/auth/session.ts`) |
| Routing/components | Route groups `(marketing)`, `(auth)`, `(app)` already separate public/auth/protected concerns cleanly; `(app)/layout.tsx` does the server-side session check + redirect; nav items centralized in `nav-items.ts` (`Home`, `Recipes`, `Parts`, `Help`) |
| Image/file handling | **None present.** No blob storage integration, no upload component, no image field anywhere. This is a real gap Tier 1 must close (Recipe/Part images, §12). |
| Env/config | `src/lib/env/server.ts` — Zod-validated, with `isDatabaseConfigured` / `isGoogleAuthConfigured` / `isContactFormConfigured` capability flags rather than hard failures, so the app degrades gracefully instead of crashing when optional integrations are unset. This pattern is worth preserving for new integrations (FoodData Central, blob storage). |
| Deployment | Live on Vercel (project `dish-frame`, linked via `.vercel/project.json`), production URL `https://dish-frame.vercel.app`, confirmed working: OAuth, Neon, Resend contact form, security headers, Speed Insights, SEO/metadata (Milestone 2 complete per `MILESTONE_2_RESULTS.md`) |
| Testing | Vitest + Testing Library (unit/component) and Playwright (e2e) both wired into CI already; `pnpm check` runs format:check → lint → typecheck → test → build in one pass |
| Conventions worth retaining | Route-group separation of concerns; capability-flag env pattern; domain-scoped `src/lib/<area>/{schema,actions}.ts` pairing already modeled by `src/lib/contact/`; colocated `*.test.ts(x)` files; centralized `src/lib/site.ts` for origin/URL concerns |

**Conclusion:** the scaffold is exactly what `MILESTONE_1.md`/`MILESTONE_2.md` describe — a credible, production-deployed shell with zero domain data. Nothing about the placeholder `/recipes` and `/parts` pages (empty-state cards, disabled buttons) implies any product architecture; they were explicitly built as "honest placeholders," and this proposal designs the domain from `PRODUCT_SPEC.md` alone, as instructed.

---

## C. Application and Information Architecture

### C.1 Route structure

Building on the existing route groups, without changing their public/auth/protected boundaries:

```text
(marketing)          — unchanged: /, /about, /contact
(auth)                — unchanged: /sign-in
(app)                 — protected shell, extended:
  /home                                — real dashboard (recent activity, active sessions, quick actions)
  /recipes                             — Recipe library (grid/list, search, filters, sort)
  /recipes/new                         — full-page Recipe editor (create)
  /recipes/[dishId]                    — Recipe Detail (current Version by default)
  /recipes/[dishId]/edit               — full-page editor (save small update / save new version)
  /recipes/[dishId]/versions/[versionId] — historical Version detail (read-only + "Prepare to cook this version")
  /recipes/[dishId]/compare            — Version comparison (?from=&to=)
  /recipes/[dishId]/cook               — Cooking setup (does not itself create a session)
  /recipes/import                      — paste-and-review importer
  /parts                               — Part library (same shape as Recipes)
  /parts/new
  /parts/[dishId]
  /parts/[dishId]/edit
  /parts/[dishId]/versions/[versionId]
  /parts/[dishId]/compare
  /parts/[dishId]/cook
  /cook                                 — active/recent Cooking Sessions index (§26.6: reachable without the source item)
  /cook/[sessionId]                     — Cooking Mode (dedicated minimal-chrome layout, see C.9)
  /cook/[sessionId]/review              — Session Review ("How did it go?")
  /tasters                              — Taster management
  /grocery-lists                        — list of grocery lists (standalone + Meal-Plan-linked)
  /grocery-lists/[id]
  /meal-plans                           — Tier 2
  /meal-plans/[id]                      — Tier 2
  /share                                 — Tier 2: sharing management (active links, pending direct shares, received shares)
  /help                                 — unchanged
  /profile                              — extended: preferences, sessions (Tier 2), Delete account (Tier 2)
(share) — NEW, public route group, Tier 2:
  /s/[token]                            — read-only public share view, no auth required
api/
  auth/[...all]                         — unchanged
  health                                 — unchanged
  export/account                         — Route Handler streaming full backup (Tier 1)
  export/dish/[dishId]                   — Route Handler streaming single-item export (Tier 1)
  import/gallery                         — Recipe Gallery migration upload endpoint (Tier 1)
```

`recipes/import` and `parts` do not need a separate `import` route — Parts are typically created directly or converted from local Recipe content (§69), not imported from external text, so the paste-and-review importer targets Recipes only, matching real usage.

### C.2 Authenticated application shell

Unchanged: `(app)/layout.tsx` continues to do the server-side session check, sidebar (desktop) / top-bar-and-sheet (mobile), and account menu. No architectural change needed here — it already supports arbitrary child routes.

### C.3 Primary navigation

Unchanged nav items (`Home`, `Recipes`, `Parts`, `Help`) for Tier 1. Tier 2 adds `Meal Plans` and folds `Grocery Lists`/`Tasters`/`Share` under either an expanded nav or the account/profile area — this is a frontend-design decision to make at Tier 2 time, not now; the route structure above does not depend on where they appear in navigation chrome.

### C.4 Major page boundaries

- **Library pages** (`/recipes`, `/parts`) are Server Components: search/filter/sort state lives in the URL (`searchParams`), so the page itself stays a plain server-rendered list with no client data-fetching library required — consistent with the scaffold's existing "no TanStack Query" posture.
- **Detail pages** are Server Components with Client Component islands for interactive controls (temporary scaling widget, Favorite toggle, filter chips).
- **Editor pages** (`/recipes/new`, `/recipes/[dishId]/edit`) are Client Components wrapping one shared `DishEditor` (see C.6).
- **Cooking Setup** (`/recipes/[dishId]/cook`) is a Client Component; it reads the current (or explicitly chosen historical) `DishVersion` server-side as initial props, then holds all setup edits (unit selection, order, scale) as transient client state until "Start cooking" is submitted.
- **Cooking Mode** (`/cook/[sessionId]`) is a Client Component shell (timers, checkoffs need client interactivity) hydrated from a Server Component data fetch.

### C.5 Server/Client component boundaries

| Concern | Component type | Why |
|---|---|---|
| Library, Detail, History, Version list, Grocery list view, Meal Plan view | Server Component | Pure data display, no per-keystroke interactivity |
| Recipe/Part editor | Client Component | Deep nested dynamic arrays (Sections → Ingredients/Instructions/PartLinks), drag-reorder, unsaved-changes guard |
| Cooking Setup | Client Component | Interactive unit selection/reorder/scale before any persistence occurs |
| Cooking Mode | Client Component | Live timers, optimistic checkoff toggling, focus-switching between units |
| Session Review form | Client Component | Multi-field optional form, per-Taster rating input |
| Version comparison | Server Component + small Client toggle | Diff computation is a pure server-side read; "reveal unchanged context" toggle is the only interactive part |
| Filters/search/sort controls | Client Component | Must update URL search params interactively |
| Theme toggle, account menu | Client Component (unchanged) | Already implemented this way |

### C.6 Form and editor architecture

**Recommendation: introduce React Hook Form, scoped specifically to the Recipe/Part editor.** `MILESTONE_1.md` deliberately deferred form libraries ("without a present Milestone 1 need") — that need now exists. The editor manages several independently reorderable, add/removable arrays at once (Sections, each with its own Ingredients, Instructions, and PartLinks), plus cross-field validation (title + Stage + "at least one meaningful ingredient/instruction/Part," §8.3). Hand-rolling this with raw `useState`/`useReducer` would mean re-implementing array-field diffing, dirty-tracking, and validation wiring that a mature library already solves. Keep this dependency scoped to editor forms only — the existing Contact form stays exactly as-is (plain Server Action, no RHF) since it has none of these needs.

One shared `<DishEditor kind="RECIPE" | "PART">` component drives both `/recipes/new`/`/recipes/[id]/edit` and `/parts/new`/`/parts/[id]/edit` — a direct, visible consequence of the unified `Dish`/`DishVersion` model (§A.1): the editor UI does not need two parallel implementations any more than the schema does.

### C.7 Shared UI/domain component boundaries

- `components/ui/*` — existing shadcn primitives, unchanged.
- `components/domain/dish/*` — Dish card, Stage badge, rating badge, Flavor-profile chips — shared by Recipe and Part surfaces.
- `components/domain/versions/*` — version selector/pager (§13.8's "latest-minor-per-major selector + prev/next" pattern), comparison view.
- `components/domain/cooking/*` — timer widget, checklist item, unit-focus panel — used only inside Cooking Mode.
- `components/domain/sharing/*` — Tier 2.

### C.8 Where responsive cooking behavior differs from management screens

Per `BRANDING.md` §5.5 ("progressive focus... Cooking mode: Larger, simpler, and focused") and `PRODUCT_SPEC.md` §28.4, Cooking Mode is architecturally distinct, not just visually distinct:

- **Dedicated layout** for the `/cook/[sessionId]` segment: no sidebar, a minimal top bar (session title, elapsed time, "End cooking session"), full viewport devoted to the focused unit. **Corrected at Slice 8 implementation:** this cannot be a nested `layout.tsx` inside `(app)/cook/[sessionId]/` as originally written here — Next.js App Router layouts compose (wrap) their parent, so a route nested under `(app)` always still renders `(app)/layout.tsx`'s `SidebarNav`/`MobileTopbar`/account header regardless of anything a deeper layout does, making "no sidebar" structurally unreachable from that path. The actual implementation is a new top-level route group, `(cook)/cook/[sessionId]/`, sibling to `(app)` with its own independent auth-redirect layout — the same route-group mechanism §C.9 already plans to use for the (not-yet-built) `(share)` group, applied here for the first time. `(app)/cook/page.tsx` (the sessions index) is unaffected and stays in `(app)`.
- **Larger touch targets and type scale** than any management screen (checkoffs and timer controls must work one-handed, at arm's length, with wet or floury hands — a real interaction-design constraint, not a decoration choice).
- Every other screen (library, detail, editor, review, planning) shares one denser, management-oriented layout system.

This is the one place the architecture proposal deliberately reaches slightly into layout territory (a dedicated route-segment layout), because the boundary is structural (a different `layout.tsx`), not merely a CSS variant — everything else about visual design is left to frontend-design work and the future `DESIGN_DECISIONS.md`, per the planning prompt's restriction.

### C.9 Public share view (Tier 2)

`(share)/s/[token]` is a Server Component, unauthenticated, resolving the incoming URL token by splitting it into `tokenId` + signature, recomputing the HMAC signature server-side, and looking up `ShareLink.tokenId` only once the signature verifies (round-2 Correction 6, recoverable design — see `PRISMA_SCHEMA_PROPOSAL.md` §5). Because it is genuinely public and not session-scoped, it is the one place in the authenticated product surface where Next.js `use cache`/tag-based caching earns its keep (see §K.9) — every other route depends on `getServerSession()` and is inherently per-request dynamic.

---

## D. Domain Model and Prisma Proposal

Presented as an annotated entity specification (pseudo-Prisma), not a literal schema file, per the planning restrictions. Field lists are representative of intent and narrative rationale; the pseudo-schema below is kept for that narrative continuity and is not re-synchronized field-by-field on every schema revision.

**`docs/PRISMA_SCHEMA_PROPOSAL.md` is the single authoritative source for the exact, literal schema** — every field, relation, referential action, composite key, and raw-SQL constraint. Where the two ever appear to disagree on a mechanical detail (an exact relation name, a specific `onDelete` action, a field present in one but not the other), `PRISMA_SCHEMA_PROPOSAL.md` governs. This section reflects both Gate 1 review passes (round 1: persistent lineage identity, live/materialized `PartLink` state, self-contained Cooking Session history, normalized grocery contributions, per-lineage preferred units, reference-aware image cleanup, recoverable share tokens; round 2: real foreign-key relations throughout, composite Dish/Version pairing keys, `PartLink` container consistency, deleted-source snapshots on Meal Plan/grocery entries, persisted grocery-sync change-tracking, cross-account `ImageAsset` sharing, grocery-category-memory extraction, generalized nutrition basis, complete search coverage, historical per-Part rating preservation, and additional database invariants) — see `docs/GATE_1_REVIEW_SUMMARY.md` and `docs/GATE_1_REVIEW_SUMMARY_2.md` for the correction-by-correction accounts of what changed and why in each pass.

### D.-1 Persistent lineage identity

Every version-owned structural row that must be **recognized across Versions** — `Section`, `Ingredient`, `Instruction`, and `PartLink` — carries a `lineageId` distinct from its own row `id`. `id` identifies one immutable row belonging to one specific `DishVersion`; `lineageId` identifies the same conceptual "slot" across every Version where it survives.

When a new `DishVersion` is created, the version-creation service function copies each unchanged Section/Ingredient/Instruction/PartLink forward as a **new row** (it must be — the old row still belongs to the old, immutable `DishVersion`), but that new row **carries its predecessor's `lineageId` value forward** rather than generating a fresh one. Only genuinely new content (a newly added Section, a newly added Ingredient, a newly attached Part) receives a brand-new `lineageId`. `lineageId` is therefore not globally unique across a table — the same value legitimately recurs across many Versions of the same Dish over time, once per Version where it survives.

**Round-3 Correction 8 — uniqueness enforced within the correct scope.** Although `lineageId` recurs across Versions, it must never recur **twice within one Version** — two different Sections in the same Version accidentally sharing a `lineageId` would make every lineage-keyed behavior above ambiguous. Each model therefore carries a scoped uniqueness constraint: `Section.@@unique([dishVersionId, lineageId])`, `PartLink.@@unique([containerVersionId, lineageId])`, and — since `Ingredient`/`Instruction` only had a `sectionId`, not a direct `dishVersionId` — both gained a denormalized `dishVersionId` column specifically so `@@unique([dishVersionId, lineageId])` can be declared at the correct (whole-Version) scope rather than merely per-Section. That denormalized `dishVersionId` is kept consistent with the row's actual owning Section via a raw-SQL composite foreign key (`(dishVersionId, sectionId) → Section(dishVersionId, id)`), the same "primary Prisma relation plus a raw-SQL consistency check" pattern used for `PartLink`'s container consistency (§G) — necessary because `sectionId` is already spoken for by `Ingredient`/`Instruction`'s ordinary `section` relation, and Prisma Schema Language cannot reliably layer a second relation onto a field already used by another one (`PRISMA_SCHEMA_PROPOSAL.md` §1 explains this limitation and the resolution pattern used throughout).

This one addition is what makes the following possible without inventing four separate mechanisms:

- **Structured Version comparison** (§94) matches old and new content by `lineageId`, not by fuzzy text similarity — an ingredient whose name changed but whose `lineageId` is stable is a genuine *edit*; a `lineageId` present in the old Version but absent from the new one is a genuine *removal*; a `lineageId` with no predecessor is a genuine *addition*. This is the difference between an honest structured diff and a character-level guess.
- **Reordering** is just a `position` change on a row that keeps its `lineageId` — trivially distinguishable from remove-and-re-add.
- **Ingredient-specific display preferences** (§D.6 below, Correction 6) target a stable `ingredientLineageId`, so a saved "16 tbsp → display as 1 cup" preference keeps applying to the *same* ingredient across future Versions, not to whatever row happens to occupy the same position.
- **Propagation to specific Part occurrences** (§72.5's "select every matching occurrence while allowing occurrences to be excluded individually") targets a stable `PartLink.lineageId` — the same physical attachment slot across the Recipe's own Version history, distinct from *which* Part Version it currently points at.

### D.0 Core discriminators

### D.0 Core discriminator

```
enum DishKind { RECIPE PART }
enum Stage { IDEA EXPERIMENTAL PROVEN ACTIVE ARCHIVED }
```

### D.1 Stable identity: `Dish`

```
model Dish {
  id                String    @id @default(cuid())
  ownerId           String    // -> User.id
  kind              DishKind

  currentVersionId  String?   @unique  // denormalized pointer, see F.5

  stage             Stage     @default(IDEA)
  cuisine           String?
  archivedAt        DateTime?

  defaultBatchQuantity Decimal?
  defaultBatchUnit     String?
  // Per-ingredient preferred display units now live on PreferredUnitOverride (D.6a, Correction 6),
  // not as a blanket per-Dish setting — see the rationale there.

  // Duplication / accepted-share provenance snapshot (D.13, H.2) — frozen at creation, never rewritten
  sourceKind            SourceKind @default(NONE) // NONE | DUPLICATE | ACCEPTED_SHARE | IMPORT
  sourceDishId          String?    // live pointer; nulled if source later deleted (H.3)
  sourceDishVersionLabel String?   // frozen text, e.g. "V4.0" — survives source deletion
  sourceTitle            String?   // frozen text
  sourceAggregateRating  Decimal?
  sourceRatingCount      Int?
  sourceSessionCount     Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  versions   DishVersion[]
  tags       DishTag[]
  flavorProfiles DishFlavorProfile[]

  @@index([ownerId, kind, stage])
  @@index([ownerId, kind, archivedAt])
  // trigram/GIN index on current title (via a generated/joined column or a denormalized `currentTitle` field —
  // see D.14 note) to support tolerant partial-word search per §44.5
}
```

**Why `currentVersionId` is denormalized rather than computed by `ORDER BY major DESC, minor DESC LIMIT 1` on every read:** the "current Version" concept is read on nearly every page in the product (library cards, detail pages, cooking entry points). A denormalized pointer, maintained transactionally at version-creation time (§F.5), turns "get current content" into a single indexed FK lookup instead of a sort on every request. Historical-Version reads (comparison, "cook this version") still query the full `DishVersion` set directly by id — the denormalization only optimizes the overwhelmingly common "give me the current one" case.

**Round-3 Correction 5 — ownership enforcement.** The plain single-column relation on `currentVersionId` (`Dish.currentVersionId → DishVersion.id`) only proves the referenced row exists — it does not prove that row actually belongs to *this* `Dish`. A bug could point a Dish's `currentVersionId` at some other Dish's Version entirely, and nothing at the Prisma-relation level would catch it. Because `Dish.id` already participates in essentially every other relation pointing at `Dish`, this cannot be expressed as a second Prisma relation without hitting the same "one scalar field, two relations" problem discussed throughout this proposal — so the ownership guarantee is added as a raw-SQL composite foreign key instead: `FOREIGN KEY (id, currentVersionId) REFERENCES DishVersion(dishId, id)`, layered on top of the existing simple Prisma relation. `MATCH SIMPLE` semantics mean this is vacuously satisfied whenever `currentVersionId` is null (e.g., transiently, before a Dish's first Version is linked inside its own creation transaction); whenever it is set, Postgres now requires the pair to genuinely match a `DishVersion` row that belongs to this Dish. Full SQL in `PRISMA_SCHEMA_PROPOSAL.md` §4.1.

**Note on search (§44) — corrected to cover every required field, and to refresh correctly (round-2 Correction 10, revised by round-3 Correction 6):** ordinary library search inspects "the current stable Recipe and current Recipe Version" across title, cuisine, Flavor profiles, tags, Section names, and linked Part names — never historical Versions, never ingredient text. Round 2 added one combined `currentSearchText` field covering all of cuisine/tags/Flavor-profiles/Section-names/Part-names, refreshed only at version-creation time — but cuisine, tags, and Flavor profiles can all change **without** a new Version (§46.1, §45.2, §79.2), which would have left that field silently stale after, e.g., an unrelated cuisine edit.

The corrected design (round-3 Correction 6) **splits genuinely-Version-owned structural content from stable relational metadata, and stops denormalizing the latter at all**: `Dish.currentStructuralSearchText` (Section names + the titles of the *exact* Part Versions referenced by the current Version's `PartLink`s — resolved from each link's own target Version, never from the target Part's current title, so a Recipe still referencing an older Part Version is never misrepresented) is refreshed **only** by the version-creation transaction, since it is genuinely tied to Version content and cannot change any other way. **Corrected by the Version-trigger and Slice 5 image correction pass:** `Dish.currentTitle` is *not* Version-owned after all — title turned out to be stable Recipe/Part identity (§E below), not content that lives on a `DishVersion` row at all — so it is written directly by every mutation that changes the title (an ordinary metadata-only save, same as `stage`/`cuisine`), in addition to being carried forward unconditionally whenever a Version-creating save also changes it. It is no longer true that `currentTitle` "cannot change any other way" than at version-creation time. Cuisine, tags, and Flavor profiles are **not denormalized at all** — they already live directly on `Dish` (`cuisine`) or in small, well-indexed, owner-scoped join tables (`DishTag`/`Tag`, `DishFlavorProfile`/`FlavorProfileValue`), so querying them live at search time is cheap and instantly correct, with zero mutation paths to remember. Ranking (§44.5) becomes a small ranked union of independently-scoped queries — `currentTitle` first (tiers 1–3), then a live cuisine query (tier 4), then a live Flavor-profile join (tier 5), then a live tag join (tier 6), then `currentStructuralSearchText` (tier 7) — rather than one mega-query or a weighted full-text-search setup. Full detail in `PRISMA_SCHEMA_PROPOSAL.md` §7.

**Settled by the owner (closes the Slice 5/6 open question on linked-Part title resolution):** the "resolved from each link's own target Version, never from the target Part's current title" clause above is now superseded — `PRODUCT_SPEC.md` §68.5 settles that a linked Part's *displayed* name always resolves from the target Part's live `Dish.currentTitle`, including in structural search (`currentStructuralSearchText`, tier 7), the same as every other place a Recipe/Part's identity is shown. `PartLink.targetDishVersionId` still pins the exact linked *content* (Ingredients/Instructions/etc.), unaffected by this. One consequence Slice 6 must account for: renaming a Part is now a new mutation path that has to refresh `currentStructuralSearchText` on every Recipe/Part whose current Version links to it, in addition to the existing version-creation refresh — it is no longer true that version-creation is "the one and only mutation path" for that field. Full detail in `PRISMA_SCHEMA_PROPOSAL.md` §7.

### D.2 Immutable content: `DishVersion`

```
model DishVersion {
  id              String   @id @default(cuid())
  dishId          String
  majorVersion    Int
  minorVersion    Int

  title           String    // Version-trigger correction pass: inert historical mirror only — title is
                             // stable Dish identity (D.1/E), never read back per-Version; kept in sync
                             // only at Version-creation time, never itself the source of truth
  description     String?   // mutable Version metadata — see the note below the model block
  imageAssetId    String?   // FK -> ImageAsset (D.2a, Correction 7) — never a raw URL/key duplicated per
                             // Version; mutable Version metadata — see the note below the model block

  yieldQuantity   Decimal?
  yieldUnit       String?   // "servings" | "cups" | free label, per §24.1
  prepTimeMinutes Int?
  cookTimeMinutes Int?
  difficulty      String?

  // Nutrition — inline, 1:1, optional (D.1 rationale: always at-most-one, no join needed)
  calories        Decimal?
  protein         Decimal?
  carbs           Decimal?
  fat             Decimal?
  nutritionBasis  NutritionBasis? // WHOLE | PER_OUTPUT_UNIT (round-2 Correction 9 — generalized from
                                  // the narrower PER_SERVING; nutritionBasisQuantity/nutritionBasisUnit
                                  // (e.g. 1 / "cup") represent any compatible output basis, not just servings
  moreNutrients   Json?           // Tier 2 FDC-sourced extras, labeled key/value/unit
  nutritionSourceProvider String?  // e.g. "fdc" — null once detached (§54.4)
  nutritionSourceId       String?
  nutritionSourceName     String?  // Slice 13: the source food's own description, for truthful attribution

  versionNote     String?   // the ONE mutable field on this row — see F.7

  sourceVersionId String?   // structural: "created from" (restore/promote/propagation), see F.6

  createdAt       DateTime @default(now())

  sections    Section[]
  topLevelPartLinks PartLink[] @relation("TopLevelLinks") // sectionId = null

  @@unique([dishId, majorVersion, minorVersion])
  @@index([dishId, majorVersion(sort: Desc), minorVersion(sort: Desc)])
}
```

**Version-trigger and Slice 5 image correction pass — a second sanctioned mutable-in-place exception.** `description` and `imageAssetId` are Version-associated but mutable, alongside `versionNote` — not governed by Correction 5's "no third exception" below, which is scoped specifically to nutrition. Editing either field, on the current Version or any historical one, is an ordinary `UPDATE` to the already-saved row (`applyVersionMetadataUpdate`, `src/lib/dishes/service.ts`) and never creates a new Version. This was a genuine design error in the original Slice 5 implementation — both fields were initially treated as ordinary immutable content requiring a new (automatic minor) Version for any change — corrected once the product rule was settled explicitly: Version association does not imply immutability for fields the product intends to be editable independent of cooking-content evolution.

**Correction 5 — nutrition immutability, no third exception.** `nutritionSourceProvider`/`nutritionSourceId`/`calories`/`protein`/`carbs`/`fat`/`moreNutrients` are ordinary immutable `DishVersion` content columns, governed by exactly the same rule as every other field on this row (§F.10) — **not** a second documented mutable exception alongside `versionNote`. Selecting an FDC result, editing a value, or detaching from a source may happen freely while a Version is still being composed in the editor (nothing is persisted yet, so there is nothing to mutate). Once a `DishVersion` row has been saved, changing a nutrition value or detaching its source is an ordinary content edit and goes through `createSmallUpdate`/`createNewVersion` (§F.5) like any other change — it is never applied as an in-place `UPDATE` to an already-saved row. This was already implied by the original proposal's single-exception design; it is stated explicitly here because §54.4's "may be detached and converted to fully manual data" reads ambiguously enough to invite a second exception, which this proposal deliberately declines to add.

### D.2a `ImageAsset` (Correction 7 — reference-aware, cross-account-safe image cleanup)

```
model ImageAsset {
  // Round-2 correction: NOT owner-scoped. A shared, immutable asset — an accepted cross-account
  // Recipe/Part copy reuses the SAME ImageAsset row (and Blob object) as its source, rather than
  // duplicating bytes. uploadedByUserId is attribution only, nullable, and never drives access
  // control or cascading deletion.
  id               String   @id @default(cuid())
  storageKey       String   @unique   // Vercel Blob object key — private store, Arch §L/§M
  uploadedByUserId String?             // nullable; SET NULL on the uploader's account deletion, never cascades
  createdAt        DateTime @default(now())
}
```

No `url` column: because the recommended Blob store is **private** (Correction 11), a raw stored URL would not be independently fetchable anyway — every read goes through an authenticated (or valid-share-token) DishFrame image route that resolves `storageKey` to a short-lived signed read on demand (§L/§M). **Authorization to read an image is derived entirely from the requesting user's access to some `DishVersion` that references the asset** (they own that `DishVersion`'s Dish, or hold a valid unrevoked `ShareLink`/accepted-share context for it) — never from `uploadedByUserId`, which is display attribution only ("uploaded by...").

**Attach-time authorization is a separate, earlier check** (Version-trigger and Slice 5 image correction pass §4, `assertImageAssetAttachable` in `src/lib/images/service.ts`): *before* any `createDish`/`editDish`/`applyVersionMetadataUpdate` write sets a `DishVersion.imageAssetId` to a client-supplied value, the service layer verifies the caller may actually use that asset — they uploaded it (`uploadedByUserId` matches), or a `DishVersion` they already own references it (the legitimate cross-account-sharing case this section sanctions). A client-supplied `imageAssetId` is never trusted merely because the row exists; an unrelated user cannot attach another account's unreferenced uploaded asset by guessing or otherwise obtaining its id. This is distinct from, and runs earlier than, the read-authorization check above — read authorization only ever asks "does some Version I own already reference this," which is exactly what attach authorization exists to gate in the first place.

**Reference strategy — query-based, not a maintained counter.** `DishVersion.imageAssetId` is the *only* place an `ImageAsset` is referenced (a `ShareLink.frozenSnapshot`, if it embeds image data at all, embeds a resolved display value at freeze time, never a live FK — see §H — so it never blocks cleanup). Because a new Version inherits the prior Version's `imageAssetId` by default (§F.8) rather than copying bytes, many `DishVersion` rows across many Versions of the same Dish **and, now explicitly, across *different* Dishes owned by *different* accounts after duplication or an accepted share** — the round-1 proposal assumed duplication always deep-copied underlying data, but the corrected design (§D.2a here, full rationale in `PRISMA_SCHEMA_PROPOSAL.md` §6) deliberately shares the image reference across the copy boundary instead, since re-uploading or physically duplicating an immutable image on every copy would be wasteful and would introduce a Blob-copy failure window the shared-reference approach avoids entirely — can legitimately point at one `ImageAsset` row.

Cleanup is therefore computed, not cached: whenever a `DishVersion` is deleted (as a consequence of its owning `Dish` being permanently deleted) or a Version's image is replaced/removed, the same transaction runs `SELECT COUNT(*) FROM "DishVersion" WHERE "imageAssetId" = $1` excluding the row(s) being removed; if the count is zero, the `ImageAsset` row is deleted and its `storageKey` is queued for a best-effort Blob-delete call (the same after-commit, best-effort discipline already established for external side effects in §I). A denormalized reference-count column is deliberately avoided — it is one more piece of state that can drift out of sync with the FK reality it's supposed to summarize, whereas a `COUNT(*)` against an indexed `imageAssetId` column is cheap and correct by construction at this data scale.

**Round-3 Correction 7 — `DishVersion.imageAsset` is explicitly `onDelete: Restrict`,** not left to Prisma's implicit default (which, for an optional relation, would be `SetNull`). An implicit `SetNull` here would be actively harmful: it would let an `ImageAsset` be deleted while a `DishVersion` still points at it, silently nulling out that Version's `imageAssetId` and losing historical photo content that's supposed to be immutable. `Restrict` makes the database physically refuse the delete unless the count-based check above has already confirmed zero references — the same "hard backstop behind an application check" pattern used elsewhere in this proposal (e.g., `PartLink`'s target relation, §G).

**Account deletion** nulls `uploadedByUserId` on every `ImageAsset` the departing user uploaded (attribution loss only), then runs the same `COUNT(*)`-of-referencing-`DishVersion`s check described above for each of that user's own now-cascading `Dish`/`DishVersion` rows — collecting the distinct set of `storageKey` values that reach zero references *before* issuing any Blob-delete call, so the compensating cleanup step issues exactly one delete call per distinct key rather than one per referencing `DishVersion` row, and correctly leaves untouched any `ImageAsset` still referenced by another account's surviving copy.

### D.3 `Section`

```
model Section {
  id             String  @id @default(cuid())
  lineageId      String  // stable across Versions when this Section survives — Correction 1, §D.-1
  dishVersionId  String
  name           String? // null = unnamed default Section, hidden per §9.1
  guidanceNote   String? // §32.3
  position       Int

  ingredients   Ingredient[]
  instructions  Instruction[]
  partLinks     PartLink[]

  @@index([lineageId])
}
```

### D.4 `Ingredient` (and its at-most-one substitute)

```
model Ingredient {
  id              String   @id @default(cuid())
  lineageId       String   // stable across Versions when this Ingredient survives — Correction 1, §D.-1;
                            // this is the id `PreferredUnitOverride.ingredientLineageId` (D.6a) targets
  sectionId       String
  name            String
  quantity        Decimal?          // structured numeric quantity — Decimal/`numeric`, never float
  quantityEnd     Decimal?          // range end, §10.4
  isApproximate   Boolean  @default(false)
  unit            String?
  displayText     String?           // free-text fallback: "to taste", "as needed" (§10.7)
  preparationNote String?
  isOptional      Boolean  @default(false)
  originalImportedText String?
  // groceryCategoryHint REMOVED (round-2 Correction 8) — remembered grocery categorization is a
  // user-level preference, not Recipe/Part Version content, and now lives on IngredientCategoryMemory
  // (a new user-owned model keyed by normalized ingredient name, §D.11a), so that remembering or
  // changing a category never creates a Recipe/Part Version. See §63.3.
  position        Int

  substituteForIngredientId String? @unique  // this row IS the substitute for another Ingredient row
  substituteFor   Ingredient? @relation("Substitutes", fields: [substituteForIngredientId], references: [id])

  @@index([lineageId])
}
```

**Settled precision (Slice 3 Gate 2 polish pass, PRODUCT_SPEC.md §10.6a):** `quantity`/`quantityEnd` are `@db.Decimal(12, 3)` — 3 places past the decimal point, the actual DB ceiling. The domain layer normalizes to that same precision *before* the write (`normalizeQuantity` in `schema.ts`, applied by both the client's fraction/mixed-number parser and `sanitizedSectionsOrThrow` in `service.ts`), so the database's own rounding is never the only thing enforcing it.

`substituteForIngredientId` being `@unique` enforces "at most one substitute per ingredient" at the database level. "A substitute cannot contain another substitute" (§11.4) is enforced by a service-layer check that a row already acting as a substitute (i.e., is itself pointed to by `substituteForIngredientId` on another row) can never itself set `substituteForIngredientId` — a narrow, testable invariant rather than a recursive constraint.

### D.5 `Instruction`

```
model Instruction {
  id        String @id @default(cuid())
  lineageId String // stable across Versions when this Instruction survives — Correction 1, §D.-1
  sectionId String
  text      String
  position  Int

  @@index([lineageId])
}
```

### D.6 `PartLink` — the nested-composition edge

**Correction 2 — a `PartLink` is explicitly one of two mutually exclusive states, not an implicit one.** The original proposal treated `materializedContent` as an optional overlay on top of always-present live target fields. That underspecifies the invariant: it must be structurally impossible for a row to have *both* a live target and materialized content (an ambiguous, partially-migrated row), or *neither* (a meaningless row). This proposal makes the state explicit via a `linkState` discriminator and makes both target-field groups nullable, with the either/or rule enforced by a database `CHECK` constraint (drafted in raw SQL in `docs/PRISMA_SCHEMA_PROPOSAL.md`, since Prisma's schema DSL does not yet have a stable, portable way to express a cross-column conditional constraint) — not by application discipline alone.

```
enum PartLinkState { LIVE MATERIALIZED }

model PartLink {
  id                  String @id @default(cuid())
  lineageId           String            // stable "occurrence" identity across Versions — Correction 1, §D.-1;
                                          // this is what propagation (§72.5) targets to select/exclude a
                                          // specific occurrence, independent of which Version it currently references
  containerVersionId  String            // the DishVersion holding this link (Recipe or Part)
  sectionId           String?           // null = top-level (attached directly to the DishVersion)
  linkState           PartLinkState @default(LIVE)
  position             Int

  // Present if and only if linkState = LIVE (enforced by CHECK constraint, not convention):
  targetDishId         String?          // stable Part being referenced — enables usage discovery (§71) & propagation candidacy (§72)
  targetDishVersionId  String?          // the EXACT immutable Part Version actually used

  // Present if and only if linkState = MATERIALIZED — set once, only by the Part-deletion
  // materialization flow (§74.3), the sanctioned exception to "DishVersion content never
  // changes after creation." Once set, this row is a frozen historical snapshot; it no longer
  // resolves to a live Part and targetDishId/targetDishVersionId are null.
  materializedTitle        String?
  materializedVersionLabel String?     // e.g. "V1.4"
  materializedContent      Json?        // resolved ingredients/instructions at deletion time

  @@index([lineageId])
  @@index([containerVersionId])
  @@index([targetDishId])
  @@index([targetDishVersionId])
  // Raw-SQL CHECK constraint added in migration (docs/PRISMA_SCHEMA_PROPOSAL.md):
  // (linkState = 'LIVE'         AND targetDishId IS NOT NULL AND targetDishVersionId IS NOT NULL
  //                              AND materializedTitle IS NULL AND materializedVersionLabel IS NULL AND materializedContent IS NULL)
  // OR
  // (linkState = 'MATERIALIZED' AND targetDishId IS NULL     AND targetDishVersionId IS NULL
  //                              AND materializedTitle IS NOT NULL AND materializedVersionLabel IS NOT NULL AND materializedContent IS NOT NULL)
}
```

**Invariant enforced partly at the database level, partly at the application layer.** Round 2 adds a real composite foreign key from `PartLink`'s live target fields to `Dish`/`DishVersion` with `onDelete: Restrict` (`PRISMA_SCHEMA_PROPOSAL.md` §2) — the database now physically refuses to delete a Part while any `LIVE` `PartLink` still references one of its Versions, a hard safety net behind the application's existing "resolve current usages, then materialize, then delete" flow (§74.2–74.3), which should always empty this out before the actual delete anyway. What the database still cannot express is the narrower condition that the referenced `Dish` must specifically have `kind = PART` (a plain FK only proves the row exists, not that it's the right *kind* of row) — that conditional remains an application-layer check, validated in the same service function that validates cycle-freedom (§G), and covered by a dedicated authorization/domain test (§O).

### D.6a `PreferredUnitOverride` (Correction 6 — ingredient-specific preferred-unit presentation)

The original proposal modeled saved preferred display units as one blanket `preferredUnits Json?` setting per `Dish` (e.g., "this whole Recipe prefers volume in cups"). That cannot express the real requirement: a user may want `16 tbsp` displayed as `1 cup` for one specific ingredient while a different `2 tbsp` elsewhere in the same Recipe stays as-is. A single per-Dish setting has no way to target one ingredient without affecting every other ingredient that happens to share a unit family.

```
model PreferredUnitOverride {
  id                  String @id @default(cuid())
  dishId              String
  ingredientLineageId String   // targets one specific ingredient's lineage (§D.-1), not the whole Dish
  unit                String   // the accepted display unit for that lineage, e.g. "cup"
  createdAt           DateTime @default(now())

  @@unique([dishId, ingredientLineageId])
}
```

`UserPreference.measurementSystem` (US/METRIC, §D.14) remains as the **broad fallback** — the default unit family suggested for an ingredient with no specific override. `PreferredUnitOverride` is the **specific, opt-in exception** a user saves after accepting a particular conversion suggestion for one ingredient (§53.6). Because it targets `ingredientLineageId` rather than a raw `Ingredient.id`, an accepted override for "the flour in this Recipe" keeps applying across future Versions where that same ingredient lineage survives, exactly like every other lineage-keyed behavior in §D.-1.

### D.7 Cooking: `CookingSession`, `CookingSessionUnit`, checkoffs, timers

```
enum SessionState { IN_PROGRESS COMPLETED ENDED_EARLY }

model CookingSession {
  id               String @id @default(cuid())
  ownerId          String
  dishId           String
  dishVersionId    String            // exact Version cooked — historical Versions cook without becoming current (§22.3)
  state            SessionState @default(IN_PROGRESS)

  startedAt        DateTime @default(now())
  endedAt          DateTime?
  rawElapsedSeconds     Int?         // computed from startedAt/endedAt at end time
  adjustedDurationSeconds Int?       // §38.3

  scaleFactor      Decimal?          // whole-session scale; per-unit overrides live on CookingSessionUnit
  cookingNotes     String?           // §31.3 — one freeform field, no separate table needed

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt // Correction 9 — needed by the recency index below; every session
                                        // mutation (checkoff, timer update, plan edit) touches this session's
                                        // own row and should bump it so "stale session" surfacing (§26.6) is correct

  units            CookingSessionUnit[]
  review           SessionReview?
  ratings          Rating[]

  @@index([ownerId, state, updatedAt])
  // Correction 9 — "only one In-progress session per stable Dish" (§26.2/26.3) is realized as a genuine
  // PARTIAL UNIQUE INDEX in raw migration SQL (docs/PRISMA_SCHEMA_PROPOSAL.md), not expressed here as an
  // ordinary Prisma @@index — Prisma's schema DSL has no first-class partial-index syntax, so this is
  // one of the raw-SQL additions layered onto the generated migration:
  //   CREATE UNIQUE INDEX "one_active_session_per_dish" ON "CookingSession" ("dishId") WHERE "state" = 'IN_PROGRESS';
}

model CookingSessionUnit {
  id               String @id @default(cuid())
  sessionId        String
  position         Int
  scaleFactor      Decimal?          // per-unit override, §24.4
  completedAt      DateTime?
  removedAt        DateTime?         // non-null = removed from active plan
  removedAfterProgress Boolean @default(false) // §27.3 — preserves evidence even when hidden from the working view

  // Correction 3 — self-contained display data, captured once at session-creation time, so this row
  // remains fully intelligible even after its source Recipe/Part/Section/PartLink is later edited or
  // permanently deleted. A Cooking Session is a historical record; it must never become unreadable
  // because the thing it was cooked from no longer exists.
  label                    String  // unit display name (Section name or Part title) at session-creation time
  sourceDishTitle          String  // the owning Recipe or Part's title at session-creation time
  sourceDishVersionLabel   String  // e.g. "V2.3" — the exact Version cooked, as a display string

  // Optional, nullable provenance — used only for "jump back to the source" navigation while it still
  // resolves; never required for display, and always allowed to go stale/dangle silently:
  sourceSectionLineageId   String? // null when the unit is a top-level Part
  sourcePartLinkLineageId  String? // set when this unit originated from a PartLink (top-level or nested-promoted, §23.4)

  checklistItems   CookingSessionChecklistItem[]
  timers           Timer[]
}

enum ChecklistItemKind { INGREDIENT INSTRUCTION }

model CookingSessionChecklistItem {
  id        String @id @default(cuid())
  unitId    String
  kind      ChecklistItemKind
  checkedAt DateTime?

  // Correction 3 — denormalized display content captured at session-creation time (not a bare
  // polymorphic sourceId that would require a live join back to Ingredient/Instruction to render):
  displayText      String   // ingredient name or instruction text, exactly as it read at session start
  displayQuantity  String?  // formatted quantity string (e.g. "1 1/2"), ingredient items only
  displayUnit      String?  // e.g. "cups", ingredient items only

  // Optional, nullable provenance — same rule as CookingSessionUnit above: useful while it resolves,
  // never required for the row to render correctly on its own:
  sourceLineageId  String?  // the Ingredient's or Instruction's lineageId at session-creation time
}

enum TimerState { RUNNING PAUSED EXPIRED DISMISSED }

model Timer {
  id               String @id @default(cuid())
  unitId           String
  name             String
  targetEndAt      DateTime? // set while RUNNING — survives refresh/device switch (§29.4)
  remainingSeconds Int?      // set while PAUSED
  state            TimerState @default(RUNNING)
}
```

### D.7a `CookingSessionPartUsage` (SLICE_9.md correction pass — durable Part-use log)

```
enum PartUsageRelation { DIRECT NESTED }

model CookingSessionPartUsage {
  id            String @id @default(cuid())
  sessionId     String
  unitId        String            // the top-level, PART-kind CookingSessionUnit responsible for including this occurrence

  partDishId    String?           // nullable/onDelete:SetNull, same pattern as Rating.dishId — a later Part deletion nulls this
  partVersionId String?

  partTitleSnapshot        String
  partVersionLabelSnapshot String

  relation             PartUsageRelation // DIRECT: this unit's own PartLink target. NESTED: found nested inside it.
  viaPartTitleSnapshot String?           // immediate containing Part's title, set only when relation is NESTED
  pathSnapshot         String            // e.g. "Chicken Curry → Sauce → Garlic Paste"

  createdAt     DateTime @default(now())
}
```

**Why this replaced read-time recursive reconstruction.** Slice 9 originally computed Part Last-cooked/history for a nested Part (§23.4's Recipe → Sauce → Garlic Paste example) by walking the *live* `PartLink` graph at read time, starting from the session's own pinned root link and descending through each Part's own current `PartLink` rows. That walk silently broke once an intermediate Part (Sauce) was permanently deleted: `deletePart`'s cascade (§J) removes the deleted Part's own `DishVersion`/`PartLink` rows entirely, so a later read-time walk down from it has nothing left to traverse — Garlic Paste's own Last-cooked/history would incorrectly disappear even though Garlic Paste itself, and the Recipe session that used it, both still exist.

**The corrected model.** The recursive `PartLink`-graph walk still happens exactly once — not at read time, but at session-creation/plan-edit time (`startCookingSession`/`addSessionUnits`, the only two places a `CookingSessionUnit` is ever created), inside the same transaction as the unit's own row. It discovers every Part occurrence reachable from that unit's own direct target (the direct target itself, `relation: DIRECT`, plus every Part nested inside it at any depth, `relation: NESTED`) and persists one `CookingSessionPartUsage` row per occurrence — identity via `partDishId`/`partVersionId` (never inferred from titles), plus title/Version-label/path snapshots for display that stay readable regardless of what happens to the source later.

**Active/removed state has no separate flag.** A `CookingSessionPartUsage` row's own "does this currently count as cooked" status is derived entirely from its `unit`'s own `removedAt` (join, not a duplicated column) — removing a unit from an active plan and later restoring it just works, with zero extra bookkeeping on the usage rows themselves.

**Deletion durability.** `CookingSessionPartUsage.partDishId`/`partVersionId` is a nullable, `onDelete: SetNull` composite FK to `DishVersion` — identical to `Rating`'s own pattern (§D.8). When an intermediate Part (Sauce) is later permanently deleted, only *its own* DIRECT usage row's live relation is nulled (snapshot fields survive); a deeper, surviving Part's (Garlic Paste's) own NESTED usage row was never related to Sauce via a live FK in the first place — only `viaPartTitleSnapshot: "Sauce"`, a frozen string — so there is nothing for Sauce's deletion to cascade into or null out. Garlic Paste's Last-cooked/history read straight off its own row, entirely unaffected.

**Read-time queries.** `getLastCookedAt`/`getPartCookingHistory` (`cooking/queries.ts`) now join against this table directly (`CookingSessionPartUsage.partDishId = <Part>` and `unit.removedAt IS NULL` and `session.state = 'COMPLETED'`) instead of walking `PartLink`. Multiple occurrences of the same Part within one session (used both directly and nested, or via two distinct nested paths) collapse into one history event per session, with occurrences summarized rather than duplicated.

**Migration/backfill.** The new table is purely additive — no existing column changed. Pre-existing `CookingSessionUnit` rows (created before this correction) have no usage rows at all; `backfillCookingSessionPartUsage()` (`cooking/service.ts`, run via `pnpm db:backfill:part-usage`) is an idempotent, one-time pass that re-derives them by re-running the same recursive walk against each such unit's still-resolvable root `PartLink` (skipping any whose target Part was already deleted before the backfill runs — nothing to reconstruct from, and the original session/unit rows are never touched or discarded either way).

### D.8 `SessionReview` and `Rating`

```
model SessionReview {
  sessionId               String  @id  // 1:1
  whatWentWell             String?
  whatDidNotGoWell         String?
  anythingElse             String?
  actualAmountQuantity     Decimal?
  actualAmountUnit         String?
  reviewAdjustedDurationSeconds Int?    // set through the Review UI specifically, §37.1
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
}

model Rating {
  id            String  @id @default(cuid())
  sessionId     String
  dishId        String   // the Recipe as a whole, OR a nested Part when rated via Tier 2 §75
  dishVersionId String
  tasterId      String
  value         Int      // 1..5, whole stars only
  createdAt     DateTime @default(now())

  @@unique([sessionId, tasterId, dishId])
}
```

`SessionReview` is created by the service layer **only** when at least one meaningful field is supplied (text, a rating, adjusted duration, or actual amount) — never as an empty row — directly implementing §33.3/33.4. This is an application-level rule, deliberately not a DB constraint, because "meaningful" spans multiple optional columns and a linked `Rating` table.

**Round-2 correction — historical per-Part ratings must survive the rated Part's later deletion (Correction 11).** A Tier 2 "rate individual Parts" rating (§75) has `dishId`/`dishVersionId` pointing at the *nested Part*, not the session's own top-level cooked item — a genuinely different Dish that can be independently deleted later while the Recipe (and its session) remains alive. The corrected `Rating` model makes `dishId`/`dishVersionId` **nullable**, `onDelete: SetNull` (not cascade), and adds `dishTitleSnapshot`/`dishVersionLabelSnapshot` **captured at creation time, always** — not as a later "materialize on delete" step, since the rating is small enough that there is no cost to always capturing it up front. When the nested Part is later deleted, `dishId`/`dishVersionId` are nulled by the database itself (no extra application step required), the row remains fully readable from its own snapshot fields, and — because every rating summary in this proposal is computed live via `WHERE dishId = ...` aggregate queries (§I) rather than cached — the now-nulled row automatically stops contributing to that Part's active analytics with no separate bookkeeping needed. A rating for the session's own top-level item never reaches this path at all: it is removed together with the whole session when that item's own Dish is deleted (§J), via the ordinary cascade already described for Recipe/Part deletion.

### D.9 `Taster`

```
model Taster {
  id         String   @id @default(cuid())
  ownerId    String
  name       String
  position   Int      // user-controlled display order (Slice 3 closeout, PRODUCT_SPEC.md §34.4a) — same drag-and-drop pattern as GroceryCategory.position (§D.-1/§63), no @@unique per owner (accepted tie tradeoff, resolved by a deterministic secondary sort — createdAt, then id — and by the fact that any later reorder rewrites every row's position anyway)
  isOwner    Boolean  @default(false) // the built-in "You" — seeded once per user
  archivedAt DateTime?
  createdAt  DateTime @default(now())
}
```

### D.10 Tags, Favorite, Flavor Profiles, Cuisine

```
model Tag {
  id          String  @id @default(cuid())
  ownerId     String
  normalizedName String            // trimmed + lowercased, unique per owner
  displayName String
  isFavorite  Boolean @default(false) // protected system tag — rename/merge/delete blocked at service layer
  createdAt   DateTime @default(now())

  @@unique([ownerId, normalizedName])
}

model DishTag {
  dishId String
  tagId  String
  @@id([dishId, tagId])
}

model FlavorProfileValue {
  id             String @id @default(cuid())
  ownerId        String
  normalizedName String  // Correction 9 — trimmed + lowercased, mirrors Tag's dedup rule
  displayName    String
  position       Int

  @@unique([ownerId, normalizedName])
}

model DishFlavorProfile {
  dishId               String
  flavorProfileValueId String
  @@id([dishId, flavorProfileValueId])
}
```

Cuisine is a plain `String?` directly on `Dish` (D.1) — free text with suggestion-from-history at the UI layer, per §46.3; no dedicated table, since the spec explicitly rejects a rigid taxonomy.

### D.11 Grocery

```
enum GroceryListMode { STANDALONE MEAL_PLAN_LINKED }

model GroceryCategory {
  id             String @id @default(cuid())
  ownerId        String
  normalizedName String  // trimmed + lowercased, mirrors Tag's dedup rule
  displayName    String
  position       Int

  @@unique([ownerId, normalizedName])
}

model IngredientCategoryMemory {
  // Round-2 Correction 8 — extracted entirely out of Ingredient/DishVersion content (which
  // previously carried a groceryCategoryHint field directly on Ingredient, §D.4). Remembered
  // categorization is a user-level preference, keyed by normalized ingredient name, wholly
  // independent of any Dish/Version — updating it NEVER creates a Recipe/Part Version.
  id                       String @id @default(cuid())
  ownerId                  String
  normalizedIngredientName String
  groceryCategoryId        String

  @@unique([ownerId, normalizedIngredientName])
}

model GroceryList {
  id             String @id @default(cuid())
  ownerId        String
  title          String
  mode           GroceryListMode @default(STANDALONE)
  linkedMealPlanId String?        // set only when mode = MEAL_PLAN_LINKED. Round-3 Correction 2:
                                   // the relation to MealPlan uses onDelete: Restrict, not SetNull —
                                   // SetNull would fire automatically the instant a MealPlan is deleted,
                                   // nulling this column WHILE mode is still MEAL_PLAN_LINKED and
                                   // immediately tripping the mode-consistency CHECK constraint before
                                   // any application code could react. Restrict instead forces the
                                   // Meal-Plan-deletion service to explicitly flip every affected list
                                   // to STANDALONE (clearing this field in the same statement) BEFORE
                                   // the MealPlan row can be deleted at all — see §I/§J below.
  completedAt    DateTime?         // non-null = frozen history (§60/§81.5)
  createdAt      DateTime @default(now())

  sources        GroceryListSource[]
  items          GroceryListItem[]
}

model GroceryListSource {
  id            String   @id @default(cuid())
  groceryListId String
  dishId        String?  // round-2 Correction 4 — nullable; SET NULL if the source is later deleted
  dishVersionId String?
  scaleFactor   Decimal?

  // Durable snapshot, always captured at generation time — survives dishId/dishVersionId nulling:
  sourceDishTitleSnapshot        String
  sourceDishKindSnapshot         DishKind
  sourceDishVersionLabelSnapshot String
}

model GroceryListItem {
  id             String  @id @default(cuid())
  groceryListId  String
  categoryId     String?
  name           String             // displayed name, possibly a combined/edited label
  quantityText   String?            // denormalized display value, frozen at generation time
  quantityDecimal Decimal?
  unit           String?
  isOptional     Boolean @default(false)
  isManual       Boolean @default(false)
  checkedAt      DateTime?
  position       Int

  contributions  GroceryItemContribution[] // Correction 4 — see below; replaces the original combinedFromSourceIds JSON
}
```

**Correction 4 — normalized grocery contributions, not a JSON breakdown.** A `GroceryListItem` is the single displayed row a user sees and checks off; a `GroceryItemContribution` is one traceable ingredient occurrence that fed into it. This is the difference between "a blob the UI happens to be able to render a breakdown from" and a real relational structure the domain logic can query, diff, and reconcile against.

```
model GroceryItemContribution {
  id                  String  @id @default(cuid())
  groceryListItemId   String            // the displayed row this contribution currently belongs to
  groceryListSourceId String?           // -> GroceryListSource (which Dish+Version+scale this came from); null for a manual item
  mealPlanEntryId     String?           // set when this contribution was produced by Meal-Plan sync (Slice 15/Tier 2)
  ingredientLineageId String?           // Correction 1's lineageId — the stable identity change-detection keys off of
  originalName        String           // the ingredient's own name at the time of contribution, before any combination
  quantityDecimal      Decimal?
  quantityText         String?
  unit                 String?

  @@index([groceryListItemId])
  @@index([ingredientLineageId])
}
```

This one model directly supports every behavior the correction calls for:

- **Source breakdown** (§61.3): the expandable "what makes up this combined line" view is simply `SELECT * FROM GroceryItemContribution WHERE groceryListItemId = ?`.
- **Safe combination** (§61.1): generation groups newly-created contributions by normalized-name + compatible-unit and creates one `GroceryListItem` per group, attaching all matching contributions to it.
- **Uncombine** (§61.4): re-partitions a `GroceryListItem`'s contributions back into one `GroceryListItem` per distinct-name group — a pure re-grouping operation over existing rows, never a destructive rebuild.
- **Manual merge** (§61.5): the user explicitly re-parents two contributions onto the same `GroceryListItem`.
- **Meal Plan synchronization** (§81.2/81.4): the resync function (Arch §H/§I) diffs the *current* set of contributions a live Meal Plan's entries would produce against the *stored* set (matched by `mealPlanEntryId` + `ingredientLineageId`), so it can precisely determine which contributions are unchanged (checkoff-preserving), which changed (flag, don't silently drop), and which disappeared (remove the contribution; if it was the last one behind a checked `GroceryListItem`, flag rather than silently deleting the user's checkmark).
- **Preserving checked state**: `checkedAt` lives on `GroceryListItem`, one level above individual contributions — as long as the resync maps old contributions to the same displayed item, the checkmark survives untouched.

**Round-2 addition — persisted change-tracking, not silent deletion (Correction 5).** The round-1 design above correctly diffed contributions during resync but did not specify *where* the outcome of that diff is recorded, which left open the possibility of a checked item's contributions simply being deleted with no visible trace. The corrected design adds a `state` (`ACTIVE | CHANGED | REMOVED`) and `previousQuantityDecimal`/`previousQuantityText`/`previousUnit`/`acknowledgedAt` directly on `GroceryItemContribution`, plus a mirrored `syncFlag` (`UNCHANGED | CHANGED | REMOVED`) and `flagAcknowledgedAt` on `GroceryListItem` itself. A contribution whose source disappears is marked `REMOVED`, not deleted outright, until the user has seen and acknowledged the change; a contribution whose quantity/unit changed keeps its previous value alongside the new one so the UI can show "was 2 cups, now 3 cups" rather than a bare overwrite. A `GroceryListItem` that loses every one of its contributions is flagged `REMOVED` while its `checkedAt` is left untouched, so a user who had already checked it off sees "you checked this off, but it's no longer in the plan" instead of the row silently vanishing. Full field list in `PRISMA_SCHEMA_PROPOSAL.md` §2.

### D.12 Meal Plans (Tier 2)

```
enum MealPlanEntryStatus { PLANNED IN_PROGRESS COOKED SKIPPED }

model MealPlan {
  id         String  @id @default(cuid())
  ownerId    String
  title      String
  startDate  DateTime
  endDate    DateTime
  notes      String?
  createdAt  DateTime @default(now())

  entries    MealPlanEntry[]
}

model MealPlanEntry {
  id               String @id @default(cuid())
  mealPlanId       String
  dishId           String?  // round-2 Correction 4 — nullable; SET NULL if the source is later deleted
  dishVersionId    String?
  cookDate         DateTime
  targetYieldQuantity Decimal?
  targetYieldUnit     String?
  note             String?
  status           MealPlanEntryStatus @default(PLANNED)
  linkedSessionId  String?

  // Durable snapshot, always captured at creation time — survives dishId/dishVersionId nulling:
  sourceDishTitleSnapshot        String
  sourceDishKindSnapshot         DishKind
  sourceDishVersionLabelSnapshot String

  plannedMeals     PlannedMeal[]
}

model PlannedMeal {
  id       String @id @default(cuid())
  entryId  String
  label    String   // e.g. "Monday lunch"
  date     DateTime
  servings Decimal
}
```

### D.13 Sharing (Tier 2)

```
enum ShareLinkMode { FIXED_SNAPSHOT CURRENT }

model ShareLink {
  id             String @id @default(cuid())
  ownerId        String
  mode           ShareLinkMode @default(FIXED_SNAPSHOT)
  tokenId        String  @unique       // Round-2 Correction 6 (supersedes round 1's hash-only design, which
                                        // could not support "owner revisits sharing management and copies an
                                        // existing active link"): a PUBLIC lookup key, not a secret. The
                                        // shareable URL token is `tokenId + "." + HMAC-SHA256(tokenId, SECRET)`,
                                        // recomputed on demand from tokenId + a server-only secret — never
                                        // itself stored. Full design and key-management notes in
                                        // `PRISMA_SCHEMA_PROPOSAL.md` §5 — see M.4.

  // Round-3 Correction 1 — split into two mode-specific field sets rather than one dishId
  // trying to serve both modes (a single dishId field would have had to participate in two
  // different relations sharing a scalar, which Prisma cannot reliably model):
  currentDishId      String?          // CURRENT mode only
  fixedDishId        String?          // FIXED_SNAPSHOT mode only
  fixedDishVersionId String?          // FIXED_SNAPSHOT mode only

  frozenSnapshot Json?                 // set only for FIXED_SNAPSHOT — title, content, cuisine, flavor profiles,
                                        // tags, displayed aggregate rating+count, per §83.3
  dishTitleSnapshot String             // captured at creation regardless of mode — keeps a revoked link's
                                        // entry in the owner's own sharing-management history readable
  expiresAt      DateTime?
  revokedAt      DateTime?             // set on owner-initiated revocation AND automatically when the source
                                        // Dish is permanently deleted (Corrected share-deletion behavior — see H/J).
                                        // Round-3 Correction 3: once revoked, the mode-specific field requirements
                                        // above are relaxed — see `PRISMA_SCHEMA_PROPOSAL.md` §6 for the full
                                        // field-lifecycle table across active/revoked, both modes.
  createdAt      DateTime @default(now())
}

enum DirectShareStatus { PENDING ACCEPTED DECLINED CANCELED }

model DirectShare {
  id            String @id @default(cuid())
  senderId      String
  recipientId   String?             // resolved account, once looked up
  recipientLookup String            // raw email/identifier entered by sender
  dishId        String?             // Round-3 Correction 4 — nullable; paired with dishVersionId
                                     // (both null or both set, enforced by a CHECK constraint)
  dishVersionId String?
  dishTitleSnapshot String          // captured at creation, survives dishId/dishVersionId nulling
  note          String?
  status        DirectShareStatus @default(PENDING)
  createdAt     DateTime @default(now())
}
```

### D.14 User-level preferences

```
enum MeasurementSystem { US METRIC }
enum FractionOrDecimal { FRACTIONS DECIMALS }
enum PrimaryRatingDisplay { GROUP_AVERAGE YOUR_RATING }

model UserPreference {
  userId               String @id  // 1:1 with Better Auth's User
  measurementSystem    MeasurementSystem @default(US)
  fractionOrDecimal    FractionOrDecimal @default(FRACTIONS)
  primaryRatingDisplay PrimaryRatingDisplay @default(GROUP_AVERAGE)
  timerSoundEnabled    Boolean @default(true)
  reviewPromptEnabled  Boolean @default(true)
  onboardingState      Json?   // per-guide completed/dismissed/incomplete map, §92.5
}
```

This is the **only** new model that touches the existing Better Auth schema, and it does so with a clean 1:1 FK to `User.id` rather than modifying Better Auth's own tables — preserving working infrastructure exactly as instructed.

### D.15 Tier 3 extension point (not built now)

```
// Not created in Tier 1/2. Shape shown to demonstrate the architecture already accommodates it.
model Publication {
  id                  String @id
  dishId              String
  publishedVersionId  String
  frozenSnapshot      Json
  status              String  // Published | Under review | Removed by moderation | Unpublished by owner
  publishedAt         DateTime
}
```

---

## E. Stable Identity versus Version-Owned Data

Exhaustive mapping, matching `PRODUCT_SPEC.md` §7.1/§7.2/§66.1 field-for-field.

| Field | Category | Model.field |
|---|---|---|
| Owner | Stable identity | `Dish.ownerId` |
| Current Version pointer | Stable identity (denormalized) | `Dish.currentVersionId` |
| Title | Stable identity (Version-trigger correction pass — moved from "Immutable Version content" below; see the note under the table) | `Dish.currentTitle` |
| Stage | Stable identity | `Dish.stage` |
| Cuisine | Stable identity | `Dish.cuisine` |
| Flavor profiles | Stable identity | `DishFlavorProfile` join |
| Tags (incl. protected Favorite) | Stable identity | `DishTag` join → `Tag` |
| Default batch scale | Stable identity (user preference on item) | `Dish.defaultBatchQuantity/Unit` |
| Preferred display units | Stable identity (user preference on item) | `Dish.preferredUnits` |
| Archive state | Stable identity | `Dish.archivedAt` |
| Duplication/source relationship | Stable identity (frozen snapshot) | `Dish.sourceKind/sourceDishId/sourceDishVersionLabel/sourceAggregateRating/...` |
| Created/updated timestamps | Stable identity | `Dish.createdAt/updatedAt` |
| Description, image | Version-associated but mutable (Version-trigger correction pass — see the note under the table; not immutable content) | `DishVersion.description/imageAssetId` |
| Authored yield | Immutable Version content | `DishVersion.yieldQuantity/yieldUnit` |
| Prep/cook time, difficulty | Immutable Version content | `DishVersion.prepTimeMinutes/cookTimeMinutes/difficulty` |
| Nutrition | Immutable Version content | `DishVersion.calories/protein/carbs/fat/...` |
| Sections, ingredients, instructions | Immutable Version content | `Section`/`Ingredient`/`Instruction` rows scoped to `dishVersionId` |
| Linked Part-Version references | Immutable Version content | `PartLink.targetDishVersionId` |
| Source Version (restore/promote/propagation) | Immutable Version content (structural) | `DishVersion.sourceVersionId` |
| **Version note** | **Mutable annotation on immutable content — one of two documented exceptions (see description/image above)** | `DishVersion.versionNote` |
| User preferences (measurement system, fractions, rating display, timer sound, review prompt) | User preference | `UserPreference.*` |
| Cooking Session content selection, checkoffs, timers, scale-used | Session snapshot (references immutable rows + session-owned overlay) | `CookingSession`/`CookingSessionUnit`/`CookingSessionChecklistItem`/`Timer` |
| Share fixed snapshot | Share/public snapshot | `ShareLink.frozenSnapshot` (+ `dishVersionId`) |
| Share current link | Live pointer, no snapshot | `ShareLink.dishId` (mode = CURRENT, resolved at render time) |
| Duplication/accepted-share starting point | Duplication/source snapshot | `Dish.sourceTitle/sourceDishVersionLabel/sourceAggregateRating/sourceRatingCount/sourceSessionCount` |

**Note on lineage identity (Correction 1):** `Section.lineageId`/`Ingredient.lineageId`/`Instruction.lineageId`/`PartLink.lineageId` are themselves ordinary immutable Version content (they live on rows scoped to one `dishVersionId`, same as everything else in that category) — they do not need their own row in the table above. What makes them worth calling out separately is that their *value* is deliberately carried forward, unchanged, across Versions where the underlying content survives, which is what makes cross-Version identity (comparison, reordering-vs-remove-and-add, per-ingredient preferences, occurrence-specific propagation) possible without treating "the same ingredient across two Versions" as an unanswerable question.

**How the architecture enforces this distinction (revised by the Version-trigger and Slice 5 image correction pass):** the domain service layer (§K) exposes exactly one function capable of writing to `DishVersion` **cooking-content** columns (Sections/Ingredients/Instructions, yield, prep/cook time, difficulty, nutrition) — the version-creation transaction (§F) — and it never accepts a `dishVersionId` to update those columns; it only ever inserts a new row. A second, narrower function, `applyVersionMetadataUpdate` (`src/lib/dishes/service.ts`), is the one sanctioned exception: it accepts an existing `dishVersionId` and updates only `description`/`imageAssetId` (`versionNote`'s existing update path is separate and equally narrow). Every other mutation path (Stage change, tag change, archive, favorite, title) writes to `Dish` only and is a plain update with no version side effect. This is enforced procedurally — exactly two narrow, purpose-built update paths exist for `DishVersion`, both scoped to the specific mutable fields they're allowed to touch, never a general-purpose `updateDishVersion(...)` — and verified by tests (§O) rather than relying on a database trigger to block updates.

---

## F. Versioning Strategy

### F.1 Storage of major/minor segments

`DishVersion.majorVersion`/`minorVersion` are plain integers (never decimals), matching §13.3 exactly — `V1.10` sorts after `V1.9` and before `V1.11` because `10 > 9` and `10 < 11` as integers, not as decimal fractions. `@@unique([dishId, majorVersion, minorVersion])` prevents any duplicate version number for a Dish.

### F.2 Current-Version selection

Computed once, at write time, and cached as `Dish.currentVersionId` (§D.1's rationale). The computation itself: "current = the row with the highest `majorVersion`, and within that, the highest `minorVersion`" (§13.5) — trivial to derive transactionally because a new version's `majorVersion` is either equal to or greater than every existing version's major (never skipped, never retroactively inserted), so a simple comparison (`newVersion.majorVersion >= dish's currently-cached current major`) is sufficient to decide whether to move the pointer, with no need to re-scan the full version history on every write.

### F.3 Historical-major refinement

"Save small update" from a historical major line increments that line's own highest minor (`majorVersion` fixed, `minorVersion = MAX(minorVersion WHERE majorVersion = X) + 1`) and **never** touches `Dish.currentVersionId` unless `X` happens to already be the highest major in existence. The selected base need not itself be that line's latest minor (§13.4's revised correction-pass example, `V2.1 → V2.3`) — `minorVersion` is always computed from the `MAX` aggregate, never from `base.minorVersion + 1`, so branching from an older saved minor while later ones already exist still allocates the line's true next number rather than colliding with one of them.

### F.4 Source-Version relationships

`DishVersion.sourceVersionId` records four distinct product situations with one column, disambiguated by context (never needs its own enum, because the calling service function already knows which situation it's in and writes the seeded `versionNote` prefix accordingly, per §14.2):
1. **New major from a historical line** (§13.6): `sourceVersionId` = the historical version being promoted.
2. **Propagation-only update** (§73): `sourceVersionId` = the prior current version of the same Dish (a "propagation" is really just an ordinary "save small update" whose only content delta is one or more `PartLink.targetDishVersionId` pointers — see F.6).
3. **Restore of an old direction as the next current major**: identical mechanism to (1).
4. **Non-sequential minor refinement** (§13.4/§13.6, added by the Slice 4 correction pass): `sourceVersionId` = the specific minor selected as base, recorded only when that base was *not* the major line's latest minor at save time. An ordinary sequential refinement — from a line's own current latest minor — leaves `sourceVersionId` unset, since consecutive numbering already implies the relationship without a stored one.

### F.5 Small update vs. new major Version (the one user-facing choice, everywhere)

Exactly two entry points into the version-creation service function, both requiring identical inputs (edited content) and differing only in the version-number computation:

```
createSmallUpdate(dishId, baseVersionId, content) → majorVersion = base.majorVersion,
                                                      minorVersion = MAX(minor WHERE major = base.major) + 1
createNewVersion(dishId, baseVersionId, content)   → majorVersion = MAX(major WHERE dishId = dishId) + 1,
                                                      minorVersion = 0
```

Both run inside one transaction: insert `DishVersion` (+ its `Section`/`Ingredient`/`Instruction`/`PartLink` children) → conditionally update `Dish.currentVersionId`/denormalized search fields → done. **The Recipe/Part editor's "Save small update" / "Save new version" choice is the only place in the entire product that decides which of these two functions is called** — propagation, restore, and duplication all reduce to calling one of these two with computed inputs, never a third path.

### F.5a Settled scope-narrowing of the user-facing choice (Slice 3 Gate 2 correction, revised by the Version-trigger and Slice 5 image correction pass)

F.5 described the small-update/new-version choice as "the only place in
the entire product that decides which of these two functions is called."
That remains true, but Gate 2 settled *when the editor actually shows it*:
`editDish` (`src/lib/dishes/service.ts`) independently classifies every
save via `diffVersionContent` (`src/lib/dishes/schema.ts`) plus its own
stable-metadata/mutable-metadata scalar comparisons, into one of four
buckets (PRODUCT_SPEC.md §13.2a) — stable Recipe/Part metadata (title,
Stage, cuisine), mutable Version metadata (description, image), non-
cooking Version-owned content (yield, prep/cook time, difficulty, Section
naming), and cooking content (Ingredients/Instructions) — and only calls
`createSmallUpdate`/`createNewVersion` — i.e., only consults a
`versionChoice` at all — for the last bucket. A non-cooking Version-owned
edit still calls `createSmallUpdate` exactly as F.5 describes, just
without the user ever choosing so; a stable-metadata-only or no-op save
calls neither and updates (or doesn't touch) the `Dish` row directly; a
mutable-Version-metadata-only save also calls neither — it calls
`applyVersionMetadataUpdate` instead (F.10), an in-place update to the
already-existing `DishVersion` row, never a new-Version-creating function.
This is a narrower *presentation* rule for the cooking-content bucket, not
a new code path there; the metadata-only buckets are a genuine addition
(the Slice 5 original implementation mis-classified description and image
into the non-cooking bucket, which this pass corrects).

### F.6 Propagation-only Recipe updates

A propagation update is: take the current content of the affected Recipe/Part, replace one or more `PartLink.targetDishVersionId` values with the newer Part Version, and call `createSmallUpdate` (§72.2/73.2's default) — or `createNewVersion` if the user overrides the classification (§73.3). No separate "propagation" table or code path exists beyond (a) the query that finds eligible current items referencing an older `PartLink.targetDishId` line, and (b) seeding the `versionNote` with the standard prefix (§14.2's "V2.3 → V2.4: Updated White Rice V3.1 → V3.2" format).

### F.7 Version comparison data

Computed on demand by diffing two `DishVersion` rows (+ their `Section`/`Ingredient`/`Instruction`/`PartLink` children) at read time — no comparison-specific storage. Because cooking content and yield/time/difficulty are immutable, comparing them is a pure, cacheable read with no risk of the compared content changing mid-view. **Revised by the Version-trigger and Slice 5 image correction pass:** title and image are excluded from the comparison snapshot entirely (`VersionMetadataSnapshot`, `src/lib/dishes/compare.ts`) — title because it is not Version-owned at all (nothing to diff), image because it is mutable Version metadata that can be edited in place after either side was saved, so diffing it would report whatever happens to be true *now* on each side rather than a material difference in recipe content between the two Versions. Description remains in the comparison snapshot — it is genuinely Version-associated content each side actually carries, even though (like image) it can also be edited in place later; excluding it was not part of this correction.

### F.8 Image inheritance

`createSmallUpdate`/`createNewVersion` default `imageAssetId` to the base version's value unless the caller explicitly supplies a replacement or an explicit "remove image" flag (§12.2) — implemented as an ordinary default-parameter behavior in the service function, not a database default (since the "default" is "whatever the previous version had," not a fixed value). Because inheritance simply copies an FK value rather than blob bytes, a single `ImageAsset` naturally ends up referenced by many Versions over time, which is exactly what §D.2a's query-based reference-counted cleanup is designed for.

Inheritance at Version-creation time is only one source of a shared reference now — **Version-trigger and Slice 5 image correction pass:** `applyVersionMetadataUpdate` (F.10) can also reassign an *existing* Version's `imageAssetId` in place, which can both create a new shared reference (attaching an image already used elsewhere) and free an old one (replacing/removing an image the edited Version previously held). §D.2a's reference-counted cleanup runs from both triggers now, not only Version creation and Dish deletion.

### F.9 Transaction behavior when creating a Version

One Postgres transaction per version creation: insert `DishVersion` row → bulk-insert its `Section`/`Ingredient`/`Instruction`/`PartLink` children → update `Dish.currentVersionId` (if applicable) and denormalized search fields → commit. A partial version (e.g., `DishVersion` row exists but its Sections don't) must never be observable — the transaction boundary is exactly this unit of work, no smaller.

### F.10 Protection against accidental in-place cooking-content mutation

Procedural, not just conventional: the domain layer's `queries.ts`/`service.ts` modules for Dish content expose only `createDishVersion(...)` (never a general `updateDishVersion(...)`) for cooking content (Sections/Ingredients/Instructions, yield, prep/cook time, difficulty, nutrition), and `updateDishMetadata(...)` (Stage/tags/cuisine/archive/Favorite/title — `Dish` columns only). **Revised by the Version-trigger and Slice 5 image correction pass:** two narrow, purpose-built exceptions exist, each scoped to exactly the mutable fields it's allowed to touch — `updateVersionNote(...)` (`versionNote` only, pre-existing) and `applyVersionMetadataUpdate(...)` (`description`/`imageAssetId` only, added by this pass) — never a general-purpose row update. Neither ever touches cooking-content columns, version numbering, `sourceVersionId`, or `Dish.currentVersionId`. A repo-wide lint rule (a `no-restricted-syntax` ESLint rule forbidding `prisma.dishVersion.update(` / `.updateMany(` / `.delete(` outside a small explicitly allow-listed set of files — the Part-deletion materialization function (§D.6/§J), `updateVersionNote`, and `applyVersionMetadataUpdate`) would turn "cooking content is immutable" from a convention developers must remember into something CI enforces; not yet implemented in this codebase, tracked as a gap rather than assumed present.

---

## G. Nested Parts and Cycle Prevention

### G.1 Representation

Already specified in §D.6 — `PartLink` rows attach either directly to a `DishVersion` (top-level) or to a `Section` within it, each with an explicit `position` for ordering. A Section may hold multiple `PartLink` rows (§67.1's "multiple Parts per Section") alongside its own `Ingredient`/`Instruction` rows — no structural limit.

### G.2 Why runaway recursion is already structurally impossible, and why an explicit check is still required

Because `PartLink.targetDishVersionId` always points at an **already-persisted, immutable** `DishVersion`, a version can only ever reference versions that existed strictly before it in time. A graph built by only ever adding edges from new nodes to already-existing nodes cannot contain a cycle among *versions* — true infinite recursion when resolving nested content is impossible by construction, full stop.

However, `PRODUCT_SPEC.md` §67.3 states the invalid case at the level of **stable Part identity** — "Part A contains Part A" is rejected as a product concept regardless of which specific (necessarily-distinct) versions are involved, because a user would see "White Rice" nested inside "White Rice" during cooking, and propagation suggestions would become confusing (a change to "White Rice" could appear to suggest updating "White Rice" itself). The version-level DAG guarantee prevents infinite *loops*; it does not prevent confusing, product-invalid *self-composition*. The architecture therefore validates acyclicity at the **stable-Dish-identity level**, which is a strictly stronger and more useful guarantee than mere runtime-safety.

### G.3 Validation algorithm

At the moment a new `DishVersion` is about to be created for stable Part `P` with a proposed set of `PartLink` rows (each pointing at an already-existing, already-immutable target `DishVersion`):

1. For each proposed `PartLink`, walk the **already-persisted** transitive closure of its `targetDishVersionId` (recursively following that version's own `PartLink` rows — a bounded, already-acyclic-by-construction graph, per G.2, so this walk cannot loop even before the new check is applied).
2. Collect the set of distinct **stable `Dish` ids** (via `targetDishId`, not version ids) reachable in that closure.
3. **Reject the save** if `P`'s own `Dish.id` appears in that set.

This is a straightforward reachability query — efficiently expressed as a recursive CTE (`WITH RECURSIVE`) walking `PartLink.targetDishVersionId → DishVersion.id → PartLink (that version's own links) → ...` — run against data that already exists and cannot itself loop, so the check terminates quickly and safely even in a pathological input.

### G.4 Validation timing

- **Immediate, at attach-time in the editor** (client calls a lightweight Server Action that runs the same reachability check against the specific PartVersion the user is about to attach) — gives instant feedback before the user invests more editing time.
- **Authoritatively re-checked inside the version-creation transaction** (§F.9) immediately before commit — closes the race window between "attach" and "save" (e.g., another tab concurrently created a new Part Version that would introduce a cycle). The transaction aborts and surfaces a clear domain error if the re-check fails.

### G.5 Query strategy for resolved nested content

Two supported access patterns, both built on the same recursive walk as G.3:

- **Shallow (one level)**: fetch a `DishVersion`'s direct `Section`/`Ingredient`/`Instruction`/`PartLink` rows — an ordinary Prisma `include`, used for the editor (which does not need nested Part content, only the reference + a summary) and for Cooking Setup's initial unit list.
- **Fully resolved (all nested levels)**: a recursive CTE producing a flattened list of every `Section`/`Ingredient`/`Instruction` reachable through the entire `PartLink` chain, used by Cooking Setup's "included Sections/Parts/nested linked Parts" preview (§21.2) and by the print/PDF view (Tier 2). Because every node in this walk is immutable, the result is cacheable per `(dishVersionId)` indefinitely (no invalidation needed beyond the version's own existence).

### G.6 Protection against pathological depth

A depth guard (e.g., 50 levels) is applied purely as a **safety valve against a latent bug or data-corruption edge case**, not as a product-facing restriction: the spec explicitly asks for "reasonable protection... without inventing an arbitrary product restriction" (§67.3). Realistic recipes nest at most a handful of levels deep (a Recipe containing a Part containing another Part); a 50-level cap is unreachable by any legitimate cooking composition and exists solely so a future bug that somehow bypassed the cycle check fails loudly (a thrown error) instead of exhausting server memory on a runaway recursive query.

---

## H. Snapshot and Materialization Strategy

One coherent rule governs every case the prompt asks about:

> **Live, normalized FK references are used everywhere content is still "owned" by an unbroken chain back to its immutable source. A denormalized JSON (or explicitly duplicated-row) snapshot is taken only at the specific, named freeze points the product spec calls out — and nowhere else.**

| Case | Representation | Why |
|---|---|---|
| Cooking Session content selection | Denormalized display snapshot captured once at session-creation time (`CookingSessionUnit.label`/`sourceDishTitle`/`sourceDishVersionLabel`, `CookingSessionChecklistItem.displayText`/`displayQuantity`/`displayUnit`, §D.7 Correction 3), plus optional nullable non-FK lineage pointers (`sourceSectionLineageId`/`sourcePartLinkLineageId`/`sourceLineageId`) used only for "jump back to source" navigation while they still resolve, never required for display | A Cooking Session is a historical record and must remain fully readable even after its source Section/Ingredient/Instruction/Part is later edited or permanently deleted — including a nested Part's deletion, whose historical `PartLink` materialization (row below) a live FK chain into the source would not survive cleanly. Session-owned data (checkoffs, timers, scale) is genuinely new information and lives in its own normalized rows; only source *content display* is snapshotted. Supersedes this row's original "normalized FK reference" description, which predated Correction 3 (corrected at Review Gate 4). |
| Standalone generated grocery-list snapshot | Denormalized (`GroceryListItem.name/quantityText/quantityDecimal/unit` written at generation time, not recomputed from source) | Spec explicitly forbids the list silently rewriting itself from later Recipe/Part edits (§60.3/§60.6) — a live reference would violate that; provenance (`GroceryListSource`) is kept alongside purely to power the *optional* same-major refresh prompt (§60.4), never for automatic recomputation. |
| Live Meal-Plan-linked grocery list | Normalized rows, reconciled by an explicit service-layer resync function on every relevant Meal Plan mutation | Must actively track Meal Plan changes while active (§81.2) — this is the one place ongoing synchronization is required, so it is implemented as an explicit, testable resync step inside the same transaction as the Meal Plan edit, never a background job or DB trigger. |
| Completed grocery-list history | Same normalized rows, simply no longer resynced (`GroceryList.completedAt` set) | Freezing is "stop reconciling," not "convert to JSON" — the rows are already the right shape. |
| Fixed share snapshot | Denormalized JSON (`ShareLink.frozenSnapshot`) captured once, at link-creation time | Must never change if the source is merely edited (§83.3). **Corrected per owner decision:** a fixed snapshot's *content* is immune to source edits, but the *link itself* is not immune to source deletion — see the corrected row below. |
| Live/current share link | No snapshot — `ShareLink.dishId` resolved fresh on every view | Explicitly the "follows current content" mode (§83.4); a snapshot would be actively wrong. |
| **Share-link revocation on source deletion (owner-confirmed correction to the original proposal)** | No snapshot of the *link's validity* — `ShareLink.revokedAt` is set transactionally, as an explicit step inside the Recipe/Part permanent-deletion transaction (§I), for **every** `ShareLink` row referencing the deleted `dishId`, regardless of mode | The original proposal treated a fixed snapshot as surviving source deletion, by analogy with duplication provenance. The product owner has settled this differently and authoritatively: **permanently deleting a Recipe or Part revokes every fixed and current share link for it** — having a frozen JSON snapshot on hand is not sufficient reason to keep a public URL resolvable once its owner has deleted the underlying item. The `ShareLink` row itself is retained (not hard-deleted) with `revokedAt` set, so it still appears, clearly marked revoked, in the owner's own sharing-management history — but the public `(share)/s/[token]` route treats any `revokedAt`-set link as unresolvable, identically to an owner-initiated revocation. |
| **Pending direct share on source deletion** | `DirectShare.status` set to `CANCELED` transactionally, as the same deletion transaction's next step, for every `PENDING` `DirectShare` referencing the deleted `dishId` | Same owner decision as above: **permanently deleting the source cancels any pending direct shares** — a recipient must never be able to accept a share pointing at content that no longer exists. |
| Duplicated/shared starting-point snapshot | Denormalized fields directly on `Dish` (`sourceTitle`, `sourceDishVersionLabel`, `sourceAggregateRating`, ...) | Must survive even source deletion (§19.3) — storing it on the row that must outlive the source is simpler than a separate child table that would need its own orphan-handling. |
| Historical Part references materialized at Part deletion | In-place JSON conversion of the specific `PartLink` rows affected (`materializedTitle`/`materializedVersionLabel`/`materializedContent`) | The one spec-sanctioned exception to "immutable rows are never rewritten" (§20, §74.3) — deliberately implemented as a single narrow, allow-listed mutation path (§F.10), not a general capability. |
| Future Tier 3 published snapshot | Denormalized JSON on a `Publication` row (§D.15) | Identical mechanism to the fixed share snapshot — no new pattern needed when Tier 3 is eventually built. |

### H.1 Share-link and direct-share lifecycle — authoritative, owner-confirmed

This was already settled in `PRODUCT_SPEC.md` and is restated here as the governing rule for §H/§I/§J, since the original proposal's snapshot table did not fully reflect it:

1. Editing a source Dish does not affect an already-created fixed share snapshot's content.
2. Archiving a source Dish does not automatically revoke its share links.
3. **Permanently deleting a Recipe or Part revokes all fixed and current share links associated with it** (both `revokedAt` set — see the corrected §H table row above).
4. **Permanently deleting the source cancels any pending direct shares** (`DirectShare.status → CANCELED`).
5. Independent copies already accepted or saved by other users survive and remain their property — entirely unaffected by anything that later happens to the sender's original.
6. **Account deletion removes all remaining share links and pending shares owned by that account** — a hard cascade delete (not a soft revoke/cancel), since the owner's entire audit trail is being removed together, per §J's account-deletion row.

---

## I. Mutations, Transactions, and Concurrency

| Mutation | Transaction boundary | Idempotency / concurrency notes |
|---|---|---|
| Create/edit Recipe or Part | One transaction: insert `DishVersion` + children, update `Dish` pointer/search fields | See F.9. Double-submit protection: client disables the submit control after first click; server-side, an accidental duplicate simply creates two adjacent, harmless versions — not corrupting, so no formal idempotency-key table is introduced for personal/family scale. |
| Convert local content → reusable Part | One transaction spanning both aggregates: create new `Dish`(kind=PART)+`DishVersion` (copied content) → create new containing `DishVersion` (content replaced with a `PartLink`) | Must be atomic — a Part created without its containing Recipe being updated to reference it (or vice versa) would be a visible half-state. |
| Detach a Part | One transaction: resolve the linked Part Version's content → create new containing `DishVersion` with that content inlined and the `PartLink` removed | Same atomicity requirement as above, in reverse. |
| Propagate Part update ("Update everywhere" / "Choose items") | **Per-item transaction**, not one giant transaction across the whole batch | A propagation batch can touch many Recipes/Parts. Committing each affected item's new-version creation independently (i) keeps lock durations short, (ii) allows legitimate partial success (one item fails validation, e.g. a cycle introduced by an unrelated concurrent edit, without blocking the rest), and (iii) matches the UI's natural per-item review/undo model. The orchestrating function collects a per-item success/failure report rather than an all-or-nothing outcome. |
| Permanently delete any Recipe or Part | One transaction: delete the stable `Dish` (cascading its own `DishVersion`/`Section`/`Ingredient`/`Instruction`/`PartLink`/standalone-history rows per §J), **plus, in the same transaction, set `revokedAt` on every `ShareLink` referencing this `dishId` and set `status = CANCELED` on every `PENDING` `DirectShare` referencing this `dishId`** (owner-confirmed correction, §H.1) | The share-revocation step must be inside the same transaction as the delete itself — a Dish that's gone but whose share link is still resolvable (or vice versa) would be a real, briefly-public data leak, not just a cosmetic inconsistency. |
| Delete a referenced Part | Two phases: (1) interactive resolution of current usages (each resolution — detach/replace/remove — is its own version-creation transaction per F.9); (2) one final transaction that materializes historical `PartLink` rows (§H) and deletes the stable Part + its standalone history, including the same share-revocation/direct-share-cancellation step as the row above | Phase 2 is bounded by realistic personal-library history size (hundreds, not millions, of historical rows) and is safe as a single transaction at that scale; documented as an explicit scaling risk (§P) with a chunked-job upgrade path if a library ever grows unusually large. |
| Begin a Cooking Session | One transaction: insert `CookingSession` + all `CookingSessionUnit`/`CookingSessionChecklistItem` rows from the (until-now-unpersisted) Cooking Setup selection | The partial unique index on `(dishId) WHERE state='IN_PROGRESS'` (§D.7) is the **authoritative** concurrency guard — a duplicate "Start cooking" (double-click, two tabs) fails the constraint and is caught and surfaced as a friendly "resume/end/cancel" prompt (§26.2), not a raw 500. |
| Edit an active Cooking Session's plan (add/remove/restore/reorder units) | One transaction: insert new `CookingSessionUnit`/`CookingSessionChecklistItem` rows for additions (same self-contained snapshot rule as session-start, §D.7); set `removedAt`/`removedAfterProgress` for removals; clear `removedAt` for restorations; update `position` for reordering | All position/removal-state changes from one edit action commit together so the active plan is never observed half-updated. The "removing the final active unit" guard (§27.4) is a pre-transaction read-then-decide check in the service function, not a database constraint (added at Review Gate 4, closing a gap this table previously left implicit). |
| End a Cooking Session | One transaction: update `state`/`endedAt`/duration fields | — |
| Save/edit/delete a Session Review + Ratings | One transaction covering `SessionReview` + all `Rating` rows for that session | Deleting a Review's ratings recalculates summaries at read time (ratings are aggregated on demand — see §I note below — so "recalculation" is simply the next read reflecting fewer rows, not a separate batch job). |
| Generate a grocery list | One transaction: insert `GroceryList` + `GroceryListSource` + all `GroceryListItem` rows | — |
| Sync a Meal-Plan-linked grocery list | One transaction per Meal Plan mutation that affects linked lists (add/remove/change entry, adopt new Version) — the resync logic runs inside that same transaction | Preserves checkoff state by matching on a normalized ingredient key before diffing (§81.4); a checked item that materially changes or disappears is flagged, never silently dropped. |
| Adopt a newer Version in a Meal Plan | One transaction: update `MealPlanEntry.dishVersionId` + resync linked grocery list | — |
| **Delete a Meal Plan (round-3 Correction 2)** | One transaction, in order: (1) for every `GroceryList` with `linkedMealPlanId` = this plan, `UPDATE ... SET mode = 'STANDALONE', linkedMealPlanId = NULL` — one statement, so the mode-consistency CHECK constraint is never observed in a violated state; (2) `DELETE FROM MealPlan` | `GroceryList.linkedMealPlan` is `onDelete: Restrict`, not `SetNull` — the database refuses the plan delete until step (1) has already run, so a developer who forgets step (1) gets a loud FK-violation error instead of a silently inconsistent row |
| Accept an independent shared copy (link or direct share) | One transaction: create new `Dish`+`DishVersion` for the top-level item **and** recursively create owned copies of every distinct linked Part Version it depends on (each copied Part copied exactly once even if referenced multiple times) | Must be all-or-nothing — a Recipe copy with a dangling reference to an uncopied Part would be broken. Bounded by realistic nesting depth (§G.6), so one transaction is appropriate rather than a background job. |
| Account deletion | Hybrid: Postgres `ON DELETE CASCADE` handles all relational rows once the `User` row is deleted — this includes a genuine **hard delete** of every `ShareLink` and `DirectShare` row the account owns (not the soft revoke/cancel used for a single Dish's deletion, §H.1's point 6), since the whole account's audit trail is being removed together; an explicit application-level **compensating step** runs before or after to remove `ImageAsset`-backed blob-storage objects (deduplicated by `storageKey` before issuing delete calls, §D.2a), since Postgres cannot cascade into external storage | Documented as an accepted, best-effort eventual-consistency edge case for the blob-cleanup half (an orphaned blob is a storage-cost nit, never a data-integrity or privacy problem, since the DB records referencing it are already gone) — a future orphan-sweep job is a reasonable low-priority follow-up, not a Tier 1/2 requirement. The relational cascade half has no such caveat: it is a normal, fully-consistent Postgres transaction. |

**On rating/summary "recalculation" generally:** this proposal recommends **computing rating summaries at read time** (session average, latest-rated-session average, per-Version average, all-time average, per-Taster average, etc. — §36.3's full list) via aggregate SQL queries, not maintaining denormalized running totals. At personal/family data volumes, an aggregate query over a Dish's `Rating` rows is fast and always correct by construction — there is no "recalculate after deletion" step to get wrong, because nothing was ever cached in the first place. If a specific summary view later proves too slow at read time (unlikely at this scale), a targeted materialized/denormalized counter can be added then, backed by the same source-of-truth rows.

**On external side effects (Resend emails):** always performed **after** the owning transaction commits, never inside it — a failed email send must never roll back a successful DB mutation (e.g., a direct-share notification failing to send should not un-create the share). Failures are logged, not silently swallowed, and never block the user-visible success state.

**On concurrency for the editor (revised by the Slice 4 correction pass):** because every save creates a new version rather than overwriting, classic lost-update corruption is avoided by design. Any immutable Version belonging to the Dish — current or historical, latest minor in its line or not — is always a valid editing base; a Version never becomes "stale" merely because a later Version was saved after it (§13.4). Two devices editing from the same base concurrently are therefore not rejected up front. Instead, concurrency is handled entirely at version-*allocation* time: the version-creation transaction runs at `Serializable` isolation with a small bounded retry (recomputing the next minor/major fresh on each attempt) on a recognized write conflict or on the `@@unique([dishId, majorVersion, minorVersion])` backstop firing; only after retries are exhausted does the save surface a friendly `ConflictError` ("this changed elsewhere, please try again") rather than a raw database error. This replaces the original proposal's up-front "must still be the latest minor" rejection, which incorrectly treated an older, still-perfectly-valid historical Version as unusable.

---

## J. Deletion and Cascade Behavior

| Target | True cascading delete | Retained static snapshot | Detached/materialized | Surviving independent copies |
|---|---|---|---|---|
| **Recipe** (permanent delete) | Its own `DishVersion`s, `Section`/`Ingredient`/`Instruction`/`PartLink` rows, standalone Cooking Sessions/Reviews/Ratings, unreferenced `ImageAsset`s (§D.2a) — **and every `ShareLink`/`DirectShare` referencing it is revoked/canceled in the same transaction (§H.1, owner-confirmed correction)**, not preserved | Completed grocery lists, Meal Plans, and any independent copy another user already saved keep their frozen snapshots (§H) — **but a not-yet-accepted share link or pending direct share is explicitly NOT a retained static snapshot; it is revoked/canceled, full stop** | — | Any Dish previously duplicated *from* this Recipe is unaffected; its `sourceDishId` is nulled while `sourceTitle`/`sourceDishVersionLabel`/aggregate snapshot fields remain (§H). A recipient who already accepted a share or saved a copy before deletion keeps that copy — deletion only forecloses *future* access via the now-revoked link/pending share. |
| **Part** (permanent delete) | The stable Part, its `DishVersion`s, its own standalone Cooking Sessions/Reviews/Ratings/Cooking notes, unreferenced `ImageAsset`s — **and every `ShareLink`/`DirectShare` referencing it, same as Recipe deletion above** | Historical Recipe/parent-Part Versions and their Cooking Sessions keep the Part's contribution via **materialized** `PartLink` rows (below) | Every current usage must be resolved first (detach/replace/remove, each creating a new containing Version) before deletion proceeds; every remaining historical `PartLink` row referencing this Part is converted in place to a frozen snapshot (`materializedTitle`/`materializedVersionLabel`/`materializedContent`), enforced by the `linkState` CHECK constraint (§D.6) | Duplicated Parts (independent `Dish` rows) are wholly unaffected |
| **Recipe/Part Version** | Never independently deletable — a Version is deleted only as a consequence of its owning Dish being permanently deleted | n/a | n/a | n/a |
| **Taster** (permanent delete) | The Taster row, all `Rating` rows tied to that Taster | Session/Review text content is untouched (ratings are the only Taster-owned data removed) | — | — |
| **Nested Part rating survives its rated Part's deletion (round-2 Correction 11)** | — | The `Rating` row itself, its `value`, its Taster link, and its `dishTitleSnapshot`/`dishVersionLabelSnapshot` all survive | `Rating.dishId`/`dishVersionId` are SET NULL (not cascaded) by the database; the row stops appearing in that Part's live rating-summary aggregates automatically, with no separate bookkeeping step, and remains visible as historical evidence within its still-alive owning Recipe session | — |
| **Session Review** (delete without deleting session) | The `SessionReview` row and its `Rating` rows | `CookingSession`, its `CookingSessionUnit`s, checklist/timer history, and `cookingNotes` all survive (§33.6) | — | — |
| **Individual Rating** | The `Rating` row | Session and Review remain; summaries simply reflect one fewer row on next read (no cached total to fix) | — | — |
| **Grocery List** (delete) | The `GroceryList`, its `GroceryListItem`/`GroceryListSource` rows | — | — | — |
| **Meal Plan** (delete) | The `MealPlan`, its `MealPlanEntry`/`PlannedMeal` rows | A **linked, already-completed** grocery list is historical and independent of the plan by definition (§81.5) and is not deleted with the plan | An **active** linked grocery list loses its live-sync source; the deletion service explicitly converts it to a `STANDALONE` frozen list (mode + `linkedMealPlanId` cleared together, in the same statement, per round-3 Correction 2) rather than cascading its deletion, so accidental Meal-Plan deletion never silently destroys an in-progress shopping list — and the database physically refuses the Meal Plan delete (`onDelete: Restrict`) until this step has actually happened |
| **Image** (`ImageAsset`) | Deleted, and its Blob object queued for best-effort removal, only when the `COUNT(*)` of surviving `DishVersion` rows referencing it drops to zero (§D.2a) — never merely because one referencing Version was deleted or replaced | — | — | — |
| **Share revocation — owner-initiated** | `ShareLink.revokedAt` set; the row itself is retained for audit/history in the sharing-management view, not hard-deleted | The frozen snapshot (if `FIXED_SNAPSHOT`) remains in the row but is no longer publicly resolvable once revoked | — | Any copy already saved by a recipient before revocation is a fully independent Dish and is entirely unaffected |
| **Share revocation — triggered by source deletion (owner-confirmed correction)** | Same mechanism as owner-initiated revocation (`ShareLink.revokedAt` set, row retained for the owner's own history) — but triggered automatically, as part of the Recipe/Part deletion transaction itself (§I), not a separate user action; every `PENDING` `DirectShare` for the same `dishId` is set to `CANCELED` in the same transaction | — | — | Same as above — already-accepted copies are unaffected |
| **Account deletion** | Every owned aggregate above, recursively, via `ON DELETE CASCADE` from `User` — **including a hard delete of every `ShareLink`/`DirectShare` the account owns**, not a soft revoke (§H.1, point 6) | Other users' already-accepted independent copies retain their frozen provenance snapshot with `sourceDishId` nulled (no personally-identifying live profile link survives, per §91) | Owned blob-storage images removed via a best-effort, key-deduplicated compensating step (§D.2a/§I) | Other users' independent copies survive entirely, per §91's explicit requirement |

---

## K. Server and Data-Access Architecture

### K.1 Server Components vs. Client Components

Covered in §C.5 with a concrete table; the general rule: **default to Server Components; drop to Client Components only where genuine per-keystroke or real-time interactivity is required** (editors, Cooking Mode, filters, timers) — no change to the scaffold's existing posture, just applied consistently to the new domain surface.

### K.2 Server Actions vs. Route Handlers

- **Server Actions** for every domain mutation reachable from a form or button inside the authenticated app (create/edit Dish, Start/End cooking, save Review, generate grocery list, etc.) — colocated per domain module (`src/lib/<domain>/actions.ts`), each a thin wrapper: session check → Zod parse → call into `service.ts` → `revalidatePath`/`redirect`.
- **Route Handlers** reserved for: the existing Better Auth catch-all and `/api/health`; new backup/export downloads (`/api/export/account`, `/api/export/dish/[dishId]`) because these stream a generated file rather than returning a React response; the Recipe Gallery migration upload endpoint (`/api/import/gallery`) if a file-upload body is involved; and the public share view, which is a normal Server Component page, not a Route Handler, since it renders HTML, not a downloadable payload.

### K.3 Validation library and schema placement

Zod, already the established pattern (`src/lib/env/server.ts`, `src/lib/contact/schema.ts`). Every domain module gets its own `schema.ts` colocated with its `actions.ts`, reused for both server-side parsing and (where the editor needs it) client-side type inference — no new validation library introduced.

### K.4 Service/domain-function boundaries

Per domain area, one module directory under `src/lib/`:

```
src/lib/
  dishes/          — shared Recipe+Part engine: schema, queries, actions, service (create/edit/version/duplicate/archive/delete)
  sections/        — Section/Ingredient/Instruction/PartLink mutation helpers used by dishes/service
  cycles/          — the G.3 reachability-check function, unit-tested in isolation
  cooking/         — Cooking Setup → Session lifecycle, checkoffs, timers
  reviews/         — Session Review + Rating
  tasters/
  tags/            — Tag + Favorite + FlavorProfileValue
  nutrition/       — manual entry + FDC lookup client (Tier 2)
  grocery/         — list generation, combination logic, category management
  mealplans/       — Tier 2
  sharing/         — Tier 2: ShareLink + DirectShare
  importExport/    — paste-and-review, Recipe Gallery migration, backup/export builders
  preferences/     — UserPreference
  auth/ db/ env/ site/ contact/  — unchanged, existing
```

Each module's `service.ts` is framework-agnostic (plain functions taking a Prisma client/transaction handle and typed inputs, returning typed results or throwing typed domain errors) — unit-testable without a Next.js request context, and reusable from Server Actions, Route Handlers, and test factories alike.

### K.5 Transaction helpers

A small `withTransaction(fn)` wrapper around `prisma.$transaction` used throughout `service.ts` modules; composable domain invariants (version numbering, cycle check, deletion materialization) are implemented as plain functions called inside that transaction, not scattered inline SQL.

### K.6 Authorization checks

Two layers, deliberately redundant (defense in depth):
1. Every Prisma query for user-owned data includes `ownerId: session.user.id` directly in its `where` clause — never fetched by id alone and checked after the fact.
2. A small set of centralized guard functions (`getOwnedDishOrThrow(userId, dishId)`, `getOwnedCookingSessionOrThrow(userId, sessionId)`, etc.) used at the top of every service function touching a specific aggregate, walking up to the owning `Dish`/`CookingSession`/`GroceryList`/`MealPlan` row for nested entities (Sections, Ingredients, CookingSessionUnits) rather than re-deriving ownership logic ad hoc per call site.

### K.7 Query organization

Reusable `select`/`include` const objects per domain (e.g., `dishCardSelect`, `dishDetailInclude`) defined once in each module's `queries.ts`, imported everywhere that shape is needed — avoids both `include: true` over-fetching and ad hoc, drifting field lists across call sites.

### K.8 Caching and revalidation

Because nearly every authenticated route depends on `getServerSession()` (reading cookies), it is inherently per-request dynamic — Next.js's App Router caching model does not meaningfully apply to most of the signed-in product surface, and this proposal does not fight that: correctness and Postgres query performance (via the indexes in §N) carry the private app, not framework-level caching.

The one genuine exception is the **public share view** (`(share)/s/[token]`, §C.9), which is not session-scoped and is exactly the kind of route Next.js 16's Cache Components / `use cache` directive is built for: tag the read with `cacheTag('share:' + tokenId)` and call `updateTag('share:' + tokenId)` from the revoke/regenerate Server Action, giving a fast, correctly-invalidated public page without any bespoke caching code. **Because permanently deleting a Recipe or Part now also revokes its share links (§H.1), the Dish-deletion transaction's post-commit step must call `updateTag` for every `tokenId` it just revoked, exactly as the explicit revoke action already does** — otherwise a cached public page could keep serving stale (and now-deleted) content for the remainder of its cache lifetime despite the underlying `ShareLink` row correctly showing `revokedAt` set. Ordinary `revalidatePath` calls after mutations remain the mechanism everywhere else (e.g., revalidate `/recipes` and `/recipes/[id]` after a save), matching the existing scaffold's Next.js defaults.

### K.9 Background work

**None is required for Tier 1 or Tier 2.** Every mutation in this proposal — including bulk Part propagation across a personal library — completes comfortably within a single request/response cycle at realistic personal/family data volumes, well inside Vercel Fluid Compute's function timeout headroom. Introducing a queue (Vercel Queues or otherwise) now would be exactly the "premature distributed architecture" the spec repeatedly warns against. If a specific operation (e.g., propagation across an unusually large shared-Part library) is later measured to be slow in practice, the correct next step is a narrowly scoped background re-invocation for that one operation — not a general-purpose job queue adopted preemptively.

### K.10a Database adapters across environments (Correction 10)

The existing scaffold's `src/lib/db/prisma.ts` constructs a single `PrismaNeon` adapter unconditionally. This proposal recommends making that environment-conditional:

- **Deployed environments (Vercel, against Neon):** `@prisma/adapter-neon` — unchanged, already correct, already working in production.
- **Local development and CI (against plain Postgres — a Docker container, not Neon):** `@prisma/adapter-pg`, Prisma's standard `node-postgres`-backed adapter, selected when `DATABASE_URL` points at a non-Neon host (or via an explicit `DATABASE_DRIVER=neon|pg` environment flag, whichever proves cleaner at implementation time — a small decision left to implementation, not architecturally significant either way).

This resolves the test-database-strategy question the original proposal left open (§P.2, item 3): **CI uses a disposable PostgreSQL service container in GitHub Actions** (a standard `postgres:` service block in the workflow YAML, fresh for every run, no persistent state to manage), not a Neon branch per run. A `docker-compose.yml` is additionally provided for local integration-test convenience, but is optional tooling, not the CI mechanism itself — CI's own service container is independent of whether a given developer happens to use Docker Compose locally.

### K.10 Error-handling conventions

Domain service functions throw a small set of typed errors (`NotFoundError`, `AuthorizationError`, `ValidationError`, `ConflictError` — the latter covering both the cycle-check rejection and the stale-edit/concurrency rejection from §I). Server Actions catch these and return a consistent `{ ok: false, code, message }` shape for `useActionState`-driven forms, rather than letting a thrown error cross the server/client boundary as an opaque digest. Genuinely unexpected errors are left to bubble to the existing `error.tsx`/`global-error.tsx` boundaries.

---

## L. External Integrations

| Integration | Architecture |
|---|---|
| **USDA FoodData Central search** | Server-only API key, read as `FDC_API_KEY` (matching the value already registered and configured in both `.env.local` and the Vercel project's environment variables — never sent to the client). A thin Server Action proxies debounced client search input to `src/lib/nutrition/fdc-client.ts`, which calls FDC and shapes the response. Generic-food results are stable enough to cache briefly (short-TTL Vercel Runtime Cache) to reduce redundant lookups during active search-as-you-type. Not implemented until Slice 13 (`BUILD_PLAN.md`); this is a schema/architecture-only mention at Gate 1. |
| **Editing/detaching imported nutrition** | `DishVersion.nutritionSourceProvider`/`nutritionSourceId` (nullable) record provenance. Per Correction 5 (§D.2), this is **not** a mutable-in-place exception: "detach" is only ever performed as part of an ordinary `createSmallUpdate`/`createNewVersion` call on an unsaved edit — ​the resulting *new* Version has those two columns null and its numeric values otherwise unchanged, while the prior, already-saved Version's nutrition fields are left exactly as they were, untouched. |
| **Optional barcode lookup** | Entirely client-side decoding (a JS/WASM UPC/EAN decoder reading camera frames) — no server round-trip for the scan itself. The decoded GTIN is then sent through the same FDC proxy used for text search to resolve a branded result. Isolated behind its own component so it can be deferred to Tier 3 without touching the nutrition data model at all, exactly as the spec allows (§54.7). |
| **Resend** | Already wired for the contact form; the identical `src/lib/contact/email-template.ts` pattern extends to a `src/lib/sharing/email-templates.ts` for optional direct-share notifications (Tier 2) — same provider, same fire-and-forget-after-commit discipline (§I). |
| **Image storage** | **Recommend a private Vercel Blob store** (Correction 11 — owner-confirmed), provisioned via the Vercel Marketplace integration flow at Slice 5 implementation time, not now — Gate 1 is schema-only and does not install or provision anything. Every Recipe/Part image is private by default; there is no bare public Blob URL anywhere in the design. Access always goes through an authenticated DishFrame image route (e.g. `/api/images/[assetId]`) that checks either (a) the requester owns the Dish, or (b) the request carries a valid, unrevoked `ShareLink` token for that specific `dishId` (necessary because the public share view, §C.9, must still be able to render an image for a logged-out viewer) — never a directly-fetchable storage URL embedded in a page. Represented by `ImageAsset` (§D.2a), referenced by `DishVersion.imageAssetId`, with query-based reference-counted cleanup rather than a maintained counter. Uploads use Vercel Blob's signed-URL client-upload pattern (server issues a short-lived, ownership-validated token after checking MIME type/size) rather than proxying the full file through a Server Action body. |
| **Export/download generation** | Computed synchronously, on demand, streamed by a Route Handler (`/api/export/account`, `/api/export/dish/[id]`) — no persistent export-job table at this scale. An explicit field-whitelisting DTO builder per aggregate (never a raw table dump) guarantees secrets (§M.5) are excluded by construction, not by a "remember to strip this" convention. |
| **Import parsing / Recipe Gallery migration** | One `src/lib/importExport/` module with swappable parser stages: `rawSource → structuredProposal → (review UI) → confirm → normal Dish-creation service call`. The deterministic paste parser, the eventual Recipe-Gallery-specific parser, and a future optional AI-assisted parser (Tier 3, §59.3) are all just different implementations of the first stage; none of them are permitted to call the Dish-creation service directly — every import, without exception, passes through the same review/confirm step as every other creation path. |

---

## M. Security and Privacy

- **Owner scoping**: every owner-scoped table carries (directly or via a resolvable parent join) an `ownerId`; every query is scoped in its `where` clause, not just checked after fetch (§K.6).
- **Authorization for nested relationships**: centralized guard functions walk from a nested entity (Section, Ingredient, CookingSessionUnit) up to its owning aggregate root before any read or write is permitted — implemented once per aggregate type, not reinvented per call site.
- **Taster privacy**: Tasters are owner-scoped rows with no account link whatsoever in Tier 1/2 (per spec, no future account-linking requirement exists yet); no cross-user visibility path exists because no query ever joins across `ownerId` boundaries for this table.
- **Share-link token storage and revocation (round-2 Correction 6, superseding round 1's hash-only design):** round 1 stored only a SHA-256 hash of the token, closing the "database read hands out a working link" risk — but a pure hash cannot be reversed, so it could not support the settled requirement that an owner can later revisit sharing management and copy an already-active link. The corrected design keeps the same security property while adding recoverability: `ShareLink.tokenId` is a plaintext, public lookup key (not itself secret), and the actual shareable URL token is `tokenId + "." + HMAC-SHA256(tokenId, SHARE_LINK_HMAC_SECRET)`, where the secret lives only in a server-only environment variable and is **never persisted in the database**. A database read alone (backup, compromised replica, a debugging `SELECT *`) still cannot produce a working share URL, because forging the signature requires the secret the database never holds — but the server itself can recompute the identical signature at any time from `tokenId` alone, which is exactly what "copy existing link" needs. Full design and key-management notes in `PRISMA_SCHEMA_PROPOSAL.md` §5. Revocation is `revokedAt`, checked on every public resolve (now also set automatically on source deletion, §H.1); regeneration assigns a new `tokenId`, which invalidates the old link by making it unfindable at lookup time, not by breaking its (still mathematically valid) old signature.
- **Independent-copy boundaries**: accept/save-copy operations never create a live cross-owner FK; every copy (including every nested Part it depends on) is a freshly inserted, fully owned row created inside one transaction (§I).
- **Secret exclusion from backups**: the export/backup builder is an explicit field-whitelisting DTO per aggregate (§L) — passwords, provider credentials, active session tokens, and raw share-link tokens are excluded by construction (the DTO simply has no field for them), not by a post-hoc redaction step that could be forgotten.
- **Authentication-session management**: Better Auth's existing multi-session model already supports list/revoke; Tier 2 adds a UI over Better Auth's existing APIs — no new schema.
- **Account deletion**: covered in §I/§J — cascading relational delete + best-effort blob cleanup, explicit confirmation + reauthentication at the UI layer.
- **Safe file/image handling**: server-side MIME-type and size validation before accepting an upload (never client-side-only); signed-URL upload flow (§L) keeps large file bytes off the Server Action request path. Because the Blob store is private (Correction 11), read access is equally gated: every image fetch goes through the authenticated/share-token-aware image route described in §L, never a raw Blob URL — "private by default" applies to reads, not just writes.
- **Rate limiting**: recommend Vercel's platform-level firewall/rate-limiting for public Tier 2/3 surfaces (public share resolution, direct-share sending) rather than hand-rolled in-app limiting — simpler, and already available on the deployed platform. This is a Tier 2 launch-readiness item, not a Tier 1 blocker (Tier 1 has no public unauthenticated surface at all beyond the existing marketing pages, which Milestone 2 already hardened).

---

## N. Indexing, Performance, and Data Growth

| Need | Index / strategy |
|---|---|
| Current-Version retrieval | `Dish.currentVersionId` FK (denormalized pointer, §D.1) — O(1) lookup, no sort |
| Version history | `@@index([dishId, majorVersion desc, minorVersion desc])` on `DishVersion` |
| Recipe/Part library listing + filters | `@@index([ownerId, kind, stage])` and `@@index([ownerId, kind, archivedAt])` on `Dish` |
| Search (tolerant partial-word, current content only) | Three trigram/GIN indexes (`pg_trgm`) on `Dish.currentTitle`, `Dish.currentStructuralSearchText` (Section names + linked Part-Version titles), and `Dish.cuisine` itself (round-3 Correction 6 — cuisine is queried live, not denormalized, so it gets its own index directly); tags and Flavor profiles are matched via ordinary indexed joins against `DishTag`/`Tag` and `DishFlavorProfile`/`FlavorProfileValue`, not a denormalized field — proportionate to §44.5's "tolerant of partial-word matching," well short of semantic search/embeddings the spec explicitly says isn't required |
| Tag / cuisine / Flavor-profile / rating filters | Standard indexes on `DishTag`/`DishFlavorProfile` join tables (both FK columns); rating filter computed via an aggregate query over `Rating` scoped by `dishId`, cached only if later proven necessary (§I) |
| Part usage lookup ("Recipes using this Part," propagation candidates) | `@@index([targetDishId])` and `@@index([targetDishVersionId])` on `PartLink` |
| Active Cooking Sessions | Partial unique index `(dishId) WHERE state='IN_PROGRESS'` doubles as the concurrency guard (§I) and the fast "is there an active session" check; `@@index([ownerId, state, updatedAt])` for the stale-session and active/recent surfacing (§26.6) |
| Session and rating summaries | `@@index([sessionId])`/`@@index([dishId, dishVersionId])` on `Rating`, computed at read time (§I) rather than cached |
| Meal Plan ranges | `@@index([mealPlanId, cookDate])` on `MealPlanEntry` |
| Grocery synchronization | `@@index([groceryListId, categoryId])` on `GroceryListItem` |
| Share tokens | `@@unique([token])` on `ShareLink` — already a unique lookup index by definition |

**Data growth:** Versions and Cooking Sessions are append-only and grow linearly with real usage — at personal/family scale (a heavy user might accumulate a few thousand Versions and a few thousand Sessions over years), this is comfortably within ordinary Postgres/Neon performance characteristics with the indexes above; no partitioning, sharding, or read-replica strategy is warranted, and introducing one now would be the "premature distributed architecture" the spec repeatedly cautions against. If a specific user's history ever grows unusually large, the first response is targeted indexing/query tuning, not an architecture change.

---

## O. Testing Architecture

- **Unit tests (Vitest)** for pure domain logic, decoupled from Prisma wherever feasible: the version-numbering algorithm (F.2–F.5, directly testing the exact `V1.9→V1.10→V1.11` and `V5.3→V6.0` examples from §13.3/§13.4), quantity scaling/fraction-formatting, the cycle-detection reachability function (G.3, tested against constructed graphs including direct self-reference, indirect cycles, and legitimate historical-version "coincidental" self-similarity that must be allowed), propagation default-classification logic, and grocery safe-combination matching.
- **Integration tests (Vitest + a real test Postgres)** for transaction behavior: partial-failure rollback, the partial-unique-index concurrency guard on `CookingSession` (§I/§D.7), Part-deletion materialization correctness end-to-end (current-usage resolution → historical materialization → final delete, verifying historical rows read correctly afterward with no dangling references), and the Meal-Plan grocery-resync reconciliation logic (checkoff preservation, change-flagging). **Settled per Correction 10:** CI uses a disposable PostgreSQL service container in GitHub Actions (fast, fully offline, no network flakiness, no persistent state to manage) connected via `@prisma/adapter-pg` (§K.10a), rather than a Neon branch per test run. A `docker-compose.yml` is additionally provided purely for local developer convenience running the same integration tests outside CI — it is not itself the CI mechanism. Neon preview-branch-per-PR remains a reasonable later improvement for other purposes (e.g., manually inspecting a PR's data), not a testing requirement.
- **Component tests (Testing Library)** for editor interactions (add/reorder/remove Sections and Ingredients, the small-update/new-version save-choice modal), Cooking Mode checkoff/timer widgets, and the Session Review form — extending the scaffold's existing `*.test.tsx` pattern.
- **End-to-end (Playwright)** golden-path flows: create Recipe → cook it → review it → see it in history; create Part → nest inside a Recipe → propagate an update and verify only the selected occurrence changed; extending the scaffold's existing e2e/CI wiring.
- **Fixtures/factories**: a `src/test/factories/` module with typed builder functions (`createTestDish()`, `createTestCookingSession()`, etc.), mirroring the existing `src/test/setup.ts` convention, so integration and component tests share consistent, DRY setup.
- **Database isolation**: every test creates and operates on its own owner/user + fully owned data graph (never shared fixtures across test files); integration tests wrap each test in a transaction rolled back afterward where the test runner allows it, or truncate owner-scoped tables between files otherwise.
- **Critical invariants explicitly covered**:
  - A `DishVersion`, once created, is never mutated — enforced procedurally (§F.10's lint rule) and spot-checked by a test asserting no update path exists for version-content fields.
  - Cycle prevention rejects both direct (`A→A`) and indirect (`A→B→A`) cases, while explicitly allowing the "coincidentally similar but distinct-version" case that is not actually a cycle.
  - Version numbering matches the spec's literal examples exactly.
  - Propagation touches only selected occurrences, never unrelated Recipes/Parts or unrelated content within a touched item.
  - Every row in the deletion matrix (§J) behaves exactly as tabled — a dedicated integration-test suite mirroring that table row-by-row.
  - Authorization rejects cross-user access at every aggregate boundary (Dish, Section, CookingSession, GroceryList, MealPlan, ShareLink management) — a parameterized test run against each guard function.

---

## P. Risks, Tradeoffs, and Owner Questions

### P.1 Highest-risk implementation areas, with recommendation and cost

| Risk area | Recommendation | Cost | Migration risk if wrong |
|---|---|---|---|
| Unified `Dish`/`DishVersion` model vs. two parallel schemas | Unified model (§A.1) | Every query must filter/branch on `kind` where behavior genuinely differs (Recipe-only "cannot be a PartLink target," §D.6); slightly less type-narrowing convenience than two distinct Prisma models would give | Low — splitting a unified model into two later is mechanical (copy rows, drop the discriminator); the reverse (merging two divergent schemas after they've accumulated inconsistent behavior) is the expensive direction, which this proposal avoids entirely by starting unified |
| Cycle-prevention validation (§G) | Reachability check over the immutable version graph at save time, recursive CTE | Moderate implementation complexity (recursive query + two validation call sites: attach-time and save-time) | Low — this is purely additive validation logic; it can be tightened or relaxed without a schema change |
| Cooking Setup persistence model | Fully transient client state, no DB table, until "Start cooking" (§D.7 note, matching §21.2/21.3 exactly) | None — this is the cheaper option, not a tradeoff | None |
| Meal-Plan-linked grocery reconciliation (§H/§I) | Explicit service-layer resync inside the same transaction as each Meal Plan mutation, now built on normalized `GroceryItemContribution` rows matched by `ingredientLineageId` + `mealPlanEntryId` (Correction 4, §D.11) rather than a JSON breakdown | The most algorithmically intricate single piece of Tier 2 (matching, diffing, checkoff preservation, change-flagging) — the normalized-contribution model makes this *tractable* (a real diff query) rather than merely *possible* (parsing/rewriting JSON blobs), but the reconciliation logic itself is still nontrivial | Medium — getting the matching heuristic wrong risks silently dropping user checkoff progress; mitigated by the dedicated integration-test coverage called out in §O and by the explicit review gate before this work begins (`BUILD_PLAN.md` §D, Gate 6) |
| Reusable ingredient-nutrition normalization (§54.5) | Deferred design decision: the spec itself states "the implementation specification must define how ingredient quantities and source serving units are normalized before claiming calculated totals" | This is a genuinely open, spec-acknowledged technical question, not something this proposal can responsibly pre-decide without real ingredient/unit data to test against | Low if deferred correctly — Tier 1 ships with manual whole-item/per-serving nutrition only (§54.1), which requires no normalization at all; this question only matters once Tier 2's "calculate totals from reusable Parts" (§54.5) is actually scheduled, at which point it deserves its own focused design pass |
| Blob storage integration timing | Provision a **private** Vercel Blob store (Correction 11) at the start of Slice 5 (the first slice that needs images, see `BUILD_PLAN.md`), not now and not deferred further | The `ImageAsset` model and `DishVersion.imageAssetId` FK already exist from the Gate 1 schema regardless of when Blob itself is provisioned, so this risk is about upload/serving-route plumbing timing, not schema timing | Low |
| Reference-counted image cleanup correctness | Query-based `COUNT(*)` check at delete/replace time (§D.2a), not a maintained counter column | A `COUNT(*)` against an indexed FK column is simple and always correct by construction; the alternative (a cached counter) trades that correctness guarantee for a marginal, unneeded performance gain at this data scale | Low |

### P.2 Product Questions Requiring Owner Decision

Per the planning prompt's instruction, this section is reserved for genuine issues this proposal cannot responsibly resolve on its own — either because `PRODUCT_SPEC.md` contains a real contradiction, or because the decision requires an external action only the product owner can take.

**No genuine contradiction was found inside `PRODUCT_SPEC.md`.** The document is internally consistent throughout the areas this architecture touches; every place it appears to leave a detail open (ingredient-quantity storage representation, §10.6; exact conversion algorithm, §52.7; ingredient-nutrition normalization, §54.5) is explicitly and deliberately deferred *by the spec itself* to implementation, not left as an unresolved conflict — and this proposal makes an explicit, opinionated call on each of those (Decimal-backed quantities, practical-fraction formatting deferred to a small formatting utility, ingredient-nutrition normalization deferred to its own design pass at Tier 2 time per P.1 above) rather than escalating them.

**All three items originally listed here have since been resolved by the product owner and are recorded as decisions, not open questions:**

1. ~~Vercel Blob provisioning approval.~~ **Resolved (Correction 11):** a **private** Vercel Blob store is the confirmed choice; provisioning itself still happens at Slice 5 implementation time (not at Gate 1), but the decision of *which* store and *what access model* is now settled, not open.
2. ~~USDA FoodData Central API key registration.~~ **Resolved:** the owner has registered an FDC API key and configured it as `FDC_API_KEY` in both `.env.local` and the Vercel project's environment variables. Nutrition lookup itself is still built at Slice 13 (Tier 2), but no external setup step remains outstanding.
3. ~~Test-database strategy for CI.~~ **Resolved (Correction 10):** a disposable PostgreSQL service container in GitHub Actions, connected via `@prisma/adapter-pg`, with an optional local `docker-compose.yml` for developer convenience — not Neon branch-per-run.

No further genuine owner-decision items remain from this proposal at this time. Any future item of this kind (an external account/service action, or a genuine spec ambiguity) will be raised explicitly, in the same style, rather than silently assumed.

---

*End of `ARCHITECTURE_PROPOSAL.md`.*
