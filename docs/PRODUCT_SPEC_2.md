# DishFrame — Product Specification, Pass 2

**Filename:** `PRODUCT_SPEC_2.md`  
**Document status:** Working Draft — Pass 2 Complete  
**Scope status:** Recipe Foundation, Cooking Sessions, cooking mode, Session Reviews, ratings, and the learning loop are implementation-ready. Later organization, practical-tool, reusable-Part, and Tier 2 areas remain unresolved.  
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

This document incorporates the completed decisions from:

- **Pass 1: Recipe Foundation**
- **Pass 2A: Cooking Session lifecycle and kitchen behavior**
- **Pass 2B: Session Review and the learning loop**

The following areas are defined in this version:

- target user;
- core product jobs;
- product vocabulary;
- ownership and privacy;
- Recipe identity;
- Recipe Versions;
- Recipe and Part Stages;
- recipe creation;
- Sections;
- Parts at the recipe-foundation and cooking-session levels;
- ingredients;
- quantities and ranges;
- optional ingredients and substitutes;
- recipe images;
- version numbering and historical major-version refinement;
- small updates and new versions;
- version notes;
- unsaved changes;
- archive;
- permanent deletion;
- duplication;
- inherited source history;
- Cooking Session entry points;
- cooking plans;
- cookable Sections and Parts;
- standalone Part sessions;
- session lifecycle;
- concurrent and stale sessions;
- cooking-mode progress;
- timers;
- mid-session scaling;
- session completion and early ending;
- session logs;
- Cooking notes;
- Session Reviews;
- Tasters;
- Recipe- and Part-level ratings;
- rating summaries;
- amount-made tracking;
- session duration;
- feedback-assisted editing;
- Stage suggestions;
- Last cooked behavior;
- Pass 1 and Pass 2 acceptance criteria.

The following areas are intentionally unresolved and must not yet be treated as implementation-ready:

- tags;
- search;
- filters;
- sorting;
- favorites;
- full serving and measurement conversion behavior outside Cooking Sessions;
- final nutrition behavior;
- import and export;
- Recipe Gallery migration;
- paste-and-review import;
- grocery lists;
- full reusable-Part update propagation;
- meal planning;
- sharing;
- public recipes;
- account-to-account behavior;
- onboarding;
- broader Tier 2 policy details.

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
- amount made (`Makes`), including quantity and unit/label;
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
- amount made (`Makes`), including quantity and unit/label;
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
- amount made (`Makes`), including quantity and unit/label;
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

Every successful Recipe or Part content save creates a new immutable Version.

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

# 43. Pending Pass 3 — Organization and Practical Tools

**Status:** Unresolved. Do not implement from this section yet.

Pass 3 must define:

- tags;
- search;
- filters;
- sorting;
- favorite behavior;
- serving and batch scaling outside active Cooking Sessions;
- quantity formatting;
- safe measurement conversion;
- final manual nutrition behavior;
- structured import;
- structured export;
- Recipe Gallery migration;
- paste-and-review;
- grocery lists.

---

# 44. Pending Pass 4 — Full Parts and Tier 2 Boundaries

**Status:** Unresolved. Do not implement from this section yet.

Pass 4 must define:

- full Part identity and editor behavior;
- Part Versions beyond the already-settled shared version model;
- local Sections versus linked Parts;
- one or multiple Parts per Section;
- Part update propagation;
- update everywhere;
- choose Recipes to update;
- preserve existing Recipe Versions;
- duplicate behavior involving Parts;
- optional Part ratings from Recipe Reviews;
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

# 45. Relationship to Other Documents

## `PRODUCT_ROADMAP.md`

Defines:

- product vision;
- roadmap tiers;
- major phases;
- build order;
- broad release boundaries.

## `PRODUCT_SPEC_1.md`

Preserves the first completed Recipe Foundation pass.

## `PRODUCT_SPEC_2.md`

Incorporates Pass 1 and adds implementation-ready product behavior for:

- Cooking Sessions;
- cooking plans;
- cooking mode;
- timers;
- notes;
- Session Reviews;
- Tasters;
- ratings;
- amount made;
- feedback-assisted editing;
- Stages;
- cooking history.

## Future `PRODUCT_SPEC_3.md`

Should incorporate Passes 1 and 2 and add the completed organization and practical-tool specification.

## `FRONTEND_SPEC.md`

Will define:

- information architecture;
- page hierarchy;
- responsive layouts;
- exact editor interactions;
- navigation;
- Version controls;
- planning controls;
- cooking-mode focus behavior;
- timer presentation;
- modal designs;
- button placement;
- visual states;
- animation;
- accessibility behavior.

## `IMPLEMENTATION_SPEC.md`

Will define:

- database schema;
- Version-line representation;
- server actions and APIs;
- numeric storage;
- ordering implementation;
- session snapshots and references;
- timer persistence;
- image storage;
- authorization;
- validation;
- tests;
- deployment details.

---

# 46. Document Stability

The following Pass 1 and Pass 2 decisions are considered settled unless later discussion reveals a direct conflict:

- primary Tier 1 user;
- private-first ownership;
- Recipe Stage and Part Stage terminology;
- Recipe versus Recipe Version responsibility;
- minimum Recipe requirements;
- full-page creation flow;
- Sections;
- ingredient structure;
- quantity behavior;
- optional ingredients;
- one substitute;
- one image per Version;
- immutable major/minor Version lines;
- historical major-line refinement;
- highest-major current-Version rule;
- implementation-neutral Version navigation requirement;
- no draft system;
- custom internal unsaved-change warning;
- archive behavior;
- permanent deletion;
- duplication;
- inherited source-Version history;
- mandatory cooking-plan step;
- Recipe and standalone Part sessions;
- Sections and Parts as cookable units;
- independent nested-Part selection;
- session lifecycle;
- concurrency rules;
- stale-session behavior;
- active-session editing;
- optional progress checkoffs;
- implementation-neutral cooking focus;
- multiple persistent timers;
- default-on short timer sound;
- mid-session scaling;
- one end-session flow;
- session logs;
- Cooking notes;
- Session Reviews;
- reusable Tasters;
- 1–5 whole-star ratings;
- equal rating weighting;
- compact provisional rating context;
- `Makes` terminology;
- optional actual amount made;
- adjusted session duration;
- feedback-assisted editing;
- optional positive Stage suggestions;
- Last cooked rules.

Later Product Specification versions should preserve these rules rather than silently replacing them.
