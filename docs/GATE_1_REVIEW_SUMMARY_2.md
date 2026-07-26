# Gate 1 Review Summary — Round 2 (Schema Integrity Corrections)

**Purpose:** a single, self-contained handoff document covering this round's schema-integrity review — the complete revised Prisma schema, the complete revised raw SQL, a correction-by-correction mapping, and any remaining owner questions — so it can be reviewed independently without needing the companion documents open. (`ARCHITECTURE_PROPOSAL.md`, `BUILD_PLAN.md`, and `PRISMA_SCHEMA_PROPOSAL.md` have all been updated in place to match everything below; this document duplicates the schema/SQL content deliberately, for standalone review.)

**Status:** Gate 1 remains open. Nothing has been applied — no migration run, no schema file touched, no package installed, no product UI built. The approved direction from prior passes is unchanged: four migrations grouped by domain cohesion, Tier 1 and Tier 2 tables created together up front, a private Vercel Blob store, the Neon adapter in deployed environments, the `pg` adapter plus a disposable PostgreSQL service in GitHub Actions for CI/local, proportional milestone-boundary testing, and the `Dish` archived-state CHECK constraint (explicitly reconfirmed as approved and unchanged this round).

---

## 1. Correction-by-correction mapping

| # | Correction | What changed |
|---|---|---|
| 1 | Add real foreign-key relations everywhere ordinary, instead of plain scalar IDs | Every ownership edge (`Dish`/`Tag`/`FlavorProfileValue`/`GroceryCategory`/`Taster`/`CookingSession`/`GroceryList`/`MealPlan`/`ShareLink`/`DirectShare` → `User`) and every ordinary join/parent-child edge (`DishTag`/`DishFlavorProfile`/`PreferredUnitOverride` → `Dish`; `GroceryListItem` → `GroceryCategory`; `Section`/`Ingredient`/`Instruction` → their parents) now has an explicit Prisma relation with a stated `onDelete` action, and `User`/`Dish`/`DishVersion` gained the corresponding back-relation arrays. Nullable/soft references are used **only** where the spec requires the child to survive its source's deletion (duplication provenance, Meal Plan/grocery entries, materialized `PartLink`s, historical Part ratings, revoked shares) — each paired with durable snapshot fields, never a bare dangling scalar. |
| 2 | Enforce Dish/Version pairing | `DishVersion` gained `@@unique([dishId, id])`. Every table storing both a `dishId` and a `dishVersionId` (`CookingSession`, `Rating`, `GroceryListSource`, `MealPlanEntry`, `ShareLink`'s fixed-snapshot fields, `DirectShare`, `PartLink`'s live target) now uses a genuine composite foreign key against that constraint, instead of two independent scalar columns that could silently mismatch. |
| 3 | Enforce PartLink container consistency; rename `topLevelPartLinks` | `Section` gained `@@unique([dishVersionId, id])`. `PartLink.sectionId` is now paired with `containerVersionId` as a second composite FK against that constraint, so a `PartLink` can never claim a `Section` belonging to a different `DishVersion`. `DishVersion.topLevelPartLinks` renamed to `partLinks` — it holds every `PartLink` for that Version; "top-level" is just the subset where `sectionId IS NULL`. |
| 4 | Preserve deleted-source identity in Meal Plans and grocery lists | `MealPlanEntry` and `GroceryListSource` both gained `sourceDishTitleSnapshot`/`sourceDishKindSnapshot`/`sourceDishVersionLabelSnapshot`, captured at creation time, and their `dishId`/`dishVersionId` are now nullable with `onDelete: SetNull` — the row remains fully understandable from its own snapshot even after the source Recipe/Part is permanently deleted. |
| 5 | Persist grocery synchronization changes, no silent disappearance | `GroceryItemContribution` gained a `state` (`ACTIVE`/`CHANGED`/`REMOVED`) plus `previousQuantityDecimal`/`previousQuantityText`/`previousUnit`/`acknowledgedAt`. `GroceryListItem` gained a mirrored `syncFlag` (`UNCHANGED`/`CHANGED`/`REMOVED`) plus `flagAcknowledgedAt`. A disappearing checked item is flagged `REMOVED` with `checkedAt` left intact, never silently deleted. Relations added among `GroceryItemContribution` ↔ `GroceryListSource`/`MealPlanEntry`/`GroceryListItem`, and `GroceryListItem` ↔ `GroceryCategory`. |
| 6 | Make active share links recoverable | `ShareLink.token`/`tokenHash` replaced with `tokenId` (plaintext, public lookup key) plus a reproducible **HMAC-SHA256(tokenId, SHARE_LINK_HMAC_SECRET)** signature, recomputed on demand from the server-only secret — never itself stored. Full design in §4 below. |
| 7 | Clarify ImageAsset across independent copies | `ImageAsset.ownerId` replaced with nullable `uploadedByUserId` (attribution only, `onDelete: SetNull`, never drives access or cascading deletion). Every surviving `DishVersion` — including ones now owned by a different account after duplication or an accepted share — references the same shared, immutable asset. Full design in §5 below. |
| 8 | Move grocery-category memory out of Ingredient Version content | `Ingredient.groceryCategoryHint` removed entirely. New `IngredientCategoryMemory` model, user-owned, keyed by normalized ingredient name → `GroceryCategory`; updating it never creates a Recipe/Part Version. |
| 9 | Correct nutrition basis modeling | `NutritionBasis` narrowed from `{ WHOLE, PER_SERVING }` to `{ WHOLE, PER_OUTPUT_UNIT }`, with new `nutritionBasisQuantity`/`nutritionBasisUnit` fields on `DishVersion` (e.g. `1` / `"cup"`) so any compatible output basis is representable, not just servings. |
| 10 | Complete the current-search strategy | `Dish` gained `currentSearchText` (cuisine + Flavor-profile names + tag names + Section names + linked current Part titles) alongside the existing `currentTitle`, both trigram-indexed, both refreshed only by the version-creation transaction. Ranking checks `currentTitle` first (exact/prefix/partial title), then falls back to `currentSearchText` (cuisine/Flavor-profile/tag/structural matches). |
| 11 | Preserve historical per-Part ratings | `Rating.dishId`/`dishVersionId` are now nullable with `onDelete: SetNull` (not cascade), and `Rating` gained `dishTitleSnapshot`/`dishVersionLabelSnapshot`, captured at creation time — never a later "materialize on delete" step. A rating for a nested Part rated inside an otherwise-still-alive Recipe session survives that Part's later deletion; it stops contributing to that Part's live analytics automatically (summaries are computed live via `WHERE dishId = ...`, so a nulled row simply drops out) without requiring the deleted Part to remain navigable. A rating for the session's own top-level item is unaffected — it cascades away with the whole session if and when that item's own Dish is deleted, exactly as before. |
| 12 | Additional database invariants | Added: `Rating.value` between 1 and 5 (CHECK); one built-in owner `Taster` per user (partial unique index); one protected Favorite `Tag` per user (partial unique index); `ShareLink` mode/snapshot-field consistency (CHECK); `GroceryList` mode/`linkedMealPlanId` consistency (CHECK); `MealPlan` start-date-not-after-end-date (CHECK). Normalized category/profile uniqueness and safe category-deletion behavior were already in place from round 1 and are confirmed unchanged. The `Dish` archived-state CHECK constraint remains, as explicitly reconfirmed. |

### Migration and review instructions — confirmed unchanged

Four migrations, grouped by domain cohesion (core content/versioning → cooking/feedback → planning/grocery → sharing); Tier 1 and Tier 2 tables created together in the same initial schema phase; private Vercel Blob; Neon adapter in deployed environments, `pg` adapter plus a disposable PostgreSQL service in GitHub Actions for CI; proportional milestone-boundary testing. The only placement addition this round: `IngredientCategoryMemory` joins Migration 3 (Planning & grocery), grouped there for domain cohesion even though its only hard dependency is Migration 1's `GroceryCategory`.

---

## 2. Complete revised Prisma schema

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
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

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
  sentDirectShares           DirectShare[] @relation("DirectShareSender")
  receivedDirectShares       DirectShare[] @relation("DirectShareRecipient")
  uploadedImages             ImageAsset[]  @relation("ImageUploader")

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

  currentTitle      String?
  currentSearchText String?

  sourceKind             SourceKind @default(NONE)
  sourceDishId           String?
  sourceDishVersionLabel String?
  sourceTitle            String?
  sourceAggregateRating  Decimal?   @db.Decimal(3, 2)
  sourceRatingCount      Int?
  sourceSessionCount     Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner          User                @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  versions       DishVersion[]       @relation("DishVersions")
  currentVersion DishVersion?        @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  tags           DishTag[]
  flavorProfiles DishFlavorProfile[]
  preferredUnitOverrides PreferredUnitOverride[]

  sourceDish   Dish?  @relation("DishDuplicationSource", fields: [sourceDishId], references: [id], onDelete: SetNull)
  duplicatedAs Dish[] @relation("DishDuplicationSource")

  cookingSessions    CookingSession[]
  ratings            Rating[]
  groceryListSources GroceryListSource[]
  mealPlanEntries    MealPlanEntry[]
  shareLinksDirect   ShareLink[]   @relation("ShareLinkDish")
  directSharesDirect DirectShare[] @relation("DirectShareDish")
  partLinkTargets    PartLink[]    @relation("PartLinkTargetDish")

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
  imageAsset      ImageAsset?   @relation(fields: [imageAssetId], references: [id])

  sections Section[]

  partLinks           PartLink[] @relation("DishVersionPartLinks")
  targetedByPartLinks PartLink[] @relation("PartLinkTarget")

  cookingSessions    CookingSession[]
  ratings            Rating[]
  groceryListSources GroceryListSource[]
  mealPlanEntries    MealPlanEntry[]
  shareLinks         ShareLink[]
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
  partLinks    PartLink[]    @relation("PartLinkSectionContainer")

  @@unique([dishVersionId, id])
  @@index([dishVersionId])
  @@index([lineageId])
}

model Ingredient {
  id                   String   @id @default(cuid())
  lineageId            String
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

  @@index([sectionId])
  @@index([lineageId])
}

model Instruction {
  id        String @id @default(cuid())
  lineageId String
  sectionId String
  text      String
  position  Int

  section Section @relation(fields: [sectionId], references: [id], onDelete: Cascade)

  @@index([sectionId])
  @@index([lineageId])
}

enum PartLinkState {
  LIVE
  MATERIALIZED
}

model PartLink {
  id                 String        @id @default(cuid())
  lineageId          String
  containerVersionId String
  sectionId          String?
  linkState          PartLinkState @default(LIVE)
  position           Int

  targetDishId        String?
  targetDishVersionId String?

  materializedTitle        String?
  materializedVersionLabel String?
  materializedContent      Json?

  containerVersion DishVersion @relation("DishVersionPartLinks", fields: [containerVersionId], references: [id], onDelete: Cascade)
  section          Section?    @relation("PartLinkSectionContainer", fields: [containerVersionId, sectionId], references: [dishVersionId, id])

  targetVersion DishVersion? @relation("PartLinkTarget", fields: [targetDishId, targetDishVersionId], references: [dishId, id], onDelete: Restrict)
  targetDish    Dish?        @relation("PartLinkTargetDish", fields: [targetDishId], references: [id], onDelete: Restrict)

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

  owner       User                 @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  dishVersion DishVersion          @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: Cascade)
  dish        Dish                 @relation(fields: [dishId], references: [id], onDelete: Cascade)
  units       CookingSessionUnit[]
  review      SessionReview?
  ratings     Rating[]
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

  session        CookingSession                 @relation(fields: [sessionId], references: [id], onDelete: Cascade)
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
  sessionId                    String   @id
  whatWentWell                 String?
  whatDidNotGoWell              String?
  anythingElse                  String?
  actualAmountQuantity          Decimal? @db.Decimal(12, 3)
  actualAmountUnit               String?
  reviewAdjustedDurationSeconds Int?
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt

  session CookingSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
}

model Rating {
  id            String  @id @default(cuid())
  sessionId     String
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

  owner          User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  linkedMealPlan MealPlan? @relation(fields: [linkedMealPlanId], references: [id], onDelete: SetNull)

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
  dish        Dish?        @relation(fields: [dishId], references: [id], onDelete: SetNull)
  dishVersion DishVersion? @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)

  contributions GroceryItemContribution[]

  @@index([groceryListId])
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

  mealPlan      MealPlan                  @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  dishVersion   DishVersion?              @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)
  linkedSession CookingSession?           @relation(fields: [linkedSessionId], references: [id], onDelete: SetNull)
  plannedMeals  PlannedMeal[]
  groceryContributions GroceryItemContribution[]

  @@index([mealPlanId, cookDate])
  @@index([linkedSessionId])
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
  dishId  String?
  mode    ShareLinkMode @default(FIXED_SNAPSHOT)

  tokenId String @unique

  dishVersionId     String?
  frozenSnapshot    Json?
  dishTitleSnapshot String

  expiresAt DateTime?
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  dish        Dish?        @relation("ShareLinkDish", fields: [dishId], references: [id], onDelete: SetNull)
  dishVersion DishVersion? @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)

  @@index([ownerId])
  @@index([dishId])
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
  dish        Dish?        @relation("DirectShareDish", fields: [dishId], references: [id], onDelete: SetNull)
  dishVersion DishVersion? @relation(fields: [dishId, dishVersionId], references: [dishId, id], onDelete: SetNull)

  @@index([senderId])
  @@index([recipientId])
  @@index([dishId, status])
}
```

---

## 3. Complete revised raw migration SQL

### Migration 1

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "dish_current_title_trgm_idx"
  ON "Dish" USING GIN ("currentTitle" gin_trgm_ops);

CREATE INDEX "dish_current_search_text_trgm_idx"
  ON "Dish" USING GIN ("currentSearchText" gin_trgm_ops);

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

ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_archived_state_consistency"
  CHECK (
    ("stage" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
    OR
    ("stage" != 'ARCHIVED' AND "archivedAt" IS NULL)
  );

CREATE UNIQUE INDEX "one_favorite_tag_per_user"
  ON "Tag" ("ownerId")
  WHERE "isFavorite" = true;
```

### Migration 2

```sql
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_value_range"
  CHECK ("value" >= 1 AND "value" <= 5);

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
```

### Migration 4

```sql
ALTER TABLE "ShareLink"
  ADD CONSTRAINT "share_link_mode_consistency"
  CHECK (
    ("mode" = 'FIXED_SNAPSHOT' AND "dishVersionId" IS NOT NULL AND "frozenSnapshot" IS NOT NULL)
    OR
    ("mode" = 'CURRENT' AND "dishVersionId" IS NULL AND "frozenSnapshot" IS NULL)
  );
```

---

## 4. Recoverable share tokens — design (Correction 6)

**Recommendation: reproducible HMAC-signed token format**, not encrypted storage (an encryption key needs the same operational care as an HMAC secret, but adds a decrypt step and a ciphertext column for no corresponding benefit).

- `ShareLink.tokenId` — securely random (e.g. 16 bytes, base64url), stored in **plaintext**, a public lookup key only. Knowing it alone grants nothing.
- The shareable URL token given to the client is `tokenId + "." + base64url(HMAC-SHA256(tokenId, SHARE_LINK_HMAC_SECRET))`. The secret is a long, high-entropy, server-only environment variable (`openssl rand -base64 32`, same posture as `BETTER_AUTH_SECRET`) — **never persisted in the database**.
- **Resolving:** split the token into `tokenId` + signature; recompute the HMAC server-side; compare in constant time; only then look up `ShareLink` by `tokenId` and check `revokedAt`/`expiresAt`.
- **"Copy existing active link"** — the capability hash-only storage couldn't support: the server already has `tokenId` on file and the secret in its own environment, so it can recompute the identical, fully valid token at any time without ever having stored the secret material.
- **Regeneration:** assign a new `tokenId`. The old one is simply no longer this row's current value, so a lookup by it fails — invalidation happens at the lookup step, not because the old signature stops verifying (it would still mathematically match; it just never gets checked, because the row it would resolve to is gone).
- **Key management/rotation:** `SHARE_LINK_HMAC_SECRET` lives only as a server-only env var. Rotating it invalidates every previously issued link at once — real but rare and acceptable at this scale; a two-secret rotation grace window is a reasonable future refinement, not built now.

---

## 5. Cross-account `ImageAsset` sharing — design (Correction 7)

**Recommendation: a shared, immutable `ImageAsset`, referenced (not copied) by every surviving `DishVersion`**, including ones owned by a different account after duplication or an accepted share.

- **Read authorization** derives entirely from the requester's access to *some* `DishVersion` referencing the asset (ownership of that Dish, or a valid share/accepted-copy context) — never from `uploadedByUserId`, which is display attribution only.
- **Duplication/accepted-share:** the new `DishVersion` sets its `imageAssetId` to the **same** `ImageAsset.id` as its source — no Blob bytes copied, no new row created. This is strictly safer than physically duplicating the Blob: it's a single already-atomic DB write with no external I/O in the critical path, avoiding the partial-failure window physical duplication would introduce (Blob copy succeeds, DB write fails, or vice versa).
- **Account deletion:** `uploadedByUserId` is set `NULL` if other accounts' `DishVersion`s still reference the asset; the asset and its Blob object survive untouched as long as any `DishVersion` anywhere still references it.
- **Cleanup:** unchanged from round 1 — a query-based `COUNT(*)` of referencing `DishVersion`s at delete/replace time, genuinely asset-centric rather than owner-centric, so it is automatically correct across account boundaries with no special-casing.

---

## 6. Remaining owner questions

**None that rise to a genuine product decision.** Every choice in this round — the HMAC token design, the shared-`ImageAsset` model, the composite-key strategy, the grocery-sync change-tracking shape — was resolvable directly from your feedback and from `PRODUCT_SPEC.md`'s existing requirements.

Two **implementation-detail** choices are worth a second look before actual implementation begins (neither is a product question — both are engineering judgment calls made in your stated direction, flagged so you can confirm or redirect):

1. **`PartLink` and `ShareLink` each declare two relations that share an underlying column** (`PartLink.containerVersionId` is used both by a direct relation to `DishVersion` and by the composite container-consistency relation to `Section`; `ShareLink.dishId` is used both by a direct relation to `Dish` and by the composite pairing relation to `DishVersion`). This is a documented, supported Prisma pattern, but the exact attribute syntax should be validated against the actual installed Prisma 7.x version when schema work begins — a minor syntax adjustment, not a design change, would be the only possible outcome of that check.
2. **Whether acknowledged, `REMOVED` `GroceryItemContribution` rows are ever pruned**, or simply left in place indefinitely as harmless historical noise. This proposal describes "a subsequent resync pass may finally prune the acknowledged, still-removed rows" as a reasonable default, but grocery lists are small enough that never pruning them is also perfectly fine — this is a low-stakes implementation choice to confirm during `BUILD_PLAN.md` Slice 15, not before.

---

## 7. Deliverables checklist

1. ✅ Revised literal Prisma schema — §2 above (identical to `PRISMA_SCHEMA_PROPOSAL.md` §2).
2. ✅ Revised raw SQL constraints/indexes — §3 above (identical to `PRISMA_SCHEMA_PROPOSAL.md` §4).
3. ✅ Concise correction mapping — §1 above.
4. ✅ Remaining owner questions — §6 above (none; two implementation-detail flags noted).
5. ✅ `docs/ARCHITECTURE_PROPOSAL.md` and `docs/BUILD_PLAN.md` updated in place (targeted sections only, per instruction — not regenerated wholesale).
6. ✅ `docs/PRISMA_SCHEMA_PROPOSAL.md` updated in place as the living, authoritative schema/migration document.

**Not done, per your explicit instructions:** no migration applied, no package installed, no product UI work begun, no gate beyond Gate 1 proceeded past.

---

*End of `GATE_1_REVIEW_SUMMARY_2.md`.*
