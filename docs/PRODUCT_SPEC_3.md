# DishFrame — Product Specification, Pass 3

**Filename:** `PRODUCT_SPEC_3.md`  
**Document status:** Working Draft — Pass 3 Complete  
**Scope status:** Recipe Foundation, Cooking Sessions, the learning loop, library organization, discovery, scaling, conversion, nutrition, import/export, migration, and grocery lists are implementation-ready. Full reusable-Part propagation, meal planning, sharing, and remaining Tier 2 boundaries are reserved for Pass 4.  
**Purpose:** Convert the stable product roadmap into explicit product behavior, terminology, rules, edge cases, priorities, and acceptance criteria.

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

This document incorporates the completed decisions from:

- **Pass 1: Recipe Foundation**
- **Pass 2A: Cooking Session lifecycle and kitchen behavior**
- **Pass 2B: Session Review and the learning loop**
- **Pass 3A: Library organization and discovery**
- **Pass 3B: Scaling, conversion, nutrition, import/export, migration, and grocery lists**

This specification defines intended Tier 1 and Tier 2 product behavior. Tier 2 features need not all be implemented in the first milestone, but foundational design and architecture must not make them unnecessarily difficult to add.

The following areas are defined in this version:

- target user and product principles;
- product vocabulary;
- ownership and privacy;
- Recipe and Part identity;
- immutable Version content;
- major/minor Version lines;
- Recipe and Part Stages;
- recipe creation;
- Sections;
- ingredients and substitutes;
- images;
- archive, deletion, and duplication;
- inherited source history;
- Cooking Sessions and cooking plans;
- cookable Sections and Parts;
- session lifecycle, progress, scaling, and timers;
- Session Reviews, notes, Tasters, and ratings;
- Recipe and Part libraries;
- search;
- tags and protected Favorite behavior;
- cuisine;
- filters and sorting;
- temporary scaling outside Cooking Sessions;
- saved default batch size and preferred display units;
- quantity formatting;
- measurement conversion;
- manual nutrition;
- USDA FoodData Central lookup;
- optional barcode lookup;
- structured backup and export;
- structured import;
- Recipe Gallery migration;
- deterministic paste-and-review import;
- grocery lists;
- Tier 1 and Tier 2 priorities for the defined areas;
- Pass 1, Pass 2, and Pass 3 acceptance criteria.

The following areas remain unresolved and must not yet be treated as implementation-ready:

- complete reusable-Part propagation;
- update everywhere versus selected Recipes;
- full Part duplication rules;
- meal planning;
- account-to-account sharing;
- read-only sharing links;
- public Recipes;
- save-shared-as-copy behavior;
- onboarding;
- final account controls;
- remaining Tier 2 boundaries.

The following are explicitly optional rather than required for the intended Tier 1 or Tier 2 product:

- custom tag categories or groups;
- AI-assisted paste parsing;
- pantry inventory;
- retailer-specific aisle mapping;
- retailer ordering;
- semantic or AI Recipe search;
- AI Recipe generation or revision.

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

A Recipe owns its current Stage, cuisine, tags, protected Favorite state, default batch presentation, and current Recipe Version reference.

## 5.2 Recipe Version

A **Recipe Version** is one immutable saved state of a Recipe’s content.

A Version may contain:

- title;
- description;
- image;
- authored yield, including quantity and unit/label;
- amount made (`Makes`) presentation derived from that yield;
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
- cuisine;
- tags;
- protected Favorite-tag relationship;
- saved default batch scale, when different from the authored Version yield;
- preferred compatible display units;
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
- authored yield, including quantity and unit/label;
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

Every successful Recipe or Part **content** save creates a new immutable Version.

The following stable metadata or presentation-preference changes do not create a Version:

- Stage;
- cuisine;
- tags;
- Favorite;
- archive state;
- saved default batch scale;
- preferred compatible display units.

DishFrame does not:

- mutate an existing Version in place;
- maintain hidden correction revisions;
- rewrite content associated with an old Cooking Session;
- classify a change automatically.

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
V6.0 from V2.3
```

The Version note may use the same concise prefix, but the note is not the only record of the relationship.

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

This is an example, not a mandatory control design. `FRONTEND_SPEC.md` will choose the final interaction.

## 13.9 Recipe and Part Stage during version changes

Recipe Stage and Part Stage belong to the stable Recipe or Part.

Saving or revisiting Version content does not automatically restore or change the Stage that existed when that historical Version was created.

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

A Version note is an editable persistent field on that Version. It commonly begins with the concise text proposed during the save flow, but the user may later revise it. It remains explanatory text rather than the only structural record of what happened.

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
- Small updates increment the minor segment of the selected major line.
- New Versions increment the highest existing major segment.
- A historical minor update does not replace the current highest-major Version.
- A new major Version becomes current.
- Historical Versions never change.
- Source-Version relationships are preserved.
- Version notes remain optional and editable.

## Images

- Each Version supports zero or one image.
- New Versions inherit the source image by default.
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

# 21. Entering the Cooking Flow

## 21.1 Cook entry points

Users may enter the cooking flow from:

- a Cook action on a Recipe card or list item;
- Start cooking on the current Recipe Version;
- Cook this version on a historical Recipe Version;
- a Cook action on a standalone Part;
- a Cook action on a historical Part Version.

All entry points use the same cooking flow.

## 21.2 Cooking has a planning step

Starting the cooking flow always opens a prefilled plan before the Cooking Session is created.

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

No entry point bypasses this planning step.

## 21.3 Session creation

Opening or editing the plan does not create a Cooking Session.

A Cooking Session is created only when the user confirms:

> Start cooking

Canceling the plan creates no session history.

## 21.4 Lightweight plans

A Recipe or Part containing only one cookable unit still uses the same plan behavior.

The frontend may present that plan more compactly, but it must not create a different product flow or silently skip planning.

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

> Cook this version

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

At the top level of the cooking plan, local Sections and top-level Parts are peers.

## 23.2 Recipe composition

A Recipe may contain:

- only local Sections;
- only reusable Parts;
- a mixture of Sections and Parts;
- Sections that themselves contain linked Parts.

## 23.3 Default inclusion

Every eligible Section and Part begins included by default.

The user may remove units from the plan and add them back.

At least one Section or Part must remain selected before cooking begins.

## 23.4 Nested Parts

A Part linked within a Section may be independently included or removed.

This supports workflows such as:

- preparing a marinade today;
- omitting the linked air-frying Part until tomorrow;
- making only a linked Part without the Section’s local content.

If a nested Part is selected without its parent Section’s local content:

- it becomes an independent cookable unit in the active session plan;
- it does not remain visually trapped inside an unselected Section;
- DishFrame retains the Section relationship for historical context.

The final visual treatment belongs in `FRONTEND_SPEC.md`.

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
- later scale adjustments;
- the final scale used.

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

The exact interaction belongs in `FRONTEND_SPEC.md`.

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

The exact navigation placement belongs in `FRONTEND_SPEC.md`.

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

These are examples rather than requirements. `FRONTEND_SPEC.md` will determine the final interaction.

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

A Taster may:

- receive a rating;
- be recorded as present without a rating;
- be omitted from the Review entirely.

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

The exact presentation belongs in `FRONTEND_SPEC.md`.

## 36.5 Unrated current Version

When the current Version has no ratings, DishFrame may show a compact provisional context value derived from the most relevant previous rated Version.

Example:

```text
~4.6/5
```

The approximation marker and/or distinct styling must make clear that this is not an actual rating for the current Version.

The detailed ratings view must identify the source Version explicitly.

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

# 42. Pass 2 Acceptance Criteria

Pass 2 is complete when the following behaviors can be implemented without additional product-policy decisions.

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
- custom tags;
- Section names;
- linked Part names.

Ingredient names are not included in ordinary library search.

If an ingredient is central enough to be a Section or Part, that higher-level name can make the Recipe discoverable without producing noisy matches for every minor ingredient.

## 44.2 Part search fields

Part-library search inspects:

- Part title;
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
5. tag;
6. Section or linked Part name.

Tier 1 and Tier 2 do not require semantic search, embeddings, or aggressive fuzzy guessing.

---

# 45. Tags and Favorite

## 45.1 Ownership

Tags belong to the authenticated user.

They are not global DishFrame categories.

Examples:

- High Protein
- Family Favorite
- Freezer Friendly
- Sweet
- Spicy
- Chicken
- Quick
- Summer
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
- rating.

## 47.2 Part filters

Part filtering supports:

- Part Stage;
- tags;
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

## 47.7 Visible active filters

Active search and filter criteria remain visible through chips, labels, or an equivalent compact treatment.

Example:

```text
Active · Vietnamese · High Protein · 4★+
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

A duplicated Recipe or Part may carry a provisional inherited rating.

When a provisional rating exists:

- it participates numerically in rating sorting and filters;
- `~4.2/5` sorts between `4.3/5` and `4.1/5`;
- it remains visibly approximate;
- it does not become the duplicate’s own rating;
- it does not contribute to actual analytics;
- the first genuine rating replaces the provisional principal value.

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
- may carry into a Cooking Plan or grocery-list flow;
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
- causes future ordinary views and Cooking Plans to open at that default;
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

A future preference may allow users to favor fractions or decimals.

---

# 53. Measurement Conversion and Preferred Units

## 53.1 User control

DishFrame may identify a more practical compatible unit while:

- scaling;
- viewing a Recipe or Part;
- editing;
- preparing a Cooking Plan;
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
- applies consistently across ordinary views and Cooking Plans;
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

When FoodData Central supplies additional recognized nutrients, Tier 2 may display an expandable:

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

A full private account backup uses a documented structured format such as JSON.

It preserves DishFrame data including:

- Recipes and Recipe Versions;
- Parts and Part Versions;
- Sections;
- ingredients;
- tags;
- Stages;
- Cooking Sessions;
- Cooking notes;
- Reviews;
- Tasters;
- ratings;
- grocery lists;
- relationships;
- timestamps.

Its purpose is:

- personal backup;
- portability;
- disaster recovery;
- future migration.

Because it contains private information, the export flow must display a clear privacy warning.

## 55.2 Item export

Users may export one Recipe or Part in a portable package.

The export may contain:

- one selected Version or full Version history;
- linked Parts;
- images or image references where supported;
- tags;
- cuisine;
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
- no session history.

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
- full session history.

The user must deliberately choose this level and receive a privacy warning.

## 55.6 Public sharing distinction

Structured export is not the same as:

- a public Recipe;
- a read-only sharing link;
- account-to-account collaboration.

Those behaviors belong in Pass 4.

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
- source relationships.

Later Recipe or Part changes do not silently rewrite the list.

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
- safe unit conversion exists.

Example:

```text
2 tbsp soy sauce
1/4 cup soy sauce
```

may combine into one total.

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

DishFrame does not automatically add both.

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

## 63.3 Ingredient memory

DishFrame may remember the category previously selected for a normalized ingredient name for that user.

## 63.4 Uncategorized items

Items without a category appear under:

> Other

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

# 65. Pass 3 Acceptance Criteria

Pass 3 is complete when the following behavior can be implemented without additional product-policy decisions.

## Library

- Recipes and Parts have separate scopes.
- Grid and compact-list views are supported.
- Archived items remain opt-in.
- Cooking Sessions are not mixed into the libraries.

## Search

- Search uses title, cuisine, tags, Sections, and linked Part names as applicable.
- Ingredient names and historical Versions are excluded.
- Current content only determines normal results.
- Strong title and cuisine matches rank before broader tag or structural matches.

## Tags and cuisine

- Tags are user-owned and stable-item-level.
- Tags support create, rename, merge, and delete.
- The intended product uses flat tags.
- Custom tag groups remain optional.
- Favorite is a protected built-in tag.
- Cuisine is one optional stable-item value.

## Filters and sorting

- Stage, tags, cuisine, and rating are supported filters.
- There is no separate Cooked/Never cooked filter.
- Multiple tags use match-all behavior.
- Recently updated is the default sort.
- Highest- and lowest-rated sorts are supported.
- Approximate inherited ratings participate in discovery but not analytics.
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
- Additional available nutrients may appear in an expandable area.
- Text search remains primary.
- Barcode scanning is an optional late Tier 2 convenience with fallback.

## Export and import

- Full private account backup preserves all DishFrame data.
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

# 66. Pending Pass 4 — Full Parts and Tier 2 Boundaries

**Status:** Unresolved. Do not implement from this section yet.

Pass 4 must define:

- complete Part identity and editor behavior;
- local Sections versus linked Parts;
- one or multiple Parts per Section;
- Part update propagation;
- update everywhere;
- choose Recipes to update;
- preservation of existing Recipe Versions;
- duplicate behavior involving Parts;
- optional Part ratings inside Recipe Reviews;
- meal planning;
- sharing;
- read-only links;
- save shared Recipe as a copy;
- account-to-account sharing;
- public Recipe behavior;
- account controls;
- onboarding boundaries;
- final Tier 1/Tier 2 implementation priorities.

---

# 67. Relationship to Other Documents

## `PRODUCT_ROADMAP.md`

Defines:

- product vision;
- roadmap tiers;
- major phases;
- build order;
- broad release boundaries.

## `PRODUCT_SPEC_1.md`

Preserves the completed Recipe Foundation pass.

## `PRODUCT_SPEC_2.md`

Adds Cooking Sessions and the learning loop.

## `PRODUCT_SPEC_3.md`

Incorporates Passes 1 and 2 and adds implementation-ready behavior for:

- libraries;
- search;
- tags;
- Favorite;
- cuisine;
- filters;
- sorting;
- scaling;
- conversion;
- nutrition;
- export and backup;
- import and migration;
- grocery lists.

## Future final `PRODUCT_SPEC.md`

Should incorporate all four passes, reconcile terminology, remove obsolete placeholders, define priorities, and serve as the stable product source of truth.

## `FRONTEND_SPEC.md` or derived design decisions

A giant manual frontend specification is not required before implementation.

Claude may derive a first interface from:

- the final Product Specification;
- DishFrame branding;
- the existing application shell;
- frontend design skills and tools.

Successful design decisions should be preserved in a concise evolving design-decisions document.

## Architecture proposal

Before domain implementation, Claude should derive and present:

- entity relationships;
- Prisma schema;
- Version representation;
- transaction boundaries;
- deletion behavior;
- testing strategy;
- phased implementation plan.

Foundational architecture should be reviewed before broad migrations and domain coding.

---

# 68. Document Stability

The following Pass 1 through Pass 3 decisions are considered settled unless later discussion reveals a direct conflict:

- private-first ownership;
- stable Recipe and Part identity;
- immutable content Versions;
- historical major-line refinement;
- highest-major current-Version rule;
- Recipe and Part Stages;
- Sections and linked Parts;
- ingredient quantities, ranges, optional ingredients, and substitutes;
- one image per Version;
- no draft system;
- archive, deletion, duplication, and inherited source history;
- mandatory Cooking Plans;
- Sections and Parts as cookable units;
- Cooking Session lifecycle;
- active-session editing;
- optional progress;
- persistent timers;
- mid-session scaling;
- Session Reviews;
- Cooking notes;
- Tasters and 1–5 ratings;
- rating summaries;
- separate Recipe and Part libraries;
- current-content search without ingredient-name indexing;
- flat user-owned tags;
- protected Favorite tag;
- stable cuisine;
- Stage/tag/cuisine/rating filtering;
- no Cooked/Never cooked filter;
- recently updated default sorting;
- approximate inherited ratings in discovery;
- temporary scaling outside sessions;
- mutable default batch presentation;
- practical fraction formatting;
- suggested compatible conversions;
- mutable preferred display units;
- manual Tier 1 nutrition;
- Tier 2 FoodData Central integration;
- optional late Tier 2 barcode scanning;
- private full backup;
- tiered item export privacy;
- reviewed structured import;
- Recipe Gallery migration;
- deterministic paste import;
- AI parsing as optional Tier 3;
- grocery snapshots;
- same-major update prompts;
- safe ingredient combination;
- editable grocery categories;
- no pantry inventory.

Later Product Specification versions should preserve these rules rather than silently replacing them.
