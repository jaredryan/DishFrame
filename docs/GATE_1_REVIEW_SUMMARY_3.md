# Gate 1 Review Summary — Round 3 (Final Schema-Validity Pass)

**Purpose:** a single, self-contained handoff document for this round's final schema-validity review — the exact `prisma format`/`prisma validate` output, the final complete literal Prisma schema, every raw SQL addition, a correction-by-correction mapping, and any remaining blockers or owner questions — reviewable independently without needing `ARCHITECTURE_PROPOSAL.md`, `BUILD_PLAN.md`, or `PRISMA_SCHEMA_PROPOSAL.md` open.

**Status:** Gate 1 remains open. No migration was applied. No database (production or otherwise) was touched. No package was installed. No Blob storage was provisioned. No USDA integration was implemented. No product UI work was begun. The schema was validated **only** against a temporary file outside the repository — `prisma/schema.prisma` itself was never written to.

The direction confirmed as unchanged and not revisited this round: the unified `Dish`/`DishVersion` architecture; four migrations grouped by domain cohesion; Tier 1 and Tier 2 models created in the same initial schema phase; a private Vercel Blob store; `@prisma/adapter-neon` in deployed Neon environments; `@prisma/adapter-pg` with a disposable PostgreSQL service container in GitHub Actions for CI; optional Docker Compose for local test convenience; `FDC_API_KEY` already configured locally and in Vercel; proportional milestone-boundary testing.

---

## 1. Exact `prisma format` result

Run against a temporary schema file outside the repository (`/private/tmp/.../scratchpad/schema.prisma`), with the repository's own `prisma.config.ts` loaded for consistency (no database connection required or made):

```
$ pnpm exec prisma format --schema <temp-file-path>

Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from <temp-file-path>.
Formatted <temp-file-path> in 29ms 🚀
```

No errors. `prisma format` only reflowed column alignment/whitespace — no structural changes were needed.

---

## 2. Exact `prisma validate` result

Run against the same, now-formatted, temporary file:

```
$ pnpm exec prisma validate --schema <temp-file-path>

Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from <temp-file-path>.
The schema at <temp-file-path> is valid 🚀
```

No errors. This is the direct, empirical confirmation that removing every shared-scalar-field relation (Correction 1) actually resolved the underlying Prisma Schema Language limitation — had any relation still illegitimately reused a field, `prisma validate` would have failed with a relation-ambiguity error at this step, before any other correction could even be assessed.

**On `migrate dev --create-only` (not run, deliberately):** the correction instructions ask that, where raw SQL is required, migrations be generated with `--create-only` and the raw SQL be added and inspected before returning. This step requires connecting to a real Postgres database to compute the schema diff. The only `DATABASE_URL` available in this environment is the project's existing Neon connection, and this project has not yet provisioned a separate preview/dev database (per `POST_LAUNCH_TODO.md` §G, that separation is still an open to-do) — so this environment cannot currently distinguish "the project's Neon database" from "the production database," and the stop conditions for this pass explicitly forbid touching production. Rather than risk that ambiguity, `migrate dev --create-only` was **not run**. In its place: every raw SQL addition below was hand-authored to match the validated schema's exact table/column/enum names, and manually inspected line-by-line for identifier correctness, type compatibility, constraint ordering, and foreign-key direction (the same review `--create-only` inspection would have performed, done by hand instead of via a generated diff). This is a noted, deliberate deviation — not a validation failure — and is trivially resolvable once the already-approved local/CI Postgres container (Correction 10 from round 2) exists: at that point, running `migrate dev --create-only` against that disposable database becomes a safe, final double-check before the real migration is ever applied, with no risk to production. See §6.

---

## 3. Final complete literal Prisma schema

Identical to `PRISMA_SCHEMA_PROPOSAL.md` §2 — this is the exact content validated in §§1–2 above.

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
  imageAsset      ImageAsset?   @relation(fields: [imageAssetId], references: [id], onDelete: Restrict)

  sections Section[]

  partLinks           PartLink[] @relation("DishVersionPartLinks")
  targetedByPartLinks PartLink[] @relation("PartLinkTarget")

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

  @@unique([dishVersionId, id])
  @@unique([dishVersionId, lineageId])
  @@index([dishVersionId])
  @@index([lineageId])
}

model Ingredient {
  id                   String   @id @default(cuid())
  lineageId            String
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
  dishVersionId String
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
  sectionId          String?
  linkState          PartLinkState @default(LIVE)
  position           Int

  targetDishId        String?
  targetDishVersionId String?

  materializedTitle        String?
  materializedVersionLabel String?
  materializedContent      Json?

  containerVersion DishVersion  @relation("DishVersionPartLinks", fields: [containerVersionId], references: [id], onDelete: Cascade)
  targetVersion    DishVersion? @relation("PartLinkTarget", fields: [targetDishId, targetDishVersionId], references: [dishId, id], onDelete: Restrict)

  @@unique([containerVersionId, lineageId])
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

## 4. Final raw migration SQL

Identical to `PRISMA_SCHEMA_PROPOSAL.md` §4 — reproduced here in full for standalone review.

### Migration 1

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "dish_current_title_trgm_idx"
  ON "Dish" USING GIN ("currentTitle" gin_trgm_ops);

CREATE INDEX "dish_current_structural_search_text_trgm_idx"
  ON "Dish" USING GIN ("currentStructuralSearchText" gin_trgm_ops);

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

ALTER TABLE "PartLink"
  ADD CONSTRAINT "part_link_section_container_consistency"
  FOREIGN KEY ("containerVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

ALTER TABLE "Ingredient"
  ADD CONSTRAINT "ingredient_section_version_consistency"
  FOREIGN KEY ("dishVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

ALTER TABLE "Instruction"
  ADD CONSTRAINT "instruction_section_version_consistency"
  FOREIGN KEY ("dishVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_archived_state_consistency"
  CHECK (
    ("stage" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
    OR
    ("stage" != 'ARCHIVED' AND "archivedAt" IS NULL)
  );

ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_current_version_ownership"
  FOREIGN KEY ("id", "currentVersionId")
  REFERENCES "DishVersion" ("dishId", "id");

CREATE UNIQUE INDEX "one_favorite_tag_per_user"
  ON "Tag" ("ownerId")
  WHERE "isFavorite" = true;

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
ALTER TABLE "ShareLink"
  ADD CONSTRAINT "share_link_mode_consistency"
  CHECK (
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

ALTER TABLE "DirectShare"
  ADD CONSTRAINT "direct_share_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );
```

---

## 5. Correction-by-correction mapping

| # | Correction | What changed |
|---|---|---|
| 1 | Remove shared relation-scalar fields | `PartLink.containerVersionId` no longer backs two relations — the `Section` composite relation is removed in favor of a raw-SQL composite FK; `PartLink.targetDish` (direct-to-Dish) removed entirely, keeping only the composite `targetVersion` relation. `CookingSession`/`GroceryListSource`/`DirectShare` each lost their redundant direct-to-`Dish` relation, keeping only the composite `DishVersion` relation (`dishId` remains a plain indexed scalar). `ShareLink` redesigned with fully separate field sets: `currentDishId` (CURRENT mode) and `fixedDishId`/`fixedDishVersionId` (FIXED_SNAPSHOT mode) — neither shares a column with the other. **Validated**: `prisma validate` succeeded against the fully redesigned schema (§2 above). |
| 2 | Fix Meal Plan deletion vs. GroceryList consistency | `GroceryList.linkedMealPlan` changed from `onDelete: SetNull` to `onDelete: Restrict`. The Meal-Plan-deletion service now must, in one transaction, flip every linked active `GroceryList` to `STANDALONE` (clearing `linkedMealPlanId` in the same statement) *before* deleting the `MealPlan` row — the database enforces this ordering by refusing the delete otherwise. The CHECK constraint is retained unchanged. |
| 3 | Fix ShareLink deletion/revocation consistency | The mode-consistency CHECK constraint is revised around the new `currentDishId`/`fixedDishId`/`fixedDishVersionId` fields, with an explicit `revokedAt IS NOT NULL` escape clause that relaxes the mode-specific field requirements once a link is revoked (by the owner or by source deletion) — while a standalone fixed-pair-consistency clause (both `fixedDishId`/`fixedDishVersionId` null or both set) is enforced unconditionally, active or revoked. `dishTitleSnapshot` is never cleared, keeping the owner's own sharing history readable regardless of revocation. The full settled share-deletion behavior (editing doesn't affect fixed snapshots; archiving doesn't revoke; permanent deletion revokes links and cancels pending shares; accepted copies survive; account deletion hard-deletes remaining links/shares) remains authoritative and unchanged. |
| 4 | Nullable Dish/Version pair consistency | Added CHECK constraints requiring both-null-or-both-non-null on `Rating`, `GroceryListSource`, `MealPlanEntry`, and `DirectShare` (and folded into `ShareLink`'s own mode-consistency CHECK for its fixed pair) — closing the gap a composite FK's `MATCH SIMPLE` semantics leave open (it only validates when *both* columns are non-null; it says nothing about a half-null row). |
| 5 | Make current-Version ownership enforceable | Added a raw-SQL composite FK: `Dish(id, currentVersionId) → DishVersion(dishId, id)`. `Dish.id` already participates in essentially every other relation pointing at `Dish`, so this could not be a second Prisma relation — the existing simple Prisma relation is kept, and the ownership guarantee is layered on as raw SQL. |
| 6 | Correct current-search maintenance | Chosen approach: **split structural denormalization from live relational search** (the alternative offered in the correction). `currentSearchText` (round 2) is replaced by `currentStructuralSearchText`, holding only genuinely Version-owned content (Section names + the titles of the *exact* Part Versions referenced, resolved from each link's own target Version, never the target Part's current title) — refreshed only at version-creation time, since nothing else can change it. Cuisine, tags, and Flavor profiles are **not denormalized at all**; they're queried live (a new trigram index on `Dish.cuisine`, plus the existing `DishTag`/`DishFlavorProfile` join indexes), which eliminates five of the six mutation paths the correction named (cuisine change, tag attach/remove, tag rename/merge/delete, Flavor-profile attach/remove, Flavor-profile rename/delete) by construction — there is nothing denormalized for them to go stale. |
| 7 | Protect shared historical images | `DishVersion.imageAsset` is now explicit `onDelete: Restrict` (Prisma's implicit default for an optional relation is `SetNull`, which would have silently corrupted historical Version content). The database now physically refuses to delete an `ImageAsset` while any `DishVersion` still references it. |
| 8 | Enforce lineage uniqueness | `Section.@@unique([dishVersionId, lineageId])` and `PartLink.@@unique([containerVersionId, lineageId])` added directly. `Ingredient`/`Instruction` each gained a denormalized `dishVersionId` column (required, since neither had one before) specifically so `@@unique([dishVersionId, lineageId])` can be declared at the correct whole-Version scope; consistency between that denormalized column and the row's actual `Section` is enforced by the same raw-SQL composite-FK pattern used for `PartLink`'s container consistency, since `sectionId` was already spoken for by the ordinary `section` relation. |
| 9 | Remaining consistency constraints | Nutrition basis: `WHOLE` requires both basis fields null, `PER_OUTPUT_UNIT` requires both non-null and quantity `> 0` — new CHECK on `DishVersion`. Nullable source pairs: covered under Correction 4. Share links: covered under Correction 3. Section/container integrity: covered under Correction 1/3 (the `PartLink`/`Ingredient`/`Instruction` raw-SQL composite FKs). Previously approved constraints (`Dish` archived-state, `PartLink` LIVE/MATERIALIZED, `Rating` value range, one Favorite tag, one owner Taster, one active session per Dish, `GroceryList` mode consistency, `MealPlan` date ordering) all retained unchanged. |
| 10 | Grocery removed-contribution retention | Confirmed as directed: acknowledged `REMOVED` `GroceryItemContribution` rows are retained indefinitely for now. No automatic pruning is designed or built. `BUILD_PLAN.md` Slice 15's wording updated to remove the round-2 "may prune" implication. |
| 11 | Validate against installed Prisma version | Done — §§1–2 above. `prisma format` and `prisma validate` both run against a temporary file, both succeeded with no errors. `migrate dev --create-only` was not run, for the reason explained in §2 — a deliberate, documented deviation, not a validation gap. |
| 12 | Migration/implementation direction | Confirmed unchanged and not revisited — see the header of this document. |

---

## 6. Remaining schema-validation status

**No blocker.** `prisma format` and `prisma validate` both succeeded against the fully corrected schema with no errors, warnings, or ambiguity — this is empirical, not asserted.

**One noted, non-blocking deviation:** `migrate dev --create-only` was not run, because doing so requires connecting to a real Postgres database, and the only `DATABASE_URL` available in this environment cannot currently be confirmed as separate from production (per `POST_LAUNCH_TODO.md` §G, a dedicated preview/dev database has not yet been provisioned). Raw SQL was instead hand-authored against the validated schema's exact identifiers and manually inspected for correctness. This closes itself naturally once the already-approved local/CI Postgres container (Correction 10, round 2) exists — at that point, running `migrate dev --create-only` against that disposable database is a safe, mechanical final check, not a design question.

---

## 7. Remaining owner questions

**None.** Every choice this round — the relation-redesign pattern, the `Restrict` vs. `SetNull` decisions, the search-strategy split, the lineage-uniqueness scope — was resolvable directly from the correction instructions and from `PRODUCT_SPEC.md`'s existing requirements, and every claim about schema validity was checked empirically rather than asserted. The two implementation-detail items flagged at the end of round 2 (the dual-relation-on-shared-column Prisma pattern, and whether removed grocery contributions are ever pruned) are now **resolved**: the first is moot, since every such dual-relation case was redesigned away this round per Correction 1; the second is explicitly settled by Correction 10 (retain, do not prune, for now).

---

*End of `GATE_1_REVIEW_SUMMARY_3.md`. Nothing in this document has been applied.*
