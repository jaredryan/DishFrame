# DishFrame — Product Specification

**Filename:** `PRODUCT_SPEC.md`  
**Document status:** Canonical Product Source of Truth  
**Scope status:** Tier 1 and Tier 2 are fully defined for the intended DishFrame product. Tier 3 is defined where useful as optional productization and enhancement work.  
**Purpose:** Define DishFrame’s product behavior, terminology, priorities, rules, edge cases, and acceptance criteria for design, architecture, implementation, and testing.

---

# 1. Product Summary

DishFrame is a private-first recipe-management and recipe-development application built around the complete lifecycle of a dish:

> **Save → organize → prepare → cook → evaluate → revise → reuse**

The product is designed for home cooks who repeatedly make familiar dishes, change them over time, and want one dependable place to:

- organize recipes;
- preserve recipe history;
- reuse recurring preparations;
- cook efficiently;
- collect personal and multi-taster ratings;
- remember what worked;
- improve future versions;
- plan future meals from dependable experience.

DishFrame is not primarily a recipe-discovery feed. Its core differentiation is that it remembers what happened after a recipe was cooked and uses that history to make future cooking more informed.

---

# 2. Specification Scope and Authority

This document is the canonical DishFrame product source of truth.

It consolidates four additive product-definition passes covering:

- Recipe Foundation;
- Cooking Sessions and the learning loop;
- organization, discovery, scaling, nutrition, import/export, and grocery lists;
- full reusable-Part behavior, Meal Planning, sharing, account controls, onboarding, and Version comparison.

Later refinements take precedence where an earlier statement conflicts with a later settled decision. Silence in a later pass does not remove a unique earlier requirement.

Tier 1 and Tier 2 together define the intended DishFrame product:

- **Tier 1** must stand alone as a complete private personal cooking system.
- **Tier 2** completes the intended family/share-worthy product and is planned immediately after or alongside Tier 1 where foundationally useful.
- **Tier 3** contains genuinely optional productization and enhancement work whose absence does not prevent DishFrame from being complete for personal and family use.

This specification defines:

- target users and product principles;
- product vocabulary;
- ownership and privacy;
- Recipe and Part identity;
- immutable content Versions and major/minor Version lines;
- Recipe and Part Stages;
- Recipe and Part creation;
- Sections, ingredients, substitutes, images, and nutrition;
- archive, permanent deletion, duplication, provenance, and source snapshots;
- Cooking setup, Cooking Sessions, timers, progress, Session Reviews, Tasters, and ratings;
- Recipe and Part libraries, search, tags, Favorite, cuisine, Flavor profiles, filters, and sorting;
- temporary scaling, default batch presentation, quantity formatting, and preferred units;
- FoodData Central lookup and optional barcode lookup;
- account backup, item export, import, Recipe Gallery migration, and paste-and-review import;
- standalone and Meal Plan-linked grocery lists;
- nested reusable Parts, Part propagation, and Part deletion materialization;
- Meal Plans, planned meals, recommendations, and grocery synchronization;
- read-only links, direct sharing, independent cross-account copies, and print/PDF;
- profile, security, preferences, image ownership, and account deletion;
- onboarding, contextual guidance, Help, and temporary tutorial data;
- structured Version comparison;
- Tier 1, Tier 2, and Tier 3 implementation boundaries;
- acceptance criteria.

Optional Tier 3 or later enhancement areas include:

- public Recipe and Part publication and directories;
- public-content moderation;
- AI-assisted paste parsing;
- arbitrary user-created tag groups;
- pantry inventory;
- retailer-specific aisle mapping, ordering, and price comparison;
- semantic or AI Recipe search;
- AI Recipe generation or revision;
- advanced social or engagement features.

---

# 3. Target User

## 3.1 Primary Tier 1 user

The primary Tier 1 user is:

> A home cook who repeatedly makes familiar dishes, changes them over time, and wants one dependable system for organizing recipes, reusing recurring preparations, cooking efficiently, and remembering how each meal was received.

DishFrame is initially designed around Jared’s real cooking workflow, while remaining general enough for:

- family cooks;
- batch meal preppers;
- hobby cooks who experiment;
- cooks who repeatedly refine dependable recipes;
- people migrating recipes from notes or another recipe app;
- cooks who care about both personal ratings and group feedback.

## 3.2 Primary user needs

The product must help the user:

- preserve recipes that evolve over time;
- compare personal ratings with family or group ratings;
- identify recipes that are dependable for particular people;
- reuse the same rice, vegetables, sauces, proteins, toppings, and cooking methods;
- update recurring preparations once;
- organize large recipes into smaller navigable Sections;
- move directly between the current things being cooked;
- avoid scrolling through one very long block of recipe text;
- preserve what was actually cooked in prior sessions;
- branch a recipe into a separate new direction when desired.

## 3.3 Tier 1 account model

Tier 1 assumes:

- one authenticated owner per Recipe;
- one authenticated owner per Part;
- other people may be represented as Tasters;
- Tasters do not need accounts;
- Tasters do not gain access to the owner’s data;
- collaboration and sharing are not part of Tier 1.

---

# 4. Product Principles

## 4.1 Personal utility first

DishFrame must first become a product the owner genuinely prefers over notes, documents, and the existing recipe workflow.

## 4.2 Recipe evolution is core

Versions, Cooking Sessions, Session Reviews, ratings, and revision history are central product behavior, not optional polish.

## 4.3 Preserve history

DishFrame must never silently rewrite prior saved versions or make old Cooking Sessions appear to have used content that did not exist at the time.

## 4.4 Flexible structure

Recipes may be simple or highly structured.

The product must support:

- one simple Section;
- many Sections;
- local recipe content;
- reusable Parts;
- combinations of local content and linked Parts.

## 4.5 Manual control is authoritative

The product may help organize, scale, compare, and suggest, but users decide:

- whether an update is small or substantial;
- whether to create a duplicate;
- whether to archive or delete;
- whether imported or calculated values are correct.

## 4.6 Familiar language

The underlying system may use technical architecture, but the interface must speak like a capable home cook.

Use ordinary organizational terms without exposing software implementation details.

---

# 5. Product Vocabulary

## 5.1 Recipe

A **Recipe** is the stable identity of one evolving dish across time.

Examples:

- Vietnamese Nuoc Cham Bowl
- Cuban Mojo Bowl
- Ginger Soy Mirin Bowl

A Recipe owns stable organization and presentation metadata and points to its current Recipe Version.

## 5.2 Recipe Version

A **Recipe Version** is one immutable saved content state of a Recipe.

It preserves the exact content used for historical comparison and Cooking Sessions.

## 5.3 Recipe Stage

**Recipe Stage** describes where a Recipe currently sits in its lifecycle.

Full label:

> Recipe Stage

Compact label:

> Stage

Allowed values:

1. **Idea**
2. **Experimental**
3. **Proven**
4. **Active**
5. **Archived**

Stage belongs to the stable Recipe, not an individual Version.

## 5.4 Section

A **Section** is a local organizational area inside a Recipe or Part Version.

Examples:

- Sauce
- Chicken
- Rice
- Vegetables
- Finish

A Section may contain:

- ingredients;
- instructions;
- both;
- one or more linked Parts;
- local content and linked Parts together.

## 5.5 Part

A **Part** is a reusable, versioned preparation that may be used across Recipes and other Parts.

Examples:

- White Rice
- Basic Air-Fried Chicken
- Nuoc Cham
- Quick-Pickled Carrots
- Toasted Almond Topping

A Part behaves like a smaller Recipe and may itself contain Sections and linked Parts, provided the reference graph remains acyclic.

## 5.6 Flavor Profile

A **Flavor profile** is dedicated stable metadata describing a Recipe or Part’s major sensory direction.

Examples:

- Sweet
- Savory
- Spicy
- Tangy
- Smoky
- Rich
- Fresh
- Umami

A Recipe or Part may have several Flavor profiles.

## 5.7 Cooking Setup

**Cooking setup** is the temporary pre-session flow opened by the action:

> Prepare to cook

The user selects cookable units, order, and scale before choosing:

> Start cooking

Opening or editing Cooking setup does not create a Cooking Session.

## 5.8 Cooking Session

A **Cooking Session** records one period in which a user prepares some or all of an exact Recipe or Part Version.

## 5.9 Session Review

A **Session Review** is the optional reflection after cooking.

The primary conversational heading may be:

> How did it go?

## 5.10 Taster

A **Taster** is a named person whose rating may be recorded without requiring a DishFrame account.

## 5.11 Meal Plan

A **Meal Plan** is a persistent user-owned planning record for a date range.

It may contain exact Recipe and Part Version entries, target yields, planned meals, linked Cooking Sessions, and linked grocery lists.

## 5.12 Planned Meal

A **planned meal** assigns part of a planned batch’s expected yield to a future date and optional meal label.

It records intent, not actual consumption.

## 5.13 Grocery List

A **Grocery List** is an editable shopping record generated from Recipes, Parts, or a Meal Plan, or created manually.

An active Meal Plan-linked list remains synchronized with its Meal Plan. A completed list becomes frozen history.

## 5.14 Share Link

A **Share Link** is an unlisted read-only link to a Recipe or Part.

It may pin a fixed snapshot or follow the stable item’s current content.

## 5.15 Independent Copy

An **independent copy** is a recipient-owned Recipe or Part created from shared content.

It does not remain synchronized with the sender.

---

# 6. Ownership and Privacy

## 6.1 Tier 1 privacy

All Tier 1 Recipes and Parts are private.

There is no visibility selector in Tier 1.

Only the authenticated owner may:

- view;
- edit;
- duplicate;
- archive;
- restore;
- delete;
- cook;
- review;
- organize.

## 6.2 No disabled sharing controls

Do not expose inactive public/private or sharing controls merely because those features may arrive in Tier 2.

Sharing should appear only when it is implemented.

## 6.3 Taster privacy

A Taster record does not:

- create an account;
- grant application access;
- make the Recipe visible;
- imply shared ownership.

---

# 7. Recipe Identity and Version Ownership

## 7.1 Stable Recipe properties

The stable Recipe owns:

- owner;
- current Recipe Version reference;
- display title (Version-trigger and Slice 5 image correction pass — moved
  here from §7.2; title is stable identity, not Version content);
- Recipe Stage;
- cuisine;
- Flavor profiles;
- tags;
- protected Favorite-tag relationship;
- saved default batch scale, when different from the authored Version yield;
- preferred compatible display units;
- archive state;
- visibility and sharing state;
- duplication/source relationship;
- creation timestamp;
- update timestamp.

Editing the title updates the Recipe directly. It never creates a Version, and it never depends on which Version is current or being edited — the title is one value for the whole Recipe, not a per-Version snapshot.

## 7.2 Version-owned properties

The Recipe Version owns:

- Sections;
- ingredients, including their authored quantities;
- instructions;
- linked Part-version references and multipliers;
- source Version when restored or branched;
- creation timestamp.

These are the immutable cooking-content snapshot: a Version's identity as
"what this Version actually prepares." Changing any of them always creates a
new Version.

**Version-scoped but mutable metadata** (Version-trigger and Slice 5 image
correction pass; extended by the Slice 13 metadata-classification correction
pass): each Version also carries description, image, authored yield
(quantity and unit/label), preparation time, cooking time, difficulty, and
nutrition (calories, macros, nutrition basis, More nutrients, and source
attribution, §54). Every one of these fields belongs to one specific
Version, but editing any of them — alone, on the current Version or on any
historical Version — updates that Version's stored value directly and never
creates a new Version. Version ownership and Version creation are separate
concerns: none of these fields describe what is actually prepared, so none
of them, alone, ever justifies a new Version. (Originally only description
and image were classified this way, with yield/prep/cook/difficulty/
nutrition treated as part of the immutable snapshot above, auto-creating a
minor Version on change; the Slice 13 correction pass settled that this
was the wrong classification for fields that are themselves purely
descriptive/operational-estimate/nutritional metadata, not preparation
content.)

When a material content change creates a new Version, the new Version
initially copies the selected base Version's full set of Version-scoped
metadata, unless the same save intentionally supplies different values.

A Version may also have one mutable explanatory Version-note annotation. The
annotation is not part of the immutable cooking-content snapshot and is
never the sole structural record of a relationship.

## 7.3 Historical descriptions

Historical Recipe Versions preserve their own description, image, yield, prep/cook time, difficulty, and nutrition — as mutable metadata, not frozen content. Any of a historical Version's own Version-scoped metadata fields may be edited in place at any time (§7.2), affecting only that exact Version — never the current Version, never any other Version, and never creating a new one; nothing about being historical makes them read-only.

Title is not part of this section at all (Version-trigger and Slice 5 image correction pass): it is stable Recipe identity (§7.1), not Version-owned, so there is no “historical title” to preserve — every Version, current or historical, is understood against the Recipe’s one current title.

The Recipe library, detail pages, breadcrumbs, history pages, and search all display the current title.

## 7.4 Recipe Stage is not versioned

Changing:

```text
Experimental → Proven
```

does not itself create a Recipe Version.

Recipe Stage describes the current lifecycle state of the Recipe as a whole.

If content and Stage change in the same editing flow:

- the content save creates a new Recipe Version;
- the Recipe Stage updates separately on the Recipe.

---

# 8. Recipe Creation

## 8.1 Creation experience

Creating a Recipe opens one full-page Recipe editor.

Do not use:

- a wizard;
- a multi-step onboarding flow;
- a pre-created empty Recipe shell;
- an automatically saved draft record.

The Recipe does not exist in persistent Recipe data until the user successfully saves it.

## 8.2 Initial editor state

A new editor begins with:

- empty title;
- Recipe Stage defaulted to `Idea`;
- one unnamed default Section;
- controls for optional metadata;
- ability to add ingredients;
- ability to add instructions;
- ability to add more Sections;
- ability to attach Parts.

## 8.3 Minimum save requirements

A new Recipe requires:

- title;
- Recipe Stage;
- at least one meaningful local ingredient, local instruction, or linked Part.

A Recipe may save with:

- one ingredient and no instruction;
- one instruction and no ingredient;
- one meaningful linked Part and no local content;
- one unnamed Section;
- incomplete optional metadata.

This intentionally allows Idea-stage Recipes to remain incomplete.

## 8.4 Optional fields

The following are optional:

- description;
- image;
- stable Recipe cuisine;
- amount made (`Makes`), including quantity and unit/label;
- preparation time;
- cooking time;
- difficulty;
- calories;
- protein;
- carbohydrates;
- fat;
- stable Recipe tags;
- stable Flavor profiles;
- Version-note annotation;
- multiple Sections.

## 8.5 Initial Version

The first successful save creates:

```text
V1.0
```

Version 1.0 becomes the current Recipe Version.

---

# 9. Sections

## 9.1 Minimum structure

Every Recipe Version contains at least one meaningful cookable structure:

- one or more local Sections;
- one or more linked Parts;
- or a combination of both.

A new Recipe begins with one unnamed default Section.

If that Section remains:

- the only local Section;
- unnamed;
- and the Recipe has no need to distinguish it from linked Parts;

its heading is hidden in normal display.

A Recipe composed entirely of Parts does not require an artificial empty Section.

## 9.2 Section content

Each Section may contain:

- zero or more ingredients;
- zero or more instructions;
- zero or more linked Parts;
- local Recipe-specific content;
- any combination of those elements.

## 9.3 Section examples

Simple Recipe:

```text
Grilled Cheese
[Unnamed default Section]
```

Structured Recipe:

```text
Ginger Soy Mirin Bowl
- Chicken
- Sauce
- Rice
- Fresh Vegetables
- Finish
```

Hybrid local/Part Recipe:

```text
Section: Chicken

Local instruction:
Marinate with olive oil, lemon, and Mediterranean seasoning.

Linked Parts:
- Basic Air-Fried Chicken
- Lemon Pan Sauce
```

## 9.4 Section actions

Users may:

- add;
- rename;
- reorder;
- remove;
- add ingredients;
- add instructions;
- reorder ingredients;
- reorder instructions;
- attach one or more Parts;
- reorder linked Parts;
- remove linked Parts.

## 9.5 Empty Sections

Empty Sections may exist temporarily while editing.

An empty Section contains:

- no ingredients;
- no instructions;
- no linked Parts;
- no meaningful local content.

Users may remove empty Sections manually.

Any remaining empty Sections are automatically removed when the Recipe is saved.

Empty Sections do not block saving when another meaningful Section or linked Part exists.

## 9.6 Independent ordering

Ingredients, instructions, and linked Parts maintain explicit ordering inside their containing structure.

Changing ingredient order does not automatically change instruction or Part order.

---

# 10. Ingredients

## 10.1 Ingredient structure

An ingredient supports:

- quantity, optional;
- ending quantity for ranges, optional;
- approximate flag, optional;
- unit, optional;
- ingredient name, required;
- preparation or note, optional;
- optional-ingredient flag;
- substitute, optional;
- original imported text, optional;
- ordering position;
- grocery category, optional in later phases.

## 10.2 Ordering position

Ordering position means where the ingredient appears in its Section.

Example:

```text
1. Chicken breast
2. Soy sauce
3. Mirin
4. Rice vinegar
```

The product must preserve user-defined ingredient order.

The implementation may call this field:

- position;
- sort order;
- index;
- sequence.

The exact technical representation belongs in the implementation specification.

## 10.3 Required ingredient value

Ingredient name is the only required ingredient field.

Valid examples include:

```text
Salt
Water
Chicken breast
Crushed peanuts
```

## 10.4 Quantity support

The product must support natural cooking quantities:

- whole numbers;
- decimals;
- fractions;
- mixed numbers;
- ranges;
- approximate quantities;
- no numeric quantity;
- count-based quantities.

Examples:

```text
2 tbsp soy sauce
0.5 cup rice
1/2 cup rice
1 1/2 cups broth
2–3 tbsp lime juice
about 2 tbsp vinegar
salt to taste
water as needed
1 can coconut milk
2 bunches green onion
```

## 10.5 Quantity-entry behavior

By default, an ingredient displays one:

> Quantity

input.

A nearby Range control changes the input into:

- Starting quantity
- Ending quantity

Approximate is a separate option.

Do not show starting and ending quantity fields by default for every ingredient.

The exact visual control belongs in frontend design work.

## 10.6 Numeric meaning versus display

The product must:

- preserve fractions;
- display quantities naturally;
- support accurate future scaling;
- avoid treating version numbers or fractional text as ordinary decimal strings.

The implementation specification will determine whether values are stored as:

- rational numbers;
- normalized decimals;
- strings plus parsed values;
- another safe structure.

## 10.6a Settled storage precision (Slice 3 Gate 2 polish pass)

§10.6's open question is settled: numeric `quantity` and `quantityEnd` are
stored as decimals normalized to **3 places past the decimal point**,
matching the database column's actual precision. A typed fraction or mixed
number is parsed, then rounded to that precision, before it is ever
persisted:

```text
1/3     → 0.333
2/3     → 0.667
2 1/8   → 2.125
1.5     → 1.5
```

One shared, pure rounding function is used identically by the entry-form
parser and the server-side sanitization path that runs on every save
(regardless of entry point), so a value can never reach storage as an
unbounded repeating decimal (e.g. `0.3333333333333333`) and no second,
divergent rounding implementation can exist.

This does not change §10.4's supported entry forms, §10.5's entry
controls, or §10.7's free-text fallback (untouched, never a numeric
value). Later fraction-aware **display** formatting (§52, Slice 5 scope,
not implemented by this pass) should recognize a normalized decimal as
"close enough to" a common fraction using a small tolerance against the
3-decimal-rounded value, rather than requiring exact rational equality —
`0.333` should still be recognized and offered as `1/3`.

## 10.7 Free-text fallback

DishFrame must support quantities and notes that cannot be represented honestly as exact numbers.

Examples:

- to taste;
- as needed;
- a splash;
- a handful;
- enough to coat;
- one large pinch.

These values do not participate in automatic quantity scaling unless the user supplies a numeric quantity.

---

# 11. Optional Ingredients and Substitutes

## 11.1 Optional ingredient

An ingredient may be marked optional.

Example:

```text
Crushed peanuts, optional
```

The Recipe remains valid without it.

## 11.2 Substitute

An ingredient may have one substitute in Tier 1.

Example:

```text
Maple syrup
Substitute: Honey
```

## 11.3 Substitute structure

A substitute may use the same basic fields as an ingredient:

- quantity;
- ending quantity;
- approximate flag;
- unit;
- ingredient name;
- note.

## 11.4 Substitute limitations

In Tier 1:

- one ingredient may have at most one substitute;
- a substitute cannot contain another substitute;
- substitutes do not recursively branch.

The data model should not make future support for multiple substitutes impossible.

## 11.5 Grocery behavior

When generating a grocery list:

- optional ingredients are included by default and visibly marked optional;
- the user may remove them;
- the primary ingredient is used by default;
- the user may switch to the saved substitute before generation or while editing the list;
- DishFrame never adds both the primary ingredient and substitute automatically.

---

# 12. Recipe Images

## 12.1 Image count

Each Recipe Version may have:

- zero images; or
- one primary image.

Tier 1 does not support:

- image galleries;
- progress-photo collections;
- multiple images per Version;
- dedicated food-photography workflows.

## 12.2 Version inheritance

A new Recipe Version inherits the selected base Version’s image by default (§7.2).

The user may, on the Version being saved:

- retain it;
- replace it;
- remove it.

An image is Version-associated but mutable (§7.2, Version-trigger and Slice 5 image correction pass): the image on any Version — current or historical — may also be added, replaced, or removed directly, in place, at any later time. This never creates a Version and never changes which content that Version’s image edit was made on. “Inherits by default” describes what a *new* Version starts with; it does not mean a Version’s image is frozen once saved.

## 12.3 No-image behavior

A Recipe must remain fully usable and visually coherent without an image.

An image is never required to create, edit, cook, review, archive, duplicate, or delete a Recipe.

---

# 13. Immutable Version Model

## 13.1 Every save creates a Version

Every successful Recipe or Part **content** save creates a new immutable Version.

The following stable metadata or presentation-preference changes do not create a Version:

- title (Version-trigger and Slice 5 image correction pass — stable Recipe identity, §7.1);
- Stage;
- cuisine;
- Flavor profiles;
- tags;
- Favorite;
- archive state;
- saved default batch scale;
- preferred compatible display units.

Description and image are Version-associated but mutable (§7.2): editing either alone, on the current or on any historical Version, also creates no Version — it updates that Version’s stored value in place instead.

DishFrame does not:

- mutate an existing Version's cooking content (Sections/ingredients/instructions/yield/prep-cook time/difficulty/nutrition) in place;
- maintain hidden correction revisions;
- rewrite content associated with an old Cooking Session;
- classify a change automatically.

Description and image (§7.2) are the sanctioned exception to "mutate in place," alongside the Version note (§14.1) — deliberately mutable metadata, not cooking content.

## 13.2 User save choices

The user chooses between:

### Save small update

Use for a limited correction, refinement, or adjustment within the same major recipe direction.

Examples:

- spelling;
- clearer wording;
- formatting;
- slightly different quantity;
- corrected amount made;
- minor timing adjustment;
- small preparation refinement.

### Save new version

Use for a meaningful new direction that should become the next primary major Version.

Examples:

- ingredient added or removed;
- major preparation change;
- linked Part changed;
- flavor direction changed;
- substantial restructuring;
- revival of a useful historical direction as the next main Recipe.

DishFrame may visually emphasize **Save new version**, but it never forces the classification.

## 13.2a Settled automatic classification (Slice 3 Gate 2 correction, revised by the Version-trigger and Slice 5 image correction pass, and by the Slice 13 metadata-classification correction pass)

§13.1's "every successful content save creates a Version" and §13.2's "the
user chooses" are refined by a settled implementation decision: the
explicit **Save small update / Save new version** choice (in the editor,
worded as **Save as a refinement / Start a new version**) is presented
**only** when an Ingredient, Instruction, or linked Part actually changed.
Every save is classified into exactly one of four buckets, determined
server-side — never trusting a client-supplied claim. Version ownership and
Version creation are separate concerns: a field can belong to one specific
Version without every edit to it creating a new Version.

### No new Version — stable Recipe/Part metadata

- title-only change (moved here by the Version-trigger correction pass —
  title is stable identity, §7.1, not Version content);
- Stage-only change;
- cuisine-only change;
- archive or restore;
- a true no-op save (nothing at all changed).

Applies directly to the stable Recipe/Part record.

### No new Version — Version-scoped mutable metadata

Any of the following changed, alone (no material-content bucket below also
changed): updates the selected Version's own stored value directly, in
place — on the current Version or on any deliberately selected historical
Version, and only that exact Version:

- description;
- image;
- Makes / serving-size information (authored yield);
- preparation time;
- cooking time;
- difficulty;
- nutrition (calories, macros, nutrition basis, More nutrients, and source
  attribution, §54).

Description and image were added to this bucket by the Version-trigger and
Slice 5 image correction pass. Yield, prep/cook time, difficulty, and
nutrition were moved into this same bucket by the Slice 13
metadata-classification correction pass — all had previously been
misclassified into "automatic small update" below, which incorrectly
created a Version for a change to fields that are themselves purely
descriptive/operational-estimate/nutritional metadata, never preparation
content.

### Automatic small update — no prompt

Version-owned material content that changes the Recipe/Part record but
does not itself add, remove, or edit any Ingredient, Instruction, or linked
Part:

- Section naming or organization changes that leave every Ingredient's and
  Instruction's own content, owning Section, and position untouched.

### Explicit refinement / new-version choice — the one user-facing prompt

Any Ingredient or Instruction:

- addition;
- removal;
- edit;
- reorder;
- movement between Sections.

Only this bucket shows the choice described in §13.2. A save combining a
stable metadata field (title, Stage, cuisine), a Version-scoped metadata
field (description, image, yield, prep/cook time, difficulty, nutrition),
or the automatic-small-update field (Section naming) with an Ingredient/
Instruction/linked-Part change still only prompts once, for the
Ingredient/Instruction/linked-Part change. Title lands on the stable
Recipe/Part record regardless; every Version-scoped metadata field lands
on the newly created Version (inheriting the selected base Version's
values unless this same save intentionally supplies different ones, §7.2);
every other changed field lands in the one Version that choice creates.
The Version is created only because of the Ingredient/Instruction/linked-
Part (or Section-organization) change — never because a metadata field
happened to change in the same save.

## 13.3 Version numbering

The first Version is:

```text
V1.0
```

A small update increments the minor segment within the selected major Version:

```text
V1.0 → V1.1 → V1.2
```

A new Version increments the highest existing major segment and resets the minor segment:

```text
V5.3 → V6.0
```

Version segments are integers, not decimal values.

Therefore:

```text
V1.10
```

follows:

```text
V1.9
```

and is followed by:

```text
V1.11
```

## 13.4 Major-Version lines

Each major Version represents one recipe direction.

Example history:

```text
V1.0 → V1.1 → V1.2
V2.0 → V2.1 → V2.2
V3.0 → V3.1
V4.0 → V4.1 → V4.2
V5.0 → V5.1 → V5.2 → V5.3
```

A user may revisit a historical major Version and continue refining that direction.

If `V5.3` is current and the user cooks or edits `V2.2`:

- **Save small update** creates `V2.3`;
- **Save new version** creates `V6.0` based on `V2.2`.

Creating `V2.3` does not replace `V5.3` as the current Recipe.

Creating `V6.0` does replace `V5.3` as the current Recipe.

A small update may also be based on an earlier saved minor within the same
major line, even when later minors already exist in that line — an
immutable Version does not stop being a valid editing base just because a
later Version was saved after it.

Example, continuing from `V2.0 → V2.1 → V2.2` above:

```text
Selected base: V2.1
Save small update: creates V2.3
```

The new minor is always the line's next overall number — `MAX(minor
segment already used in that major) + 1` — never `(selected base's minor)
+ 1`. Selecting `V2.1` here still creates `V2.3`, not `V2.2` again, since
`V2.2` already exists.

## 13.5 Current Version

The current Recipe or Part Version is:

> The latest minor Version within the highest existing major Version.

Examples:

```text
Existing: V2.3, V5.3
Current: V5.3
```

```text
Existing: V2.3, V5.3, V6.0
Current: V6.0
```

A small update to a historical major line remains historical.

A new major Version becomes current.

## 13.6 Historical source relationships

When a new major Version is based on historical content, DishFrame stores that source relationship structurally.

Example:

```text
V2.3 → V6.0
```

The Version note may use the same source → result wording ("V2.3 → V6.0: Revival"), but the note is not the only record of the relationship.

A minor Version may also record a source relationship: refining an earlier saved minor while later minors already exist in the same major line (§13.4's `V2.1 → V2.3` example) records that specific selected minor as the source, since consecutive numbering alone no longer implies which Version it was actually based on. An ordinary sequential refinement — from a line's own current latest minor — does not need this, because consecutive numbering already implies it without a stored relationship.

## 13.7 Restoring historical content

Historical content is never made mutable.

From a historical Version, the user may:

- save a small update within that historical major line; or
- promote the historical direction into the next major Version.

DishFrame does not silently restore an old Version as current.

## 13.8 Version-history navigation requirement

The product must make large Version histories understandable without forcing every minor Version into the primary selector.

The Version experience should support:

- showing the current Version prominently;
- quickly selecting the latest minor Version of each major line;
- sequentially moving backward or forward through every saved Version;
- crossing naturally from `V3.0` backward to the latest `V2.x`, and from that Version forward to `V3.0`;
- accessing the complete Version history when needed.

One plausible frontend pattern is:

- a selector containing the latest minor Version from each major line;
- adjacent previous/next controls that traverse every Version.

This is an example, not a mandatory control design. Frontend design work will choose the final interaction.

## 13.9 Recipe and Part Stage during version changes

Recipe Stage and Part Stage belong to the stable Recipe or Part.

Saving or revisiting Version content does not automatically restore or change the Stage that existed when that historical Version was created.

---

# 14. Version Notes

## 14.1 Mutable annotation on immutable content

Every Recipe or Part Version may have one optional Version-note annotation.

The Version’s cooking content remains immutable. The note is a deliberately mutable explanatory annotation attached to that immutable snapshot.

Editing or deleting the note:

- does not create another Version;
- does not alter ingredients, instructions, Parts, yield, nutrition, or other Version content;
- does not change structural provenance.

## 14.2 Suggested note prefixes

DishFrame may seed concise editable text, always in source → result order.

Examples:

Ordinary change, from what was already the current direction:

```text
V2.0 → V3.0: Revision
```

Major created from (or promoted from) a historical direction:

```text
V1.4 → V3.0: Revival
```

Part propagation:

```text
V2.3 → V2.4:
Updated White Rice V3.1 → V3.2.
```

The user may:

- type after the prefix;
- edit all text;
- delete it;
- leave the note empty.

## 14.3 Notes are not structural truth

Important relationships such as:

- source Version;
- restored-from Version;
- duplicated-from Version;
- updated Part Version;

must be stored as structured data.

The Version note remains human-readable context only.

---

# 15. Unsaved Changes

## 15.1 No draft system in Tier 1

Tier 1 does not create:

- autosaved Recipe drafts;
- draft Recipe Versions;
- abandoned Recipe records;
- separate current/draft states.

A saved small update is a real current Version, not a draft.

## 15.2 DishFrame-controlled navigation

If the user attempts to leave the editor through DishFrame-controlled navigation while unsaved changes exist, show a custom confirmation modal.

Actions:

- **Keep editing** — primary
- **Discard changes** — destructive secondary

Do not include Save in this warning modal.

Saving must remain prominent and easy to access in the editor itself.

## 15.3 Browser-controlled exits

Tier 1 does not require:

- a native browser unload prompt;
- automatic local draft recovery;
- custom handling for tab close;
- custom handling for browser refresh.

If the user closes or refreshes the browser with unsaved changes, those changes may be lost.

This tradeoff avoids:

- an ugly browser prompt;
- a hidden draft system;
- complex recovery behavior.

Lightweight local recovery may be reconsidered only if real usage shows a recurring problem.

## 15.4 Discard behavior

Discarding changes:

- removes all unsaved editor changes;
- returns to the previous safe destination;
- does not create a Version;
- does not modify the current Version.

---

# 16. Archive

## 16.1 Archive meaning

Archive preserves a Recipe while removing it from ordinary active use.

Archiving:

- changes Recipe Stage to `Archived`;
- preserves every Version;
- preserves every Cooking Session;
- preserves ratings;
- preserves source relationships;
- preserves linked history;
- removes the Recipe from ordinary workflows.

## 16.2 Default visibility

Archived Recipes are hidden by default from:

- normal Recipe-library results;
- ordinary search;
- planning;
- suggestions;
- active cooking choices;
- recommendation systems.

## 16.3 Finding archived Recipes

Archived Recipes appear only when the user explicitly:

- filters Recipe Stage to Archived; or
- chooses an equivalent explicit include-archived control.

Other tags and filters do not reveal Archived Recipes by default.

## 16.4 Restore from Archive

An Archived Recipe may be restored.

Restoring requires selecting a non-Archived Recipe Stage.

Restoring does not create a Recipe Version unless Recipe content is also changed.

---

# 17. Permanent Deletion

## 17.1 Delete availability

Permanent deletion remains available so users control their data.

Archive is the encouraged ordinary removal action.

## 17.2 Confirmation

Deleting a Recipe requires a deliberate destructive confirmation.

The confirmation must clearly warn that deletion removes:

- the Recipe;
- every Recipe Version;
- Cooking Sessions;
- Session Reviews;
- ratings;
- Recipe-owned relationships.

The exact confirmation interaction belongs in frontend design work.

## 17.3 Irreversibility

Permanent deletion cannot be undone.

## 17.4 References retained by other records

Permanent Recipe deletion does not require unrelated historical records to break.

Completed grocery lists, Meal Plans, accepted independent copies, and Cooking Session history retain the static snapshots or provenance necessary to remain understandable.

A retained record may show:

```text
Deleted Recipe
6 servings
Chicken breast — 2 lb
Rice — 3 cups
```

The deleted Recipe is no longer navigable or manageable. The retained record exists only as part of the surviving item’s own history.

---

# 18. Recipe Duplication

## 18.1 Duplicate purpose

Duplication creates a separate Recipe identity for a branch or variation that should no longer share the same ongoing Version lineage.

Users should duplicate when they want:

- a distinct experimental direction;
- a separate variation;
- a new dish based on an existing Recipe;
- independent future Stages and Versions.

## 18.2 Source selection

The user duplicates a specific Recipe Version.

The current Version is the default source, but historical Version duplication may be allowed.

## 18.3 New duplicate

The duplicate receives:

- a new Recipe identity;
- Version `V1.0`;
- copied content from the selected source Version;
- suggested title `Copy of [source title]`;
- the same Recipe Stage as the source Recipe by default;
- the same linked Part-Version references;
- a structural source Recipe reference;
- a structural source Version reference.

The user may change the Stage during or after duplication.

## 18.4 What is not copied as native history

The duplicate does not receive:

- the source Recipe’s Version lineage;
- source Cooking Sessions as its own sessions;
- source ratings as its own ratings;
- the source Recipe’s last-cooked date;
- source analytics as duplicate analytics.

The duplicate’s own Version history begins at V1.0.

The duplicate’s own Cooking Session and rating statistics begin empty.

---

# 19. Inherited Source Context

## 19.1 Starting-point snapshot

Duplicating a Recipe or Part Version creates a new stable item at V1.0.

At duplication time, DishFrame captures a static starting-point snapshot containing:

- source item title;
- exact source Version;
- aggregate source rating and count when available;
- relevant source-session count when useful;
- structural provenance.

The duplicate may keep a live link to the source while the source still exists.

## 19.2 Snapshot does not drift

Later source edits, sessions, or ratings do not rewrite the duplicate’s starting-point snapshot.

The duplicate reflects the evidence that existed at the moment of duplication or accepted sharing.

## 19.3 Source deletion

If the source is later deleted:

- remove the live link;
- preserve the static source title;
- preserve the exact source Version label;
- preserve the captured aggregate evidence and provenance.

The duplicate remains intelligible without retaining an orphaned source item.

## 19.4 Display distinction

Inherited context must remain visually and semantically separate from the duplicate’s own history.

Example before the duplicate is cooked:

```text
No sessions yet

Starting point
Based on Cuban Mojo Bowl V4.0
~4.6/5 across 5 Tasters
3 source Cooking Sessions
```

Example after the duplicate is cooked:

```text
This Recipe
4.3/5 across 2 Tasters

Starting point
Cuban Mojo Bowl V4.0
~4.6/5 across 5 Tasters
```

## 19.5 Analytics rules

Inherited source context does not count toward:

- the duplicate’s actual average rating;
- duplicate Last cooked;
- duplicate cooking count;
- duplicate recommendation recency;
- duplicate Taster statistics.

A displayed provisional rating may participate in discovery sorting and filtering until the duplicate receives genuine ratings.

---

# 20. Recipe Foundation Acceptance Criteria

Recipe Foundation is implementation-ready when all of the following behaviors are supported.

## Recipe creation

- A user can open a full-page Recipe editor.
- The editor defaults Recipe Stage to Idea.
- The editor starts with one unnamed local Section and allows linked Parts.
- No Recipe record is created before save.
- Saving requires title, Recipe Stage, and at least one meaningful local ingredient, local instruction, or linked Part.
- Saving creates V1.0.

## Recipe structure

- A simple Recipe can use one unnamed Section.
- A Recipe may be composed entirely of linked Parts.
- A structured Recipe can use multiple named Sections.
- Sections can contain ingredients, instructions, multiple linked Parts, or any combination.
- Empty Sections are removed on save.
- Ingredient, instruction, and linked-Part ordering persist.

## Ingredients

- Ingredient name is required.
- Quantity and unit are optional.
- Fractions, decimals, mixed numbers, ranges, and approximate amounts are supported.
- Free-text quantity behavior is supported.
- Ingredients may be optional.
- One substitute per ingredient is supported.
- Substitutes cannot recursively contain substitutes.

## Versions

- Every content save creates an immutable Version.
- The user chooses small update or new Version.
- Small updates increment the minor segment of the selected major line.
- New Versions increment the highest existing major segment.
- A historical minor update does not replace the current highest-major Version.
- A new major Version becomes current.
- Historical cooking content never changes, except for the explicit Part-deletion materialization rule that preserves equivalent content and provenance.
- Source-Version relationships are preserved.
- Version-note annotations remain optional and editable without changing immutable Version content.

## Images

- Each Version supports zero or one image.
- New Versions inherit the source Version's image by default.
- Image is Version-associated but mutable: it may be added, replaced, or
  removed in place on the current Version or any historical Version,
  without creating a new Version (Version-trigger and Slice 5 image
  correction pass).

## Unsaved changes

- DishFrame-controlled navigation uses a custom warning modal.
- Keep editing is primary.
- Discard changes is destructive.
- Tier 1 has no draft system.
- Tier 1 has no required browser unload prompt.

## Recipe Stage

- Stage belongs to the stable Recipe.
- Stage changes do not create Versions.
- Archived Recipes are hidden by default.
- Archived Recipes can be restored.

## Deletion

- Permanent deletion is available.
- The user receives a clear destructive warning.
- Deletion is irreversible.
- Archive is encouraged as the safer action.

## Duplication

- A specific Version can be duplicated.
- The duplicate begins at V1.0.
- The duplicate defaults to the source Recipe Stage.
- The duplicate has a separate Version lineage.
- Source-Version history is available as inherited context.
- Inherited sessions and ratings do not count as duplicate history.

---

# 21. Entering the Cooking Flow

## 21.1 Cook entry points

Users may enter the cooking flow from:

- a **Prepare to cook** action on a Recipe card or list item;
- **Prepare to cook** on the current Recipe Version;
- **Prepare to cook this version** on a historical Recipe Version;
- a **Prepare to cook** action on a standalone Part;
- a **Prepare to cook this version** action on a historical Part Version.

All entry points use the same cooking flow.

## 21.2 Cooking has a setup step

Choosing **Prepare to cook** always opens a prefilled Cooking setup before a Cooking Session is created.

The user reviews:

- the source Recipe or Part Version;
- included Sections;
- included Parts;
- nested linked Parts;
- order;
- estimated durations;
- target amount made or scale.

The user may:

- include or remove cookable units;
- add removed units back;
- reorder units;
- adjust scaling;
- cancel.

No entry point bypasses Cooking setup.

## 21.3 Session creation

Opening or editing Cooking setup does not create a Cooking Session.

A Cooking Session is created only when the user confirms:

> Start cooking

Canceling Cooking setup creates no session history.

## 21.4 Lightweight plans

A Recipe or Part containing only one cookable unit still uses the same Cooking setup behavior.

The frontend may present that setup more compactly, but it must not create a different product flow or silently skip planning.

---

# 22. Cooking Session Sources and Historical Integrity

## 22.1 Recipe session

A Recipe Cooking Session points to:

- the stable Recipe;
- the exact Recipe Version selected;
- every selected Section;
- every selected linked Part Version;
- session-specific scaling;
- session-specific order.

## 22.2 Standalone Part session

A Part may be cooked independently.

A standalone Part Cooking Session points to:

- the stable Part;
- the exact Part Version selected;
- selected content and scaling;
- session-specific order when the Part contains multiple cookable units.

## 22.3 Historical Versions

The current Recipe or Part Version is the default source.

When viewing a historical Version, the user may deliberately choose:

> Prepare to cook this version

Cooking historical content:

- does not make it current;
- does not change its Stage;
- does not restore it;
- creates a session tied to that exact Version.

## 22.4 Immutable session context

Later Recipe or Part edits never alter an existing session.

The session preserves enough context to establish:

- what content was selected;
- which Versions were used;
- how it was scaled;
- what order was chosen;
- what progress occurred;
- how the session ended.

This data does not need to be displayed all at once.

---

# 23. Cookable Units

## 23.1 Unit types

A Cooking Session may contain:

- local Sections;
- top-level Parts;
- Parts linked inside Sections.

Sections and Parts are both cookable units.

At the top level of the Cooking setup, local Sections and top-level Parts are peers.

## 23.2 Recipe composition

A Recipe may contain:

- only local Sections;
- only reusable Parts;
- a mixture of Sections and Parts;
- Sections that themselves contain linked Parts.

## 23.3 Default inclusion

Every eligible Section and Part begins included by default.

The user may remove units from Cooking setup and add them back.

At least one Section or Part must remain selected before cooking begins.

## 23.4 Nested Parts

A Part linked within a Section may be independently included or removed.

This supports workflows such as:

- preparing a marinade today;
- omitting the linked air-frying Part until tomorrow;
- making only a linked Part without the Section’s local content.

If a nested Part is selected without its parent Section’s local content:

- it becomes an independent cookable unit in the active Cooking Session;
- it does not remain visually trapped inside an unselected Section;
- DishFrame retains the Section relationship for historical context.

The final visual treatment belongs in frontend design work.

### 23.4a Authoring versus Cooking Setup (settled 2026-07-31)

A Part linked into a Recipe or another Part is authored as a complete,
reusable object. Editing a Recipe or Part never selectively removes or
alters content nested inside a linked Part — a different composition is
modeled through more modular Parts, a different Part, or Recipe-local
content, never by editing inside someone else's linked Part.

Cooking Setup is a separate, session-scoped concern. This rule generalizes
independent inclusion/exclusion beyond the Section→Part case above: a Part
linked inside another Part is *also* its own independent cookable unit, at
any nesting depth (Recipe → Sauce → Garlic Paste is two levels). The cook
may include Sauce while excluding Garlic Paste from one particular
session, or the reverse, without changing the authored Recipe or Part.
This is session planning, not source editing, and it is why every such
nested Part must be exposed as its own selectable Cooking Setup unit —
never usage implied merely by selecting its container.

A nested Part's own Last cooked and cooking history follow its own
selected session unit, not its container's: removing the container from a
session does not stop a separately-selected nested Part from counting as
cooked, and excluding or removing the nested Part's own unit does not stop
its container from counting (§41.3/§41.4).

## 23.5 Suggested order

DishFrame suggests cookable-unit order by:

1. longest estimated duration first;
2. authored Recipe order when durations are missing or equal.

The order is a suggestion.

Users may reorder units freely.

Session order does not change the authored Recipe or Part order.

Tier 1 does not attempt dependency-aware or parallel scheduling.

---

# 24. Amount Made and Session Scaling

## 24.1 User-facing terminology

DishFrame uses the natural label:

> Makes

Examples:

```text
Makes 6 servings
Makes 2 cups
Makes 12 cookies
Makes 1 loaf
Makes 1 batch
```

The underlying concept supports a quantity and a unit or user-facing label.

## 24.2 Plan target

During planning, the user may:

- accept the source Version’s Makes value;
- enter another target;
- leave it undefined when scaling is not useful.

The plan must not require servings for a sauce, topping, or other Part whose output is better described in another unit.

## 24.3 Calculable scaling

When the source and target amounts are compatible, DishFrame calculates a scaling factor and updates numeric ingredient quantities for the session.

Changing session scaling:

- does not edit the Recipe or Part Version;
- is saved with the session;
- leaves free-text quantities unchanged unless they have structured numeric values.

## 24.4 Mid-session scaling

While a session is In progress, the user may adjust:

- the entire session scale;
- an individual Section scale;
- an individual Part scale.

DishFrame must preserve enough context to distinguish:

- the original scale;
- the scale currently in effect;
- the final scale used.

This is exactly two persisted values per session/unit — the original
(captured once at creation, never rewritten) and the current (which mutates
with each adjustment and simply *is* the final scale once the session ends).
DishFrame does not log a timeline of every intermediate adjustment made
along the way.

An individual Section's or Part's scale is a relative adjustment on top of
the whole session's scale, not an absolute override — e.g. a session scaled
2× with a Part additionally scaled 1.5× yields that Part at 3× (2 × 1.5)
effective. Changing the whole-session scale continues to affect every unit,
including ones with their own adjustment.

## 24.5 Progress discrepancies after scaling

Scaling after work has begun must not silently pretend completed work changed.

When scaling upward:

- remaining quantities update;
- completed ingredient steps that now require additional quantity are flagged or reopened;
- the user can see what additional amount is needed.

When scaling downward:

- remaining quantities update;
- completed quantities that exceed the new target are clearly flagged;
- DishFrame does not imply that already-added ingredients can be removed.

The exact interaction belongs in frontend design work.

---

# 25. Session Lifecycle

## 25.1 States

A Cooking Session has one of three states:

- **In progress**
- **Completed**
- **Ended early**

## 25.2 No Paused state

Leaving cooking mode does not create a separate Paused status.

An In-progress session may simply be resumed later.

## 25.3 No review-status field

Review state is derived from whether a meaningful saved Session Review exists.

DishFrame does not create:

- an explicit Reviewed/Not reviewed session status;
- an empty Session Review object to represent no review.

## 25.4 Completed session

Completed means the user deliberately finished the work they intended to complete in that session.

DishFrame does not attempt to classify whether:

- the complete final dish was served;
- only part of the Recipe was prepared;
- preparation will continue another day.

The session log shows what was actually included and completed.

## 25.5 Ended early

Ended early means the user deliberately stopped before completing the planned work.

The session preserves partial evidence and may still be reviewed and rated.

---

# 26. Concurrent and Stale Sessions

## 26.1 Multiple source items

Users may have multiple In-progress sessions for different source items.

Examples:

- one Recipe session;
- another Recipe session;
- one standalone Part session.

This supports preparing more than one dish at the same time.

## 26.2 One active session per stable Recipe

Only one In-progress session may exist for the same stable Recipe at a time, regardless of Recipe Version.

If another is requested, offer:

- Resume current session
- End current session
- Cancel

## 26.3 One active standalone session per stable Part

Only one standalone In-progress session may exist for the same stable Part at a time.

Use the same resume/end/cancel behavior.

## 26.4 Part use across different sessions

A Recipe session containing a Part and a standalone session for that Part may coexist.

DishFrame does not implement complicated cross-session locking merely because the same Part appears in both contexts.

## 26.5 No automatic expiration

In-progress sessions never expire automatically.

They remain until the user:

- completes them;
- ends them early;
- deliberately deletes them where permitted.

## 26.6 Stale-session attention

Sessions more than one day old should receive a gentle attention treatment.

The product should:

- show the session age;
- use an attention color such as orange rather than destructive red;
- offer Resume;
- offer End session;
- never silently complete or delete it.

Active and recent Cooking Sessions must be reachable from the signed-in application without searching the original Recipe first.

The exact navigation placement belongs in frontend design work.

---

# 27. Editing an Active Session

## 27.1 Editable plan

An In-progress session may be edited to:

- add eligible Sections or Parts;
- remove planned Sections or Parts;
- restore previously removed units;
- reorder remaining work;
- adjust target amount or scale.

Editing the existing session is preferred over opening another session for the same Recipe or Part.

## 27.2 Removal before progress

A unit with no meaningful progress may be removed cleanly from the active plan.

## 27.3 Removal after progress

If a unit has:

- checked ingredients;
- checked instructions;
- completed items;
- timer activity;
- been marked complete;

removing it from the active plan must not erase that evidence.

DishFrame may hide it from the working interface, but the session log preserves it as removed after progress.

## 27.4 Removing the final unit

The session cannot remain as a meaningless empty active plan.

If removing the final unit would empty the session, offer:

- Delete session
- Keep editing

If the session contains meaningful history, clearly warn that deletion removes it.

DishFrame does not silently delete a session.

---

# 28. Cooking-Mode Progress and Focus

## 28.1 Optional checkoffs

Each selected Section or Part supports:

- ingredient checkoffs;
- instruction checkoffs.

Checkoffs:

- belong only to the Cooking Session;
- do not edit the source Version;
- persist across navigation and refresh;
- remain optional.

The user may complete a unit or session without checking every item.

## 28.2 Unit progress

Each cookable unit should expose:

- individual checkoff state;
- a concise progress summary;
- whether the unit is complete;
- timer status.

## 28.3 Complete unit

The user may mark a unit complete without manually checking every remaining item.

Completing a unit:

- marks remaining checklist items complete;
- marks the unit complete;
- shifts working focus away from it using the chosen frontend pattern;
- remains reversible while the session is In progress.

## 28.4 Implementation-neutral focus requirement

Cooking mode must let users:

- quickly focus on any selected Section or Part;
- see that unit’s relevant ingredients, instructions, progress, and timers;
- move to another unit within one or two actions;
- avoid navigating one long continuous Recipe;
- see enough overall session context to understand what remains.

Possible patterns include:

- persistent navigation;
- focused panels;
- drawers;
- selectable cards;
- accordions;
- carousels.

These are examples rather than requirements. Frontend design work will determine the final interaction.

## 28.5 Distinct action meanings

If collapse, close, complete, remove, or navigation controls are used, their meanings must remain visually distinct.

In particular:

- a collapse control must not look like removal;
- Complete must not be easily confused with hiding or navigation;
- removal belongs primarily in session-editing behavior.

---

# 29. Timers

## 29.1 Multiple timers per unit

Each Section or Part may have multiple named timers.

The first timer should be easy to create.

Additional timers may remain behind an Add timer action so flexibility does not clutter ordinary cooking.

## 29.2 Timer controls

Timers support:

- create;
- name or rename;
- start;
- pause;
- resume;
- reset;
- add time;
- subtract time;
- complete or dismiss.

## 29.3 Multiple active timers

Timers may run simultaneously:

- within one unit;
- across several units;
- across the same Cooking Session.

## 29.4 Persistence

A running timer stores a target end time.

A paused timer stores remaining duration.

Timer behavior must survive:

- switching units;
- leaving cooking mode;
- page refresh;
- resuming the session on another authenticated device.

## 29.5 Multiple devices

Tier 1 does not require real-time synchronization between two simultaneously open devices.

The most recently persisted action may win.

Users should ordinarily rely on one reference device while cooking.

## 29.6 Expired state

When DishFrame is open, an expired timer provides:

- a visible expired state;
- an accessible alert;
- a short audible signal.

The audible signal:

- is enabled by default;
- should be a brief ding or short sound rather than a prolonged alarm;
- may be muted;
- uses a preference that persists across sessions.

DishFrame does not promise reliable sound or operating-system notification while the browser is closed.

PWA or native notifications remain deferred.

## 29.7 Timer visibility location

Timer state (name, countdown, expired state, controls) is surfaced only in
the dedicated Timers area of Cooking Mode (the desktop rail; the
equivalent collapsible area on tablet/mobile).

Section/Recipe navigation (the left nav rail on desktop, and its
tablet/mobile equivalents) never carries timer indicators — no countdown
chip, badge, or other timer-derived state on a nav item, at any screen
size. Navigation communicates only Section identity and
checkoff/completion progress.

---

# 30. Ending a Cooking Session

## 30.1 One primary end action

Cooking mode exposes one main action:

> End cooking session

## 30.2 End decision

The end flow offers:

- **Finish session**
- **End early**
- **Keep cooking**

If steps or timers remain active, the end flow states that context clearly.

## 30.3 Finish session

Finishing:

- marks the session Completed;
- records end time;
- stops active timer countdowns;
- preserves timer state;
- preserves checklist progress;
- does not require every item to have been checked.

## 30.4 End early

Ending early:

- marks the session Ended early;
- records end time;
- stops active timer countdowns;
- preserves partial progress;
- preserves Cooking notes;
- remains eligible for Session Review and ratings.

## 30.5 Review transition

After either Completed or Ended early, DishFrame asks:

> Want to record how it went?

Actions:

- **Review this session**
- **Not now**

Choosing Not now:

- saves the session;
- creates no empty Review;
- returns to an appropriate Recipe, Part, Cooking, or Home context;
- leaves Review available later;
- does not trigger aggressive reminders.

A future Tier 2 preference may allow users to disable the automatic Review prompt while preserving later access to Review.

---

# 31. Session Log and Cooking Notes

## 31.1 Session log

Every completed or ended Cooking Session becomes a historical session log.

The log is not a separate user-created object or action.

It is the historical representation of the Cooking Session.

## 31.2 Session-log content

A session log preserves:

- source Recipe or Part Version;
- selected Sections and Parts;
- units completed;
- units incomplete;
- units removed after progress;
- checklist state;
- timers;
- start time;
- end time;
- raw elapsed duration;
- adjusted session duration, when supplied;
- source and final scaling;
- session outcome;
- Cooking notes;
- relationship to any Session Review.

## 31.3 Cooking notes

Every Cooking Session supports one editable freeform Cooking notes field.

It may be updated:

- during cooking;
- immediately after;
- hours or days later.

Cooking notes are suitable for immediate factual observations.

Examples:

- Used larger chicken breasts.
- Added another tablespoon of water.
- Rice finished before the vegetables.
- Research a lower air-fryer temperature next time.

Cooking notes remain even when no structured Session Review is created.

---

# 32. Persistent Recipe, Section, and Part Notes

## 32.1 Recipe Version description

Each Recipe Version may have its ordinary description of the dish.

This is not the same as a Version note.

## 32.2 Version note

Each Recipe Version and Part Version may have one optional persistent Version note.

The note commonly begins with the concise prefix proposed during the save flow.

Examples:

```text
V2.0 → V3.0:
```

```text
V6.0 from V2.3:
```

The user may edit that note later.

## 32.3 Section guidance

Each Section may have one optional persistent guidance note.

Examples:

- Best made one day ahead.
- Use the smaller air-fryer basket.
- This sauce thickens substantially when chilled.

## 32.4 Part guidance

Each Part Version may have its own persistent description and guidance suitable for preparing that Part.

## 32.5 No second Recipe-level notes field

Do not add a second general top-level Recipe notes field.

Recipe-level writing is already supported through:

- the Recipe Version description;
- the Recipe Version note;
- Section guidance;
- Part guidance;
- Cooking notes;
- Session Review fields.

---

# 33. Session Review

## 33.1 Availability

A Session Review is available after every Completed or Ended-early session.

This includes:

- full Recipe sessions;
- partial Recipe sessions;
- standalone Part sessions.

DishFrame does not attempt to determine whether the complete final dish was served.

## 33.2 Review prompts

The structured text prompts are:

- **What went well?**
- **What did not go well?**
- **Anything else?**

Every field is optional.

Review language does not assume that the user deliberately experimented or changed the Recipe.

## 33.3 One Review per session

Each Cooking Session may have at most one Session Review.

A Review is created only when the user saves meaningful review content, such as:

- one text response;
- one rating;
- adjusted duration;
- actual amount made.

An entirely empty Review is not stored.

## 33.4 No draft Review state

A saved Review containing only one value is a valid completed Review.

DishFrame does not maintain a separate Review draft status.

## 33.5 Editability

A saved Review may later be edited to:

- change text;
- add or remove ratings;
- add Tasters;
- adjust time;
- add or change actual amount made.

## 33.6 Review deletion

The user may delete the Review without deleting the Cooking Session.

Deleting the Review removes Review-owned information, including:

- review text;
- ratings;
- adjusted duration entered through Review;
- actual amount made entered through Review.

Deleting it does not remove:

- the Cooking Session;
- the session log;
- checklist progress;
- timer history;
- Cooking notes.

DishFrame must warn that ratings will be removed and summaries recalculated.

---

# 34. Tasters

## 34.1 Reusable names

Users may create reusable named Tasters.

Examples:

- You
- Mom
- Dad
- Older Sister
- Younger Sister

## 34.2 Owner Taster

The authenticated owner appears as a built-in personal Taster labeled:

> You

The profile may supply a more specific display name where appropriate.

## 34.3 No account behavior

A Taster:

- does not need an account;
- receives no access;
- is not a collaborator;
- does not create shared ownership.

## 34.4 Management

Users may:

- create;
- rename;
- archive;
- restore;
- permanently delete.

**Formalized in the Slice 2 follow-up:** the built-in owner Taster (§34.2)
is exempt from archive and permanent deletion — one owner Taster must
always exist and remain selectable, enforced by a database-level partial
unique index. It may still be renamed (the "more specific display name"
case §34.2 already allows), and the UI continues identifying it as the
owner regardless of its current display name.

## 34.4a Persistent ordering (Slice 3 closeout)

Tasters have a persistent, user-controlled display order (drag-and-drop in
Settings), the same treatment as Grocery Categories (§63).

- The order is not alphabetical or creation-based — it represents
  whatever practical priority or frequency-of-use makes sense to the
  household (e.g., the people who taste-test most often listed first).
- The built-in owner Taster (§34.2) may be reordered like any other
  Taster. Reordering is independent of, and does not affect, its
  protected archive/delete behavior (§34.4) — only archive and permanent
  deletion are restricted for the owner Taster, never its position.
- Future Taster selectors and cooking/review interfaces (rating entry,
  session review, etc.) should read Tasters in this order by default
  unless a specific workflow has its own settled reason to sort
  differently (e.g., an eventual "most recently rated" view).

## 34.5 Archive

Archiving:

- hides the Taster from ordinary future selection;
- preserves historical ratings;
- preserves the displayed historical name.

## 34.6 Permanent deletion

Permanent deletion removes:

- the Taster;
- the displayed name;
- all ratings associated with that Taster.

Rating summaries recalculate afterward.

DishFrame does not preserve anonymized Taster ratings in Tier 1.

---

# 35. Rating Input and Scope

## 35.1 Scale

Ratings use:

> **1–5 whole stars**

A Taster rating requires one touch-friendly whole-star selection.

Half-star input is not required.

## 35.2 Calculated averages

Calculated averages display one decimal place:

```text
4.3/5
```

Do not expose unnecessary precision such as:

```text
4.33/5
```

## 35.3 Optional ratings

Ratings are optional.

A Taster either:

- has a saved 1–5-star rating for the session; or
- has no saved rating for the session.

DishFrame does not distinguish, or persist, whether an unrated Taster was
present and declined to rate versus not present at all — that distinction
does not affect rating summaries, Version evidence, or the learning loop,
and Tier 1 does not track Taster attendance separately from a rating.
Clearing a previously entered rating (e.g., tapping the same star again)
simply leaves that Taster with no saved rating for the session; it does not
create or preserve a separate attendance record.

Each Taster may have at most one rating per session for a given rated item.

## 35.4 Recipe-session rating

After every Recipe Cooking Session, DishFrame may ask:

> Would you like to rate this Recipe as a whole?

The Review shows enough session context to support the judgment.

Example:

```text
This session included:
✓ Chicken
✓ White Rice
○ Fresh Vegetables
○ Finish
```

The user decides whether the session provides enough evidence for a Recipe-level rating.

This applies to:

- complete sessions;
- partial sessions;
- Ended-early sessions.

DishFrame trusts the user rather than attempting to infer whether a rating is valid.

## 35.5 Standalone Part rating

A standalone Part session may rate that Part Version.

Example:

> How did White Rice V2.1 turn out?

## 35.6 Parts used inside Recipes

Using a linked Part inside a Recipe:

- records that the Part Version was used;
- does not automatically turn the overall Recipe rating into a Part rating.

Optional per-Part ratings inside a Recipe Review are deferred from Tier 1.

A possible Tier 2 enhancement may expose them behind an optional expanded control so ordinary Reviews remain simple.

---

# 36. Rating Records and Summaries

## 36.1 Rating record

Every saved rating remains tied to:

- stable Recipe or Part;
- exact Recipe or Part Version;
- Cooking Session;
- Taster;
- session outcome;
- date.

## 36.2 Equal weighting

Every deliberately submitted rating counts as one rating.

DishFrame does not equalize Taster influence through a more complicated formula in Tier 1.

## 36.3 Available summaries

DishFrame must be able to calculate:

- session average;
- latest rated-session average;
- owner’s latest rating;
- owner’s current-Version average;
- current-Version group average;
- each Taster’s average;
- all-time Recipe or Part average;
- number of ratings;
- number of rated sessions;
- number of distinct Tasters;
- rating range;
- rating history by Version.

## 36.4 Selective presentation

The ordinary Recipe card or header should show only a principal summary, likely similar to:

```text
★ 4.6/5
```

Detailed summaries belong behind a deliberate ratings-history or insights view.

The exact presentation belongs in frontend design work.

## 36.5 Provisional principal rating

When an item lacks genuine ratings for its current content, DishFrame may show a compact provisional value derived from:

- the most relevant previous rated Version;
- a duplicated source Version;
- an accepted shared source snapshot.

Example:

```text
~4.6/5
```

Any provisional value displayed as the item’s principal library rating participates numerically in rating filtering and sorting.

It remains:

- visibly approximate;
- excluded from the item’s actual rating average;
- excluded from rating analytics;
- traceable to its exact source in the detailed ratings view.

The first genuine current-item rating replaces the provisional principal value.

## 36.6 Ended-early ratings

A deliberately entered rating from an Ended-early session counts in rating summaries.

The associated session remains visibly labeled Ended early in detailed history.

## 36.7 Rating deletion

Deleting an individual rating or deleting its Review immediately recalculates all affected summaries.

---

# 37. Actual Amount Made and Nutrition Context

## 37.1 Optional actual amount

The Session Review may optionally ask:

> How much did it make?

This field is low-priority and should appear late in the Review rather than dominate it.

## 37.2 Comparison

When compatible values exist, DishFrame may compare:

```text
Makes: 6 servings
Made this session: 5 servings
```

or:

```text
Makes: 2 cups
Made this session: 2.5 cups
```

## 37.3 No automatic Recipe change

A discrepancy:

- remains session evidence;
- may prompt the user to review the Recipe or Part;
- never silently changes the source Version.

One session is evidence, not automatic truth.

## 37.4 Session-specific nutrition

When a Recipe Version contains manually entered batch nutrition and a session records a different number of servings, DishFrame may show session-specific per-serving nutrition.

Example:

```text
Batch calories: 3,000
Recipe makes: 6 servings
This session made: 5 servings

Recipe estimate: 500 calories per serving
This session: 600 calories per serving
```

This does not rewrite the Recipe Version’s nutrition.

DishFrame must not claim meaningful per-serving nutrition for incompatible units unless a valid relationship has been defined.

---

# 38. Session Duration

## 38.1 Recorded values

A Cooking Session records:

- start time;
- end time;
- raw elapsed duration;
- optional user-adjusted session duration.

## 38.2 One adjusted duration

Tier 1 does not require users to separate:

- active preparation time;
- passive preparation time;
- cooking time.

The user may instead adjust one session-duration value.

## 38.3 Review adjustment

At Review time, raw elapsed duration is the default.

The user may adjust it when:

- they took a break;
- they forgot to end the session;
- they started work before pressing Start;
- raw wall-clock time is otherwise misleading.

The exact control may be:

- direct input;
- step buttons;
- slider;
- another touch-friendly pattern.

That is a frontend decision.

## 38.4 Clear difference

DishFrame should explain the adjustment clearly.

Example:

```text
Recorded time: 45 minutes
10 minutes excluded from raw elapsed time
```

## 38.5 No automatic estimate rewriting

Session duration does not automatically change:

- Recipe estimated duration;
- Section estimated duration;
- Part estimated duration.

Detailed attribution is difficult when cooking work overlaps.

Deriving future estimates from repeated full and partial sessions is deferred as an optional insights feature.

---

# 39. Feedback-Assisted Editing

## 39.1 No automatic content generation

A Session Review never:

- rewrites ingredients;
- rewrites instructions;
- generates a Recipe Version;
- generates a Part Version;
- interprets feedback into automatic changes.

No AI-generated Recipe revisions are part of Tier 1.

## 39.2 Completion actions

After saving a Recipe Review, DishFrame may offer:

- **Edit recipe**
- **Change Recipe Stage**
- **Done**

After saving a Part Review:

- **Edit part**
- **Change Part Stage**
- **Done**

The Review is saved before any editor opens.

Leaving the editor does not discard the Review.

## 39.3 Ordinary editor

Edit recipe and Edit part open the normal editor.

The Review does not create a separate automatic mutation workflow.

## 39.4 Evidence access

While editing a Recipe or Part, users must be able to quickly reference relevant:

- Cooking Sessions;
- Cooking notes;
- Session Reviews;
- ratings.

The evidence should be accessible without losing unsaved edits.

Possible frontend patterns include:

- side-by-side context on larger screens;
- a panel;
- a drawer;
- a quick toggle;
- an overlay on smaller screens.

These are examples, not mandatory implementations.

## 39.5 Editing from the cooked Version

When the session used the current Version, editing begins from that Version.

When the session used a historical Version, DishFrame clearly identifies:

- the cooked Version;
- the current Version;
- the available save choices.

From a historical major line:

- Save small update increments that major line’s latest minor Version;
- Save new version creates the next highest major Version and makes it current.

The exact source relationship is preserved.

---

# 40. Recipe and Part Stage Suggestions

## 40.1 Part Stage

Parts use the same lifecycle values as Recipes:

1. Idea
2. Experimental
3. Proven
4. Active
5. Archived

Full label:

> Part Stage

Compact label:

> Stage

## 40.2 Manual authority

DishFrame never changes Recipe Stage or Part Stage automatically.

## 40.3 Positive suggestions

After meaningful use, DishFrame may offer restrained suggestions.

### Idea

> This has now been tested. Move it to Experimental?

### Experimental

> Feeling confident in it? Mark it Proven.

No score threshold or required number of sessions is imposed.

### Proven

> Add this to your Active rotation?

## 40.4 Active and Archived

DishFrame does not prompt Active Recipes or Parts to downgrade after one poor or Ended-early session.

Manual Stage controls remain available.

Archived items are never silently restored or unarchived.

---

# 41. Session-History Effects

## 41.1 Recipe Last cooked

Every Completed Recipe Cooking Session updates Recipe Last cooked.

This includes sessions that prepared only part of the Recipe.

DishFrame does not require evidence that the entire final dish was served.

## 41.2 Ended early

Ended-early sessions do not update Last cooked.

Their timestamp remains available through session history and may support a future Last attempted concept, but Tier 1 does not need to surface a separate headline Last attempted field.

## 41.3 Part Last cooked

A Part’s Last cooked value updates when the Part Version is:

- completed in a standalone Part session; or
- used in a Completed Recipe session.

Tier 1 uses one simple Last cooked value for the Part regardless of context.

## 41.4 Part usage history

When a Recipe session uses a Part Version:

- that use is recorded in the Part’s history;
- no duplicate standalone Part session is created.

## 41.5 Session evidence

Completed and Ended-early sessions both remain visible in history.

They preserve their own:

- outcome;
- progress;
- ratings;
- Review;
- notes.

---

# 42. Cooking and Learning-Loop Acceptance Criteria

The Cooking Session and learning loop are implementation-ready when the following behaviors are supported.

## Cooking entry and plan

- Recipe cards, Recipe Details, historical Versions, Parts, and historical Part Versions can enter the same cooking flow.
- Every flow shows a prefilled plan.
- The plan can be canceled without creating a session.
- Start cooking creates the Cooking Session.
- At least one Section or Part is required.

## Cookable units

- Sections and Parts can both be selected and ordered.
- A Recipe may contain only Parts.
- Nested Parts can be selected independently.
- A selected nested Part can become a top-level session unit while preserving source context.
- Suggested ordering uses estimated duration.
- User ordering does not rewrite Recipe ordering.

## Source integrity

- Sessions point to exact Recipe and Part Versions.
- Historical Versions can be cooked without becoming current.
- Later edits do not rewrite session history.

## Scaling

- Session scaling may be undefined, accepted, or changed.
- Whole-session and unit-specific scaling can change during cooking.
- Completed quantities that conflict with a later scale are flagged.
- Scaling does not edit the source Version.

## Lifecycle and concurrency

- Sessions use In progress, Completed, and Ended early.
- No Paused status is required.
- Multiple different source sessions may be active.
- Only one session per stable Recipe or standalone Part may be active.
- Sessions never expire automatically.
- Stale sessions receive a gentle attention treatment.

## Active-session editing

- Users can add, remove, restore, and reorder units.
- Meaningful progress is preserved when a unit is removed.
- Removing the last unit requires an explicit delete decision.
- Sessions are never silently deleted.

## Cooking mode

- Ingredient and instruction checkoffs are optional.
- Unit completion is available and reversible while active.
- Users can quickly focus on any unit and move among units in one or two actions.
- The product requirement remains neutral about exact frontend controls.

## Timers

- Units support multiple named timers.
- Multiple timers can run together.
- Timers persist across navigation, refresh, and later resumption.
- Expired timers provide visible, accessible, and short audible alerts while the app is open.
- Mute preference persists.
- Closed-browser notifications are not promised.

## Ending

- One End cooking session action leads to Finish session, End early, or Keep cooking.
- Active work is called out before ending.
- Both outcomes preserve session evidence.
- Both outcomes offer optional Review.
- Not now creates no empty Review.

## Notes and Reviews

- Cooking notes are editable during and after cooking.
- One optional Review may exist per session.
- Review fields are What went well, What did not go well, and Anything else.
- Reviews remain editable and may be deleted.
- Deleting a Review preserves the session log and Cooking notes.
- Empty Reviews are not stored.

## Tasters and ratings

- Reusable Tasters can be created, renamed, archived, restored, and deleted.
- Owner appears as You.
- Ratings use whole 1–5 stars.
- Averages use one decimal place.
- Ratings are optional.
- Recipe ratings are offered after every Recipe session with clear whole-Recipe wording.
- Standalone Part sessions can rate the Part.
- Recipe ratings do not automatically rate linked Parts.
- Every saved rating counts equally.
- Ended-early ratings count when deliberately entered.
- Rating summaries update after deletion.

## Amount and duration

- Makes supports servings and other units.
- Actual amount made is optional and low priority.
- Session-specific nutrition may be shown when valid.
- Start, end, raw elapsed, and adjusted duration are preserved.
- Session evidence never silently rewrites Recipe estimates.

## Learning loop

- Reviews never automatically change Recipe or Part content.
- Saved Reviews may lead to Edit, Change Stage, or Done.
- Editors can expose relevant feedback context without losing edits.
- Historical minor updates stay on their major line.
- Promoted historical directions create the next major Version.
- Stage suggestions are optional, explainable, and positive.

## History

- Completed partial or full Recipe sessions update Last cooked.
- Ended-early sessions do not.
- Part Last cooked updates from standalone use or completed Recipe use.
- Recipe use records Part history without creating duplicate Part sessions.

---

# 43. Recipe and Part Libraries

## 43.1 Separate scopes

DishFrame provides separate library scopes for:

- Recipes;
- Parts.

Recipes and Parts are searched, filtered, sorted, and viewed within their current scope.

Tier 1 and Tier 2 do not require a combined Recipes-and-Parts result screen.

Cooking Sessions are not mixed into either library. They remain available through their own active, recent, and historical contexts.

## 43.2 Scope switching

Users may switch between Recipe and Part scopes without losing the broader Library context.

The exact navigation placement belongs in frontend design.

## 43.3 Archived items

Archived Recipes and Parts remain excluded by default.

They appear only when the user explicitly selects the Archived Stage or an equivalent include-archived control.

Other searches, tags, ratings, or filters do not reveal archived items implicitly.

## 43.4 Views

The Recipe library supports:

- grid view;
- compact list view.

The selected view persists for the user.

Parts support the same view choices unless final frontend testing demonstrates that one view is materially clearer.

Grid and list views may emphasize different amounts of information, but they operate on the same underlying items and organization state.

---

# 44. Search

## 44.1 Recipe search fields

Normal Recipe-library search inspects the current stable Recipe and current Recipe Version across:

- title;
- cuisine;
- Flavor profiles;
- custom tags;
- Section names;
- linked Part names.

Ingredient names are not included in ordinary library search.

If an ingredient is central enough to be a Section or Part, that higher-level name can make the Recipe discoverable without producing noisy matches for every minor ingredient.

## 44.2 Part search fields

Part-library search inspects:

- Part title;
- cuisine where present;
- Flavor profiles;
- custom tags;
- internal Section names, where applicable.

Ingredient names are not included in ordinary Part search.

## 44.3 Excluded search content

Normal library search does not inspect:

- full instruction text;
- individual ingredient names;
- Cooking notes;
- Session Reviews;
- Taster names;
- historical Version content.

## 44.4 Current content only

Library search uses current content only.

Historical Versions do not make a Recipe or Part appear in normal search results.

If an old direction should remain independently discoverable, the user may duplicate it into a separate stable Recipe or Part.

## 44.5 Matching behavior

Search is:

- case-insensitive;
- tolerant of ordinary punctuation differences;
- tolerant of leading and trailing whitespace;
- capable of partial-word matching;
- explicit when no results exist.

Suggested ranking:

1. exact title;
2. title prefix;
3. partial title;
4. cuisine;
5. Flavor profile;
6. tag;
7. Section or linked Part name.

Tier 1 and Tier 2 do not require semantic search, embeddings, or aggressive fuzzy guessing.

---

# 45. Tags and Favorite

## 45.1 Ownership

Tags belong to the authenticated user.

They are not global DishFrame categories.

Examples:

- High Protein
- Freezer Friendly
- Chicken
- Quick
- Summer
- Meal Prep
- Weeknight
- Needs Tweaking

## 45.2 Stable-item metadata

Tags belong to the stable Recipe or Part rather than an individual Version.

Changing tags:

- does not create a Version;
- changes current organization;
- does not rewrite historical Version content.

Historical Version views may display the stable item’s current tags without claiming those tags existed at the time of that Version.

## 45.3 Creation

Users may create tags:

- while editing a Recipe or Part;
- while filtering;
- from tag management.

## 45.4 Identity and uniqueness

Tag identity is case-insensitive.

DishFrame:

- trims whitespace;
- preserves one clean display label;
- prevents duplicates differentiated only by capitalization or surrounding whitespace;
- permits spaces and ordinary punctuation;
- imposes no small arbitrary per-item tag limit.

## 45.5 Rename

Renaming a tag updates it everywhere it is used.

No Recipe or Part Version is created.

## 45.6 Merge

Renaming a tag to an existing tag offers to merge the source into the destination.

The destination tag is then used by every affected Recipe and Part.

## 45.7 Delete

Deleting a tag:

- removes it from every Recipe and Part;
- does not delete those items;
- requires confirmation showing the number of affected items.

Ordinary custom tags do not require an archive state.

## 45.8 Flat tags

The intended Tier 1 and Tier 2 product uses a flat tag model.

Custom user-created tag categories or groups are an optional enhancement to reconsider before the product is declared fully complete.

Their absence does not block release.

## 45.9 Protected Favorite tag

Every account receives a protected built-in tag:

> Favorite

Favorite:

- uses the normal Recipe/Part tag relationship;
- cannot be renamed;
- cannot be merged;
- cannot be deleted;
- may be used in normal tag filtering.

The frontend may expose a familiar one-tap Favorite action that adds or removes this tag.

That action is a design optimization rather than a separate Favorite data model.

---

# 46. Cuisine

## 46.1 Stable metadata

Cuisine is optional and belongs to the stable Recipe or Part.

It does not belong to an individual Version.

Changing cuisine:

- does not create a Version;
- changes how the stable item is organized.

If a cooking direction has evolved into a sufficiently different identity and cuisine that historical cuisine needs to remain independently meaningful, the user should duplicate it into another stable Recipe or Part.

## 46.2 One primary cuisine

Tier 1 and Tier 2 support one primary cuisine value per Recipe or Part.

Examples:

- Vietnamese
- Japanese
- Cuban
- Mediterranean
- Korean-American
- Fusion

Users may use tags for secondary or cross-cultural classification.

## 46.3 Flexible values

Cuisine uses free-text values with suggestions based on the user’s existing values.

DishFrame does not impose a rigid global cuisine taxonomy.

Parts may omit cuisine when it is not meaningful.

---

# 47. Filters

## 47.1 Recipe filters

Recipe filtering supports:

- Recipe Stage;
- tags;
- cuisine;
- Flavor profiles;
- rating.

## 47.2 Part filters

Part filtering supports:

- Part Stage;
- tags;
- Flavor profiles;
- rating;
- cuisine when meaningful.

DishFrame does not add a separate Cooked/Never cooked filter.

Stage is the stronger product signal for lifecycle and intended use.

## 47.3 Rating filter

Rating filtering is one coherent category.

It may include:

- Unrated;
- 3 stars and up;
- 4 stars and up;
- 5 stars;
- other sensible whole-star thresholds.

Rated/Unrated does not require a second standalone filter group.

## 47.4 Across-category logic

Different filter categories use AND logic.

Example:

```text
Stage: Active
Cuisine: Vietnamese
Tag: High Protein
Rating: 4★+
```

means an item must satisfy every selected category.

## 47.5 Within-category logic

Within a category:

- multiple Stages use OR;
- multiple cuisines use OR;
- rating choices follow the selected rating rule.

## 47.6 Tag logic

Multiple selected tags use match-all behavior.

Example:

```text
High Protein + Quick
```

returns only items containing both tags.

## 47.7 Flavor-profile logic

Multiple selected Flavor profiles use match-all behavior.

Example:

```text
Sweet + Spicy
```

returns only items carrying both profiles.

## 47.8 Visible active filters

Active search and filter criteria remain visible through chips, labels, or an equivalent compact treatment.

Example:

```text
Active · Vietnamese · Sweet + Spicy · High Protein · 4★+
```

This is not a separate inspection screen.

Users may clear individual criteria or clear all filters while retaining other appropriate library state.

---

# 48. Sorting

## 48.1 Default

Default Recipe and Part sort:

> Recently updated

## 48.2 Recipe options

Recipe sorting supports:

- Recently updated;
- Recently created;
- Alphabetical;
- Highest rated;
- Lowest rated;
- Recently cooked;
- Least recently cooked;
- Shortest estimated duration.

## 48.3 Part options

Part sorting supports:

- Recently updated;
- Recently created;
- Alphabetical;
- Highest rated;
- Lowest rated;
- Recently cooked;
- Least recently cooked;
- Shortest estimated duration.

## 48.4 Rating sorts

Unrated items appear after rated items in both Highest rated and Lowest rated sorts.

A Recipe or Part may carry a provisional principal rating derived from:

- a previous rated Version;
- a duplicated source;
- an accepted shared source snapshot.

When a provisional rating exists:

- it participates numerically in rating sorting and filters;
- `~4.2/5` sorts between `4.3/5` and `4.1/5`;
- it remains visibly approximate;
- it does not become a genuine rating;
- it does not contribute to actual analytics;
- the first genuine current-item rating replaces the provisional principal value.

## 48.5 Recently cooked

Completed sessions determine Last cooked.

Never-cooked items appear last when sorting Recently cooked.

## 48.6 Least recently cooked

Never-cooked items appear first.

Remaining items are ordered from oldest Last cooked to newest.

## 48.7 Duration

Shortest-duration sorting uses the current Version’s estimated duration where available.

Items without an estimate appear after items with one.

---

# 49. Primary Rating Presentation

## 49.1 User preference

Users may select a principal Recipe rating:

- Group average;
- Your rating.

Default:

> Group average

This supports family and multi-Taster use while allowing solo or experimental cooks to prioritize their own judgment.

## 49.2 Compact library value

The ordinary library and Recipe header may use one compact value:

```text
★ 4.6/5
```

Detailed rating history remains available through a deliberate deeper view.

## 49.3 Provisional value

When current content lacks its own rating but meaningful inherited or prior evidence exists, DishFrame may display:

```text
~4.6/5
```

The approximate marker and styling must distinguish it from a real current rating.

The detailed view identifies the exact source.

---

# 50. Empty and No-Result States

## 50.1 Empty Recipe library

Offer meaningful actions such as:

- Create Recipe
- Import Recipe

## 50.2 Empty Part library

Offer:

- Create Part
- a brief explanation that Parts are reusable preparations.

## 50.3 No matching results

Distinguish a filtered no-result state from an empty library.

No-result behavior supports:

- clearing search;
- clearing individual filters;
- clearing all filters;
- seeing active criteria;
- retaining the typed query while other filters are adjusted.

---

# 51. Temporary Scaling Outside Cooking Sessions

> **Amended by the Slice 6 design remediation pass (owner-approved, in that
> pass's own conversation):** the live "View for"/temporary-scaling control
> this section describes is deferred out of the ordinary Recipe/Part view
> page — that page is not Cooking Mode and no longer shows an editable
> scaling panel — until Cooking Mode (§51.1's "starting a Cooking Session")
> actually ships and can host it. The view page instead shows a static
> yield line (e.g. "Makes 4 servings") derived from §51.4's saved default
> batch scale, which remains editable from the Recipe/Part editor. §51.4's
> underlying save-a-default behavior is unchanged, only its editing surface
> moved. The rest of
> this section's intent is expected to resurface inside Cooking Mode's own
> slice, not to be rebuilt from scratch.

## 51.1 Availability

Users may temporarily scale the current Recipe or Part Version without starting a Cooking Session.

Examples:

```text
Makes 6 servings
View for 9 servings
```

```text
Makes 2 cups
View for 4 cups
```

## 51.2 Temporary behavior

Temporary scaling:

- changes displayed quantities;
- does not create a Cooking Session;
- does not create a Version;
- does not change the authored Version yield;
- may carry into a Cooking setup or grocery-list flow;
- otherwise resets when the user leaves.

## 51.3 Whole-item scaling

Outside a Cooking Session, scaling applies to the whole Recipe or Part.

Independent Section scaling remains a Cooking Session capability.

## 51.4 Save as default

The user may save a temporary scale as the stable item’s default batch presentation.

Action concept:

> Save as default

Saving the default:

- does not create a Version;
- does not mutate the authored Version formula;
- stores the chosen default batch scale on the stable Recipe or Part;
- causes future ordinary views and Cooking setups to open at that default;
- remains resettable to the authored Version yield.

A Version is required only when actual recipe meaning changes, such as:

- ingredient ratios;
- ingredient identity;
- instructions;
- structure;
- preparation.

## 51.5 Session history

Each Cooking Session still records the exact scale used in that session, regardless of the stable default.

---

# 52. Quantity Scaling and Formatting

## 52.1 Single values

Structured numeric quantities scale mathematically.

```text
2 cups → 3 cups at 1.5×
```

## 52.2 Ranges

Both endpoints scale.

```text
2–3 tbsp → 3–4.5 tbsp at 1.5×
```

## 52.3 Approximate values

Approximation remains visible.

```text
About 2 cups → About 3 cups
```

## 52.4 Free text

DishFrame does not invent calculations for nonnumeric amounts.

Examples remain unchanged:

- Salt to taste
- Water as needed
- One large handful

## 52.5 Counts

Count ingredients may produce fractional calculated values.

```text
1 egg → 1.5 eggs
```

DishFrame does not silently round and alter proportions.

## 52.6 Authored style

The base Recipe view preserves the author’s stored quantity style where practical.

Examples:

- `1/2`
- `0.5`
- `1 1/2`

## 52.7 Calculated style

Calculated quantities use familiar, practical kitchen fractions through eighths when readable, excluding impractical divisions such as sevenths.

Otherwise, DishFrame uses a concise decimal with enough precision to avoid materially changing the quantity.

The product specification defines the outcome rather than a specific conversion algorithm.

Users may choose a fractions-or-decimals display preference. Calculated values still preserve enough precision to avoid materially changing quantities.

---

# 53. Measurement Conversion and Preferred Units

## 53.1 User control

DishFrame may identify a more practical compatible unit while:

- scaling;
- viewing a Recipe or Part;
- editing;
- preparing a Cooking setup;
- generating a grocery list.

It suggests rather than forces the conversion.

## 53.2 Compatible families

Safe conversions include:

### Volume

- teaspoons;
- tablespoons;
- cups;
- fluid ounces;
- milliliters;
- liters.

### Weight

- ounces;
- pounds;
- grams;
- kilograms.

### Temperature

- Fahrenheit;
- Celsius.

## 53.3 Simplification

The same interaction may suggest a simpler unit.

Examples:

```text
6 tsp → 2 tbsp
16 tbsp → 1 cup
1,000 g → 1 kg
```

Conversion and simplification use one coherent product behavior.

## 53.4 Unsafe conversion

DishFrame does not automatically convert mass to volume without a trusted ingredient-specific density relationship.

Example not automatically performed:

```text
100 grams flour → cups flour
```

Tier 1 and Tier 2 do not require an ingredient-density database.

## 53.5 Accepted temporary conversion

If a suggestion is accepted for a temporary view:

- that compatible unit is used consistently throughout the current view or flow;
- it does not modify the authored Version.

## 53.6 Save preferred units

Users may save accepted compatible units as stable preferred presentation.

Saving preferred units:

- does not create a Version;
- does not change the underlying authored quantity;
- applies consistently across ordinary views and Cooking setups;
- remains reversible.

DishFrame should not show conflicting preferred units in Recipe Detail and cooking mode.

---

# 54. Nutrition

## 54.1 Tier 1 manual nutrition

Tier 1 supports manual nutrition entry.

Primary fields:

- Calories
- Protein
- Carbohydrates
- Fat

DishFrame does not make medical claims or treat user-entered values as authoritative.

## 54.2 Nutrition basis

Nutrition supports:

- whole Recipe or Part;
- per serving or compatible output unit.

When yield permits, DishFrame may calculate one basis from the other.

Example:

```text
Whole Recipe: 3,000 calories
Makes 6 servings
Calculated: 500 calories per serving
```

## 54.3 Scaling

When the entire Recipe scales proportionally:

- total nutrition scales;
- nutrition per serving remains unchanged when servings scale proportionally.

When the batch remains fixed but actual serving count changes:

- total nutrition remains unchanged;
- session-specific per-serving nutrition changes.

Saved Version nutrition is never silently rewritten.

## 54.4 Tier 2 FoodData Central lookup

Tier 2 integrates USDA FoodData Central for nutrition lookup.

The user may search:

- generic foods;
- branded foods.

The user selects the matching result.

Imported data:

- remains editable;
- retains source name and source identifier;
- may be detached and converted to fully manual data;
- is labeled as sourced information that may contain errors or change.

Manual entry always remains available.

## 54.5 Reusable ingredient nutrition

Where the implementation model supports it, selected nutrition records may be associated with structured ingredients and reused through Parts.

DishFrame may then calculate Recipe totals from:

- reusable Parts;
- local ingredients;
- local sauces or toppings.

The implementation specification must define how ingredient quantities and source serving units are normalized before claiming calculated totals.

## 54.6 More nutrients

When FoodData Central supplies additional recognized nutrients, Tier 2 displays an expandable:

> More nutrients

The primary interface remains focused on calories and macros.

The product may display available values such as:

- fiber;
- sugar;
- sodium;
- saturated fat;
- cholesterol;
- other clearly labeled source nutrients.

DishFrame does not require every food to provide every nutrient and does not dump unlabeled technical source fields directly into the interface.

## 54.7 Barcode lookup

Text search remains the primary nutrition-lookup method.

Tier 2 may also support retail barcode scanning as a convenience:

- request camera access only after user action;
- scan UPC/EAN-compatible retail barcodes;
- use the decoded GTIN/UPC to locate a branded FoodData Central result;
- return to text search when scanning is unsupported or unsuccessful;
- never make barcode support necessary to use nutrition lookup.

Barcode scanning is a late Tier 2 convenience rather than a foundational dependency.

If cross-browser camera behavior or quality assurance becomes disproportionately costly, it may move to Tier 3 without changing the nutrition data model.

---

# 55. Export and Backup

## 55.1 Full account backup

A full private account backup uses a documented portable structured format, such as JSON with associated image files or portable image references.

It preserves the user’s DishFrame product data, including:

- Recipes and Recipe Versions;
- Parts and Part Versions;
- Sections, ingredients, instructions, and linked-Part structure;
- Stages, cuisine, Flavor profiles, tags, and Favorite;
- default batch presentation and preferred units;
- Cooking Sessions, Cooking notes, Session Reviews, Tasters, and ratings;
- grocery lists and grocery categories;
- Meal Plans, entries, planned meals, and relationships;
- preferences;
- provenance and duplication/share-source snapshots;
- images or portable image references;
- sharing and publication configuration where relevant;
- creation and update timestamps.

It excludes:

- passwords;
- authentication-provider credentials;
- active authentication-session tokens;
- raw secret share-link tokens;
- other security secrets.

A restore does not silently reactivate prior share links, public links, or signed-in sessions. The user may create new links after restoration.

The export flow displays a clear privacy warning because the backup contains private cooking and Taster data.

Its purposes include:

- personal backup;
- portability;
- disaster recovery;
- future migration.

## 55.2 Item export

Users may export one Recipe or Part in a portable package.

The export may contain:

- one selected Version or full Version history;
- linked Parts;
- images or image references where supported;
- tags, cuisine, and Flavor profiles;
- source attribution;
- selected evidence according to privacy level.

## 55.3 Standard item export

Default standard export includes:

- Recipe or Part content;
- aggregate rating;
- rating count;
- no Taster names;
- no individual ratings;
- no Cooking notes;
- no Session Reviews;
- no Cooking Session history.

## 55.4 Detailed evidence export

An optional detailed-evidence export may include:

- per-Version ratings;
- per-session ratings;
- individual rating values;
- session outcomes.

Taster names remain anonymized unless separately and explicitly enabled.

## 55.5 Full private-history item export

An explicit full-private-history option may include:

- Taster names;
- Cooking notes;
- Session Reviews;
- full Cooking Session history.

The user must deliberately choose this level and receive a privacy warning.

## 55.6 Public sharing distinction

Structured export is distinct from:

- read-only share links;
- direct account-to-account sharing;
- Tier 3 public publication.

---

# 56. Import Principles

## 56.1 Mandatory review

Import never silently overwrites or creates final content without review.

Flow:

1. Select or provide source.
2. Parse and validate.
3. Show preview.
4. Identify unsupported or ambiguous fields.
5. Allow correction.
6. Confirm.
7. Create DishFrame items and Versions.

Canceling before confirmation creates nothing.

## 56.2 Duplicate titles

Recipe and Part titles are not required to be globally unique within an account.

Import:

- warns about exact or strong title matches;
- identifies likely duplicates;
- permits import anyway;
- does not force immediate renaming during bulk migration;
- never merges solely because titles match.

## 56.3 New identity by default

Ordinary imported content creates a new stable Recipe or Part identity.

It does not merge into existing history automatically.

## 56.4 Full restore

A true DishFrame account restore into an empty account may preserve stable identifiers and relationships.

Restoring into a populated account should generally create new identities or require an explicit conflict-resolution process.

---

# 57. Structured Import and Export Format

## 57.1 Technical terminology

Structured formats use the standard technical concept:

> yield

Example fields may include:

```text
yieldQuantity
yieldUnit
yieldLabel
```

The ordinary interface uses the friendlier:

```text
Makes 6 servings
```

## 57.2 Supported item data

The structured format supports:

- title;
- description;
- yield;
- cuisine;
- Flavor profiles;
- tags;
- Sections;
- ingredients;
- instructions;
- persistent notes;
- linked Parts where available;
- image metadata;
- nutrition;
- source information.

## 57.3 Imported Version start

Imported content with no Version history begins at:

```text
V1.0
```

## 57.4 Linked Parts

Linked Parts are most reliably preserved in DishFrame-to-DishFrame imports.

External formats without reusable-component relationships may import content as local Sections.

DishFrame does not invent linked Parts unless the mapping is explicit and reviewed.

---

# 58. Recipe Gallery Migration

## 58.1 Dedicated importer

Recipe Gallery migration is a dedicated migration utility rather than permanent domain behavior.

## 58.2 Behavior

The migration tool:

- reads the known Recipe Gallery format;
- previews mapped DishFrame Recipes;
- flags unsupported values;
- preserves original source text or raw records where useful;
- creates new DishFrame identities;
- does not invent historical Versions absent from the source.

The exact mapping depends on the real Recipe Gallery data.

---

# 59. Paste-and-Review Import

## 59.1 Foundational deterministic parsing

Users may paste recipe text from:

- Apple Notes;
- recipe websites;
- messages;
- plain-text files;
- other personal documents.

DishFrame uses deterministic recognition where possible for:

- headings;
- ingredient lines;
- numbered steps;
- common section patterns.

## 59.2 Review

The proposed structured Recipe must always be reviewed and editable before save.

Original pasted text remains available until import is confirmed.

## 59.3 AI-assisted parsing

AI-assisted paste parsing is an optional Tier 3 productization feature.

It is not required for the personal or family Tier 1/Tier 2 product because hosted model usage introduces recurring cost.

If later implemented, AI may:

- structure user-provided text;
- map it to the DishFrame schema;
- identify uncertain fields.

It may not:

- invent a new Recipe;
- improve flavor;
- revise instructions automatically;
- generate substitutions without user direction.

Output must be validated and reviewed before save.

---

# 60. Grocery-List Creation

## 60.1 Sources

Users may generate a grocery list from:

- one Recipe;
- one Part;
- several Recipes and Parts;
- future meal-plan selections.

## 60.2 Source amount

Before generation, users may set the desired amount for each source item.

The list receives scaled ingredient requirements.

## 60.3 Snapshot

A generated grocery list stores:

- exact source Recipe and Part Versions;
- selected scale;
- generated ingredient lines;
- source relationships;
- each line's saved substitute, if any, at the same selected scale (§62.2).

Later Recipe or Part changes do not silently rewrite the list. Both the
original line and its saved substitute, when one exists, remain stored side
by side for as long as the line exists — selecting one never discards the
other (§62.2). Substitute selection remains available, in both directions,
even after the source Recipe or Part is edited, superseded by a newer
Version, or permanently deleted (§60.6) — it never requires re-reading the
live Recipe or Part.

## 60.4 Same-major update prompt

If a list used `V1.13` and `V1.14` later exists, DishFrame may offer to refresh that source to `V1.14`.

A newer minor Version on another major line does not trigger that prompt.

Example:

- list uses `V3.2`;
- `V1.14` is created;
- no update prompt is shown.

The user may deliberately choose another major Version by editing the list source.

## 60.5 Update preview

Refreshing a source:

- previews ingredient additions, removals, and quantity changes;
- preserves awareness of manual list edits;
- does not silently discard those edits;
- requires confirmation.

## 60.6 Deleted sources

If a source Recipe or Part is later deleted, the grocery list retains its ingredient snapshot.

---

# 61. Combining Grocery Items

## 61.1 Safe combinations

DishFrame attempts to combine equivalent items when:

- names are sufficiently equivalent;
- units are compatible;
- safe unit conversion exists;
- optionality matches (§62.1) — a required and an optional occurrence never
  auto-combine, even when name/quantity/unit otherwise match exactly. An
  optional item must stay independently removable rather than being absorbed
  into a required combined item.

Example:

```text
2 tbsp soy sauce
1/4 cup soy sauce
```

may combine into one total (when both occurrences share the same
optionality).

## 61.2 Ambiguous lines

DishFrame does not automatically combine materially ambiguous items.

Examples:

```text
1 can tomatoes
400 g tomatoes
```

```text
2 onions
1 cup diced onion
```

A brand, variety, or preparation difference may also prevent combination.

## 61.3 Source preservation

Combined items preserve their source breakdown.

The user may reveal the individual source lines through an expandable or equivalent frontend treatment.

## 61.4 Uncombine

Users may choose:

> Keep separate

during generation or:

> Uncombine

afterward.

Uncombine is a correction and inspection tool rather than a prominent general-purpose splitting system.

## 61.5 Manual merge

The user may deliberately merge lines DishFrame did not combine when they know the items are equivalent.

A manual merge may deliberately combine a required and an optional
contribution (§61.1's auto-combine restriction does not apply to a
deliberate user action). The resulting line must represent that truthfully:
it is not displayed simply as "Optional" — its optionality is derived from
its actual contributions and displayed as a distinct "total including an
optional item" state. The source breakdown (§61.3) still identifies each
individual contribution's own optionality.

---

# 62. Optional Ingredients and Substitutes in Grocery Lists

## 62.1 Optional ingredients

Optional ingredients are included by default and visibly marked optional.

The user may remove them before or after list generation.

DishFrame does not silently omit them.

## 62.2 Substitutes

The primary ingredient is used by default.

The user may switch to the saved substitute:

- before generation;
- while editing the generated list.

DishFrame does not automatically add both, but generation itself keeps both
the primary ingredient and its saved substitute (at the same selected scale)
stored on the line, so a later switch never needs to re-read the source.

Switching after generation is **reversible**: the user may move back to the
original ingredient at any time, and back again, as many times as they like
— neither direction discards the other's stored values. This is offered only
when it can actually succeed — a single, not-yet-combined, not-manually-added
line with a saved substitute. DishFrame does not show a switch control that
is guaranteed to fail; a combined line's contributions must be uncombined
first.

---

# 63. Grocery Categories

## 63.1 Default categories

New accounts receive an immediately useful editable set such as:

- Produce
- Meat and Seafood
- Dairy
- Pantry
- Frozen
- Bakery
- Other

## 63.2 Customization

Users may:

- rename categories;
- reorder categories;
- create categories;
- delete categories.

**Formalized in the Slice 2 follow-up:** the "Other" category (§63.1) is
the account's single protected fallback category — it may be renamed and
reordered like any other, but never permanently deleted, since it is the
destination items fall back to (§63.4) and must always exist. It is
identified behaviorally (a stable flag), not by its literal name, so
renaming it does not affect its protected status.

## 63.3 Ingredient memory

DishFrame may remember the category previously selected for a normalized ingredient name for that user.

## 63.4 Uncategorized items

Items without a category appear under:

> Other

**Formalized in the Slice 2 follow-up:** this also applies when a category
is deleted — its existing Grocery List items move to the protected
fallback category (§63.2) rather than becoming uncategorized, and any
remembered ingredient categorizations (§63.3) pointing at the deleted
category are cleared so they can be relearned.

## 63.5 No retailer mapping

Tier 1 and Tier 2 do not provide:

- retailer-specific aisles;
- store maps;
- retailer ordering;
- price comparison.

---

# 64. Grocery-List Behavior

A grocery list supports:

- title;
- creation date;
- source Recipes and Parts;
- item checkoffs;
- manual items;
- editing names and quantities;
- safe combining;
- source-breakdown viewing;
- uncombine;
- category grouping;
- reordering;
- completion;
- reopening;
- duplication;
- deletion.

Completing a grocery list preserves it as history.

DishFrame does not:

- add purchased items to pantry inventory;
- deduct ingredients already owned;
- track consumed meals.

---

# 65. Organization and Practical-Tools Acceptance Criteria

Organization and practical tools are implementation-ready when the following behaviors are supported.

## Library

- Recipes and Parts have separate scopes.
- Grid and compact-list views are supported.
- Archived items remain opt-in.
- Cooking Sessions are not mixed into the libraries.

## Search

- Search uses title, cuisine, Flavor profiles, tags, Sections, and linked Part names as applicable.
- Ingredient names and historical Versions are excluded.
- Current content only determines normal results.
- Strong title and cuisine matches rank before Flavor profiles, broader tags, or structural matches.

## Tags and cuisine

- Tags are user-owned and stable-item-level.
- Tags support create, rename, merge, and delete.
- The intended product uses flat tags.
- Custom tag groups remain optional.
- Favorite is a protected built-in tag.
- Cuisine is one optional stable-item value.

## Filters and sorting

- Stage, tags, cuisine, Flavor profiles, and rating are supported filters.
- There is no separate Cooked/Never cooked filter.
- Multiple tags use match-all behavior.
- Recently updated is the default sort.
- Highest- and lowest-rated sorts are supported.
- Any displayed provisional principal rating participates in discovery but not analytics.
- Unrated items remain last in rating sorts.

## Scaling and units

- Temporary scaling is available outside Cooking Sessions.
- Temporary scaling does not create a Version.
- Users may save a default batch scale without changing authored Version content.
- Scaling handles values, ranges, approximation, counts, and free text.
- Calculated quantities use practical fractions or concise decimals.
- Compatible conversion and simplification are suggested rather than forced.
- Preferred compatible units can be saved without creating a Version.
- Unsafe mass-to-volume conversions are not automatic.

## Nutrition

- Manual calories and macros are supported.
- Whole-item and per-output bases are supported.
- Nutrition scales correctly.
- Tier 2 FoodData Central lookup is editable and source-aware.
- Additional recognized nutrients appear in an expandable area when source data exists.
- Text search remains primary.
- Barcode scanning is an optional late Tier 2 convenience with fallback.

## Export and import

- Full private account backup preserves all portable DishFrame product data while excluding credentials, active sessions, and secret link tokens.
- Standard item export aggregates ratings and excludes private history.
- Detailed and full-private export levels are explicit.
- Import always includes preview and confirmation.
- Duplicate titles produce warnings rather than forced merges.
- Structured formats use yield terminology.
- DishFrame-to-DishFrame imports may preserve linked Parts.
- Recipe Gallery has a dedicated importer.
- Deterministic paste import is foundational.
- AI-assisted parsing is optional Tier 3.

## Grocery lists

- Lists can be generated from one or many Recipes and Parts.
- Lists store exact Version snapshots.
- Same-major minor updates may prompt refresh.
- Source refresh shows a preview.
- Safe equivalent items combine.
- Source breakdown remains available.
- Users may keep items separate or uncombine.
- Optional ingredients remain marked optional.
- Substitutes do not both appear automatically.
- Grocery categories begin useful and remain fully customizable.
- Completed lists remain historical.
- Pantry inventory remains outside scope.

---

# 66. Full Part Identity and Creation

## 66.1 Recipe-like behavior

A Part behaves like a smaller Recipe in nearly every important respect.

A stable Part owns:

- owner;
- current Part Version reference;
- Part Stage;
- cuisine;
- Flavor profiles;
- tags;
- protected Favorite-tag relationship;
- archive state;
- default batch scale;
- preferred display units;
- source relationship when duplicated;
- creation and update metadata.

A Part Version may contain:

- title;
- description;
- image;
- authored yield;
- preparation and cooking time;
- difficulty;
- nutrition;
- local Sections;
- ingredients;
- instructions;
- linked Part Versions;
- Version note.

Parts use the same general systems as Recipes for:

- major/minor Version lines;
- historical refinement;
- Stage;
- archive;
- duplication;
- Cooking Sessions;
- Session Reviews;
- ratings;
- nutrition;
- scaling;
- organization.

The Part editor uses the same general editing system as the Recipe editor, adapted to Part terminology.

## 66.2 Minimum creation requirements

A new Part requires:

- title;
- Part Stage;
- at least one meaningful local ingredient, local instruction, or linked Part.

It begins at:

```text
V1.0
```

Default Stage:

> Idea

A Part may be simple or structured.

## 66.3 Examples

Simple:

```text
White Rice

- 1 cup rice
- 1 1/4 cups water
- Cook
```

Structured:

```text
Lemongrass Chicken

Section: Marinade
Section: Refrigerate
Section: Air-fry
```

---

# 67. Nested Parts and Cycle Prevention

## 67.1 Allowed composition

A Recipe or Part may contain:

- local Sections;
- top-level linked Parts;
- Parts nested inside Sections;
- multiple Parts inside one Section;
- local content and linked Parts in the same Section.

Each linked Part:

- references an exact Part Version;
- has an ordering position;
- remains distinguishable from local content;
- may be independently selected during Cooking setup.

## 67.2 Nested use case

Example:

```text
Part: Lemongrass Chicken

Section: Marinade
- local marinade ingredients
- local instructions

Linked Part:
- Basic Air-Fried Chicken
```

This supports a reusable cooking technique wrapped by a more specific preparation.

## 67.3 Cycle prohibition

DishFrame prohibits direct and indirect circular Part references.

Invalid:

```text
Part A contains Part A
```

Invalid:

```text
Part A contains Part B
Part B contains Part A
```

The domain model must represent an acyclic Part graph.

The product does not impose an arbitrary shallow nesting depth, although the frontend may optimize the common experience around shallow nesting.

---

# 68. Attaching and Editing Linked Parts

## 68.1 Version selection

When attaching a Part, DishFrame selects the current Part Version by default.

The user may deliberately choose a historical Part Version.

The containing Recipe or Part Version records the exact selected Part Version.

Later Part updates never silently replace that reference.

## 68.2 No inline shared-Part editing

A linked Part is not edited inline as though its content belongs only to the current Recipe.

From a Recipe editor, the user may:

- open the Part;
- choose another Part Version;
- detach it into local content;
- remove it;
- add local content around it.

## 68.3 Open Part

The Recipe editor may provide:

> Open Part

This opens the ordinary full Part editor, not a second inline editing mode.

The editor:

- makes clear that the Part may be used by other Recipes;
- may show the number of current usages;
- preserves a return path to the originating Recipe;
- uses the normal Part Version save flow;
- presents normal propagation choices after save.

This retains the useful Recipe context without hiding the fact that the user is editing a shared object.

## 68.4 No Recipe-specific overrides

DishFrame does not support invisible Recipe-specific overrides inside a live shared Part.

For one-Recipe customization, the user may:

- detach the Part;
- duplicate the Part;
- choose another Part Version;
- add local Recipe content around the Part.

## 68.5 Linked Part display name (settled decision, closes the Slice 5 open question)

A linked Part's *displayed name* and its *linked content* resolve from two different sources, and must not be confused:

- **Displayed name**: the target Part's stable current identity — `Dish.currentTitle` — the same live value used everywhere else the Part's own identity is shown (§7.1). This is a live lookup, not something pinned at attach time.
- **Linked content**: the exact selected `DishVersion` (§68.1) — Ingredients, Instructions, and every other Version-owned property. This remains pinned exactly as before and never changes when the Part is renamed.

Example:

- a Recipe links to Part Version V1.2;
- the Part is later renamed from "Sauce" to "Smoky Tomato Sauce";
- the Recipe now displays "Smoky Tomato Sauce" as the linked Part's name;
- its linked Ingredients, Instructions, quantities, and other Version-associated content still come from exact Part Version V1.2, unchanged.

This applies everywhere a linked Part's name is shown, including inside search results and structural search matching (§44) — never from `DishVersion.title`, which is stable-identity-era legacy content, not a per-Version name snapshot (§7.1, §7.3). A Part rename does not create a Version, does not change which Part Version any Recipe link targets, and does not rewrite any linked Recipe's or parent Part's own content or Version.

---

# 69. Creating a Part from Local Content

## 69.1 Save as reusable Part

Users may convert useful local Recipe content into a reusable Part.

Conceptual action:

> Save as reusable Part

This is especially useful when a repeated pattern becomes apparent while the user is building or reviewing a Recipe.

## 69.2 Create and link

Normal behavior:

- create a new stable Part at V1.0;
- copy the selected local content into the Part;
- replace that local content with an exact Part Version reference;
- create a new immutable Recipe Version;
- preserve the prior Recipe Version unchanged.

Although the rendered cooking instructions may initially remain equivalent, the Recipe’s structure and provenance have changed. A new Recipe Version is the practical and traceable representation.

## 69.3 Save a copy as Part

An alternate action may:

- create the new Part;
- leave the Recipe content local and unchanged;
- avoid a new Recipe Version unless the Recipe itself changes.

This supports creating a reusable starting point without restructuring the current Recipe.

---

# 70. Detaching a Part

## 70.1 Behavior

A linked Part may be detached into local Recipe or parent-Part content.

Detaching:

- copies the exact linked Part Version’s resolved content;
- removes the live Part reference;
- creates a new containing Recipe or Part Version;
- leaves the original Part unchanged;
- leaves prior Versions unchanged;
- ends future Part-update suggestions for that occurrence.

## 70.2 Purpose

Detaching is the normal escape hatch when:

- the user wants Recipe-specific subtraction or modification;
- the shared Part is mostly useful but not exact;
- the Part is being removed from active reuse;
- a referenced Part is being permanently deleted.

---

# 71. Discovering Part Usage

Part Detail should include:

> Recipes using this Part

For current Recipe usages, DishFrame can identify:

- stable Recipe;
- current Recipe Version;
- exact Part Version referenced;
- Section or placement;
- whether a newer eligible Part Version exists.

Historical usages may remain discoverable through deeper history.

The primary view emphasizes current Recipe Versions.

---

# 72. Part Update Propagation

## 72.1 No automatic propagation

Saving a new Part Version never silently changes a Recipe or parent Part.

Existing Versions continue to reference the exact Part Version they used.

## 72.2 Minor Part update

Example:

```text
Recipe uses White Rice V2.3
New Part Version: V2.4
```

DishFrame treats this as a routine refinement on the same Part direction.

Current Recipes or Parts referencing older `V2.x` Versions are eligible for an update suggestion.

## 72.3 Major Part update

Example:

```text
Recipe uses White Rice V2.4
New Part Version: V3.0
```

DishFrame may offer the same update choices but must communicate more strongly that this is a new Part direction.

It should not be presented as an obvious or automatic replacement.

## 72.4 Update actions

After saving a Part Version, offer:

- **Update everywhere**
- **Choose Recipes and Parts to update**
- **Do not update existing Recipes**

Update everywhere normally targets:

- current Versions;
- non-Archived Recipes and parent Parts;
- references owned by the same user.

Archived items are excluded unless deliberately included.

For a new major Part Version, Update everywhere requires clear confirmation.

## 72.5 Choose items

Choose Recipes and Parts to update shows eligible current Recipes and parent Parts and permits individual selection.

If the same Part occurs more than once in one item, DishFrame may initially select every matching occurrence while allowing occurrences to be excluded individually.

## 72.6 Postponement

The user may postpone indefinitely.

Examples:

```text
White Rice V2.4 available
```

```text
4 Recipes use an older V2 Version
```

These are restrained indicators rather than blocking warnings.

---

# 73. Recipe Versions Created by Part Propagation

## 73.1 Immutable Recipe update

Every selected propagation update creates a new immutable Recipe or parent-Part Version.

## 73.2 Default classification

A propagation-only change defaults to:

> Save small update

This remains true whether the incoming Part change was minor or major.

The Part’s major/minor classification does not determine how substantially the complete Recipe changed.

## 73.3 Manual authority

The user may override the default and classify an affected Recipe as a new major Version.

A bulk review may apply one default while permitting per-item overrides.

## 73.4 Scope of change

Propagation changes only the selected exact Part references.

It does not:

- rewrite historical Versions;
- alter Cooking Sessions;
- update unrelated Part references;
- change detached local content;
- replace excluded occurrences;
- alter unrelated Recipe content.

## 73.5 Seeded Version note

The seeded note follows the normal Recipe Version transition format.

Example:

```text
V2.3 → V2.4:
Updated White Rice V3.1 → V3.2.
```

If several Parts changed, list each change under the Recipe transition.

The note remains editable.

---

# 74. Archiving, Deleting, and Duplicating Parts

## 74.1 Archive

Archiving a Part:

- changes Stage to Archived;
- hides it from ordinary Part browsing and new attachment;
- preserves Part Versions;
- preserves Recipe references;
- preserves Cooking Session history.

Recipes already using the Part can continue to display and cook the exact referenced Version.

The Part may be restored.

## 74.2 Current references before deletion

A referenced Part cannot be permanently deleted until every current usage is resolved.

For each current Recipe or parent Part, the user may:

- detach into local content;
- replace with another Part;
- remove the occurrence.

DishFrame recommends detaching because it normally preserves the existing cooking meaning.

The deletion flow should:

- list every affected current item;
- explain the result;
- permit opening and reviewing each item;
- create new Versions for changed current items.

## 74.3 Historical materialization

Permanent deletion does not require orphaned, navigable, or tombstoned Part records.

Before deletion, DishFrame materializes historical Part references inside immutable historical Recipe Versions, parent-Part Versions, and Cooking Sessions as static local snapshots.

A snapshot retains useful provenance such as:

```text
Originally used:
White Rice V1.4
```

and the resolved content that White Rice V1.4 contributed at that time.

The historical record retains:

- former Part title;
- exact former Part Version label;
- resolved ingredients and instructions;
- former placement where useful.

It no longer retains:

- a live Part relationship;
- a separately navigable deleted Part;
- update behavior;
- management behavior.

This is an acceptable deletion-time storage transformation because visible cooking content, provenance, and historical meaning remain intact while unwanted Part records are truly removed.

## 74.4 Standalone history

Permanent Part deletion also deletes history that belongs only to that standalone Part, including:

- standalone Part Cooking Sessions;
- standalone Part Session Reviews;
- standalone Part ratings;
- standalone Part Cooking notes and derived summaries.

Historical Recipe, parent-Part, and Recipe-session references survive only through the static materialized snapshots described above.

## 74.5 Final deletion

After current usages are resolved and historical references are materialized:

- delete the stable Part;
- delete its standalone Part Versions and management records;
- delete its standalone activity history;
- remove it from the Part library and attachment controls.

## 74.6 Duplicate Part

A user may duplicate a current or historical Part Version.

The duplicate:

- becomes a new stable Part;
- begins at V1.0;
- defaults to the source Stage;
- copies the selected Version content;
- retains structural source attribution;
- does not receive source sessions or ratings as its own;
- may display a provisional inherited rating when source evidence exists.

Recipes using the original remain unchanged.

## 74.7 Duplicate Recipe containing Parts

Duplicating a Recipe within the same account keeps references to the same owned Parts by default.

It does not deep-copy every linked Part.

The user may later:

- duplicate a specific Part;
- replace a reference;
- detach it into local content.

---

# 75. Rating Parts Within Recipe Sessions

Tier 1 keeps the ordinary Session Review centered on the Recipe as a whole.

Tier 2 may provide an optional secondary area:

> Rate individual Parts

It includes only exact Part Versions used in the Cooking Session.

Each Taster may optionally rate those Parts.

Part ratings:

- remain tied to the Cooking Session;
- belong to exact Part Versions;
- count toward Part summaries;
- remain independent of the overall Recipe rating.

Local Sections are not rated as stable items.

Section-specific feedback belongs in Cooking notes or Session Review text.

The Part-rating control remains collapsed or otherwise secondary by default.

---

# 76. Meal Plan Identity

## 76.1 Record

A Meal Plan is a user-owned editable planning record for a defined period.

It supports:

- custom title;
- start date;
- end date;
- optional notes;
- Recipe entries;
- standalone Part-preparation entries;
- linked grocery lists;
- creation and update timestamps.

Common period presets may include:

- one week;
- two weeks;
- custom range.

Meal Plans are editable records rather than immutable Versions.

## 76.2 Entry types

A Recipe entry records:

- stable Recipe;
- exact Recipe Version;
- intended cook date;
- target batch yield;
- planned meals or serving allocations;
- optional note;
- linked Cooking Session when started from the plan;
- status.

A standalone Part entry records equivalent information for a Part Version.

Standalone Part preparation supports workflows such as:

- batch-cooking chicken;
- preparing rice;
- chopping vegetables;
- making a sauce before final assembly.

## 76.3 Exact Version

A plan entry selects an exact Recipe or Part Version.

Later changes do not silently replace it.

When a newer minor Version appears on the same major line, DishFrame may offer to update the entry.

A new major direction does not automatically replace or routinely prompt over the selected direction.

---

# 77. Planned Meals and Batch Coverage

## 77.1 Planned meals

A cooking entry may assign its expected servings to future meals.

Example:

```text
Cook Sunday:
Ginger Soy Mirin Bowl
Makes 6 servings

Planned meals:
Sunday dinner — 1 serving
Monday lunch — 1 serving
Monday dinner — 1 serving
Tuesday lunch — 1 serving
Tuesday dinner — 1 serving
Wednesday lunch — 1 serving
```

The internal concept may be represented as serving allocations.

## 77.2 Allocation feedback

DishFrame may warn when planned allocations:

- exceed expected yield;
- leave expected yield unallocated.

It does not block the plan.

The user may intentionally want flexible leftovers or extra food.

## 77.3 No consumption tracking

Planned meals describe intent.

They do not become consumed/not-consumed records.

DishFrame does not require the user to confirm that each serving was eaten.

## 77.4 Multiple occurrences

The same Recipe or Part may appear more than once in one plan:

- at different scales;
- on different dates;
- using different Versions;
- for different planned meals.

DishFrame does not deduplicate these entries.

---

# 78. Meal Plan Status and Cooking Sessions

Recommended cooking-entry statuses:

- **Planned**
- **In progress**
- **Cooked**
- **Skipped**

Starting a Cooking Session from a plan entry:

- links the session;
- changes the entry to In progress.

A Completed session marks the cooking entry Cooked.

An Ended-early session does not automatically mark it Cooked.

The user may manually mark an entry Cooked or Skipped when cooking occurs outside DishFrame.

Individual planned meals do not require statuses.

Past Meal Plans remain accessible.

Users may:

- view;
- rename;
- duplicate into a new date range;
- delete.

---

# 79. Flavor Profiles

## 79.1 Product concept

Flavor profiles are a dedicated optional multi-select classification rather than ordinary undifferentiated tags.

Examples:

- Sweet
- Savory
- Spicy
- Tangy
- Smoky
- Rich
- Fresh
- Umami

A Recipe or Part may have multiple profiles:

```text
Sweet · Spicy · Tangy
```

## 79.2 Stable metadata

Flavor profiles belong to the stable Recipe or Part.

Changing them does not create a Version.

## 79.3 Starter values and customization

New accounts receive a useful starter set.

Users may:

- create values;
- rename values;
- reorder values;
- delete values.

The Flavor profiles category itself remains a built-in DishFrame product concept.

The implementation may reuse typed tag infrastructure without exposing arbitrary tag grouping as a required product feature.

## 79.4 Discovery and planning

Flavor profiles may be used in:

- Recipe and Part filtering;
- search where appropriate;
- Meal Plan recommendations;
- recommendation explanations.

---

# 80. Meal Plan Recommendations

## 80.1 Explainable priority

Recommended priority:

1. Active Recipes, least recently cooked first.
2. Proven Recipes.
3. Experimental Recipes when development or variety is desired.
4. Idea Recipes only through deliberate exploration.
5. Archived Recipes excluded by default.

DishFrame may further filter or rank using:

- tags;
- cuisine;
- Favorite;
- aggregate or primary rating;
- Flavor profiles;
- nutrition;
- estimated duration;
- target yield.

## 80.2 Explanation

Recommendations should explain themselves.

Example:

```text
Active · not cooked in 28 days · 4.7/5 · Sweet + Spicy
```

The ordinary explanation order emphasizes:

1. Stage;
2. how recently it was cooked;
3. rating;
4. one or two Flavor profiles.

## 80.3 Favorite

Favorite may:

- be filtered explicitly;
- break ties;
- appear consistently.

Favorite does not override Stage.

An Experimental Favorite does not automatically outrank every Active Recipe.

## 80.4 User control

DishFrame suggests; it does not silently fill a Meal Plan.

The user approves additions and changes.

---

# 81. Grocery Lists Generated From Meal Plans

## 81.1 Generation

Users may generate a grocery list from:

- an entire Meal Plan;
- selected plan entries;
- a chosen date range.

Generation uses:

- exact planned Versions;
- target yields;
- optional-ingredient choices;
- substitute choices;
- standalone Part entries.

## 81.2 Active synchronization

A grocery list directly linked to a Meal Plan remains synchronized with that Meal Plan while active.

Editing the Meal Plan updates generated grocery content.

This includes:

- added plan entries;
- removed plan entries;
- changed target yields;
- changed selected Versions;
- changed optional ingredients or substitutes.

Manual grocery items remain separate and are preserved.

## 81.3 Recipe changes

A new Recipe or Part Version does not bypass the Meal Plan.

DishFrame may prompt the user to update the relevant Meal Plan entry according to the normal same-major Version rules.

If the user adopts the new Version in the Meal Plan, the linked active grocery list updates through Meal Plan synchronization.

## 81.4 Checked items

Synchronization remains active after shopping begins.

DishFrame should preserve checkoff state where an equivalent generated item remains.

If a checked generated item materially changes or disappears, DishFrame should visibly flag the change rather than silently erasing evidence.

## 81.5 Completion boundary

Completing the grocery list freezes it as a historical record.

Later Meal Plan changes do not alter a completed list.

This preserves what the user actually shopped for.

## 81.6 Standalone lists

A standalone grocery list not linked to a Meal Plan stores a generated snapshot and does not silently rewrite itself from later Recipe or Part changes.

---

# 82. Sharing Principles

## 82.1 Independent copies

DishFrame shares independent copies rather than shared ownership.

There is no Tier 1 or Tier 2 requirement for:

- joint Recipe editing;
- edit-conflict resolution;
- shared family workspaces;
- friend graphs;
- followers;
- social feeds.

## 82.2 Private by default

Every Recipe and Part begins private.

Visibility changes require deliberate user action.

DishFrame never infers public or shared visibility from:

- Stage;
- tags;
- Cooking Sessions;
- usage in another item;
- prior sharing.

---

# 83. Read-Only Share Links

## 83.1 Supported items

Users may create unlisted read-only links for:

- Recipes;
- Parts.

A viewer does not need a DishFrame account.

## 83.2 Link management

The owner may:

- create;
- copy;
- revoke;
- regenerate;
- set optional expiration;
- inspect active links.

Regenerating invalidates the replaced token.

Multiple links may exist when separate expiration or content settings are useful.

## 83.3 Fixed snapshot

Mode:

> Share this Version

At link creation, DishFrame freezes the exact displayed snapshot, including:

- the selected Recipe or Part Version content;
- cuisine;
- Flavor profiles;
- selected tags;
- displayed aggregate rating and count;
- other stable metadata shown by the link.

The link never changes with later content edits, stable-metadata edits, or new ratings.

It works for current or historical Versions.

Default:

> Share this Version

## 83.4 Current link

Mode:

> Keep link current

Behavior:

- follows the stable item’s current highest-major Version;
- reflects current stable metadata;
- reflects the current displayed aggregate rating and count;
- updates when relevant content or metadata changes;
- remains clearly labeled as live.

## 83.5 Default content

A normal read-only link may include:

- title;
- description;
- image;
- ingredients;
- instructions;
- yield shown as Makes;
- time;
- cuisine;
- Flavor profiles;
- selected tags;
- nutrition;
- aggregate rating and count;
- creator attribution where enabled.

It excludes:

- Taster identities;
- individual ratings;
- Cooking notes;
- Session Reviews;
- Cooking Session history;
- private Version history;
- active sessions;
- grocery lists;
- Meal Plans.

The owner may hide aggregate ratings.

---

# 84. Saving Shared Items as Independent Copies

## 84.1 Viewer action

A signed-in viewer may choose:

> Save to My Recipes

or:

> Save to My Parts

A logged-out viewer is prompted to authenticate before saving.

## 84.2 Copy behavior

The saved copy:

- becomes independently owned;
- begins at V1.0;
- copies the exact shared Version;
- retains structural source attribution;
- does not synchronize with future sender edits;
- receives no sender-private history;
- receives a static provisional aggregate source-rating snapshot when source evidence exists.

## 84.3 Linked Parts across accounts

A Recipe copy cannot retain live private references to Parts owned by the sender.

DishFrame creates recipient-owned copies of every linked Part Version required by the Recipe.

Each copied Part:

- begins at V1.0;
- retains structural source attribution;
- is linked from the recipient’s new Recipe;
- is copied only once even if used multiple times.

No sender-owned Part remains live-linked.

Nested linked Parts follow the same self-contained-copy rule.

---

# 85. Direct Account-to-Account Sharing

A user may send a Recipe or Part directly to another DishFrame account.

The recipient sees:

- sender identity;
- item preview;
- optional note;
- Accept and save a copy;
- Decline or dismiss.

The sender may cancel a pending share.

Accepting creates the same independent copy used by share links.

There is no ongoing synchronization.

The exact recipient lookup mechanism belongs in implementation and privacy review.

## 85.1 Unified single-/multi-Recipe sending (Slice 22)

Direct Recipe sharing is one unified flow supporting one or many Recipes,
not a separate "bulk share" feature alongside ordinary sharing. Every sent
Recipe collection — including a one-Recipe send — is grouped as one
collection with:

- one sender;
- one recipient (once bound) or pending recipient email;
- one optional note for the whole collection;
- one sent timestamp;
- individually tracked per-Recipe status (pending/accepted/declined/canceled).

Entry points:

- from `/share`, the ordinary primary send action, starting with nothing
  preselected;
- from a Recipe detail page's existing direct-share action, opening the
  same flow with that Recipe preselected.

The sender enters an exact recipient email, selects one or more owned,
currently shareable Recipes (a searchable selector using title, image,
lifecycle/Stage, and current-Version existence — never a full Recipe-graph
load), may Select all or deselect individual Recipes, adds one optional
note, reviews the exact recipient email and selected count, and sends
atomically: every selected Recipe's graph is frozen and validated together,
and one failure leaves no partial collection.

A server-enforced batch maximum (50 Recipes) applies regardless of client
behavior.

Part sharing keeps its existing single-item flow — this multi-select
collection behavior is Recipe-specific.

## 85.2 Pending invitations for a not-yet-registered recipient

When the entered email matches no existing DishFrame account, DishFrame
never creates a placeholder account, password, or session for that email.
Instead, after the sender explicitly confirms the exact email, DishFrame
creates a pending collection addressed to that email, with no bound
recipient yet. The sender sees wording such as:

> They'll receive this after signing in to DishFrame with this Google
> email.

The sender may cancel this pending invitation at any time before it is
claimed. A canceled invitation can never later become claimable by a
future account using the same email.

When that email later signs in to DishFrame through Google with a verified
email, DishFrame binds every still-pending collection addressed to it to
the real account — automatically, transactionally, and idempotently, as
part of DishFrame's ordinary new-account setup. Binding never automatically
accepts any Recipe; the collection simply becomes an ordinary pending
Received collection from that point on, using the real account's identity
for authorization from then on, not email matching.

## 85.3 Recipient review: accept all, accept a subset, or decline all

The recipient's review of a collection may:

- Accept all;
- select individual Recipes and accept only those — every remaining
  pending Recipe in the collection is declined as part of that same
  explicit action, made clear before submission, never left ambiguously
  pending;
- Decline all.

Every Recipe defaults to selected, so accepting an entire family-shared
collection is one click.

## 85.4 Sender and recipient collection summaries

A Sent collection shows the recipient's identity when registered, or the
exact pending email when not yet registered; the note; Recipe count; a
pending/accepted/declined/canceled summary; and whether the recipient has
joined. The sender may cancel an entirely unclaimed collection, or all
remaining pending Recipes in an already-claimed collection, without
affecting any already-accepted copy.

A Received collection shows the sender's identity, the note, sent date,
total Recipe count, and pending/accepted/declined counts, with a clear
Review action.

---

# 86. Public Publication — Tier 3

## 86.1 Priority

Public publication and public discovery are Tier 3 productization features.

They are not required for the intended personal/family Tier 1 and Tier 2 product because read-only links and direct sharing already provide proper sharing.

## 86.2 Equal Recipe and Part support

If implemented, public publication supports:

- Recipes;
- Parts.

Parts receive equal treatment because reusable preparations are a central DishFrame differentiator and may be valuable independently.

## 86.3 Published snapshot

Publishing freezes one reviewed public snapshot containing:

- one exact Recipe or Part Version;
- the stable metadata selected for publication;
- the displayed aggregate rating and count when enabled.

Later Version, metadata, or rating changes do not alter the publication automatically.

DishFrame may offer:

> Update public item

The owner reviews and explicitly replaces the published snapshot.

## 86.4 Unpublish

The owner may unpublish at any time.

Archiving a published item asks:

> Also unpublish this item?

The control may be selected by default, but archiving does not force removal.

Permanent deletion:

- unpublishes the item;
- removes its public page.

Account deletion removes all publications.

## 86.5 Public content

A public Recipe or Part may show:

- published Version content;
- title;
- description;
- image;
- ingredients;
- instructions;
- yield;
- times;
- nutrition;
- cuisine;
- Flavor profiles;
- selected public tags;
- creator attribution;
- aggregate rating and count when enabled;
- Save to My Recipes or Parts.

It excludes:

- private Version notes by default;
- unpublished Versions;
- Cooking Sessions;
- Session Reviews;
- Taster identities;
- individual ratings;
- private tags not selected for publication;
- Meal Plans;
- grocery lists.

## 86.6 Public directory

A basic directory may search and filter by:

- item type;
- title;
- cuisine;
- Flavor profiles;
- public tags;
- aggregate rating.

It is not:

- an infinite engagement feed;
- a popularity-ranking system;
- a social network.

## 86.7 Moderation status

A small moderation lifecycle may use:

- Published;
- Under review;
- Removed by moderation;
- Unpublished by owner.

Ordinary publication does not require manual preapproval.

Tier 3 public release requires:

- report action;
- administrator removal;
- reasonable rate limits;
- clear ownership and privacy language;
- an understandable status explanation for the owner.

Comments, appeals, reputation scoring, and advanced social moderation are not required.

---

# 87. Print and PDF Presentation

Recipes and Parts support a simplified printable view.

It:

- removes application navigation;
- removes editing controls;
- preserves readable ingredients and instructions;
- includes appropriate basic metadata;
- works with browser printing;
- supports browser Save as PDF.

It does not reveal private history unless the user deliberately uses a private detailed export.

---

# 88. Profile, Security, and Preferences

## 88.1 Separation of concerns

DishFrame distinguishes:

### Profile and security

- name;
- profile image where supported;
- email and authentication details;
- signed-in sessions;
- password or provider management where supported;
- account export;
- account deletion.

### Product preferences

- theme;
- preferred measurement system;
- fraction/decimal preference;
- primary rating preference;
- timer sound;
- Session Review prompt preference;
- grocery categories.

The exact page layout is a frontend decision.

## 88.2 Nutrition display

Nutrition display does not require a durable account-level preference in Tier 1 or Tier 2.

Use progressive disclosure:

- calories compactly visible where appropriate;
- protein, carbohydrates, and fat in the expanded nutrition area;
- additional source nutrients under More nutrients.

DishFrame may remember lightweight expanded/collapsed UI state without elevating it into an important profile preference.

---

# 89. Authentication Session Management

Users may inspect signed-in account sessions across devices.

They may:

- sign out the current session;
- sign out another session;
- sign out all other sessions.

Displayed metadata may include:

- device or browser description;
- approximate last-active time;
- approximate location only where safe and reliable.

DishFrame does not expose:

- session tokens;
- precise IP addresses.

Authentication sessions remain distinct from Cooking Sessions.

---

# 90. Sharing, Publication, and Image Management

## 90.1 Sharing management

Account controls provide a place to inspect:

- active read-only links;
- expired links;
- pending direct shares;
- received shares;
- revoked or completed share state where useful.

Tier 3 may add:

- public Recipes;
- public Parts;
- publication status;
- moderation status.

Users can revoke or cancel sharing without locating the item first.

## 90.2 Images

DishFrame must:

- identify which Recipe or Part Version uses an image;
- allow replacement or removal through the owning item, in place, on the
  current Version or any historical Version (§7.2, §12.2 — image is
  Version-associated but mutable, not frozen once saved);
- authorize attaching an image to a Version by verifying the signed-in
  user is actually allowed to use that asset — they uploaded it, or a
  `DishVersion` they already own references it (Version-trigger and
  Slice 5 image correction pass §4) — never merely because a
  client-supplied asset id exists;
- authorize reading a private image by the signed-in user owning at least
  one `DishVersion` that references the asset, not only by original
  upload attribution, since duplication/accepted-share intentionally
  reuses the same asset across accounts; a public `ShareLink`-token read
  path is deferred until the sharing slice (Tier 2), not built early as a
  placeholder;
- avoid orphaned uploads when Versions or items are deleted, **and** when
  an image is replaced or removed in place on a surviving Version —
  reference-counted cleanup runs in both cases, not deletion alone;
- preserve appropriate image references or files in backup/export.

A separate media library is optional.

Clear ownership and cleanup are required.

---

# 91. Account Deletion

Account deletion requires:

- explicit destructive confirmation;
- recent authentication or reauthentication where practical;
- clear explanation of removal;
- opportunity to export first.

Deletion removes the owner’s:

- Recipes;
- Parts;
- Versions;
- Cooking Sessions;
- Reviews;
- Tasters;
- ratings;
- grocery lists;
- Meal Plans;
- images;
- share links;
- pending shares;
- public publications;
- preferences;
- account records.

Independent copies already accepted by other users remain their property.

After source-account deletion, another user’s independent copy must not retain a personally identifying live profile link.

It may display generic provenance such as:

> Originally copied from another DishFrame user

---

# 92. Onboarding Principles

## 92.1 Timing

Onboarding is implemented after core product language and workflows stabilize.

## 92.2 Initial introduction

A brief, prominent, skippable introduction explains:

- DishFrame’s Save → cook → evaluate → revise → reuse loop;
- why Versions exist;
- what reusable Parts are;
- why Parts save repeated work.

Parts require explicit upfront explanation because users cannot be expected to infer the concept from a control label.

The introduction may offer direct entry into deeper feature guides.

It does not force the user through every workflow before normal use.

## 92.3 Early preference setup

An early, compact onboarding step may ask the user to choose:

- preferred measurement system;
- fractions or decimals;
- primary rating display;
- timer sound;
- Session Review prompting.

These settings remain editable later under Preferences.

Tags are taught contextually rather than configured up front.

## 92.4 Temporary interactive example

DishFrame does not silently create sample Recipes or Parts in the user’s library.

Onboarding may use obviously fictional temporary Recipe data solely to demonstrate live product behavior.

Temporary tutorial data:

- is clearly labeled as an example;
- may use intentionally generic or playful placeholder content;
- is never saved to the user’s library;
- disappears when the demonstration ends.

## 92.5 Progress memory

DishFrame remembers which onboarding guides were:

- completed;
- dismissed;
- left incomplete.

Completed explanations do not repeatedly interrupt the user.

---

# 93. Contextual Onboarding and Help

## 93.1 Contextual teaching

Teach concepts when they become useful.

Examples:

- first Recipe creation: Sections and Stage;
- first meaningful edit: Versions;
- initial introduction and first Parts visit: reusable Parts;
- first Start cooking action: Cooking Sessions;
- first completed session: Session Review;
- first saved ratings: Tasters and rating summaries;
- first Meal Plan visit: plan entries and planned meals;
- first grocery list: generation and synchronization;
- Share action: independent copies;
- Tier 3 Publish action: public visibility.

## 93.2 Parts emphasis

The first introduction must explain Parts at a big-picture level.

A later Parts-specific guide may show:

- creating a standalone Part;
- linking a Part;
- saving local content as a Part;
- propagation;
- detaching.

## 93.3 Sharing explanation

Users do not need a tutorial explaining the familiar concept of a Share button.

When sharing is invoked, DishFrame briefly explains:

- the recipient receives or saves an independent copy;
- sender and recipient changes do not synchronize.

## 93.4 Help area

A permanent Help area provides:

- feature-organized explanations;
- FAQs;
- DishFrame terminology;
- replayable interactive guides;
- direct links to relevant sections.

Replayable interactive guidance is preferred over requiring videos because it remains easier to maintain as the product evolves.

Videos may be added later as optional support.

---

# 94. Structured Version Comparison

## 94.1 Comparable items

Users may compare any two Versions belonging to the same stable Recipe or Part.

## 94.2 Changed content first

The default comparison shows changed fields only.

It includes every material difference.

Unchanged content may be revealed on demand for context.

## 94.3 Structural grouping

Differences are grouped by cooking meaning rather than by raw character changes.

A useful information hierarchy is:

1. metadata;
2. Sections;
3. linked Parts;
4. ingredients;
5. instructions;
6. nutrition.

This is a priority hierarchy rather than an inflexible rendering order.

## 94.4 Difference types

Comparison can show:

- description changes;
- yield changes;
- time changes;
- Version-owned metadata such as description, yield, times, and difficulty;
- mutable Version-note annotations;
- Section additions, removals, and reordering;
- linked Part additions, removals, Version changes, and reordering;
- ingredient additions and removals;
- quantity and unit changes;
- preparation-note changes;
- instruction additions, removals, changes, and reordering;
- nutrition changes.

Comparison deliberately excludes title and image (Version-trigger and
Slice 5 image correction pass): title is stable Recipe/Part identity
(§7.1), never Version-owned, so there is nothing to diff between two
Versions of the same item. Image is Version-associated but mutable (§7.2)
— it can be edited in place independently of Version content, so diffing
it would report whatever happens to be true *now* on each side rather
than a material difference in recipe content between the two Versions.
Description remains included: unlike title and image, it is genuinely
Version-associated content each Version actually carries, even though it
too can be edited in place afterward.

Examples:

```text
Rice vinegar
V2.0: 4 tbsp
V3.0: 3 tbsp
```

```text
Added:
Quick-Pickled Carrots V2.1
```

```text
Removed:
Toasted Almond Topping
```

## 94.5 Context

The frontend may let the user focus one change and reveal surrounding unchanged context, then return easily to the changed-field overview.

## 94.6 No mutation

Comparison never changes either Version.

Character-by-character text diff is not the primary experience.

---

# 95. Final Priority Model

## 95.1 Tier 1 — complete personal product

Tier 1 includes:

- private ownership;
- Recipe and Part creation, editing, archive, deletion, and duplication;
- immutable content Versions;
- Version history and comparison;
- libraries, search, tags, Favorite, cuisine, and Flavor profiles;
- scaling and compatible units;
- manual nutrition;
- import and Recipe Gallery migration;
- Cooking setup and Cooking Sessions;
- cooking mode and timers;
- Session Reviews, Tasters, and ratings;
- grocery lists;
- complete reusable-Part behavior and propagation.

Tier 1 must stand on its own as a complete personal cooking system.

## 95.2 Tier 2 — intended share-worthy product

Tier 2 includes:

- USDA FoodData Central nutrition lookup;
- optional barcode lookup when implementation remains proportionate;
- batch-oriented Meal Planning;
- Meal Plan-linked grocery synchronization;
- optional Part ratings inside Recipe Session Reviews;
- read-only sharing links;
- independent shared copies;
- direct account-to-account sharing;
- print/PDF presentation;
- share-readiness account controls;
- authentication-session management;
- desktop cooking refinement;
- onboarding and Help.

Tier 2 is part of the intended DishFrame product and is planned immediately after or alongside Tier 1 where foundationally useful.

## 95.3 Tier 3 — optional productization and enhancements

Tier 3 includes:

- public Recipe publication;
- public Part publication;
- public directories;
- moderation;
- AI-assisted paste parsing;
- custom arbitrary tag groups;
- advanced social or engagement ideas;
- other commercial-scale enhancements.

Tier 3 is not part of the immediate initial build requirement.

## 95.4 Foundational Tier 2 awareness

Early architecture must not block:

- nested acyclic Parts;
- independent ownership;
- cross-account copy graphs;
- Recipe and Part visibility;
- source attribution;
- Meal Plan exact-Version selection;
- live linked grocery lists with frozen completion history;
- share-link records;
- account deletion;
- future published-Version snapshots.

Claude need not implement every Tier 2 feature in the first coding slice, but must account for these extension points when foundational choices make later retrofits expensive.

---

# 96. Parts, Planning, Sharing, and Account Acceptance Criteria

Parts, Meal Planning, sharing, account controls, onboarding, and Version comparison are implementation-ready when the following behaviors are supported.

## Parts

- Parts use Recipe-like identity and Version behavior.
- Parts may contain Sections and nested Parts.
- Cycles are prohibited.
- Sections may contain multiple linked Parts.
- Linked Parts use exact Versions.
- Part editing opens the normal Part editor with a return path.
- No hidden Recipe-specific override exists.
- Local content may become a reusable Part.
- Parts may be detached into local content.
- Part usage is discoverable.

## Propagation

- Part saves never silently change Recipes.
- Minor and major Part updates can be offered to affected items.
- Update everywhere, Choose Recipes and Parts, and Do not update are supported.
- Propagation-only Recipe changes default to minor.
- Users retain classification authority.
- Only selected references change.
- Deferred updates remain nonblocking.

## Part lifecycle

- Archive preserves existing use.
- Current references must be resolved before deletion.
- Detaching is recommended.
- Historical references materialize into static snapshots with provenance.
- No navigable orphaned deleted Part remains.
- standalone Part sessions, Reviews, ratings, and notes are deleted with the Part.
- duplicated Parts receive independent identity and optional provisional source rating.
- Recipe duplication reuses owned Parts by default.

## Meal Planning

- Meal Plans have date ranges and editable entries.
- Recipe and standalone Part entries are supported.
- Entries select exact Versions.
- Planned meals allocate servings without consumption tracking.
- Entry statuses are Planned, In progress, Cooked, and Skipped.
- Explainable recommendations use Stage, recency, rating, and Flavor profiles.
- Flavor profiles are dedicated stable metadata.
- Active linked grocery lists synchronize with Meal Plans.
- Completed lists freeze as history.

## Sharing

- Recipes and Parts are private by default.
- Unlisted links support fixed and current modes.
- fixed snapshot sharing is the default.
- Ordinary sharing excludes private history.
- Recipients save independent copies.
- Linked Parts are copied into recipient ownership.
- Direct account sharing uses the same copy model.
- Direct Recipe sharing is one unified single-/multi-Recipe flow; a
  not-yet-registered recipient is a pending email invitation, never a
  placeholder account, claimed automatically on that email's first
  verified sign-in.
- print/PDF views are supported.

## Public Tier 3

- Recipes and Parts receive equal public treatment.
- Publication freezes one reviewed Version, selected stable metadata, and displayed aggregate rating context.
- Updates and unpublishing are deliberate.
- Archiving may preserve publication.
- Deletion removes publication.
- basic directory and moderation behavior are defined.

## Account and onboarding

- profile/security and product preferences are conceptually separated.
- nutrition uses progressive disclosure rather than a required profile preference.
- authentication sessions can be managed.
- sharing and images have manageable ownership.
- account deletion is comprehensive.
- onboarding begins with a brief product introduction.
- Parts receive explicit upfront explanation.
- contextual guides teach features when relevant.
- Help provides FAQs, terminology, and replayable guides.

## Version comparison

- any two same-item Versions can be compared.
- changed content is shown first.
- every material difference is preserved.
- differences are grouped structurally.
- unchanged context is available.
- comparison is read-only.

---

# 97. Supporting Documents and Implementation Handoff

## 97.1 `PRODUCT_ROADMAP.md`

Defines:

- product vision;
- roadmap tiers;
- broad phases;
- release boundaries.

Where roadmap wording conflicts with this canonical specification, this specification governs detailed product behavior.

## 97.2 `DishFrame_BRANDING.md`

Defines:

- brand principles;
- voice;
- visual direction;
- color and typography guidance;
- public-facing messaging.

## 97.3 Milestone documents

The Milestone 1/2 scaffolding-era planning documents this section originally referenced are no longer kept in the repository (git history is the archive); they never replaced the canonical product behavior in this document.

## 97.4 Frontend design work

The first frontend implementation may be derived from:

- this Product Specification;
- DishFrame branding;
- the roadmap;
- the greenfield application scaffold;
- frontend design skills and tools.

Successful interface decisions should be recorded in a concise evolving design-decisions document rather than requiring a separate exhaustive frontend specification before work begins.

## 97.5 Technical-planning handoff

Before domain implementation, Claude Code should produce exactly two planning deliverables:

1. `ARCHITECTURE_PROPOSAL.md`
2. `BUILD_PLAN.md`

`ARCHITECTURE_PROPOSAL.md` contains:

- proposed Prisma entities and relationships;
- immutable Version and snapshot strategy;
- nested-Part and cycle strategy;
- ownership and sharing boundaries;
- mutation and transaction boundaries;
- deletion and materialization behavior;
- validation and testing architecture;
- technical risks and tradeoffs;
- Tier 2 extension implications.

`BUILD_PLAN.md` contains:

- vertical implementation slices;
- dependencies and sequencing;
- migrations;
- testing milestones;
- review checkpoints;
- Tier 1 and Tier 2 implementation ordering;
- explicit stop points before high-risk changes.

DishFrame is greenfield. The repository contains working platform scaffolding, authentication, deployment configuration, and mostly empty product pages. The domain should be designed from this Product Specification rather than inferred from placeholder pages.

Claude must stop after producing the two documents and wait for review before changing domain code.

---

# 98. Canonical Decision Stability

The following decisions are canonical unless the product owner explicitly revises them:

- private-first ownership;
- stable Recipe and Part identity;
- immutable content Versions;
- historical major-line refinement;
- highest-major current-Version rule;
- Recipe and Part Stages;
- Sections and linked Parts;
- nested acyclic Parts;
- multiple Parts per Section;
- ingredient quantities, ranges, optional ingredients, and substitutes;
- one image per Version;
- no draft system;
- archive, deletion, duplication, and inherited source history;
- mandatory Cooking setup;
- Sections and Parts as cookable units;
- Cooking Session lifecycle;
- active-session editing;
- optional progress;
- persistent timers;
- mid-session scaling;
- Session Reviews;
- Cooking notes;
- Tasters and 1–5 ratings;
- optional Part ratings in Tier 2;
- rating summaries;
- separate Recipe and Part libraries;
- current-content search without ingredient-name indexing;
- flat user-owned tags;
- protected Favorite tag;
- stable cuisine;
- dedicated Flavor profiles;
- Stage/tag/cuisine/Flavor-profile/rating filtering;
- no Cooked/Never cooked filter;
- recently updated default sorting;
- provisional prior-Version and source-snapshot ratings in discovery;
- temporary scaling outside sessions;
- mutable default batch presentation;
- practical fraction formatting;
- suggested compatible conversions;
- mutable preferred display units;
- manual Tier 1 nutrition;
- Tier 2 FoodData Central integration;
- optional late Tier 2 barcode scanning;
- private full backup;
- tiered item-export privacy;
- reviewed structured import;
- Recipe Gallery migration;
- deterministic paste import;
- AI parsing as optional Tier 3;
- standalone grocery snapshots;
- active Meal Plan-linked grocery synchronization;
- completed grocery history;
- safe ingredient combination;
- editable grocery categories;
- no pantry inventory;
- Part propagation without automatic mutation;
- propagation-only Recipe updates defaulting minor;
- Part deletion through current-reference resolution and historical static materialization;
- Meal Plans with exact Version entries;
- planned meals without consumption tracking;
- explainable recommendations;
- read-only fixed/current links;
- independent cross-account copies;
- direct sharing;
- print/PDF;
- public Recipes and Parts as Tier 3;
- public publication frozen to reviewed Version-and-metadata snapshots;
- profile/security and preference separation;
- authentication-session management;
- comprehensive account deletion;
- skippable progressive onboarding;
- explicit upfront Part explanation;
- replayable Help guides;
- structured changed-content-first Version comparison;
- Tier 1 and Tier 2 as the immediate intended build;
- Tier 3 as optional productization.

Architecture, design, build plans, and implementation must preserve these rules rather than silently replacing them.

---

# 99. Final Implementation Updates

Tier 1 and Tier 2 (§95.1/§95.2) are now fully implemented, including Slice 22's Multi-Recipe direct sharing (§85.1) and the whole cross-account sharing/print/account-deletion/onboarding surface (§80–§93). The bulk of this document's "Canonical Decision Stability" list (§98) reflects shipped, current behavior, not aspiration.

Two product surfaces exist that predate/sit alongside this document and are worth recording here rather than in a since-removed slice report:

- **Legal pages.** `/privacy` and `/terms` exist (a shared legal-page layout), reachable from the site footer and listed in the sitemap/robots files. Content describes the actual current implementation (Google-only sign-in, private-by-default data, Vercel Blob images, a Resend-backed Contact form that is not persisted to the database, no analytics/tracking SDK). Both pages still need professional legal review before any broad commercial launch — see `docs/TODO.md`.
- **Public marketing pages carry no signed-in personalization.** Every visitor — signed in or not — sees the same header, hero, and CTA copy ("Create your first recipe" → `/recipes/new`, which itself redirects to sign-in when needed). This was a deliberate simplification of an earlier session-aware design; see `ARCHITECTURE_PROPOSAL.md` §Q for the architectural reason (it also restores static prerendering for those routes).

A small number of genuinely open product questions and known gaps remain from the Tier 1/2 build (e.g. `/home`'s dashboard sections still being static placeholders, a sitewide badge-text contrast gap, the Meal-Plan grocery-generation UI's pre- vs. post-generation customization scope). These are tracked as current work in `docs/TODO.md` rather than restated here, since they are not yet settled decisions.
