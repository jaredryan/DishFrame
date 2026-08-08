# Recipe App — Product Roadmap

**Document status:** Stable planning reference  
**Purpose:** Preserve the product direction, release boundaries, and high-level build sequence before writing the more detailed product and frontend specifications.

---

## 1. Product Vision

Recipe App is a full-stack personal recipe manager built around the complete lifecycle of a recipe:

> **Save → organize → prepare → cook → evaluate → revise → reuse**

It will include the expected foundations of a modern recipe application—recipe storage, search, scaling, nutrition, grocery lists, cooking assistance, and sharing—but its primary differentiation is what happens **after a recipe is cooked**.

The app should help users:

- preserve recipes they trust;
- organize recipes in a way that matches how they actually cook;
- assemble recipes from reusable components;
- follow recipes efficiently in the kitchen;
- record how each cooking session went;
- collect ratings from multiple tasters;
- revise recipes without losing prior versions;
- understand how a recipe evolved;
- plan future meals from a dependable, changing rotation.

The initial product is designed around Jared’s real cooking workflow, while remaining general enough for other home cooks and meal preppers.

---

## 2. Product Positioning

This is not intended to become:

- an infinite recipe-discovery feed;
- a social network for cooks;
- a calorie diary;
- a full pantry-inventory system;
- an AI recipe generator;
- a grocery-commerce platform.

The intended positioning is:

> **A personal cookbook and recipe-development system for people who repeatedly cook, refine, and rotate dependable meals.**

A simpler expression of the differentiator is:

> **A recipe app that remembers what happened after you cooked the recipe.**

---

## 3. Roadmap Tiers

### Tier 1 — Complete for Personal Use

Everything required for Jared to replace his current recipe-management workflow and genuinely prefer using this app.

Tier 1 may be substantial. The goal is not the smallest possible demo; the goal is a complete, useful personal product.

### Tier 2 — Complete Before Sharing Broadly

Features needed before comfortably introducing the app to family members or other users.

These features improve planning, sharing, public presentation, account controls, and first-use clarity.

### Tier 3 — Optional Productization

Features that would improve the app before serious commercialization or public release, but are not committed MVP scope.

These may be built later if the app remains enjoyable, useful, or commercially promising.

### Excluded Scope

Ideas judged too costly, too maintenance-heavy, too unreliable, or too far from the core product thesis are intentionally omitted rather than retained as an active fourth tier.

---

# 4. Tier 1 Roadmap — Personal-Use Release

Tier 1 is ordered primarily by implementation dependency and secondarily by feature importance.

---

## Phase 1: Application Foundation

Build the full-stack foundation before adding recipe behavior.

### Scope

- Responsive web application.
- Frontend and backend scaffolding.
- Persistent relational database.
- OAuth authentication.
- Private user accounts and recipe ownership.
- Multiple simultaneous authenticated device sessions.
- Long-lived sign-in suitable for phones and tablets.
- Image storage.
- Basic account menu and logout.
- Initial protected application shell.
- Minimal dashboard or landing state after login.

### Product Decisions

- Recipes are private by default.
- Use OAuth rather than managing user passwords directly.
- Do not impose an arbitrary two-device session limit.
- Security should be responsible but proportionate to a personal recipe product.

### Completion Definition

A user can sign in, reach a protected application, remain signed in across devices, and own private persisted data.

---

## Phase 2: Recipe and Version Architecture

Define the central product model before building extensive interfaces.

### Recipe Identity

A recipe represents the stable identity across time.

Examples:

- Vietnamese Nuoc Cham Bowl
- Cuban Mojo Bowl
- Japanese Soy Mirin Bowl

Recipe-level properties may include:

- owner;
- current version;
- lifecycle state;
- favorite status;
- visibility;
- creation and update metadata;
- archive state;
- source attribution when copied from another user.

### Immutable Recipe Versions

Every recipe contains one or more versions.

Creating a new recipe automatically creates Version 1.

A version may contain:

- title;
- short description;
- optional cuisine;
- optional image;
- expected servings or batch yield;
- preparation time;
- cooking time;
- difficulty;
- calories;
- protein;
- carbohydrates;
- fat;
- ingredient modules;
- instruction modules and steps;
- estimated duration per module;
- version note;
- creation date.

The current version is shown by default on the recipe-detail page.

Historical versions remain available and are never silently overwritten.

### Version Behavior

- Substantive recipe edits create a new version.
- Restoring an old version creates a new current version based on that history.
- Restoring never deletes later versions.
- Minor typo corrections may eventually be allowed without creating a formal version, subject to the product specification.
- Version comparison can be implemented after basic version browsing works.

### Recipe Lifecycle

Use one required lifecycle field:

1. **Idea** — captured but not meaningfully tested.
2. **Experimental** — being tested or refined.
3. **Proven** — dependable but not currently in regular rotation.
4. **Active** — dependable and currently used regularly.
5. **Archived** — preserved but excluded from normal browsing and recommendations.

Common progression:

`Idea → Experimental → Proven → Active`

Additional transitions:

- `Active → Proven` when removed from the current rotation.
- `Any state → Archived`
- `Archived → Experimental` when deliberately revived.

The interface should remain flexible rather than rigidly enforcing every transition.

### Notes Model

Maintain two note types:

- **Version notes:** why the recipe changed and what distinguishes this version.
- **Cook-session notes:** what happened during one particular cooking session.

Do not maintain a separate general recipe-notes field. The current version note acts as the current recipe’s primary notes.

---

## Phase 3: Core Recipe Management

Build the central recipe workflows.

### Recipe CRUD

- Create.
- View.
- Edit.
- Duplicate.
- Archive.
- Restore.
- Delete where appropriate.
- Protect against accidental unsaved changes.
- Validate required fields.

### Flexible Recipe Modules

Recipes should support user-defined ingredient and instruction groupings.

Examples:

- Sauce
- Protein
- Rice
- Cooked Vegetables
- Fresh Vegetables
- Toppings
- Dough
- Filling
- Glaze
- Pasta
- Finish

Users can:

- create modules;
- rename modules;
- reorder modules;
- remove modules;
- add ingredients and steps inside modules;
- reorder ingredients and steps;
- use drag-and-drop where appropriate.

The architecture must support both full recipes and future reusable components.

### Recipe Library

Support:

- grid view;
- compact list view;
- recipe image;
- title;
- lifecycle;
- tags;
- rating summary;
- preparation time;
- nutrition summary where useful.

### Recipe Detail

Display the current version by default, with access to:

- full ingredients;
- instructions;
- macros;
- servings;
- version note;
- version history;
- cooking mode;
- cook history;
- edit actions;
- duplicate, share, archive, and other overflow actions.

### Visual System and Dark Mode

Create the design system during this phase rather than adding theme support later.

Include:

- semantic design tokens;
- light palette;
- dark palette;
- system, light, and dark modes;
- persistent preference;
- theme toggle in the account menu;
- responsive behavior across phone, tablet, and desktop.

---

## Phase 4: Search, Tags, and Organization

### Search

Search across:

- recipe title;
- cuisine;
- custom tags.

Additional search targets can be added later if useful.

### Custom User-Owned Tags

Users can create unrestricted personal tags.

Examples:

- Spicy
- Sweet
- High Protein
- Chicken
- Korean
- Quick
- Summer
- Family Favorite
- Needs Tweaking
- Freezer Friendly

The app may suggest starter tags without imposing a universal taxonomy.

### Filters

Support filters for:

- lifecycle;
- custom tags;
- cuisine;
- favorite status when added;
- other structured fields where useful.

Archived recipes remain hidden unless explicitly requested.

### Sorting

Initial sorting may include:

- recently updated;
- alphabetical;
- preparation time;
- rating;
- last cooked.

Last-cooked data should be derived from cook logs rather than manually maintained.

---

## Phase 5: Serving Scaling, Nutrition, and Measurement Conversion

### Serving and Batch Scaling

Users can change the target number of servings or batch yield.

The app recalculates:

- ingredient quantities;
- batch macros;
- per-serving macros.

Users can always return to the original recipe yield.

### Manual Nutrition

Tier 1 requires manual nutrition entry at the recipe-version level:

- calories;
- protein;
- carbohydrates;
- fat.

Automatic nutrition lookup is deferred.

Ingredient-level nutrition may be considered later, but the first release must at least support accurate manual recipe-level totals.

### Safe Unit Conversion

Support conversion within compatible measurement families.

#### US Volume

- teaspoon;
- tablespoon;
- fluid ounce;
- cup;
- pint;
- quart;
- gallon.

#### Metric Volume

- milliliter;
- liter.

#### Weight

- ounce;
- pound;
- gram;
- kilogram.

#### Count-Based Quantities

Examples:

- onion;
- carrot;
- egg;
- can;
- package;
- bunch.

### Conversion Rules

- Scale numeric quantities.
- Simplify quantities within the same measurement family.
- Format values intelligently, such as converting `4 teaspoons` to `1 tablespoon + 1 teaspoon`.
- Convert between compatible US and metric units.
- Leave unknown or count-based units as scaled numeric amounts.
- Do not automatically convert volume to weight without ingredient-density data.

---

## Phase 6: Version History and Comparison

### Version History

Users can:

- view every version;
- inspect historical ingredients and instructions;
- see version notes;
- restore an older version as a new current version;
- identify which version was used for a cook session.

### Version Comparison

Provide structured comparison between two versions.

Show:

- added and removed ingredients;
- quantity changes;
- module changes;
- added and removed steps;
- changed recipe metadata;
- changes to servings or nutrition;
- version notes.

A clear structured comparison is preferred over character-level Git-style diffing.

---

## Phase 7: Migration, Import, and Export

These features occur after the recipe structure stabilizes so importers do not need repeated rewrites.

### Structured Import and Export

Support:

- application-defined JSON import;
- application-defined JSON export;
- CSV import and export where the data maps cleanly;
- individual recipe export;
- complete-library export;
- human-readable export where practical.

### Recipe Gallery Migration

Provide a practical migration path for Jared’s current Recipe Gallery collection.

Use the cheapest reliable approach:

1. structured Recipe Gallery export if available;
2. dedicated migration script;
3. text extraction from Recipe Gallery documents or PDFs;
4. conversion through paste-and-review;
5. manual correction only for ambiguous fields.

Tier 1 requires successful migration, not a permanent universal Recipe Gallery PDF parser.

### Paste-and-Review Import

Users can paste long-form recipe text.

The app proposes:

- title;
- description;
- servings;
- ingredient modules;
- quantities and units;
- instruction modules;
- steps;
- times;
- optional metadata where confidently inferred.

The user reviews and corrects the proposed structure before saving.

This is a Tier 1 feature because users commonly begin with recipes in Notes, documents, emails, or existing recipe apps.

---

## Phase 8: Cooking-Mode Preparation

Before cooking, the user chooses how the session should run.

### Session Setup

Users can:

- select which modules to cook;
- omit modules already prepared;
- set target servings;
- accept a suggested module order;
- drag modules into another order;
- remove modules from the current session.

### Suggested Ordering

The first implementation may order modules primarily by estimated duration, longest first.

This is only a starting suggestion. Users retain full control because:

- passive and active time differ;
- some steps depend on others;
- multiple tasks may run in parallel;
- the mathematically longest step is not always the best first step.

Advanced scheduling is deferred to Tier 3.

---

## Phase 9: Mobile- and Tablet-First Cooking Mode

Cooking mode is a focused kitchen interface separate from the general recipe-detail page.

### Priorities

1. Phone.
2. Tablet.
3. Desktop fallback.

Desktop should remain functional, but the primary kitchen experience is designed around phones and tablets.

### Cooking-Mode Features

- large readable text;
- selected modules only;
- ingredient checkoffs;
- instruction-step checkoffs;
- scaled quantities;
- quick navigation between modules;
- visible progress;
- protection against accidental exit;
- minimal editing controls;
- clear completion action;
- support for reopening the same recipe later and cooking different modules.

This supports multi-session preparation without requiring a separate preparation-day checklist feature.

---

## Phase 10: Multiple Module Timers

Each cooking module can maintain its own timer.

### Timer Features

- timer named after the module;
- start;
- pause;
- resume;
- reset;
- add or subtract time;
- all active timers visible together;
- current timer status accessible throughout cooking mode;
- persistence across navigation or refresh by storing the target end time.

Reliable background operating-system notifications are deferred to PWA or native-app work.

---

## Phase 11: Cook Logs and Post-Meal Review

Cooking sessions are first-class records tied to the exact recipe version used.

### Cook Log

A cook log may record:

- recipe;
- recipe version;
- date;
- target servings;
- selected modules;
- actual preparation or cooking time;
- actual yield;
- cook-session notes;
- what worked;
- what should change;
- ratings from named tasters.

### Post-Meal Review

When leaving cooking mode, the user can:

- return directly to the app; or
- enter an optional post-meal review.

The review may ask:

- Who tried it?
- How did each person rate it?
- What worked?
- What should change?
- How many servings did it actually produce?
- Should the expected yield be updated?
- Should a new recipe version be created?
- Should the lifecycle state change?

The review must remain skippable.

### Reality-Based Yield

If actual yield differs from expected yield:

- show the difference;
- recommend a recipe update;
- explain the macro impact;
- never silently rewrite the recipe after a single session.

---

## Phase 12: Named Tasters and Multi-Person Ratings

Users can create reusable named tasters without requiring each taster to create an account.

Examples:

- Jared;
- Mom;
- Dad;
- Older Sister;
- Younger Sister.

### Rating Features

Record ratings per cook session.

Recipe summaries may show:

- owner’s rating;
- family or group average;
- most recent ratings;
- rating range;
- number of tastings;
- all-time average;
- most recent family verdict.

The user can choose which rating summary is most prominent.

Future account linking for tasters is optional and not required for Tier 1.

---

## Phase 13: Grocery List Generation

Users can select recipes and serving counts to generate a consolidated grocery list.

### Grocery List Features

- select one or more recipes;
- choose servings or batch quantities;
- collect recipe ingredients;
- group items by grocery category;
- retain recipe attribution;
- add manual items;
- edit quantities;
- check off items;
- keep ambiguous ingredients separate.

### Combination Logic

Be conservative:

- combine exact normalized ingredients using compatible units;
- avoid speculative ingredient matching;
- do not silently combine incompatible measurements;
- do not subtract pantry inventory.

Weekly meal planning is not required for grocery-list generation in Tier 1.

---

## Phase 14: Reusable Components and Subrecipes

This is the final Tier 1 phase because it is both highly valuable and structurally demanding.

### Component Library

The main library can expose:

- Recipes
- Components

A component is a smaller versioned cooking unit.

Examples:

- White Rice
- Brown Rice
- Nuoc Cham
- Quick-Pickled Carrots
- Air-Fried Chicken
- Toasted Almond Topping

### Component Behavior

- Components have their own detail pages.
- Components have immutable versions.
- Recipes can reference a specific component version.
- Recipes can also contain local modules that are not reusable.
- Users are never forced to convert every module into a reusable component.

### Updating Components

When a component receives a new version, offer:

- **Update everywhere**
- **Choose recipes to update**
- **Do not update existing recipes**

Choosing recipes opens a checklist of recipes using that component.

Updating a recipe:

- creates a new recipe version;
- points the new version to the updated component;
- preserves all previous recipe and component history.

### Tier 1 Risk Note

Reusable components are a major differentiator but may prove more complex than expected.

They should remain at the end of Tier 1 so the personal app can already function even if component work requires additional iteration.

---

# 5. Tier 1 Completion Criteria

Tier 1 is complete when Jared can:

1. Sign in privately on multiple devices.
2. Import his existing recipes without rebuilding them manually.
3. Create, edit, duplicate, archive, and restore recipes.
4. Search and filter his library through custom tags and lifecycle.
5. Scale servings and inspect macros.
6. Use safe unit conversion and quantity formatting.
7. View every version of a recipe.
8. Compare versions.
9. Enter a focused phone- or tablet-friendly cooking mode.
10. Run multiple module-specific timers.
11. Record a cook session tied to the exact version used.
12. collect ratings from multiple family members;
13. record what worked and what should change;
14. create a revised version without losing history;
15. generate a consolidated grocery list;
16. build recipes from reusable versioned components.

At this point, the application should be good enough to replace Recipe Gallery for Jared’s personal use.

---

# 6. Tier 2 Roadmap — Share-Worthy Release

Tier 2 turns the personal tool into an application that family members and other users can adopt comfortably.

---

## Phase 1: Batch-Oriented Meal Planning

Create a weekly or multiweek planning experience.

### Features

- choose recipes for a planning period;
- select intended cook dates;
- define batch yields;
- indicate which meals or days each batch covers;
- account for planned leftovers;
- send the completed plan into the grocery list;
- filter by tags, cuisine, lifecycle, nutrition, time, and favorites.

### Recommendation Order

Suggested recipes should prioritize:

1. Active recipes, least recently cooked first.
2. Proven recipes.
3. Experimental recipes when the user wants variety or development.
4. Idea recipes only through deliberate exploration.
5. Archived recipes excluded by default.

This incorporates the useful effect of “resting” recipes without creating a separate Rested lifecycle state.

There is no separate Active Rotation workspace.

---

## Phase 2: Favorites

Add a built-in favorite property.

Favorites are not merely custom tags because:

- users expect a universal favorite control;
- favorites deserve a consistent icon;
- favorites need a fast filter;
- favorite and lifecycle answer different questions.

An Active recipe is currently in rotation. A Favorite recipe is especially valued.

---

## Phase 3: Read-Only Share Links

Users can generate unlisted read-only recipe links.

Potential controls:

- revoke link;
- regenerate link;
- optional expiration;
- public versus unlisted distinction;
- clear exclusion of private cook history and personal notes.

---

## Phase 4: Save a Shared Recipe as a Copy

A signed-in recipient can choose **Save to My Recipes**.

Behavior:

- creates an independent recipe owned by the recipient;
- optionally retains source attribution;
- does not share future edits;
- avoids joint ownership and conflict resolution.

---

## Phase 5: Direct Account-to-Account Sharing

Users can send a recipe to another account.

Recipient experience:

- sender identity;
- recipe preview;
- accept and save a copy;
- decline or dismiss.

There is no friend graph, follower system, or shared editing.

---

## Phase 6: Public Recipe Visibility and Basic Directory

Users can intentionally mark selected recipes public.

Public recipes may be:

- viewable while logged out;
- searchable by title, cuisine, and tags;
- saved as independent copies;
- attributed to their creator.

Private data must remain excluded:

- cook history;
- personal ratings;
- private version notes where applicable;
- unpublished versions.

### Additional Concerns

Public visibility introduces:

- accidental-publication prevention;
- spam;
- offensive content;
- reporting;
- moderation;
- duplicate recipes;
- privacy clarity.

These concerns should be addressed proportionately before opening the directory broadly.

---

## Phase 7: Printable and External Sharing

Provide a simplified recipe presentation suitable for:

- browser printing;
- saving as PDF;
- sending to people without accounts;
- viewing without application controls.

This belongs near the end of Tier 2 because it is valuable but not central to the core workflow.

---

## Phase 8: Share-Readiness Account Controls

Before broader use, support:

- account deletion;
- full data export;
- active-session management;
- shared-link revocation;
- public-recipe management;
- uploaded-image management;
- clear ownership and privacy controls.

---

## Phase 9: Desktop Cooking-Mode Refinement

Cooking mode is already functional on desktop in Tier 1.

Tier 2 adds a dedicated desktop-polish pass so larger screens use their available space more effectively without changing the phone- and tablet-first interaction model.

---

## Phase 10: Onboarding

Onboarding is built last, after terminology and workflows stabilize.

Teach:

- recipe versions;
- cook logs;
- post-meal review;
- named tasters and ratings;
- custom tags;
- lifecycle;
- reusable components;
- meal planning;
- sharing.

Optional setup may include:

- starter tags;
- preferred measurement system;
- default batch size;
- optional nutrition goals;
- sample recipes.

Onboarding should explain why this app is different, not merely show where the Create button is.

---

# 7. Tier 2 Completion Criteria

Tier 2 is complete when a new user can:

1. Understand the product without Jared explaining it personally.
2. Import or paste existing recipes.
3. Plan weekly batches.
4. Generate groceries from the plan.
5. Favorite and organize recipes.
6. Share recipes through links or directly to another account.
7. Save an independent copy of a shared recipe.
8. Publish selected recipes safely.
9. View or print recipes without joining.
10. Control their account, sessions, exports, links, and public content.

At this point, the product is ready to share confidently with family and early external users.

---

# 8. Tier 3 Roadmap — Optional Productization

Tier 3 is not committed MVP scope.

These features may be considered before commercialization or a wider public release.

---

## 1. Rotation and Meal-Planning Insights

Provide transparent, rule-based observations such as:

- cuisines repeated recently;
- missing flavor profiles;
- overused proteins;
- recipes not cooked recently;
- high-rated recipes absent from the current plan;
- active meals that may need a break.

Avoid mysterious recommendation algorithms.

---

## 2. Recipe and Cooking Statistics

Potential statistics:

- most cooked;
- highest rated;
- most divisive;
- most revised;
- average actual yield;
- average preparation time;
- family consensus;
- cuisines cooked over time;
- rating changes across versions.

---

## 3. Website Recipe Import

Use a structured-data-first approach.

When available, import:

- title;
- author;
- image;
- ingredients;
- instructions;
- servings;
- preparation and cooking time.

Always require a review step.

If structured data is unavailable, fail gracefully and offer paste-and-review rather than promising universal scraping.

---

## 4. Automatic Nutrition Calculation

Integrate a nutrition database to propose:

- calories;
- protein;
- carbohydrates;
- fat;
- optional micronutrients.

Manual overrides remain authoritative.

Challenges include:

- ingredient matching;
- serving-size ambiguity;
- API cost;
- usage limits;
- incorrect database entries;
- user corrections.

---

## 5. Installable Progressive Web App and Offline Access

Configure the website as an installable PWA.

Potential capabilities:

- home-screen icon;
- app-like standalone launch;
- cached recipes;
- offline recipe viewing;
- cached images;
- offline cooking instructions;
- locally persisted active timers;
- recent grocery lists;
- queued edits once connectivity returns.

Start with offline reading. Offline editing and conflict resolution are more complex.

---

## 6. Native Mobile Application

Build native applications only if usage or commercial ambition justifies the investment.

Potential benefits:

- stronger offline behavior;
- dependable timer notifications;
- better camera access;
- share-sheet imports;
- app-store distribution;
- more natural kitchen-device behavior.

A PWA may prove sufficient.

---

## 7. Public Directory Enhancements

If public recipes gain traction, consider:

- stronger public search;
- creator attribution;
- curated collections;
- reporting;
- moderation tooling;
- duplicate detection;
- featured recipes.

Do not introduce:

- infinite feeds;
- comments;
- follower systems;
- engagement-ranking mechanics.

---

## 8. Advanced Cooking Scheduling

Move beyond duration-based ordering into:

- active versus passive time;
- dependencies;
- parallel tasks;
- desired completion time;
- recommended start times;
- coordinated multi-module schedules.

This could become a distinctive feature but is substantially harder than simple ordering and timers.

---

## 9. OCR Recipe Import

OCR means optical character recognition.

Possible flow:

1. Photograph a cookbook page or printed recipe card.
2. Extract the visible text.
3. Parse likely ingredients, sections, and instructions.
4. Review and correct the proposal.
5. Save the recipe.

Printed text is more reliable than handwriting.

This is the final Tier 3 item and may be skipped if accuracy or implementation cost is poor.

---

# 9. Explicitly Excluded Scope

The following ideas are not part of the active roadmap:

- full pantry inventory;
- automatic pantry deduction;
- photograph-based pantry recognition;
- AI-generated recipes;
- AI-generated recipe revisions;
- joint recipe ownership;
- collaborative recipe editing;
- friend or follower graphs;
- social feeds;
- comments and engagement mechanics;
- grocery-retailer integration;
- price optimization;
- direct grocery ordering;
- smart-appliance integration;
- augmented-reality cooking;
- complex food-diary tracking;
- automatic tracking of every consumed meal.

These may only return if real usage creates a strong, specific need.

---

# 10. Product Principles

## Personal Utility Before Market Breadth

The app must first become something Jared genuinely wants to use.

## Recipe Evolution Is Core

Cook logs, post-meal review, version history, and comparison are not optional polish. They are central to the product thesis.

## Flexible Structure Over Rigid Taxonomy

Use flexible modules and custom tags rather than forcing every recipe into one universal format.

## Recommendations Should Be Explainable

Meal-planning suggestions should come from understandable rules such as lifecycle, recency, tags, and ratings.

## Preserve History

Recipe and component updates must not silently rewrite prior versions or old cook sessions.

## Users Own Their Copies

Sharing creates independent copies rather than joint ownership.

## Manual Control Remains Authoritative

Scaling, nutrition, imports, recommendations, and conversions should help users without pretending to be infallible.

## Mobile and Tablet Matter Most in the Kitchen

Cooking mode should prioritize the devices people realistically use while cooking.

## Avoid Maintenance-Heavy Features

Do not add systems that require constant manual upkeep unless their practical value clearly justifies the burden.

## Build the Web Product First

Start with a responsive web application. Consider PWA and native applications only after the core product proves useful.

---

# 11. High-Level Build Sequence

The roadmap follows this dependency chain:

1. **Foundation**  
   Authentication, ownership, persistence, application shell.

2. **Recipe Architecture**  
   Recipe identity, versions, lifecycle, modules, tags, nutrition.

3. **Core Management**  
   CRUD, library, detail, search, themes.

4. **Scaling and Evolution**  
   Measurement conversion, version history, comparisons.

5. **Migration**  
   Recipe Gallery conversion, structured import/export, paste-and-review.

6. **Cooking**  
   Session setup, module ordering, cooking mode, timers.

7. **Post-Cooking**  
   Cook logs, post-meal review, ratings, yield correction.

8. **Practical Planning**  
   Grocery lists and reusable components.

9. **Share-Worthy Expansion**  
   Meal planning, favorites, sharing, public recipes, onboarding.

10. **Optional Productization**  
    Insights, web import, nutrition automation, offline support, native apps, OCR.

---

# 12. Relationship to Future Documents

This roadmap intentionally remains a big-picture planning artifact.

It should stay relatively stable while more detailed implementation documents evolve.

## Next: `PRODUCT_SPEC.md`

The product specification should define:

- target users;
- product premise;
- terminology;
- exact feature behavior;
- policy decisions;
- acceptance criteria;
- edge cases;
- Tier 1 and Tier 2 boundaries;
- explicit exclusions.

Examples of decisions for the product specification:

- Which edits create a new version?
- What fields are required?
- How are imported recipes reviewed?
- How are ratings summarized?
- How does actual yield suggest a revision?
- What happens when a linked component is updated?
- What information is included in a shared recipe?

## Then: `FRONTEND_SPEC.md`

The frontend specification should define:

- information architecture;
- navigation;
- screen hierarchy;
- primary user journeys;
- desktop, tablet, and mobile layouts;
- editor interactions;
- cooking-mode flow;
- post-meal flow;
- meal-planning flow;
- sharing and onboarding flows;
- component behavior and visual states.

## Then: `IMPLEMENTATION_SPEC.md`

The implementation specification should define:

- current technology stack;
- application architecture;
- authentication provider;
- database schema;
- APIs and server actions;
- storage;
- validation;
- caching;
- testing;
- CI/CD;
- deployment;
- migration strategy;
- security boundaries;
- observability.

Technology choices should use the latest stable, well-supported versions available at scaffold time rather than hard-coded versions from earlier projects.

---

# 13. Current Planning Status

> **Superseded.** This section describes planning status from before any
> implementation began. See §14 "Final Implementation Updates" below for
> what actually happened; the "Agreed next steps" list here is historical
> only.

The product feature-discovery phase is substantially complete.

Agreed next steps:

1. Preserve this roadmap.
2. Take a break.
3. Return later for the product-definition pass.
4. Create `PRODUCT_SPEC.md`.
5. Create `FRONTEND_SPEC.md`.
6. Finalize the technology and implementation plan.
7. Provide Claude with the documentation required to build the app.

---

# 14. Final Implementation Updates

`PRODUCT_SPEC.md` was written next, as planned. `FRONTEND_SPEC.md` and
`IMPLEMENTATION_SPEC.md` (§12) were never created as separate documents —
that planning role was absorbed instead by `ARCHITECTURE_PROPOSAL.md`
(technical/data-model planning) and `BUILD_PLAN.md` (slice sequencing and
implementation planning), which together carried the project through to a
complete build.

**Tier 1 (§4) and Tier 2 (§6) are both now fully implemented** — see
`PRODUCT_SPEC.md` §95 ("Final Priority Model") and §99 ("Final
Implementation Updates") for the current state. Tier 3 (§8) remains
optional, forward-looking scope, largely unbuilt, exactly as this roadmap
originally intended — with two exceptions worth noting: Recipe Gallery
migration (part of Tier 1 Phase 7, §4) was deliberately deferred by owner
decision rather than built (the generic paste-and-review importer serves
as the interim substitute), and barcode scanning (listed as optional/late
Tier 2, §6 Phase whichever covers it) was built as a convenience entry
point into the existing nutrition-lookup search, not a separate search
mechanism. Any other roadmap item not mentioned here shipped as
originally scoped; see `docs/TODO.md` for genuinely still-open work.
