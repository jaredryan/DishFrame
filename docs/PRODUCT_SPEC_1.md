# DishFrame — Product Specification, Pass 1

**Filename:** `PRODUCT_SPEC_1.md`  
**Document status:** Working Draft — Pass 1 Complete  
**Scope status:** Recipe Foundation is implementation-ready. Later product areas remain unresolved.  
**Purpose:** Convert the stable product roadmap into explicit product behavior, terminology, rules, edge cases, and acceptance criteria.

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

# 2. Current Specification Scope

This document records the completed decisions from **Pass 1: Recipe Foundation**.

The following areas are defined in this version:

- target user;
- core product jobs;
- product vocabulary;
- ownership and privacy;
- Recipe identity;
- Recipe Versions;
- Recipe Stage;
- recipe creation;
- Sections;
- Parts at the recipe-foundation level;
- ingredients;
- quantities and ranges;
- optional ingredients and substitutes;
- recipe images;
- version numbering;
- small updates and new versions;
- version notes;
- unsaved changes;
- archive;
- permanent deletion;
- duplication;
- inherited source history;
- Recipe Foundation acceptance criteria.

The following areas are intentionally unresolved and must not yet be treated as implementation-ready:

- Cooking Session lifecycle;
- cooking-mode behavior;
- timers;
- Session Reviews;
- servings made;
- Tasters and rating summaries;
- search;
- tags;
- filtering and sorting;
- serving scaling;
- unit conversion;
- nutrition behavior;
- import and export;
- grocery lists;
- full reusable-Part behavior;
- meal planning;
- favorites;
- sharing;
- public recipes;
- account-to-account behavior;
- Tier 2 policy details.

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

A Recipe owns its current Stage and points to its current Recipe Version.

## 5.2 Recipe Version

A **Recipe Version** is one immutable saved state of a Recipe’s content.

A Version may contain:

- title;
- description;
- image;
- cuisine;
- expected servings;
- preparation time;
- cooking time;
- difficulty;
- nutrition;
- Sections;
- ingredients;
- instructions;
- linked Part versions;
- version note.

Every successful content save creates a new immutable Recipe Version.

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

The Stage belongs to the stable Recipe, not to an individual Recipe Version.

## 5.4 Section

A **Section** is a local organizational area inside a Recipe Version.

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
- a linked Part;
- local content plus a linked Part.

## 5.5 Part

A **Part** is a reusable versioned preparation that may be used across multiple Recipes.

Examples:

- White Rice
- Basic Air-Fried Chicken
- Nuoc Cham
- Quick-Pickled Carrots
- Toasted Almond Topping

Full reusable-Part behavior will be defined in a later specification pass.

## 5.6 Cooking Session

A **Cooking Session** is one period in which a user prepares some or all of a specific Recipe Version.

Detailed behavior is pending Pass 2.

## 5.7 Session Review

A **Session Review** is the optional reflection after cooking.

The primary conversational heading may be:

> How did it go?

Detailed behavior is pending Pass 2.

## 5.8 Taster

A **Taster** is a named person whose rating may be recorded for a Cooking Session.

Detailed behavior is pending Pass 2.

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
- Recipe Stage;
- archive state;
- visibility when later introduced;
- duplication/source relationship;
- creation timestamp;
- update timestamp.

## 7.2 Version-owned properties

The Recipe Version owns:

- display title;
- description;
- image;
- cuisine;
- expected servings;
- preparation time;
- cooking time;
- difficulty;
- nutrition;
- Sections;
- ingredients;
- instructions;
- linked Part-version references;
- version note;
- source Version when restored or branched;
- creation timestamp.

## 7.3 Historical titles and descriptions

Historical Recipe Versions preserve their historical titles and descriptions.

If a Recipe changes from:

```text
Japanese Bowl
```

to:

```text
Ginger Soy Mirin Bowl
```

the historical Version remains titled `Japanese Bowl`.

The Recipe library displays the current Version’s title.

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
- ability to add more Sections.

## 8.3 Minimum save requirements

A new Recipe requires:

- title;
- Recipe Stage;
- at least one meaningful ingredient or instruction.

A Recipe may save with:

- one ingredient and no instruction;
- one instruction and no ingredient;
- one unnamed Section;
- incomplete optional metadata.

This intentionally allows Idea-stage Recipes to remain incomplete.

## 8.4 Optional fields

The following are optional:

- description;
- image;
- cuisine;
- expected servings;
- preparation time;
- cooking time;
- difficulty;
- calories;
- protein;
- carbohydrates;
- fat;
- tags;
- version note;
- multiple Sections.

## 8.5 Initial Version

The first successful save creates:

```text
V1.0
```

Version 1.0 becomes the current Recipe Version.

---

# 9. Sections

## 9.1 Default Section

Every Recipe Version contains at least one Section.

A new Recipe begins with one unnamed default Section.

If it remains:

- the only Section;
- unnamed;

its heading is hidden in normal Recipe display.

This allows simple Recipes to feel like ordinary recipes rather than artificially modular records.

## 9.2 Section content

Each Section may contain:

- zero or more ingredients;
- zero or more instructions;
- a linked Part;
- local recipe-specific content;
- both local content and a linked Part.

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

Linked Part:
Basic Air-Fried Chicken
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
- attach a supported Part when that feature is implemented.

## 9.5 Empty Sections

Empty Sections may exist temporarily while editing.

An empty Section contains:

- no ingredients;
- no instructions;
- no linked Part;
- no meaningful local content.

Users may remove empty Sections manually.

Any remaining empty Sections are automatically removed when the Recipe is saved.

Empty Sections do not block saving.

## 9.6 Independent ordering

Ingredients and instructions each maintain independent ordering inside a Section.

Changing ingredient order does not automatically change instruction order.

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

The exact visual control belongs in `FRONTEND_SPEC.md`.

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

How optional ingredients and substitutes enter grocery lists is unresolved.

That policy will be defined in the grocery-list pass.

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

A new Recipe Version inherits the current Version’s image by default.

The user may:

- retain it;
- replace it;
- remove it.

Historical Versions preserve the image they had when saved.

## 12.3 No-image behavior

A Recipe must remain fully usable and visually coherent without an image.

An image is never required to create, edit, cook, review, archive, duplicate, or delete a Recipe.

---

# 13. Immutable Version Model

## 13.1 Every save creates a Version

Every successful Recipe content save creates a new immutable Recipe Version.

DishFrame does not:

- mutate an existing Version in place;
- maintain hidden user-facing correction state;
- rewrite content associated with an old Cooking Session;
- classify changes automatically.

## 13.2 User save choices

The user chooses between:

### Save small update

Use for a limited correction or adjustment.

Examples:

- spelling;
- clearer wording;
- formatting;
- slightly different quantity;
- corrected expected servings;
- minor timing adjustment;
- small cleanup.

### Save new version

Use for a meaningful new direction.

Examples:

- ingredient added or removed;
- major preparation change;
- linked Part changed;
- flavor direction changed;
- substantial restructuring;
- branch in Recipe development.

DishFrame may visually emphasize **Save new version**, but it never forces the classification.

## 13.3 Version numbering

The first Version is:

```text
V1.0
```

A small update increments the second segment:

```text
V1.0 → V1.1 → V1.2
```

A new Version increments the first segment and resets the second:

```text
V1.2 → V2.0
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

## 13.4 Current Version

Every successful save makes the new Version the current Recipe Version.

Historical Versions remain immutable and available.

## 13.5 Restore behavior

Restoring old content never makes the old Version mutable or current again.

Restoring creates the next Version using the selected historical Version as its source.

Example:

Current:

```text
V2.3
```

Selected source:

```text
V1.4
```

Possible result:

```text
V2.4 from V1.4
```

when saved as a small update, or:

```text
V3.0 from V1.4
```

when saved as a new Version.

The source Version relationship must be stored structurally.

## 13.6 Recipe Stage during restore

Restoring Version content does not automatically restore the Recipe Stage that existed at the time.

Recipe Stage remains a current Recipe-level decision.

---

# 14. Version Notes

## 14.1 Optional notes

Version notes are always optional.

This applies to:

- V1.0;
- small updates;
- new Versions;
- restored Versions;
- Part-driven changes.

## 14.2 Suggested note prefixes

DishFrame may prefill a concise editable prefix.

Examples:

Ordinary change:

```text
V2.0 → V3.0:
```

Restore:

```text
V3.0 from V1.4:
```

Part update:

```text
Rice V2.0 → V3.0:
```

The cursor should be positioned after the prefix.

The user may:

- type after it;
- edit it;
- delete it;
- leave the note empty.

## 14.3 Notes are not structural truth

Important relationships such as:

- source Version;
- restored-from Version;
- updated Part Version;

must be stored as structured data.

A note is explanatory text, not the only record of what happened.

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

The exact confirmation interaction belongs in the frontend specification.

## 17.3 Irreversibility

Permanent deletion cannot be undone.

## 17.4 Future references

Future grocery lists, meal plans, and other historical records should retain snapshots rather than block deletion.

A retained reference may show:

```text
Deleted recipe
6 servings
Chicken breast — 2 lb
Rice — 3 cups
```

The system should indicate that the source Recipe was deleted and may require manual adjustment.

The exact snapshot policy will be completed when those features are specified.

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

# 19. Inherited Source History

## 19.1 Purpose

A duplicate should not lose the evidence that its starting point may already have been cooked and rated.

However, that history must not be falsely presented as belonging to the new Recipe.

## 19.2 Included source history

DishFrame preserves inherited reference history from the exact source Version that was duplicated.

This may include:

- number of Cooking Sessions tied to that source Version;
- ratings from those sessions;
- Tasters from those sessions;
- summary statistics for that source Version;
- source Recipe name;
- source Version number;
- link back to the source Recipe when it still exists.

## 19.3 Excluded source history

The duplicate does not automatically inherit:

- sessions tied to other source Versions;
- ratings tied to other source Versions;
- the full prior Recipe lineage;
- source last-cooked status;
- source recommendation priority.

The complete source lineage remains accessible through the source Recipe relationship.

## 19.4 Display distinction

Inherited history must be visually and semantically distinguished from the duplicate’s own history.

Example before the duplicate is cooked:

```text
No sessions yet

Starting point
Based on Cuban Mojo Bowl V4.0
Family rating: 9.2/10 across 5 tasters
3 source cooking sessions
```

Example after the duplicate is cooked:

```text
This recipe
8.5/10 across 2 tasters

Starting point
Cuban Mojo Bowl V4.0
9.2/10 across 5 tasters
```

## 19.5 Analytics rules

Inherited source history does not count toward:

- duplicate average rating;
- duplicate last-cooked date;
- duplicate cooking count;
- duplicate recommendation recency;
- duplicate Taster statistics.

---

# 20. Pass 1 Acceptance Criteria

Pass 1 Recipe Foundation is complete when all of the following product behaviors can be implemented without additional policy decisions.

## Recipe creation

- A user can open a full-page Recipe editor.
- The editor defaults Recipe Stage to Idea.
- The editor starts with one unnamed Section.
- No Recipe record is created before save.
- Saving requires title, Recipe Stage, and at least one ingredient or instruction.
- Saving creates V1.0.

## Recipe structure

- A simple Recipe can use one unnamed Section.
- A structured Recipe can use multiple named Sections.
- Sections can contain ingredients, instructions, or both.
- Empty Sections are removed on save.
- Ingredient and instruction ordering persist independently.
- Sections can later support linked Parts.

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
- Small updates increment the minor segment.
- New Versions increment the major segment.
- Historical Versions never change.
- Restoring creates a new current Version.
- Source Version relationships are preserved.
- Version notes remain optional.

## Images

- Each Version supports zero or one image.
- New Versions inherit the prior image by default.
- Historical images remain preserved.

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

# 21. Pending Pass 2 — Cooking Sessions and Learning Loop

**Status:** Unresolved. Do not implement from this section yet.

Pass 2 must define:

- when a Cooking Session record is created;
- session lifecycle states;
- selected Sections;
- selected Parts;
- target servings;
- suggested ordering;
- session snapshots versus live references;
- step and ingredient progress;
- timer creation and persistence;
- pause/resume behavior;
- abandoned sessions;
- completed sessions;
- “Finish cooking” behavior;
- transition to Session Review;
- review skipping;
- servings made;
- personal ratings;
- multi-Taster ratings;
- notes;
- what worked;
- what should change;
- Stage-change suggestions;
- proposing a small update or new Version;
- relationship between Session Review and Recipe editing.

---

# 22. Pending Pass 3 — Organization and Practical Tools

**Status:** Unresolved. Do not implement from this section yet.

Pass 3 must define:

- tags;
- search;
- filters;
- sorting;
- favorites boundary;
- scaling;
- quantity formatting;
- safe measurement conversion;
- nutrition;
- import;
- export;
- Recipe Gallery migration;
- paste-and-review;
- grocery lists.

---

# 23. Pending Pass 4 — Parts and Tier 2 Boundaries

**Status:** Unresolved. Do not implement from this section yet.

Pass 4 must define:

- full Part identity;
- Part Versions;
- local Sections versus linked Parts;
- one or multiple Parts per Section;
- Part update behavior;
- update everywhere;
- choose Recipes to update;
- preserve existing Recipe Versions;
- duplicate behavior involving Parts;
- meal planning;
- favorites;
- sharing;
- read-only links;
- save shared Recipe as a copy;
- account-to-account sharing;
- public Recipe behavior;
- account controls;
- onboarding boundaries.

---

# 24. Relationship to Other Documents

## `PRODUCT_ROADMAP.md`

Defines:

- product vision;
- roadmap tiers;
- major phases;
- build order;
- broad release boundaries.

## `PRODUCT_SPEC_1.md`

Defines:

- explicit Pass 1 product behavior;
- rules;
- terminology;
- edge cases;
- acceptance criteria.

## Future `PRODUCT_SPEC_2.md`

Should incorporate Pass 1 and add the completed Cooking Session and learning-loop specification.

## `FRONTEND_SPEC.md`

Will define:

- page hierarchy;
- responsive layouts;
- exact editor interactions;
- navigation;
- modal designs;
- button placement;
- visual states;
- cooking-mode interaction;
- animation;
- accessibility behavior.

## `IMPLEMENTATION_SPEC.md`

Will define:

- database schema;
- server actions and APIs;
- numeric storage;
- ordering implementation;
- immutable-Version persistence;
- image storage;
- authorization;
- validation;
- tests;
- deployment details.

---

# 25. Document Stability

The following Pass 1 decisions are now considered settled unless later product discussion reveals a direct conflict:

- primary Tier 1 user;
- private-first ownership;
- Recipe Stage terminology;
- Recipe versus Recipe Version responsibility;
- minimum Recipe requirements;
- full-page creation flow;
- Sections;
- ingredient structure;
- quantity behavior;
- optional ingredients;
- one substitute;
- one image per Version;
- immutable major/minor-style Versions;
- small update versus new Version;
- no draft system;
- custom internal unsaved-change warning;
- archive behavior;
- permanent deletion;
- duplication;
- inherited source-Version history.

Later versions of the Product Specification should preserve these rules rather than silently replacing them.
