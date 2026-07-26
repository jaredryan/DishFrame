# Claude Code Planning Prompt — DishFrame

You are working in the `dishframe` repository.

Your task in this run is **technical planning only**. Read the supplied product and brand documents, inspect the repository, and create exactly two planning documents:

1. `docs/ARCHITECTURE_PROPOSAL.md`
2. `docs/BUILD_PLAN.md`

After writing those two documents, stop and wait for review. Do not begin product implementation.

---

## 1. Source-of-truth order

Read these documents fully before planning:

1. `PRODUCT_SPEC.md`
2. `BRANDING.md`
3. `PRODUCT_ROADMAP.md`
4. `DishFrame_MILESTONE_1.md`
5. `MILESTONE_2.md`

Authority rules:

- `PRODUCT_SPEC.md` is the canonical authority for detailed product behavior, terminology, priorities, edge cases, and acceptance criteria.
- `DishFrame_BRANDING.md` governs brand character, visual direction, tone, and design principles.
- `PRODUCT_ROADMAP.md` provides broader vision and roadmap context. Where it conflicts with the canonical Product Specification, follow `PRODUCT_SPEC.md`.
- The milestone documents describe the existing platform scaffold and prior setup work.
- The repository confirms the actual installed stack and working infrastructure, but its placeholder pages do not define the product domain.
- Do not use `PRODUCT_SPEC_1.md` through `PRODUCT_SPEC_4.md` as competing sources. They are superseded by the consolidated `PRODUCT_SPEC.md`.

If you find a genuine contradiction inside the canonical Product Specification, do not silently choose a different product behavior. Record it in a clearly labeled **Product Questions Requiring Owner Decision** section of `ARCHITECTURE_PROPOSAL.md`.

---

## 2. Current repository state

DishFrame is effectively a greenfield application.

The repository contains working platform scaffolding, authentication, deployment configuration, and mostly empty product pages. It does not contain a mature Recipe, Version, Part, Cooking Session, rating, grocery, or Meal Plan domain that must be preserved.

Expected established stack:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- Neon PostgreSQL
- Prisma 7
- Better Auth with Google OAuth
- Resend
- Vercel

Inspect the repository to verify the exact installed versions, conventions, routes, authentication setup, and deployment assumptions.

Preserve working infrastructure. Do not infer product architecture from placeholder pages.

Prefer a cohesive Next.js full-stack monolith. Do not introduce microservices, containers, Kubernetes, queues, or other operational complexity without a concrete requirement from the Product Specification.

---

## 3. Restrictions for this run

You may inspect files, configuration, package metadata, and the current application structure.

You may create or edit only:

- `docs/ARCHITECTURE_PROPOSAL.md`
- `docs/BUILD_PLAN.md`

Do not:

- modify application source code;
- modify Prisma schema files;
- generate or run migrations;
- install or remove packages;
- create UI components;
- create routes or server actions;
- change authentication;
- alter deployment configuration;
- create additional planning documents;
- begin implementation.

The two requested documents must contain the complete planning output. The supporting subjects listed below are sections inside those documents, not additional deliverables.

Be opinionated. Where several technical approaches are viable, recommend one and explain why it best fits DishFrame. Avoid presenting a menu of vague alternatives without a conclusion.

Do not simplify or discard unusual product rules merely because a more conventional model would be easier to code.

---

# Deliverable 1: `docs/ARCHITECTURE_PROPOSAL.md`

Create an implementation-ready architecture proposal. It must include the following.

## A. Executive recommendation

- Summarize the recommended application architecture.
- State the major architectural principles.
- Explain how the proposal supports both the immediate Tier 1 build and the planned Tier 2 work.
- Identify which Tier 3 extension points should be accommodated without implementing Tier 3 now.

## B. Existing scaffold assessment

Briefly document:

- verified framework and package versions;
- existing authentication and session behavior;
- database and Prisma setup;
- current route and component organization;
- image/file handling already present;
- deployment assumptions;
- useful conventions worth retaining.

Keep this assessment proportional. The scaffold is not a legacy domain to reverse-engineer.

## C. Application and information architecture

Propose:

- route structure;
- authenticated application shell;
- primary navigation;
- major page boundaries;
- server/client component boundaries;
- form and editor architecture;
- shared UI/domain component boundaries;
- where responsive cooking behavior differs from ordinary management screens.

Do not produce a full visual design specification. The architecture should leave room for Claude’s frontend-design capabilities during implementation and for an evolving `DESIGN_DECISIONS.md` later.

## D. Domain model and Prisma proposal

Provide a detailed proposed relational model, including important fields, relations, constraints, indexes, and ownership boundaries.

Cover at minimum:

- users and product preferences;
- Recipes and Recipe Versions;
- Parts and Part Versions;
- Sections and ordered content;
- ingredients, quantities, substitutes, and units;
- nested Part references;
- Stages, cuisine, Flavor profiles, tags, and protected Favorite behavior;
- images;
- Version-note annotations;
- source/duplication provenance snapshots;
- Cooking setup inputs where persistence is required;
- Cooking Sessions, selected units, progress, checkoffs, scaling, timers, and outcomes;
- Cooking notes and Session Reviews;
- Tasters and ratings;
- provisional rating sources;
- grocery lists, items, categories, source breakdowns, and completion history;
- Meal Plans, entries, planned meals, statuses, and linked active grocery lists;
- account-to-account shares and read-only share links;
- backup/import metadata where persistent records are needed;
- Tier 3 publication extension points without implementing a public product now.

A readable entity-and-field specification or annotated pseudo-Prisma is acceptable. It must be detailed enough to guide the real schema implementation.

## E. Stable identity versus Version-owned data

Explicitly map every important field to:

- stable Recipe/Part identity;
- immutable Recipe/Part Version content;
- mutable Version-note annotation;
- user preference;
- session snapshot;
- share/public snapshot;
- duplication/source snapshot.

Explain how the architecture enforces the distinction.

## F. Versioning strategy

Define:

- storage of integer major and minor segments;
- current-Version selection;
- historical-major refinement;
- source-Version relationships;
- small update versus new major Version;
- propagation-only Recipe updates;
- Version comparison data;
- image inheritance;
- transaction behavior when creating a Version;
- protection against accidental in-place content mutation.

## G. Nested Parts and cycle prevention

Define:

- representation of Parts inside Recipes and Parts;
- ordering and placement;
- exact Part Version references;
- multiple Parts per Section;
- cycle detection;
- validation timing;
- query strategy for resolved nested content;
- reasonable protection against pathological depth without inventing an arbitrary product restriction.

## H. Snapshot and materialization strategy

Give one coherent strategy for:

- immutable Cooking Session context;
- generated standalone grocery-list snapshots;
- live Meal Plan-linked grocery lists;
- completed grocery-list history;
- fixed share snapshots;
- live-current share links;
- duplicated/shared starting-point snapshots;
- historical Part references materialized during Part deletion;
- surviving references after Recipe deletion;
- future Tier 3 published snapshots.

Clarify which snapshots are normalized rows, structured JSON, or another representation, and justify the choice.

## I. Mutations, transactions, and concurrency

Identify major mutation boundaries and required database transactions, including:

- creating and editing Recipes and Parts;
- saving minor and major Versions;
- converting local content into a Part;
- detaching a Part;
- propagating Part updates to selected Recipes and Parts;
- deleting referenced Parts;
- beginning and ending Cooking Sessions;
- saving Reviews and ratings;
- generating and synchronizing grocery lists;
- adopting a newer Version in a Meal Plan;
- accepting independent shared copies;
- account deletion.

Address:

- idempotency where relevant;
- optimistic concurrency or stale-edit handling;
- multi-device session limitations;
- rollback behavior;
- partial-failure prevention.

## J. Deletion and cascade behavior

Create an explicit deletion matrix for:

- Recipe deletion;
- Part deletion;
- Version preservation;
- Taster deletion;
- Review deletion;
- rating deletion;
- grocery-list deletion;
- Meal Plan deletion;
- image cleanup;
- share revocation;
- account deletion.

Distinguish:

- true cascading deletion;
- retained static snapshots;
- detached or materialized content;
- surviving independent copies.

## K. Server and data-access architecture

Recommend:

- Server Components versus Client Components;
- Server Actions versus Route Handlers;
- validation library and schema placement;
- service/domain-function boundaries;
- transaction helpers;
- authorization checks;
- query organization;
- caching and revalidation;
- background work, if genuinely needed;
- error-handling conventions.

Prefer the simplest architecture that keeps domain rules testable and centralized.

## L. External integrations

Plan architecture for:

- USDA FoodData Central search;
- editing and detaching imported nutrition data;
- optional barcode lookup;
- Resend use, if required by direct sharing or account behavior;
- image storage;
- export/download generation;
- import parsing and Recipe Gallery migration.

Do not assume AI-assisted parsing in Tier 1 or Tier 2.

## M. Security and privacy

Address:

- owner scoping;
- authorization for every stable item and nested relationship;
- Taster privacy;
- share-link token storage and revocation;
- independent-copy boundaries;
- secret exclusion from backups;
- authentication-session management;
- account deletion;
- safe file/image handling;
- rate limiting for relevant Tier 2 and Tier 3 surfaces.

## N. Indexing, performance, and data growth

Recommend indexes and query strategies for:

- current Version retrieval;
- Version history;
- Recipe and Part libraries;
- search fields;
- tag, cuisine, Flavor-profile, Stage, and rating filters;
- Part usage lookup;
- active Cooking Sessions;
- session and rating summaries;
- Meal Plan ranges;
- grocery synchronization;
- share tokens.

Avoid premature distributed architecture, but account for long Version and session histories.

## O. Testing architecture

Define:

- unit-test boundaries for domain rules;
- integration tests for transactions and Prisma behavior;
- component tests where useful;
- end-to-end flows;
- fixtures/factories;
- database isolation;
- critical invariants;
- deletion and snapshot tests;
- nested-Part cycle tests;
- Version-number tests;
- propagation tests;
- authorization tests.

## P. Risks, tradeoffs, and owner questions

Identify the highest-risk implementation areas.

For each major tradeoff:

- recommend one approach;
- explain why;
- state what it costs;
- identify any migration risk.

List only genuine product questions that cannot be answered by `PRODUCT_SPEC.md`.

---

# Deliverable 2: `docs/BUILD_PLAN.md`

Create a concrete vertical-slice implementation plan derived from the architecture proposal.

## A. Planning principles

The plan must:

- build end-to-end usable slices rather than disconnected model layers;
- preserve the working scaffold;
- keep Tier 1 usable at intermediate milestones;
- account for foundational Tier 2 needs early;
- avoid implementing Tier 3 productization unless needed as a cheap extension point;
- include tests in every slice;
- include explicit review checkpoints before high-risk domain work;
- reference relevant sections of `PRODUCT_SPEC.md`.

## B. Required detail for every slice

For each implementation slice, include:

- objective;
- user-visible outcome;
- domain entities and schema changes;
- migrations;
- routes/pages;
- major components;
- Server Actions or Route Handlers;
- validation and authorization;
- tests;
- dependencies;
- completion/acceptance criteria;
- manual QA targets;
- risks;
- whether a review checkpoint is required before continuing.

## C. Recommended broad sequence

You may refine the exact sequence, but preserve the following product priorities unless the architecture proposal justifies a better ordering.

### Foundation and core Tier 1

1. Application information architecture, navigation, design foundation, and shared editor patterns.
2. Foundational Prisma domain and user-owned organizational metadata.
3. Recipe and Part libraries, creation, detail, editing, archive, and duplication.
4. Immutable Version creation, historical-major behavior, navigation, notes, and comparison.
5. Sections, ingredients, quantities, substitutes, images, and scaling.
6. Nested Parts, Part usage, detaching, propagation, cycle prevention, and deletion materialization.
7. Cooking setup and Cooking Session lifecycle.
8. Cooking-mode focus, progress, scaling, and persistent timers.
9. Session Reviews, Cooking notes, Tasters, ratings, provisional ratings, and the learning loop.
10. Search, filtering, sorting, tags, Favorite, cuisine, and Flavor profiles.
11. Deterministic import, Recipe Gallery migration, export, and backup.
12. Standalone grocery lists and grocery categories.

### Planned Tier 2

13. USDA FoodData Central nutrition integration and expanded nutrients.
14. Optional barcode lookup if implementation and browser QA remain proportionate.
15. Meal Plans, planned meals, recommendations, and live grocery synchronization.
16. Read-only share links and independent copies.
17. Direct account-to-account sharing.
18. Print/PDF presentation.
19. Profile/security refinements, authentication-session management, and sharing management.
20. Progressive onboarding and Help.
21. Desktop cooking refinement and final cross-product polish.

The plan may combine or split these when it creates more coherent vertical slices. Explain every meaningful deviation.

## D. Review gates

At minimum, include stop-and-review gates:

1. After the proposed foundational Prisma schema and first migration plan, before schema implementation.
2. After the first coherent Recipe/Part library and editor design direction.
3. Before implementing nested-Part propagation and deletion materialization.
4. Before implementing Cooking Session persistence and timers.
5. Before implementing Meal Plan-linked grocery synchronization.
6. Before implementing cross-account copying and sharing.
7. At Tier 1 completion before beginning Tier 2.
8. At Tier 2 completion before considering Tier 3.

## E. Definition of done

Conclude with:

- Tier 1 definition of done;
- Tier 2 definition of done;
- deferred Tier 3 list;
- proposed release/verification checklist;
- recommended first implementation slice after plan approval.

---

## 4. Final response for this planning run

After creating the two documents:

- provide a concise summary of the recommended architecture;
- list the proposed first implementation slice;
- list any genuine owner questions;
- confirm that no product code, schema, migration, package, or configuration was changed;
- stop and wait for review.

Do not begin implementation until explicitly authorized.
