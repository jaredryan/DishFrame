# DishFrame — Prisma Schema and Migration Proposal (Gate 1, Revision 3)

**Document status:** Gate 1 deliverable, third revision — a final schema-validity pass. This revision removes every Prisma relation that illegitimately reused a scalar field across two relations (a real Prisma Schema Language limitation, not a style preference), fixes a genuine `onDelete` conflict between `GroceryList`'s mode CHECK constraint and its Meal-Plan relation, closes several nullable-pair gaps that a composite foreign key's `MATCH SIMPLE` semantics leave open, and was **validated against the installed Prisma 7.9.0** with `prisma format` and `prisma validate` — exact output in `GATE_1_REVIEW_SUMMARY_3.md`.
**Companion documents:** `ARCHITECTURE_PROPOSAL.md`, `BUILD_PLAN.md`, `GATE_1_REVIEW_SUMMARY.md`/`_2.md`/`_3.md` (prior and current review passes).
**Status relative to the repository:** Still a **proposal document**. Nothing here has been applied. No migration has been generated or run against any database. No package has been installed. The schema below was validated against a **temporary** file outside the repository, never against `prisma/schema.prisma` itself.

---

## 1. Modeling conventions (revision 3 addendum)

Round 2 introduced several relations that reused the same scalar field for two different `@relation` declarations on one model (e.g., `PartLink.containerVersionId` backing both a direct relation to `DishVersion` and a composite relation to `Section`). **Prisma Schema Language cannot reliably model this** — a scalar field's `fields: [...]` role belongs to at most one relation. This revision removes every such case. The resolution pattern used throughout, and the reason it's correct:

- **Where a record always references an exact Version** (never "whichever is current") — `CookingSession`, `GroceryListSource`, `DirectShare` — the redundant direct-to-`Dish` relation is removed entirely. Only the composite relation to `DishVersion` (via `DishVersion`'s `@@unique([dishId, id])`) remains. `dishId` stays as a plain, indexed scalar column for querying; existence of a valid `Dish` is guaranteed *transitively*, because `DishVersion.dishId` itself already has its own foreign key to `Dish.id` — a separate direct relation would have proven nothing the composite relation doesn't already guarantee.
- **Where a record's target genuinely varies by mode** (`ShareLink`, which is the one place a "follow whatever is current" reference and a "pinned to an exact Version" reference legitimately coexist) — the model is redesigned with **two entirely separate field sets**, `currentDishId` (used only in `CURRENT` mode) and `fixedDishId`/`fixedDishVersionId` (used only in `FIXED_SNAPSHOT` mode). Neither scalar is shared with the other relation, so both are ordinary, unambiguous Prisma relations — the cleanest possible fix, since it removes the need to share a column at all rather than working around the sharing.
- **Where the necessary consistency check has no valid Prisma-relation representation without reusing a field already spoken for** (`PartLink`'s container-consistency check against `Section`; `Ingredient`/`Instruction`'s consistency check against their owning `Section`; `Dish.currentVersionId`'s ownership check against `DishVersion`) — the primary Prisma relation is kept exactly as it already was (single-column, unambiguous), and the additional consistency guarantee is added as a **raw-SQL composite foreign key**, layered on top in the migration. Postgres has no objection to a column participating in a raw FK that isn't also modeled as a Prisma relation — only Prisma's own relation-resolution logic does, and only when two `@relation` blocks compete for the same field.

---

## 2. Complete, validated Prisma schema

**Validated with `prisma format` and `prisma validate` against the installed Prisma 7.9.0 — both succeeded with no errors.** Exact command output in `GATE_1_REVIEW_SUMMARY_3.md` §1.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ============================================================================
// Existing Better Auth models — UNCHANGED except User gains relation fields.
// ============================================================================

model User {
  id            String   @id
  name          String
  email         String   @unique
  emailVerified Boolean  @default(false)
  image         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  sessions Session[]
  accounts Account[]

  preference                 UserPreference?
  dishes                     Dish[]
  tags                       Tag[]
  flavorProfileValues        FlavorProfileValue[]
  groceryCategories          GroceryCategory[]
  ingredientCategoryMemories IngredientCategoryMemory[]
  tasters                    Taster[]
  cookingSessions            CookingSession[]
  groceryLists               GroceryList[]
  mealPlans                  MealPlan[]
  shareLinks                 ShareLink[]
  sentDirectShares           DirectShare[]              @relation("DirectShareSender")
  receivedDirectShares       DirectShare[]              @relation("DirectShareRecipient")
  uploadedImages             ImageAsset[]                @relation("ImageUploader")

  @@map("users")
}

model Session {
  id        String   @id
  token     String   @unique
  userId    String
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model Account {
  id                    String    @id
  userId                String
  providerId            String
  accountId             String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([providerId, accountId])
  @@map("accounts")
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime? @default(now())
  updatedAt  DateTime? @updatedAt

  @@map("verifications")
}

// ============================================================================
// Migration 1 — Core content & versioning
// ============================================================================

enum DishKind {
  RECIPE
  PART
}

enum Stage {
  IDEA
  EXPERIMENTAL
  PROVEN
  ACTIVE
  ARCHIVED
}

enum SourceKind {
  NONE
  DUPLICATE
  ACCEPTED_SHARE
  IMPORT
}

model Dish {
  id      String   @id @default(cuid())
  ownerId String
  kind    DishKind

  currentVersionId String? @unique

  stage      Stage     @default(IDEA)
  cuisine    String?
  archivedAt DateTime?

  defaultBatchQuantity Decimal? @db.Decimal(12, 3)
  defaultBatchUnit     String?

  // Round-3 Correction 6: split search maintenance. currentTitle (title only) and
  // currentStructuralSearchText (Section names + linked Part-Version titles) are both
  // refreshed ONLY at version-creation time, because both are genuinely tied to Version
  // content. Cuisine/tag/Flavor-profile search is NOT denormalized here at all — it is
  // queried live via relational joins at search time (see §6 below), which sidesteps the
  // "remember to refresh on every stable-metadata mutation" problem entirely for those
  // three fields.
  currentTitle                String?
  currentStructuralSearchText String?

  sourceKind             SourceKind @default(NONE)
  sourceDishId           String?
  sourceDishVersionLabel String?
  sourceTitle            String?
  sourceAggregateRating  Decimal?   @db.Decimal(3, 2)
  sourceRatingCount      Int?
  sourceSessionCount     Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner                  User                    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  versions               DishVersion[]           @relation("DishVersions")
  currentVersion         DishVersion?            @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  tags                   DishTag[]
  flavorProfiles         DishFlavorProfile[]
  preferredUnitOverrides PreferredUnitOverride[]

  sourceDish   Dish?  @relation("DishDuplicationSource", fields: [sourceDishId], references: [id], onDelete: SetNull)
  duplicatedAs Dish[] @relation("DishDuplicationSource")

  // Round-3 Correction 1: ShareLink's CURRENT-mode field is the ONLY remaining direct
  // Dish relation among the models this correction touches — every other cross-cutting
  // reference now targets DishVersion via a composite relation instead (see DishVersion's
  // own back-relation list below).
  shareLinksCurrent ShareLink[] @relation("ShareLinkCurrentDish")

  @@index([ownerId, kind, stage])
  @@index([ownerId, kind, archivedAt])
}

model DishVersion {
  id           String @id @default(cuid())
  dishId       String
  majorVersion Int
  minorVersion Int

  title        String
  description  String?
  imageAssetId String?

  yieldQuantity   Decimal? @db.Decimal(12, 3)
  yieldUnit       String?
  prepTimeMinutes Int?
  cookTimeMinutes Int?
  difficulty      String?

  calories                Decimal?        @db.Decimal(10, 2)
  protein                 Decimal?        @db.Decimal(10, 2)
  carbs                   Decimal?        @db.Decimal(10, 2)
  fat                     Decimal?        @db.Decimal(10, 2)
  nutritionBasis          NutritionBasis?
  nutritionBasisQuantity  Decimal?        @db.Decimal(12, 3)
  nutritionBasisUnit      String?
  moreNutrients           Json?
  nutritionSourceProvider String?
  nutritionSourceId       String?

  versionNote String?

  sourceVersionId String?

  createdAt DateTime @default(now())

  dish            Dish          @relation("DishVersions", fields: [dishId], references: [id], onDelete: Cascade)
  currentFor      Dish?         @relation("CurrentVersion")
  sourceVersion   DishVersion?  @relation("VersionLineage", fields: [sourceVersionId], references: [id])
  derivedVersions DishVersion[] @relation("VersionLineage")
  // Round-3 Correction 7: explicit Restrict — the database must physically refuse to
  // delete an ImageAsset while any DishVersion still references it. Cleanup is a
  // reference-counted application check performed BEFORE attempting the delete; this
  // constraint is the hard backstop if that check is ever wrong or skipped.
  imageAsset      ImageAsset?   @relation(fields: [imageAssetId], references: [id], onDelete: Restrict)

  sections Section[]

  partLinks           PartLink[] @relation("DishVersionPartLinks")
  targetedByPartLinks PartLink[] @relation("PartLinkTarget")

  // Round-3 Correction 1: every one of these now targets DishVersion (via a composite
  // (dishId, dishVersionId) -> (dishId, id) relation on the child model) rather than Dish
  // directly, since a direct Dish relation would have required reusing the same dishId
  // scalar the composite relation also uses.
  cookingSessions    CookingSession[]
  ratings            Rating[]
  groceryListSources GroceryListSource[]
  mealPlanEntries    MealPlanEntry[]
  shareLinksFixed    ShareLink[]
  directShares       DirectShare[]

  @@unique([dishId, majorVersion, minorVersion])
  @@unique([dishId, id])
  @@index([dishId, majorVersion(sort: Desc), minorVersion(sort: Desc)])
  @@index([imageAssetId])
}

enum NutritionBasis {
  WHOLE
  PER_OUTPUT_UNIT
}

model ImageAsset {
  id               String   @id @default(cuid())
  storageKey       String   @unique
  uploadedByUserId String?
  createdAt        DateTime @default(now())

  uploader User?         @relation("ImageUploader", fields: [uploadedByUserId], references: [id], onDelete: SetNull)
  versions DishVersion[]

  @@index([uploadedByUserId])
}

model Section {
  id            String  @id @default(cuid())
  lineageId     String
  dishVersionId String
  name          String?
  guidanceNote  String?
  position      Int

  dishVersion  DishVersion   @relation(fields: [dishVersionId], references: [id], onDelete: Cascade)
  ingredients  Ingredient[]
  instructions Instruction[]
  // Round-3 Correction 1/3: no Prisma relation from PartLink to Section anymore (it would
  // have reused PartLink.containerVersionId, already used by PartLink's direct relation to
  // DishVersion). Container consistency is enforced by a raw-SQL composite foreign key
  // instead (§4 below), so this side carries no corresponding Prisma-navigable
  // back-relation — PartLinks belonging to a Section are queried directly by sectionId,
  // not via a Section.partLinks include.

  @@unique([dishVersionId, id]) // target for PartLink's and Ingredient's/Instruction's raw-SQL composite FKs
  @@unique([dishVersionId, lineageId]) // Round-3 Correction 8 — lineage uniqueness per Version
  @@index([dishVersionId])
  @@index([lineageId])
}

model Ingredient {
  id                   String   @id @default(cuid())
  lineageId            String
  // Round-3 Correction 8: denormalized from Section, required so lineage uniqueness can be
  // scoped to the whole DishVersion (not just one Section). Consistency with the actual
  // owning Section's dishVersionId is enforced by a raw-SQL composite foreign key
  // (dishVersionId, sectionId) -> Section(dishVersionId, id) — see §4 below — rather than a
  // second Prisma relation, since sectionId is already used by the direct `section`
  // relation below.
  dishVersionId        String
  sectionId            String
  name                 String
  quantity             Decimal? @db.Decimal(12, 3)
  quantityEnd          Decimal? @db.Decimal(12, 3)
  isApproximate        Boolean  @default(false)
  unit                 String?
  displayText          String?
  preparationNote      String?
  isOptional           Boolean  @default(false)
  originalImportedText String?
  position             Int

  substituteForIngredientId String?     @unique
  substituteFor             Ingredient? @relation("Substitutes", fields: [substituteForIngredientId], references: [id])
  substitute                Ingredient? @relation("Substitutes")

  section Section @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@unique([dishVersionId, lineageId])
  @@index([sectionId])
  @@index([lineageId])
  @@index([dishVersionId])
}

model Instruction {
  id            String @id @default(cuid())
  lineageId     String
  dishVersionId String // Round-3 Correction 8 — same reasoning as Ingredient.dishVersionId, above
  sectionId     String
  text          String
  position      Int

  section Section @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@unique([dishVersionId, lineageId])
  @@index([sectionId])
  @@index([lineageId])
  @@index([dishVersionId])
}

enum PartLinkState {
  LIVE
  MATERIALIZED
}

model PartLink {
  id                 String        @id @default(cuid())
  lineageId          String
  containerVersionId String
  // Round-3 Correction 1/3: sectionId remains a plain, indexed scalar. It is NOT the
  // `fields` of any Prisma relation — the Section-container-consistency check is enforced
  // entirely by a raw-SQL composite foreign key (containerVersionId, sectionId) ->
  // Section(dishVersionId, id), added in Migration 1 (§4 below).
  sectionId          String?
  linkState          PartLinkState @default(LIVE)
  position           Int

  targetDishId        String?
  targetDishVersionId String?

  materializedTitle        String?
  materializedVersionLabel String?
  materializedContent      Json?

  containerVersion DishVersion  @relation("DishVersionPartLinks", fields: [containerVersionId], references: [id], onDelete: Cascade)
  // Round-3 Correction 1: `targetDish` (the direct-to-Dish relation from prior revisions)
  // removed entirely — it reused targetDishId, already used by this composite relation.
  // Existence of a valid target Dish is guaranteed transitively (targetDishVersionId's own
  // DishVersion.dishId FK already proves it), so nothing is lost by removing it.
  targetVersion    DishVersion? @relation("PartLinkTarget", fields: [targetDishId, targetDishVersionId], references: [dishId, id], onDelete: Restrict)

  @@unique([containerVersionId, lineageId]) // Round-3 Correction 8 — lineage uniqueness per container Version
  @@index([lineageId])
  @@index([containerVersionId])
  @@index([sectionId])
  @@index([targetDishId])
  @@index([targetDishVersionId])
}

model Tag {
  id             String   @id @default(cuid())
  ownerId        String
  normalizedName String
  displayName    String
  isFavorite     Boolean  @default(false)
  createdAt      DateTime @default(now())

  owner  User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  dishes DishTag[]

  @@unique([ownerId, normalizedName])
}

model DishTag {
  dishId String
  tagId  String

  dish Dish @relation(fields: [dishId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([dishId, tagId])
  @@index([tagId])
}

model FlavorProfileValue {
  id             String @id @default(cuid())
  ownerId        String
  normalizedName String
  displayName    String
  position       Int

  owner  User                @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  dishes DishFlavorProfile[]

  @@unique([ownerId, normalizedName])
}

model DishFlavorProfile {
  dishId               String
  flavorProfileValueId String

  dish               Dish               @relation(fields: [dishId], references: [id], onDelete: Cascade)
  flavorProfileValue FlavorProfileValue @relation(fields: [flavorProfileValueId], references: [id], onDelete: Cascade)

  @@id([dishId, flavorProfileValueId])
  @@index([flavorProfileValueId])
}

enum MeasurementSystem {
  US
  METRIC
}

enum FractionOrDecimal {
  FRACTIONS
  DECIMALS
}

enum PrimaryRatingDisplay {
  GROUP_AVERAGE
  YOUR_RATING
}

model UserPreference {
  userId               String               @id
  measurementSystem    MeasurementSystem    @default(US)
  fractionOrDecimal    FractionOrDecimal    @default(FRACTIONS)
  primaryRatingDisplay PrimaryRatingDisplay @default(GROUP_AVERAGE)
  timerSoundEnabled    Boolean              @default(true)
  reviewPromptEnabled  Boolean              @default(true)
  onboardingState      Json?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model GroceryCategory {
  id             String @id @default(cuid())
  ownerId        String
  normalizedName String
  displayName    String
  position       Int

  owner                      User                       @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  groceryListItems           GroceryListItem[]
  ingredientCategoryMemories IngredientCategoryMemory[]

  @@unique([ownerId, normalizedName])
}

model PreferredUnitOverride {
  id                  String   @id @default(cuid())
  dishId              String
  ingredientLineageId String
  unit                String
  createdAt           DateTime @default(now())

  dish Dish @relation(fields: [dishId], references: [id], onDelete: Cascade)

  @@unique([dishId, ingredientLineageId])
}

// ============================================================================
// Migration 2 — Cooking & feedback loop
// ============================================================================

enum SessionState {
  IN_PROGRESS
  COMPLETED
  ENDED_EARLY
}

model CookingSession {
  id            String       @id @default(cuid())
  ownerId       String
  // Round-3 Correction 1: dishId remains a plain, indexed scalar — no longer the `fields`
  // of a direct-to-Dish relation (removed; it reused dishId, already used by the composite
  // relation below). Every Cooking Session always references an exact Version, so the
  // composite relation alone is sufficient.
  dishId        String
  dishVersionId String
  state         SessionState @default(IN_PROGRESS)

  startedAt               DateTime  @default(now())
  endedAt                 DateTime?
  rawElapsedSeconds       Int?
  adjustedDurationSeconds Int?

  scaleFactor  Decimal? @db.Decimal(8, 4)
  cookingNotes String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner           User                 @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  dishVersion     DishVersion          @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: Cascade)
  units           CookingSessionUnit[]
  review          SessionReview?
  ratings         Rating[]
  mealPlanEntries MealPlanEntry[]

  @@index([ownerId, state, updatedAt])
  @@index([dishId])
}

model CookingSessionUnit {
  id                   String    @id @default(cuid())
  sessionId            String
  position             Int
  scaleFactor          Decimal?  @db.Decimal(8, 4)
  completedAt          DateTime?
  removedAt            DateTime?
  removedAfterProgress Boolean   @default(false)

  label                  String
  sourceDishTitle        String
  sourceDishVersionLabel String

  sourceSectionLineageId  String?
  sourcePartLinkLineageId String?

  session        CookingSession                @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  checklistItems CookingSessionChecklistItem[]
  timers         Timer[]

  @@index([sessionId])
}

enum ChecklistItemKind {
  INGREDIENT
  INSTRUCTION
}

model CookingSessionChecklistItem {
  id        String            @id @default(cuid())
  unitId    String
  kind      ChecklistItemKind
  checkedAt DateTime?

  displayText     String
  displayQuantity String?
  displayUnit     String?
  sourceLineageId String?

  unit CookingSessionUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@index([unitId])
}

enum TimerState {
  RUNNING
  PAUSED
  EXPIRED
  DISMISSED
}

model Timer {
  id               String     @id @default(cuid())
  unitId           String
  name             String
  targetEndAt      DateTime?
  remainingSeconds Int?
  state            TimerState @default(RUNNING)

  unit CookingSessionUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@index([unitId])
}

model SessionReview {
  sessionId                     String   @id
  whatWentWell                  String?
  whatDidNotGoWell              String?
  anythingElse                  String?
  actualAmountQuantity          Decimal? @db.Decimal(12, 3)
  actualAmountUnit              String?
  reviewAdjustedDurationSeconds Int?
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  session CookingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model Rating {
  id            String  @id @default(cuid())
  sessionId     String
  // Round-3 Correction 4: paired-nullability enforced by a raw-SQL CHECK constraint (both
  // null or both non-null) in addition to the composite FK's own MATCH SIMPLE behavior,
  // which alone would silently accept a half-null row.
  dishId        String?
  dishVersionId String?

  dishTitleSnapshot        String
  dishVersionLabelSnapshot String

  tasterId  String
  value     Int
  createdAt DateTime @default(now())

  session     CookingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  dishVersion DishVersion?   @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)
  taster      Taster         @relation(fields: [tasterId], references: [id], onDelete: Cascade)

  @@unique([sessionId, tasterId, dishId])
  @@index([dishId, dishVersionId])
}

model Taster {
  id         String    @id @default(cuid())
  ownerId    String
  name       String
  isOwner    Boolean   @default(false)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())

  owner   User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  ratings Rating[]

  @@index([ownerId])
}

// ============================================================================
// Migration 3 — Planning & grocery
// ============================================================================

enum GroceryListMode {
  STANDALONE
  MEAL_PLAN_LINKED
}

enum GroceryItemSyncFlag {
  UNCHANGED
  CHANGED
  REMOVED
}

enum GroceryContributionState {
  ACTIVE
  CHANGED
  REMOVED
}

model GroceryList {
  id               String          @id @default(cuid())
  ownerId          String
  title            String
  mode             GroceryListMode @default(STANDALONE)
  linkedMealPlanId String?
  completedAt      DateTime?
  createdAt        DateTime        @default(now())

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  // Round-3 Correction 2: Restrict, not SetNull. SetNull would fire automatically the
  // instant a referenced MealPlan is deleted, nulling linkedMealPlanId WHILE mode is still
  // MEAL_PLAN_LINKED — immediately violating the mode-consistency CHECK constraint before
  // any application code could react. Restrict instead forces the MealPlan-deletion service
  // to explicitly flip every affected list to STANDALONE (and clear linkedMealPlanId) in
  // its own transaction BEFORE the MealPlan row can be deleted at all — see §6/§7 below.
  linkedMealPlan MealPlan? @relation(fields: [linkedMealPlanId], references: [id], onDelete: Restrict)

  sources GroceryListSource[]
  items   GroceryListItem[]

  @@index([ownerId])
  @@index([linkedMealPlanId])
}

model GroceryListSource {
  id            String   @id @default(cuid())
  groceryListId String
  dishId        String?
  dishVersionId String?
  scaleFactor   Decimal? @db.Decimal(8, 4)

  sourceDishTitleSnapshot        String
  sourceDishKindSnapshot         DishKind
  sourceDishVersionLabelSnapshot String

  groceryList GroceryList  @relation(fields: [groceryListId], references: [id], onDelete: Cascade)
  dishVersion DishVersion? @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)

  contributions GroceryItemContribution[]

  @@index([groceryListId])
  @@index([dishId])
}

model GroceryListItem {
  id              String    @id @default(cuid())
  groceryListId   String
  categoryId      String?
  name            String
  quantityText    String?
  quantityDecimal Decimal?  @db.Decimal(12, 3)
  unit            String?
  isOptional      Boolean   @default(false)
  isManual        Boolean   @default(false)
  checkedAt       DateTime?

  syncFlag           GroceryItemSyncFlag @default(UNCHANGED)
  flagAcknowledgedAt DateTime?

  position Int

  groceryList   GroceryList               @relation(fields: [groceryListId], references: [id], onDelete: Cascade)
  category      GroceryCategory?          @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  contributions GroceryItemContribution[]

  @@index([groceryListId, categoryId])
}

model GroceryItemContribution {
  id                  String   @id @default(cuid())
  groceryListItemId   String
  groceryListSourceId String?
  mealPlanEntryId     String?
  ingredientLineageId String?
  originalName        String
  quantityDecimal     Decimal? @db.Decimal(12, 3)
  quantityText        String?
  unit                String?

  state                   GroceryContributionState @default(ACTIVE)
  previousQuantityDecimal Decimal?                 @db.Decimal(12, 3)
  previousQuantityText    String?
  previousUnit            String?
  acknowledgedAt          DateTime?

  groceryListItem   GroceryListItem    @relation(fields: [groceryListItemId], references: [id], onDelete: Cascade)
  groceryListSource GroceryListSource? @relation(fields: [groceryListSourceId], references: [id], onDelete: SetNull)
  mealPlanEntry     MealPlanEntry?     @relation(fields: [mealPlanEntryId], references: [id], onDelete: SetNull)

  @@index([groceryListItemId])
  @@index([ingredientLineageId])
  @@index([mealPlanEntryId])
}

enum MealPlanEntryStatus {
  PLANNED
  IN_PROGRESS
  COOKED
  SKIPPED
}

model MealPlan {
  id        String   @id @default(cuid())
  ownerId   String
  title     String
  startDate DateTime
  endDate   DateTime
  notes     String?
  createdAt DateTime @default(now())

  owner              User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  entries            MealPlanEntry[]
  linkedGroceryLists GroceryList[]

  @@index([ownerId])
}

model MealPlanEntry {
  id                  String              @id @default(cuid())
  mealPlanId          String
  dishId              String?
  dishVersionId       String?
  cookDate            DateTime
  targetYieldQuantity Decimal?            @db.Decimal(12, 3)
  targetYieldUnit     String?
  note                String?
  status              MealPlanEntryStatus @default(PLANNED)
  linkedSessionId     String?

  sourceDishTitleSnapshot        String
  sourceDishKindSnapshot         DishKind
  sourceDishVersionLabelSnapshot String

  mealPlan             MealPlan                  @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  dishVersion          DishVersion?              @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)
  linkedSession        CookingSession?           @relation(fields: [linkedSessionId], references: [id], onDelete: SetNull)
  plannedMeals         PlannedMeal[]
  groceryContributions GroceryItemContribution[]

  @@index([mealPlanId, cookDate])
  @@index([linkedSessionId])
  @@index([dishId])
}

model PlannedMeal {
  id       String   @id @default(cuid())
  entryId  String
  label    String
  date     DateTime
  servings Decimal  @db.Decimal(8, 2)

  entry MealPlanEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)

  @@index([entryId])
}

model IngredientCategoryMemory {
  id                       String @id @default(cuid())
  ownerId                  String
  normalizedIngredientName String
  groceryCategoryId        String

  owner           User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  groceryCategory GroceryCategory @relation(fields: [groceryCategoryId], references: [id], onDelete: Cascade)

  @@unique([ownerId, normalizedIngredientName])
}

// ============================================================================
// Migration 4 — Sharing
// ============================================================================

enum ShareLinkMode {
  FIXED_SNAPSHOT
  CURRENT
}

model ShareLink {
  id      String        @id @default(cuid())
  ownerId String
  mode    ShareLinkMode @default(FIXED_SNAPSHOT)

  tokenId String @unique

  // Round-3 Correction 1: redesigned with separate field sets per mode, instead of one
  // dishId field trying to serve both. currentDishId is used only in CURRENT mode;
  // fixedDishId/fixedDishVersionId are used only in FIXED_SNAPSHOT mode. Neither scalar is
  // shared with the other relation, so both are ordinary, unambiguous Prisma relations.
  currentDishId String?

  fixedDishId        String?
  fixedDishVersionId String?
  frozenSnapshot     Json?

  dishTitleSnapshot String

  expiresAt DateTime?
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  owner            User         @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  currentDish      Dish?        @relation("ShareLinkCurrentDish", fields: [currentDishId], references: [id], onDelete: SetNull)
  fixedDishVersion DishVersion? @relation(fields: [fixedDishId, fixedDishVersionId], references: [dishId, id], onDelete: SetNull)

  @@index([ownerId])
  @@index([currentDishId])
  @@index([fixedDishId])
}

enum DirectShareStatus {
  PENDING
  ACCEPTED
  DECLINED
  CANCELED
}

model DirectShare {
  id                String            @id @default(cuid())
  senderId          String
  recipientId       String?
  recipientLookup   String
  dishId            String?
  dishVersionId     String?
  dishTitleSnapshot String
  note              String?
  status            DirectShareStatus @default(PENDING)
  createdAt         DateTime          @default(now())

  sender      User         @relation("DirectShareSender", fields: [senderId], references: [id], onDelete: Cascade)
  recipient   User?        @relation("DirectShareRecipient", fields: [recipientId], references: [id], onDelete: SetNull)
  dishVersion DishVersion? @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)

  @@index([senderId])
  @@index([recipientId])
  @@index([dishId, status])
}
```

---

## 3. Migration grouping

Unchanged from prior passes — still four migrations, still applied together at once, still grouped by domain cohesion and FK dependency order. No model moved between migrations this round.

---

## 4. Complete raw migration SQL

### Migration 1

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "dish_current_title_trgm_idx"
  ON "Dish" USING GIN ("currentTitle" gin_trgm_ops);

CREATE INDEX "dish_current_structural_search_text_trgm_idx"
  ON "Dish" USING GIN ("currentStructuralSearchText" gin_trgm_ops);

-- Round-3 Correction 6 — cuisine is searched live (not denormalized), so it gets its own
-- trigram index directly on the column, same tolerant partial-word matching as the others:
CREATE INDEX "dish_cuisine_trgm_idx"
  ON "Dish" USING GIN ("cuisine" gin_trgm_ops);

ALTER TABLE "PartLink"
  ADD CONSTRAINT "part_link_state_consistency"
  CHECK (
    (
      "linkState" = 'LIVE'
      AND "targetDishId" IS NOT NULL
      AND "targetDishVersionId" IS NOT NULL
      AND "materializedTitle" IS NULL
      AND "materializedVersionLabel" IS NULL
      AND "materializedContent" IS NULL
    )
    OR
    (
      "linkState" = 'MATERIALIZED'
      AND "targetDishId" IS NULL
      AND "targetDishVersionId" IS NULL
      AND "materializedTitle" IS NOT NULL
      AND "materializedVersionLabel" IS NOT NULL
      AND "materializedContent" IS NOT NULL
    )
  );

-- Round-3 Correction 3 — PartLink container consistency: a PartLink's sectionId, when
-- present, must belong to a Section that itself belongs to the same containerVersionId.
-- Added as a raw composite FK rather than a second Prisma relation (§1). MATCH SIMPLE
-- (Postgres default) means this is vacuously satisfied for top-level links (sectionId NULL).
ALTER TABLE "PartLink"
  ADD CONSTRAINT "part_link_section_container_consistency"
  FOREIGN KEY ("containerVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

-- Round-3 Correction 8 — same container-consistency pattern for Ingredient and Instruction,
-- whose denormalized dishVersionId must match their own Section's actual dishVersionId.
-- Both columns are required (never null) on these tables, so these FKs always apply:
ALTER TABLE "Ingredient"
  ADD CONSTRAINT "ingredient_section_version_consistency"
  FOREIGN KEY ("dishVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

ALTER TABLE "Instruction"
  ADD CONSTRAINT "instruction_section_version_consistency"
  FOREIGN KEY ("dishVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

-- Approved and unchanged from prior passes:
ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_archived_state_consistency"
  CHECK (
    ("stage" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
    OR
    ("stage" != 'ARCHIVED' AND "archivedAt" IS NULL)
  );

-- Round-3 Correction 5 — Dish.currentVersionId, when set, must belong to THIS Dish, not
-- merely reference any existing DishVersion row. Dish.id already participates in every
-- other relation pointing at Dish, so this cannot be modeled as a second Prisma relation
-- (§1) — added as a raw composite FK instead. MATCH SIMPLE means this is vacuously
-- satisfied whenever currentVersionId is NULL (e.g., transiently, before a Dish's first
-- Version is linked inside the creation transaction).
ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_current_version_ownership"
  FOREIGN KEY ("id", "currentVersionId")
  REFERENCES "DishVersion" ("dishId", "id");

CREATE UNIQUE INDEX "one_favorite_tag_per_user"
  ON "Tag" ("ownerId")
  WHERE "isFavorite" = true;

-- Round-3 Correction 9 — nutrition basis field consistency:
ALTER TABLE "DishVersion"
  ADD CONSTRAINT "nutrition_basis_consistency"
  CHECK (
    ("nutritionBasis" IS NULL)
    OR
    (
      "nutritionBasis" = 'WHOLE'
      AND "nutritionBasisQuantity" IS NULL
      AND "nutritionBasisUnit" IS NULL
    )
    OR
    (
      "nutritionBasis" = 'PER_OUTPUT_UNIT'
      AND "nutritionBasisQuantity" IS NOT NULL
      AND "nutritionBasisUnit" IS NOT NULL
      AND "nutritionBasisQuantity" > 0
    )
  );
```

### Migration 2

```sql
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_value_range"
  CHECK ("value" >= 1 AND "value" <= 5);

-- Round-3 Correction 4 — Rating's nullable Dish/Version pair must be both-null or
-- both-non-null; the composite FK's MATCH SIMPLE behavior alone would silently accept a
-- half-null row (e.g., dishId set, dishVersionId null), which this closes:
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );

CREATE UNIQUE INDEX "one_owner_taster_per_user"
  ON "Taster" ("ownerId")
  WHERE "isOwner" = true;

CREATE UNIQUE INDEX "one_active_session_per_dish"
  ON "CookingSession" ("dishId")
  WHERE "state" = 'IN_PROGRESS';
```

### Migration 3

```sql
ALTER TABLE "GroceryList"
  ADD CONSTRAINT "grocery_list_mode_consistency"
  CHECK (
    ("mode" = 'MEAL_PLAN_LINKED' AND "linkedMealPlanId" IS NOT NULL)
    OR
    ("mode" = 'STANDALONE' AND "linkedMealPlanId" IS NULL)
  );

ALTER TABLE "MealPlan"
  ADD CONSTRAINT "meal_plan_date_order"
  CHECK ("endDate" >= "startDate");

-- Round-3 Correction 4 — same pair-consistency pattern as Rating, above:
ALTER TABLE "GroceryListSource"
  ADD CONSTRAINT "grocery_list_source_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );

ALTER TABLE "MealPlanEntry"
  ADD CONSTRAINT "meal_plan_entry_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );
```

### Migration 4

```sql
-- Round-3 Correction 3 — revised to reflect ShareLink's redesigned fields (currentDishId /
-- fixedDishId / fixedDishVersionId, replacing the single dishId/dishVersionId pair from
-- round 2) and to explicitly allow a revoked link's source references to be cleared:
ALTER TABLE "ShareLink"
  ADD CONSTRAINT "share_link_mode_consistency"
  CHECK (
    -- the fixed pair is always either both-null or both-set, regardless of mode/revocation:
    (
      ("fixedDishId" IS NULL AND "fixedDishVersionId" IS NULL)
      OR
      ("fixedDishId" IS NOT NULL AND "fixedDishVersionId" IS NOT NULL)
    )
    AND
    (
      "revokedAt" IS NOT NULL
      OR
      (
        "mode" = 'CURRENT'
        AND "currentDishId" IS NOT NULL
        AND "fixedDishId" IS NULL
        AND "fixedDishVersionId" IS NULL
        AND "frozenSnapshot" IS NULL
      )
      OR
      (
        "mode" = 'FIXED_SNAPSHOT'
        AND "currentDishId" IS NULL
        AND "fixedDishId" IS NOT NULL
        AND "fixedDishVersionId" IS NOT NULL
        AND "frozenSnapshot" IS NOT NULL
      )
    )
  );

-- Round-3 Correction 4 — same pair-consistency pattern as Rating/GroceryListSource/MealPlanEntry:
ALTER TABLE "DirectShare"
  ADD CONSTRAINT "direct_share_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );
```

---

## 5. Meal Plan deletion service (Correction 2)

Because `GroceryList.linkedMealPlan` is now `onDelete: Restrict`, the database will refuse `DELETE FROM "MealPlan"` outright while any `GroceryList` still references it. The Meal-Plan-deletion service function must therefore run, in one transaction, in this exact order:

1. For every `GroceryList` where `linkedMealPlanId` = the Meal Plan being deleted: `UPDATE ... SET mode = 'STANDALONE', "linkedMealPlanId" = NULL` — this satisfies the mode-consistency CHECK constraint by construction, since both the mode change and the FK clearing happen together in one statement.
2. Do **not** alter `GroceryListItem`/`GroceryItemContribution` rows — list items and checkoff state are preserved exactly as they were; only the list's own linkage flips.
3. `DELETE FROM "MealPlan" WHERE id = ?` — now succeeds, because no `GroceryList` references it anymore.

If step 1 is ever skipped or incomplete, step 3 fails loudly with a Postgres foreign-key-violation error rather than silently corrupting a list's mode/link state — this is the entire point of choosing `Restrict` over `SetNull` here.

---

## 6. ShareLink revocation and field lifecycle (Correction 3)

| State | `currentDishId` | `fixedDishId`/`fixedDishVersionId` | `frozenSnapshot` | `revokedAt` |
|---|---|---|---|---|
| Active `CURRENT` link | set | null | null | null |
| Active `FIXED_SNAPSHOT` link | null | set | set | null |
| Revoked (owner-initiated, either mode) | may be cleared | may be cleared | may be cleared | set |
| Revoked (source permanently deleted, either mode) | cleared by `ON DELETE SET NULL` | cleared by `ON DELETE SET NULL` | untouched (frozen JSON, no FK) | set explicitly by the deletion transaction, in the same transaction as the FK-driven clearing |

`dishTitleSnapshot` is captured at creation time regardless of mode and is **never** cleared by any of the above — it is the one field that keeps a revoked link's entry in the owner's own sharing-management history intelligible ("this link, for *this* Recipe, was revoked because the source was deleted") without ever being part of the CHECK constraint or a live reference.

Public resolution always checks `revokedAt IS NULL` (and `expiresAt` where set) before rendering anything — a revoked link is unresolvable regardless of which fields happen to still be populated.

---

## 7. Current-search maintenance (Correction 6) — chosen approach: split structural denormalization from live relational search

Two independent mechanisms, chosen deliberately over one combined field that would need six different mutation paths to remember to refresh it:

- **`Dish.currentTitle`** and **`Dish.currentStructuralSearchText`** (Section names + the titles of the *exact* Part Versions referenced by the current Dish Version's `PartLink`s — resolved from each `targetDishVersionId`'s own `title` field, **never** from the target Part's current title, so a Recipe that still references an older Part Version is never misrepresented as containing whatever that Part's title happens to be today) are refreshed **only** by the version-creation transaction — the one and only mutation path that can change them, by construction, since both are genuinely Version-owned content.
- **Cuisine, tags, and Flavor profiles are not denormalized at all.** They already live directly on `Dish` (`cuisine`) or in small, well-indexed, owner-scoped join tables (`DishTag`/`Tag`, `DishFlavorProfile`/`FlavorProfileValue`) — querying them live at search time (`Dish.cuisine ILIKE` with the new trigram index, or an `EXISTS` join against the tag/Flavor-profile tables) is cheap and always instantly correct, with no refresh path to forget. This is what eliminates five of the six mutation paths named in the correction (cuisine change, tag attach/remove, tag rename/merge/delete, Flavor-profile attach/remove, Flavor-profile rename/delete) — none of them need to touch any search-related column at all.

**Ranking** (§44.5): check `currentTitle` first (exact/prefix/partial title, tiers 1–3), then cuisine (tier 4, live query), then Flavor profile (tier 5, live query), then tag (tier 6, live query), then `currentStructuralSearchText` (tier 7, structural). This is a small ranked union of independently-scoped queries, not one mega-query or a weighted full-text-search setup — each individual query is simple, and each is trivially correct on its own terms.

---

## 8. Database adapters and remaining owner questions

Unchanged from prior passes: `@prisma/adapter-neon` for deployed/Neon, `@prisma/adapter-pg` for local/CI, a disposable Postgres service container in GitHub Actions, optional Docker Compose locally.

**No remaining owner questions.** See `GATE_1_REVIEW_SUMMARY_3.md` for the exact `prisma format`/`prisma validate` output and the full correction-by-correction mapping for this pass.

---

*End of `PRISMA_SCHEMA_PROPOSAL.md`. Nothing in this document has been applied.*
