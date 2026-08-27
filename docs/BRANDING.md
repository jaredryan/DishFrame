# DishFrame — Branding, Voice & Design Principles

**Document status:** Stable brand reference  
**Purpose:** Preserve the agreed name, positioning, visual identity, language, design motif, and interface guardrails for future product, frontend, and implementation work.

---

## 1. Product Name

# DishFrame

### Styling

Use the product name as one word with an internal capital:

- **DishFrame**
- Repository slug: `dishframe`
- Suggested project folder: `dishframe`

Avoid:

- Dish Frame
- Dishframe
- literal picture-frame interpretations of the name

### Meaning

**DishFrame is short for Dish Framework.** It is not related to picture
frames, framed photos, or gallery/museum display — "Frame" refers to a
structural framework (as in "framework for cooking"), not a picture frame.
Do not describe the name as meaning that recipes are placed inside a
frame. (Slice 21 clarification — this was implicit in the original name
rationale below but was stated explicitly after the public-site redesign
pass needed an unambiguous guardrail.)

DishFrame is a framework for organizing, preparing, cooking, evaluating, and improving dishes.

The name supports the product’s main ideas:

- complete recipes organized into clear sections;
- sauces, grains, proteins, sides, toppings, and other preparations reused across recipes;
- cooking sessions narrowed into focused views;
- previous versions preserved and compared;
- notes and ratings carried forward into the next meal;
- meal planning grounded in recipes that already work.

“Dish” gives the product a concrete culinary center.

“Frame” communicates structure, context, organization, modularity, and room to grow into future cooking-related features.

### Name status

DishFrame is the committed working identity for the project.

A preliminary collision check did not reveal an obvious active recipe-management or cooking-software product using the same exact name. This is sufficient for development and a GitHub repository, but it is not formal trademark clearance.

---

## 2. Product Positioning

DishFrame is not another passive recipe gallery.

It is:

> **A modern framework for the way people actually cook: organize what they know, reuse what already works, and improve dishes over time.**

The product combines familiar recipe-management functionality with a stronger emphasis on:

- flexible recipe organization;
- reusable preparations;
- recipe versions;
- cooking history;
- session reviews;
- ratings from multiple people;
- learning from every meal;
- planning future meals from proven experience.

The underlying product may be engineered as a structured system, but the experience should remain natural to an ordinary home cook.

---

## 3. Governing Brand Principle

> **DishFrame thinks in systems but speaks like a capable home cook.**

The product may use components, modules, immutable versions, dependency relationships, and structured records internally.

The interface should usually speak in familiar terms:

- recipe;
- section;
- part;
- version;
- cooking session;
- notes;
- rating;
- servings;
- plan.

A lightly organized tone is appropriate. Software and engineering jargon is not.

---

## 4. Brand Personality

DishFrame should feel:

- modern;
- vibrant;
- bold;
- organized;
- clear;
- efficient;
- confident;
- consumer-facing;
- thoughtfully tactile;
- flexible rather than rigid;
- polished without feeling precious;
- warm through its content rather than rustic decoration.

DishFrame should not feel:

- farmhouse-inspired;
- excessively cozy or cutesy;
- dominated by cream, orange, or sage;
- like an organic grocery brand;
- like a restaurant-ordering product;
- like a calorie-tracking dashboard;
- like enterprise SaaS;
- like a developer IDE;
- black-and-neon;
- rainbow-driven or chaotic;
- clinical or sterile.

### Core design premise

> **The interface supplies clarity. The food and human feedback supply warmth.**

Warmth should come primarily from:

- food photography;
- natural ingredient color;
- names and ratings from family or other tasters;
- cooking notes;
- conversational prompts;
- subtle motion;
- generous spacing;
- familiar language.

---

# 5. Design Motif: Modular Preparation

The central motif is:

> **Complex dishes made manageable through clear, modular preparation.**

This reflects the whole product:

- recipes contain sections;
- some preparations can be saved and reused;
- versions preserve iteration;
- cooking mode narrows attention;
- planning combines complete dishes;
- session reviews turn experience into improvements.

The interface should make complexity feel calm.

---

## 5.1 Modular surfaces

The basic visual unit is a clean white card on a pale cool-gray background.

Cards may represent:

- recipes;
- reusable parts;
- recipe sections;
- cooking sections;
- previous versions;
- cooking-history entries;
- planned dishes.

Recommended treatment:

- moderate corner radii, approximately 12–16px;
- thin cool-gray borders;
- restrained shadows;
- generous internal spacing;
- clear headings;
- concise metadata;
- color used as an accent rather than a full-card fill.

Cards should feel related without becoming identical templates.

---

## 5.2 Frames within frames

Larger pages may contain nested structures:

- a recipe view containing Sauce, Rice, Chicken, Vegetables, and Finish sections;
- a cooking session containing only the sections selected for that day;
- two versions shown beside one another;
- a meal plan containing several recipe cards.

Show nesting primarily through:

- spacing;
- surface contrast;
- headings;
- subtle dividers;
- occasional colored rails or edge accents.

Avoid heavy borders around every layer.

---

## 5.3 Colored edge language

A slim rail, edge, or top rule can communicate state without flooding the interface with color.

Examples:

- blue: selected or primary;
- green: complete, proven, active, or successful;
- purple: experimental, changed, or version-related;
- orange: cooking now, timed, or requiring immediate attention.

In cooking mode, a running section may use an orange rail and timer. A completed section may settle into green.

Color should become functional architecture rather than decoration.

---

## 5.4 Assembly behavior

Reusable parts should feel naturally inserted into complete recipes.

Possible visual cues:

- a small “Saved part” label;
- a connection or link icon;
- a nested card with a subtly tinted header;
- a version label;
- a restrained transition when adding the part to a recipe.

Avoid literal puzzle-piece graphics and exaggerated snapping animations.

---

## 5.5 Progressive focus

DishFrame naturally moves through five levels:

1. Browse many dishes.
2. Open one recipe.
3. Prepare one cooking session.
4. Focus on one section or timer.
5. Review how the meal went.

The interface should visually tighten as the user moves deeper.

### Library

Broad, visual, and easy to scan.

### Recipe detail

Structured and information-rich.

### Cooking setup

Selectable and reorderable.

### Cooking mode

Larger, simpler, and focused.

### Session review

Conversational and reflective.

This progressive focusing should become one of the product’s strongest interaction patterns.

---

## 5.6 “Frame” as composition, not decoration

Express the name through:

- modular cards;
- nesting;
- containment;
- clear sections;
- connected reusable parts;
- adjacent comparisons;
- focus transitions;
- structured planning surfaces.

Avoid:

- ornamental photo frames;
- picture-frame icons as the main identity;
- thick boxes around everything;
- rigid grids on every screen;
- forcing the motif where it does not improve clarity.

A frame supplies structure while leaving room for variation.

---

# 6. Color Strategy

DishFrame uses:

- **two main brand colors**;
- **two narrowly assigned semantic accents**;
- **a restrained neutral foundation**.

### Color meaning

> **Blue frames the system.**  
> **Green marks what works.**  
> **Purple shows what changed.**  
> **Orange shows what is cooking.**

### Directional visual balance

These are guidelines, not literal quotas:

- Neutral surfaces and typography: approximately **80%**
- Blue: approximately **12%**
- Green: approximately **5%**
- Purple: approximately **2%**
- Orange: approximately **1%**

Most screens should not display all four accent colors at equal strength.

Food photography will add natural color. The interface should frame it rather than compete with it.

---

## 6.1 Primary blue

Blue is the primary product and interaction color.

Use it for:

- primary buttons;
- active navigation;
- links;
- focus rings;
- selected filters;
- active tabs;
- important controls;
- cooking progress;
- selection states.

Character:

- vivid cobalt or royal blue;
- saturated and confident;
- fresh and modern;
- energetic without becoming neon.

Provisional tokens:

```css
--blue-600: #2563eb;
--blue-dark: #4f7dff;
```

---

## 6.2 Secondary green

Green is the secondary brand color and the main positive-state color.

Use it for:

- successful completion;
- completed cooking sections;
- positive outcomes;
- Proven recipe states;
- successful updates;
- strong ratings or improvement indicators;
- freshness-related secondary emphasis.

> **Amended by the Slice 6 design remediation pass (owner-approved, in
> that pass's own conversation):** Active previously shared this same
> green with Proven at two opacities, which read as indistinguishable at a
> glance — Active now uses the primary blue family instead, leaving green
> as Proven's own distinct "what works" signal. Wherever this document still
> says "Active" alongside green below (§9's screen-level color use), treat
> Active as blue and Proven as the green state.

Character:

- fresh and saturated;
- slightly blue-leaning;
- not sage;
- not lime;
- not olive;
- never the dominant navigation color.

Provisional tokens:

```css
--green-600: #16a66a;
--green-dark: #34d78d;
```

---

## 6.3 Evolution purple

Purple represents development and change.

Use it selectively for:

- recipe versions;
- version history;
- comparisons;
- Experimental recipe status;
- changed sections or ingredients;
- revision actions;
- recipe evolution.

Character:

- vivid but controlled;
- clearly distinguishable from blue;
- uncommon enough to make version-related experiences feel special.

Provisional tokens:

```css
--purple-600: #7c3aed;
--purple-dark: #a575ff;
```

---

## 6.4 Cooking orange

Orange represents active cooking, heat, and immediate attention.

Use it selectively for:

- running timers;
- cooking-in-progress;
- heat-related indicators;
- time-sensitive attention;
- warnings that are not errors;
- nearly complete progress.

Orange must not dominate:

- navigation;
- marketing pages;
- general primary buttons;
- large page backgrounds;
- the overall product identity.

Character:

- vivid tangerine;
- energetic;
- clearly different from red;
- functional rather than rustic.

Provisional tokens:

```css
--orange-600: #f97316;
--orange-dark: #ff9a4d;
```

---

## 6.5 Red

Reserve red for:

- destructive actions;
- errors;
- dangerous states;
- failed operations;
- critical warnings.

Do not use interface red merely because food photography often contains red.

---

# 7. Light Theme

The light theme should feel bright and crisp without being stark white everywhere.

Foundation:

- pale cool-gray page background;
- clean white cards;
- white or lightly tinted raised surfaces;
- graphite primary text;
- cool medium-gray secondary text;
- subtle cool-gray borders;
- soft, restrained shadows.

Provisional tokens:

```css
--background: #f4f6f8;
--surface: #ffffff;
--surface-subtle: #f8fafc;
--text-primary: #252932;
--text-secondary: #667080;
--border: #dfe4ea;
```

Cards should stand out through:

- surface contrast;
- spacing;
- hierarchy;
- fine borders;
- restrained depth.

Avoid:

- heavy shadows;
- beige backgrounds;
- dark outlines around every element;
- excessive gradients.

---

# 8. Dark Theme

Dark mode should remain colorful and consumer-facing rather than resembling a coding application.

Foundation:

- smoky dark-gray or slate background;
- lighter slate card surfaces;
- soft off-white text;
- subdued but visible borders;
- brighter variants of the same accents.

Avoid:

- pure black;
- near-black surfaces everywhere;
- neon-on-black;
- terminal styling;
- cold navy covering the entire interface.

Provisional tokens:

```css
--background-dark: #252932;
--surface-dark: #303641;
--surface-raised-dark: #39404c;
--text-primary-dark: #f5f7fa;
--text-secondary-dark: #b8c0cc;
--border-dark: #48515f;
```

The same semantic hierarchy remains:

- blue is primary;
- green means successful and ready;
- purple means evolving or changed;
- orange means active cooking or time.

Exact shades may be adjusted for accessible contrast and equal perceived intensity.

---

# 9. Screen-Level Color Use

## Recipe library

- neutral foundation;
- blue navigation and controls;
- green Active or Proven states;
- purple Experimental state where relevant;
- minimal orange.

## Recipe detail

- blue primary actions;
- green success and trusted status;
- purple version navigation;
- orange only for cooking or time-sensitive information.

## Version comparison

- neutral surfaces;
- blue controls;
- purple version markers and changed content;
- green accepted or successful changes;
- little or no orange.

## Cooking mode

- neutral surfaces;
- blue navigation and controls;
- green completed steps;
- orange running timers and active cooking;
- purple generally absent unless revision is directly relevant.

## Session review

- blue save actions;
- green successful results;
- purple creating or reviewing a new version;
- orange unfinished timing information.

## Meal planning

- blue selection and planning;
- green Active and Proven suggestions;
- purple Experimental recipes;
- orange schedule pressure or warnings, not decoration.

---

# 10. Typography Direction

Exact fonts are not locked yet.

Provisional pairing for early scaffolding:

- **Manrope** for headings and display text;
- **Inter** for body and interface text.

This pairing should remain easy to replace during the frontend-design phase.

Typography should be:

- modern;
- highly readable;
- clean;
- slightly expressive at display sizes;
- efficient in ingredient lists and metadata;
- comfortable on phones and tablets.

Use tabular numerals where useful for:

- timers;
- quantities;
- ratings;
- nutrition.

Avoid:

- script fonts;
- rustic handwriting as a primary typeface;
- novelty food fonts;
- extensive monospace;
- geometry that harms readability.

The internal capital in **DishFrame** should remain legible in the wordmark.

---

# 11. Imagery Direction

Food photography is the primary source of visual warmth.

Prefer:

- appetizing real dishes;
- natural ingredient color;
- clear lighting;
- modern composition;
- enough negative space to coexist with interface elements;
- version-specific photography only when a meaningful change warrants it.

Avoid:

- generic stock-food overload;
- heavy rustic-table styling;
- orange filters;
- excessive wooden textures;
- food illustrations everywhere;
- requiring an image for every recipe.

DishFrame must remain attractive when a recipe has no image.

---

# 12. Shape, Surface & Layout

Use:

- modular cards;
- moderate radii;
- clear grouping;
- strong whitespace;
- precise alignment;
- subtle depth;
- occasional connected or nested structures;
- responsive layouts intentionally adapted to each screen size.

Avoid:

- excessively bubbly design;
- putting every value inside a pill;
- dense administrative tables everywhere;
- heavy skeuomorphism;
- ornamental borders;
- forcing bento layouts onto every page;
- chaotic broken-grid composition.

The layout should communicate a framework without becoming mechanically repetitive.

---

# 13. Motion

Motion should support structure and focus.

Potential uses:

- sections expanding into cooking mode;
- reusable parts settling into recipes;
- versions sliding into comparison;
- completed steps settling into a finished state;
- timers drawing attention without aggressive flashing;
- cards and filters reorganizing smoothly.

Motion should be:

- restrained;
- fast;
- purposeful;
- primarily transform- and opacity-based;
- respectful of reduced-motion preferences.

Avoid:

- slow decorative transitions;
- bouncing controls;
- constant ambient animation;
- motion that competes with cooking.

---

# 14. Product Vocabulary

The codebase may use precise technical model names. The interface should use familiar cooking language.

## Reusable part

A reusable preparation saved independently and used in more than one recipe.

Examples:

- White Rice
- Nuoc Cham
- Pickled Carrots
- Air-Fried Chicken
- Toasted Almond Topping

Navigation label:

> **Parts**

Page heading:

> **Reusable Parts**

Supporting copy:

> Save the sauces, sides, staples, and preparations you use across more than one recipe.

“Part” is intentionally ordinary. The page heading and nearby copy should supply context where the one-word label would otherwise be vague.

## Section

A grouping inside one recipe or cooking session.

Examples:

- Sauce
- Rice
- Chicken
- Vegetables
- Finish

A section may be written only for that recipe or linked to a saved reusable part.

Use:

- Add a section
- Reorder sections
- Choose which sections you’re making today

## Recipe status

Use **Recipe Status** in the interface instead of Lifecycle.

Values:

- Idea
- Experimental
- Proven
- Active
- Archived

## Cooking session

“Cooking session” is acceptable user-facing language when the period of cooking itself needs a name.

Use naturally:

- Start cooking session
- Resume cooking session
- Cooking history
- Last cooked
- Previous sessions

Do not unnecessarily number or formalize sessions.

## Session review

The optional reflection after cooking may be called a **Session Review** in navigation or internal headings.

The main conversational heading should usually be:

> **How did it go?**

Questions may include:

- Who tried it?
- How would everyone rate it?
- What worked?
- What would you change?
- How many servings did it make?
- Save these changes as a new version?

## Servings made

Use:

- Servings made
- How many servings did it make?
- Expected servings
- Makes 6 servings

Avoid “actual yield” in the interface.

## Taster

“Taster” is acceptable when a concise noun is useful.

Prefer conversational copy where possible:

- Who tried it?
- Add a taster
- Ratings by person
- Mom rated it 10/10

## Version

“Version” is a core product term and is familiar enough to use directly.

Use:

- Version 3
- Compare versions
- Save as a new version
- Restore this version
- What changed?

### Terminology map

| Internal or planning language | Preferred interface language    |
| ----------------------------- | ------------------------------- |
| Component                     | Part / Reusable Part            |
| Module                        | Section                         |
| Lifecycle                     | Recipe Status                   |
| Cook log                      | Cooking History                 |
| Post-cook workflow            | Session Review / How did it go? |
| Actual yield                  | Servings Made                   |
| Expected yield                | Expected Servings / Makes       |
| Dependency                    | Recipes Using This Part         |
| Propagate update              | Update Everywhere               |
| Dashboard                     | Home                            |

---

# 15. Voice Principles

## Speak to capable home cooks

Do not lecture users, praise routine actions, or dramatize cooking.

Prefer:

> Save what worked for next time.

Avoid:

> Unlock your culinary potential.

## Use ordinary verbs

Prefer:

- save;
- make;
- cook;
- try;
- change;
- plan;
- share;
- compare;
- reuse;
- organize;
- review.

Avoid leading with:

- optimize;
- configure;
- propagate;
- leverage;
- mutate;
- execute.

## Describe concrete things

Prefer:

> Save the sauces, grains, and sides you make often.

Avoid:

> Create reusable recipe structures.

Prefer:

> How many servings did it make?

Avoid:

> Record the actual yield.

## Allow light organizational language

DishFrame is a systematized approach to cooking. Light organizational language is appropriate:

- organize;
- status;
- section;
- session;
- review;
- history;
- version;
- compare.

The line is crossed when copy begins sounding like software architecture, enterprise operations, or a laboratory report.

## Keep the system mostly invisible

Prefer:

> Use this rice in another recipe.

Avoid:

> Add this component as a dependency.

## Warm, not cutesy

Prefer:

- How did it go?
- Ready to cook?
- Save it for next time.
- Nothing here yet.
- You have not made this one in a while.

Avoid:

- Let’s make some magic!
- Yum! Great job!
- Your culinary adventure begins here!
- Time to whip up something delicious!

## Explain consequences near decisions

Example:

> **Update this part everywhere?**  
> Six recipes use this version. Updating them will create a new version of each recipe.

Be direct about what will happen without exposing technical implementation details.

---

# 16. Public Copy Direction

> **Superseded by the Slice 21 public-site redesign.** The headline,
> pillar, About, and Contact copy below is the pre-Slice-21 draft, kept
> for history. The current-truth public copy is the block that follows
> it (see also §23 "Final Implementation Updates" for what shipped after
> that).

## Hero (superseded)

Headline:

> ~~A better framework for the way you cook.~~

Supporting copy:

> ~~Keep recipes organized, reuse what already works, and save what you learn each time you cook.~~

## Homepage pillars (superseded)

### Reuse what you already know

> Save the sauces, grains, proteins, sides, and toppings you make often, then use them across any recipe.

### Learn from every meal

> Keep ratings and notes from each time you cook, so you remember what worked and what you want to change.

### Plan from what works

> Organize recipes your way, keep track of what you’re still practicing, and use recent meals to decide what belongs in the week ahead.

## About page (superseded)

Opening:

> DishFrame began with a simple idea: cooking does not end when the meal is served. Every time you make something, you learn what worked, what changed, who liked it, and what you want to do differently next time.

### More workshop than recipe box

> DishFrame helps you keep the preparations you use often, organize complete recipes around them, and preserve each version as your cooking changes.

## Contact page (superseded)

> Questions, ideas, or feedback about DishFrame? Send a note. The product is still taking shape, and practical feedback from real home cooks is especially useful.

---

## 16.1 Current public copy (Slice 21)

DishFrame is a **personal cooking framework**. Its defining idea:

> Recipes are living things that improve through cooking.

### Hero

Eyebrow:

> Your personal cooking framework

Headline (canonical visible Home hero H1):

> **Build dishes the way you actually cook.**

Approved supporting brand language (not the visible H1, but still current —
used in `<title>`/OpenGraph metadata and available for promotional or other
secondary contexts where benefit-oriented phrasing fits better than the H1):

> Recipes that get better every time you cook.

Supporting copy:

> Turn scattered notes into structured, living recipes you can cook from, improve over time, plan around, and share with the people you feed.

Primary action (signed out):

> **Create your first Recipe**

Primary action (signed in — truthful, never a generic “Sign in” or “Start
building” once a session exists):

> **Open DishFrame**

Secondary action (scrolls to the on-page workflow explanation, does not
navigate away):

> **See how DishFrame works**

Reassurance line (not a major selling point, a small aside):

> Private by default. Built for real kitchens.

### Short brand line

> **Cook. Refine. Repeat.**

Used in the footer and sparingly elsewhere — not forced into every
section.

### Core loop

Primary conceptual loop (Home’s central workflow section):

> **Build → Cook → Improve**

Expanded workflow (Home’s Meal Plan/Grocery List connective section):

> **Plan → Shop → Cook → Review → Refine**

### Home content architecture

In order: Hero; “A Recipe is more than a list of ingredients” (what a
working Recipe holds vs. where that knowledge usually gets lost); the
Build → Cook → Improve workflow as a connected step timeline; a Reusable
Parts moment (one Part visually connected to the Recipes that use it);
the Plan → Shop → Cook → Review → Refine connected path; one concise
sharing section; a closing CTA (“Start with the Recipe you already
make.”).

### About page

Hero:

> Recipes aren’t finished. They’re learned.

Structure: an origin story told as two frustrations (recipes were hard to
cook from; recipes were hard to improve and maintain), each resolving
into the DishFrame features it produced; three product principles
(Cooking comes before collecting; Structure without rigidity; Improvement
without erasing history); a closing statement (“DishFrame is built for
the Recipes you return to — the ones that slowly become yours.”). Does
not repeat Home’s full feature inventory, and does not mention any
AI tool in the origin story.

### Contact page

Heading:

> Help make DishFrame better.

Supporting copy:

> Found a bug, ran into friction while cooking, or have an idea that would improve the experience? Send a note.

Desktop layout is two columns: the form beside a small branded
Cooking-Mode-with-a-note illustration (`ContactVisual`), not a form alone
on an empty page. A concise privacy line sits near the submit button,
linking to `/privacy`. No response-time guarantee, no topic selector (the
existing three-field form’s stability was prioritized over adding one).

Do not invent an office, support department, company history, fake email address, or response-time guarantee.

### Privacy and Terms

New public routes, `/privacy` and `/terms`, share a single
`LegalLayout` component (effective date, title, then plain typographic
sections). Both are product-aligned baseline policies grounded in actual
implementation (Google auth, Neon/Vercel hosting, Vercel Blob images,
Resend for contact-form email only, USDA FoodData Central for nutrition
search, no analytics/tracking installed). **Both need professional legal
review before a broad commercial launch** — tracked in `docs/TODO.md`.

## Sign-in page

Heading:

> **Welcome to DishFrame**

Supporting copy:

> Sign in to keep your recipes, reusable parts, and cooking history in one place.

Button:

> **Continue with Google**

Reassurance:

> Your recipes stay private unless you choose to share them.

## Signed-in Home empty state

Heading:

> **Start your DishFrame**

Supporting copy:

> Add your first recipe or bring one over from your existing notes. As you cook, DishFrame will help you remember what worked and improve it next time.

Initial actions:

- Create a recipe
- Import a recipe

Until those features exist, actions should route to honest placeholder screens or clearly indicate that they are coming next.

Suggested empty sections:

- Recent Recipes
- Active Dishes
- Saved Parts
- Latest Notes

Use simple empty text such as:

> Nothing here yet.

---

# 17. Navigation Language

## Public navigation

- Home
- About
- Contact
- Sign in
- Create your first Recipe *(primary CTA)*

Shown identically to every visitor regardless of auth state — see §23
"Final Implementation Updates" (the earlier signed-in-only "Open
DishFrame" variant was superseded by the fully static public site).

Footer additionally links About, Contact, Privacy, and Terms, plus the
short brand line "Cook. Refine. Repeat."

## Signed-in navigation

- Home
- Recipes
- Parts
- Settings
- Help

## Account menu

- Profile
- Sign out

Settled deviation (Slice 3 Gate 2 remediation): Settings and the
Light/Dark/System theme selector were both removed from
this dropdown. Settings already lives in the signed-in left navigation
(§17's own "Signed-in navigation" list did not include it, so the dropdown
copy was the only place it was duplicated), and a wide three-option
selector didn't fit a dropdown menu row well. The complete Appearance
setting (the same `ThemeToggle` control) now lives in `/settings` instead.

Prefer `/home` over `/dashboard`.

---

# 18. Public and Signed-In Design Difference

## Public site

May be more expressive, spacious, illustrative, animated, and narrative.

The hero may show an abstract DishFrame composition rather than a fake completed screenshot.

## Signed-in application

Should be calmer, denser where necessary, efficient, tactile, and focused on real tasks.

Both must share typography, colors, surfaces, radii, motion language, and the modular-preparation motif.

---

# 19. Logo & Wordmark Direction

A final logo is not yet required.

Potential concepts:

- modular blocks assembling into a dish;
- a plate or bowl divided into connected preparations;
- nested frames;
- one piece shifting to suggest revision;
- a simplified D/F monogram;
- structured lines that remain recognizably culinary.

Avoid:

- literal ornate picture frames;
- chef hats;
- crossed forks and spoons;
- orange flames as the main identity;
- generic leaves;
- code brackets;
- symbols requiring an engineering explanation.

The wordmark should preserve **DishFrame** with a clearly legible internal capital F.

---

# 20. Design Guardrails

## Always

- Keep blue visually dominant.
- Use green as the secondary positive and food-adjacent color.
- Assign purple primarily to evolution and versions.
- Assign orange primarily to active cooking and time.
- Keep most surfaces neutral.
- Use crisp white cards in light mode.
- Keep dark mode smoky and colorful, not black and technical.
- Let food photography provide natural warmth.
- Express “Frame” through organization and focus.
- Prioritize phone and tablet clarity for cooking.
- Maintain accessible contrast.
- Use familiar cooking language in the interface.

## Never

- Make orange the dominant brand color.
- Turn green into the primary navigation system.
- Use all four accents equally on every screen.
- Drift into a rainbow identity.
- Adopt rustic cream-and-sage styling.
- Mimic an organic grocery brand.
- Use terminal-like dark mode.
- Make the product look like enterprise project management.
- Literalize picture frames throughout the interface.
- Expose software architecture through routine user-facing copy.
- Sacrifice usability to express the motif.

---

# 21. Relationship to Future Documents

## `PRODUCT_ROADMAP.md`

Defines the big-picture release sequence and feature priorities.

## `PRODUCT_SPEC.md`

Should define users, terminology, exact feature behavior, policy decisions, acceptance criteria, edge cases, and release boundaries.

## `FRONTEND_SPEC.md`

Should define information architecture, screen hierarchy, responsive layouts, exact visual tokens, typography, interactions, animation, states, and accessibility.

## `IMPLEMENTATION_SPEC.md`

Should define technical architecture, database schema, authentication, APIs, storage, testing, deployment, and theming implementation.

---

# 22. Locked Decisions

- Product name: **DishFrame**
- Repository slug: `dishframe`
- Product styling: one word with internal capital F
- Primary color: vivid cobalt/royal blue
- Secondary color: fresh blue-leaning green
- Version/evolution accent: electric violet
- Cooking/timer accent: vivid tangerine orange
- Light foundation: pale cool-gray background with white cards
- Dark foundation: smoky gray/slate, not near-black
- Brand personality: modern, vibrant, bold, structured, clear, and human
- Motif: modular preparation and progressive focus
- Visual warmth supplied primarily by food and human feedback
- Frame expressed through composition rather than literal decoration
- Governing voice: **DishFrame thinks in systems but speaks like a capable home cook**
- Main interface terms: Parts, Sections, Recipe Status, Cooking Session, Session Review, Servings Made, Version
- Public hero headline (canonical visible Home H1, resolved after Slice 21):
  **Build dishes the way you actually cook.**
- Approved supporting brand language (Slice 21 original headline, retained —
  used in metadata/`<title>`/OG, not the visible H1): **Recipes that get
  better every time you cook.**
- Public hero description (Slice 21): **Turn scattered notes into structured, living recipes you can cook from, improve over time, plan around, and share with the people you feed.**
- Short brand line (Slice 21): **Cook. Refine. Repeat.**
- Core loop (Slice 21): **Build → Cook → Improve**, expanded as **Plan → Shop → Cook → Review → Refine**
- Public-site visual direction (Slice 21): a restrained "connected framework" motif — thin connector lines and small circular nodes linking modular Recipe/Section/Part cards, reused consistently across the hero, workflow, and Parts sections; no picture-frame imagery, no fake dashboard, no stock food photography
- Exact fonts, hex values, and logo geometry remain adjustable during real-screen testing

---

# 23. Final Implementation Updates

The "connected framework" motif (§22) shipped as one signature visual grammar reused with variation across the public site, not a single one-off graphic:

- **`ClosingCta`** (shared by Home/About) uses a static full-bleed radial-gradient dot pattern as its background texture — the final, approved treatment, after an earlier mirrored-corner-flourish motif was judged too subtle to register at desktop widths.
- **Navbar** carries a small brand-specific "leading dot" that appears on the active nav link and on hover/focus, echoing the hero's own dot-indicator language.
- **About's** four-step framework section has a permanent gradient connector "thread" running through the row gutters between steps, color-blended between each step's brand color and the next (blue → green → orange → violet) — judged the single strongest visual-cohesion win of the public redesign, since it makes the "connected framework" thesis visible rather than only stated in prose.
- **Contact** intentionally carries no connector/motif decoration — judged as lacking a content-driven reason, and adding the motif everywhere would flatten it into wallpaper.
- Typography stayed Manrope (display) / Inter (body); no third typeface or new color tokens were introduced anywhere in the redesign.

**Accessible-contrast convention, now established:** any colored text (digits, labels) sitting on a tinted/colored background must use the `text-brand-{blue,green,orange,violet}-text` token variants (`globals.css`), never the raw `text-primary`/`text-brand-*` tokens — the raw tokens measured as low as 2.59:1 in places, failing WCAG AA, while the `-text` variants measure 5.87–9.64:1 in both themes. Applies to any future colored-text-on-tint component.

**Known, still-open accessibility gap (not yet acted on):** a sitewide pattern of small colored badge text on ~10%-tint backgrounds ("Proven," "Saved part," version tags, star ratings — used throughout the signed-in app, not just the public pages) generally measures 3.1–3.3:1, below the 4.5:1 AA text threshold, though these read as compact status badges rather than body text. This needs an explicit owner decision — introduce darker accessible accent-text variants system-wide, or declare these badges exempt from the AA text threshold — tracked in `docs/TODO.md`.

`/privacy` and `/terms` (see "Privacy and Terms" above) are linked from the public footer alongside the "Cook. Refine. Repeat." brand line.

**Public pages carry no signed-in personalization.** An earlier design (Slice 21) gave `PublicHeader` a `signedIn` prop so signed-in visitors saw a different header/CTA; this was later simplified so every visitor sees the same visitor-oriented header/hero/CTA regardless of auth state, restoring static prerendering for the whole marketing route group. Treat any mention elsewhere of session-aware public headers as superseded by this current state.

Final design-review scores (browser-verified against the live public pages, out of 10): Home 9.5, About 9.5, Navbar 8.5, Contact 8, Footer 8 — considered complete, with only the accessibility gap above and a couple of very-low-priority cosmetic items (asymmetric whitespace in Home's framework timeline at ≥1536px, About's step numerals sitting close to their card edge) left open.
