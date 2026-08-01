# DishFrame — Revised Slices 14–21 Roadmap and Milestones

**Status:** Current owner-approved execution order  
**Supersedes:** The original strictly linear placement of the large design/polish pass and the postponed pre-Slice-15 manual review

---

## 1. Why the order changed

DishFrame's core personal-use functionality is nearly complete.

A comprehensive design review is most valuable after Meal Plans and live grocery synchronization exist, because Slice 15 completes the central personal workflow. The sharing/account/onboarding slices can then continue while the owner performs the design audit in parallel.

Slice 21 is therefore split into:

- **21A:** post-Slice-15 comprehensive design audit and core-product refinement;
- **21B:** final whole-product polish after onboarding and every remaining feature exist.

The roadmap has two meaningful milestones rather than a separate “technically shareable but not yet polished enough to share” milestone.

---

## 2. Revised execution order

### Step 1 — Slice 14: Optional barcode nutrition lookup

Complete the optional camera/barcode convenience layer on top of Slice 13's existing USDA FoodData Central flow.

Text search remains the reliable primary/fallback path.

### Step 2 — Slice 15: Meal Plans and live grocery synchronization

Build the final major personal-use workflow:

- Meal Plans and scheduled cooking entries;
- starting Cooking Sessions from plans;
- recommendation support;
- active grocery-list synchronization with plan changes;
- preservation of checkoffs and explainable refresh behavior.

Before implementation, Claude performs only a lightweight architecture preflight against the Slice 12 grocery handoff and canonical Slice 15 synchronization rules. It stops only for a concrete data-model or product-rule conflict.

A comprehensive owner design review is **not** required before Slice 15.

### Step 3 — Representative seed-data update

Update representative data so the built product can be reviewed across realistic states from Slices 7–15, including:

- Recipes and Parts;
- historical Versions;
- Cooking Sessions and Reviews;
- Tasters and ratings;
- search/filter states;
- grocery lists;
- nutrition and sourced nutrition;
- barcode-supported branded-food states where practical;
- Meal Plans and synchronized grocery states.

### Step 4 — Broad functional verification

Run the owner-controlled broad verification pass in a fresh session.

Resolve correctness blockers before treating the personal product as complete.

### Step 5 — Slice 21A: Comprehensive design audit and core-product refinement

Begin a large manual review of the now-complete personal product:

- information architecture and navigation;
- cross-page visual consistency;
- responsive behavior;
- light/dark themes;
- forms, dialogs, cards, lists, tables, and detail pages;
- loading, empty, error, success, and destructive states;
- mobile and desktop Cooking Mode;
- keyboard, focus, contrast, reduced motion, and accessibility;
- wording and interaction clarity;
- overall coherence as one product.

Record findings as:

- blocker/correctness;
- usability;
- design;
- polish.

Correctness findings may interrupt later feature work. Design and polish findings should be grouped into coherent passes.

---

## Milestone 1 — Complete personal product

Milestone 1 is reached after:

1. Slice 14;
2. Slice 15;
3. representative seed-data update;
4. broad functional verification;
5. Slice 21A review and the core corrections required for the product to feel coherent.

At this point DishFrame should be a product the owner can confidently use as the complete personal cooking system envisioned:

> Save → organize → plan → shop → cook → review → revise → reuse.

---

## 3. Sharing and product-completion track

### Gate 7 — Sharing architecture

The owner/product portion of Gate 7 has been completed early and is recorded in:

`docs/GATE_7_ARCHITECTURE_REVIEW.md`

Immediately before Slice 16, Claude performs only the technical preflight described in that document. This is no longer a new owner design discussion unless the repository reveals a concrete conflict.

### Step 6 — Slice 16: Read-only sharing and independent copies

Build:

- fixed and current unlisted links;
- privacy-safe public Recipe/Part pages;
- one-time idempotent acceptance;
- fully independent recipient-owned graph copying;
- recursive Part and referenced-Version copying;
- recipient-owned image assets.

### Step 7 — Slice 17: Direct account-to-account sharing

Add recipient selection, preview, optional sender note, pending/cancel/accept/decline states, and reuse Slice 16's independent-copy engine.

### Step 8 — Slice 18: Print and PDF presentation

Add clean print-friendly Recipe and Part views that work through browser printing and Save as PDF.

### Step 9 — Slice 19: Account, security, and share management

Add:

- signed-in device/session inspection and revocation;
- sent/received/expired/revoked share management;
- safe account deletion;
- export-first opportunity;
- deletion behavior that preserves already-independent recipient copies.

### Parallel owner track during Slices 16–19

Continue the Slice 21A design audit and apply findings in coherent batches while Claude builds Slices 16–19.

Do not constantly interrupt feature implementation for isolated polish observations. Interrupt only for correctness, privacy, ownership, or destructive-data issues.

### Step 10 — Slice 20: Onboarding, Help, and public/first-use revisit

After every primary feature exists:

- build real Help and FAQs;
- explain Versions, Parts, Cooking, planning, nutrition, and sharing;
- add skippable/replayable onboarding;
- add contextual first-use guidance;
- revisit public and first-time-user surfaces with stable terminology.

### Step 11 — Slice 21B: Final whole-product polish

Perform the true final pass across all surfaces, including those added in Slices 16–20:

- public sharing;
- direct sharing;
- print layouts;
- account/security management;
- deletion;
- onboarding and Help;
- final responsive, theme, desktop Cooking Mode, accessibility, and consistency checks.

### Step 12 — Final release verification

Run:

- broad automated verification;
- full manual responsive/theme review;
- fresh-user journey;
- privacy and ownership checks;
- share revocation/deletion/accepted-copy survival;
- account deletion;
- accessibility and keyboard review;
- real-device checks where relevant.

Resolve release blockers and material usability issues.

---

## Milestone 2 — DishFrame finished

Milestone 2 is reached after:

1. Slices 16–19;
2. design-audit corrections applied in coherent batches;
3. Slice 20;
4. Slice 21B;
5. final release verification.

This is the point where DishFrame is not merely technically shareable, but polished and safe enough that the owner is proud to give it to friends and family.

---

## 4. Review-gate interpretation

### Gate 5 / Gate 6

The postponed Tier 1 review and pre-Meal-Plan synchronization review are effectively consolidated into the post-Slice-15 seed, broad verification, and Slice 21A review.

Before Slice 15, only a narrow code-aware architecture preflight is required.

### Gate 7

Owner/product architecture is already settled early.

Claude performs the remaining technical preflight immediately before Slice 16 using `docs/GATE_7_ARCHITECTURE_REVIEW.md`.

### Gate 8

Gate 8 remains the final release gate after Slice 21B.

---

## 5. Compact roadmap

```text
14
→ 15
→ representative seeds
→ broad verification
→ 21A design audit/core refinement
→ MILESTONE 1

→ Gate 7 technical preflight
→ 16
→ 17
→ 18
→ 19
  ↳ design-audit corrections continue in parallel
→ 20
→ 21B final polish
→ final release verification
→ MILESTONE 2
```
