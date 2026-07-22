# DishFrame — Milestone 1: Foundation, Authentication & Application Shell

## Instructions for Claude

Implement this milestone now. Do not stop at a plan.

Work carefully through the entire repository, make the changes, run the relevant checks, and leave the project in a clean reviewable state. Do not push, open a pull request, or make remote changes unless I explicitly ask.

Read these documents first if they exist in the repository:

- `PRODUCT_ROADMAP.md`
- `BRANDING.md` or `DishFrame_BRANDING.md`

Treat the branding document as the source of truth for visual direction, vocabulary, and public copy. This milestone intentionally precedes the detailed product and frontend specifications.

---

# 1. Milestone Goal

Create the complete technical foundation and initial application shell for **DishFrame**.

At the end of this milestone, the repository should contain:

- a modern full-stack Next.js application;
- a live PostgreSQL-ready database configuration;
- Prisma ORM configured using current Prisma 7 patterns;
- Better Auth configured for Google OAuth;
- persistent database-backed users and sessions;
- public marketing pages;
- a protected signed-in application shell;
- light, dark, and system themes;
- responsive layouts;
- the DishFrame visual system and initial copy;
- honest placeholder pages for future recipe features;
- baseline automated tests and CI;
- complete local setup documentation.

Do **not** build recipes, reusable parts, cooking sessions, grocery lists, meal planning, or any other domain data model yet.

The only database models in this milestone should be those required by authentication, unless a minimal technical model is genuinely required by the selected libraries.

---

# 2. Technical Stack

Use the latest stable, mutually compatible releases available at execution time. Do not install prerelease, canary, beta, or experimental packages merely to appear current.

The intended stack is:

## Runtime and package management

- **Node.js 24 LTS**
- **pnpm**
- Pin the package manager in `package.json`.
- Add an `.nvmrc` or equivalent declaring Node 24.
- Add appropriate `engines` metadata.

## Application

- **Next.js 16.3 or the latest patched stable Next.js 16.x**
- **React 19.2**
- **App Router**
- **TypeScript**, latest stable release supported cleanly by the selected Next.js version
- Strict TypeScript configuration
- Server Components by default
- Client Components only where interaction requires them
- Server Actions or route handlers where appropriate
- Do not use the Pages Router

## Styling and interface

- **Tailwind CSS 4.3 or latest stable 4.x**
- **shadcn/ui**, latest stable CLI and components
- Prefer the mature accessible primitive option offered by the current shadcn setup
- CSS-variable-driven design tokens
- **next-themes** for system/light/dark preferences
- **Lucide React** for interface icons
- Provisional fonts through `next/font`:
  - Manrope for headings
  - Inter for body and interface text

Do not install a large UI framework in addition to shadcn/ui.

## Database

- **PostgreSQL**
- **Neon** as the intended hosted Postgres provider
- **Prisma ORM 7**, latest stable 7.x
- Follow current Prisma 7 ESM and generated-client conventions
- Use a custom generated client output, such as `src/generated/prisma`
- Follow the current official Neon + Prisma 7 serverless adapter setup
- Do not copy old Prisma 5/6 initialization patterns
- Do not use SQLite as a temporary substitute

## Authentication

- **Better Auth**
- Google OAuth only for Milestone 1
- Better Auth’s official Prisma adapter
- Persistent database-backed users, accounts, and sessions
- Multiple simultaneous sessions should be allowed
- Long-lived ordinary consumer-app sign-in behavior
- No email/password authentication
- No roles or permissions yet

## Validation and utilities

- **Zod** for environment and boundary validation
- Use a small internal environment-validation module rather than adding an unnecessary large framework
- Use shadcn’s standard class utilities (`clsx`, `tailwind-merge`, and CVA where installed)
- Do not install state-management or data-fetching libraries without a present Milestone 1 need

Do not add:

- Redux
- Zustand
- TanStack Query
- tRPC
- GraphQL
- React Hook Form
- an email provider
- image-upload infrastructure
- analytics
- monitoring SaaS
- AI libraries
- recipe-parsing libraries

Those choices should be made when a real feature requires them.

## Testing and quality

- ESLint using current Next.js-compatible configuration
- Prettier, including Tailwind class formatting if compatible with Tailwind 4
- **Vitest**
- **Testing Library**
- **jest-dom**
- **Playwright**
- GitHub Actions CI

Remember that Next.js 16 does not run lint automatically as part of `next build`. Provide explicit scripts and CI steps.

---

# 3. Repository Setup

## If the repository is empty

Initialize the Next.js application in the current repository rather than nesting it inside another `dishframe` directory.

Use:

- App Router
- TypeScript
- Tailwind
- ESLint
- a `src` directory
- an `@/*` import alias

## If files already exist

Preserve:

- documentation;
- Git history;
- unrelated configuration;
- user-authored content.

Do not delete `PRODUCT_ROADMAP.md` or the branding document.

## Suggested structure

Use route groups to separate public and signed-in layouts without changing clean URLs.

```text
src/
  app/
    (marketing)/
      page.tsx
      about/
        page.tsx
      contact/
        page.tsx
    (auth)/
      sign-in/
        page.tsx
    (app)/
      layout.tsx
      home/
        page.tsx
      recipes/
        page.tsx
      parts/
        page.tsx
      help/
        page.tsx
      profile/
        page.tsx
    api/
      auth/
        [...all]/
          route.ts
      health/
        route.ts
  components/
    app/
    auth/
    branding/
    layout/
    marketing/
    theme/
    ui/
  generated/
    prisma/
  lib/
    auth/
    db/
    env/
    utils/
prisma/
  schema.prisma
prisma.config.ts
tests/
  e2e/
```

Adjust names when the current official library setup strongly favors another arrangement, but keep concerns separated and understandable.

---

# 4. Database Setup

Configure Prisma ORM 7 for Neon PostgreSQL using current official guidance.

## Requirements

- Prisma 7 ESM-compatible setup
- `prisma.config.ts`
- generated client outside `node_modules`
- server-safe singleton Prisma client for Next.js development
- Neon serverless driver adapter if recommended by current Neon and Prisma documentation
- database URL environment variables documented clearly
- authentication tables generated or modeled according to current Better Auth guidance
- initial migration committed to the repository
- Prisma client generation working
- Prisma Studio script
- database-health query available through a minimal health endpoint

## Hosted database behavior

First inspect whether usable Neon credentials, an authenticated Neon CLI, or an existing database URL are already available.

### If credentials are available

- Create or connect the Neon project.
- Apply the initial authentication migration.
- Verify the connection.
- Do not print secrets in the final summary.

### If credentials are not available

- Fully configure the project for Neon.
- Do not silently fall back to SQLite.
- Create `.env.example`.
- Provide exact setup instructions in `README.md`.
- Explain which value must be supplied before migrations and sign-in can work.
- Complete every task that does not require the missing external credential.

Use pooled and direct URLs only if current Prisma 7 + Neon guidance calls for both.

---

# 5. Authentication Setup

Use Better Auth with Google OAuth and the official Prisma adapter.

## Required behavior

- `/sign-in` displays the Google sign-in action.
- Successful sign-in redirects to `/home`.
- Signed-in users visiting `/sign-in` redirect to `/home`.
- Signed-out users visiting protected routes redirect to `/sign-in`.
- The protected layout reads the session on the server.
- The account menu displays the authenticated user’s name, email, and avatar when available.
- Sign out works and returns the user to the public site or sign-in page.
- Sessions persist in PostgreSQL.
- Multiple device sessions are allowed.
- Do not add artificial two-device restrictions.
- Do not implement account deletion yet.

## Environment variables

Use the current Better Auth naming conventions where possible. Document all required variables in `.env.example`, expected to include equivalents of:

```text
DATABASE_URL=
DIRECT_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Do not include unused values merely because they appear in older tutorials.

Generate a secure local Better Auth secret if appropriate, store it only in an ignored local environment file, and never commit it.

Document the exact Google OAuth callback URL.

If Google credentials are unavailable, the sign-in page and auth configuration should still be complete, with a clear setup note. Do not fake a successful sign-in.

---

# 6. Design System

Implement the starting DishFrame token system from the branding document.

The exact shades remain provisional, but use these as the initial baseline.

## Light theme

```css
--background: #f4f6f8;
--surface: #ffffff;
--surface-subtle: #f8fafc;
--text-primary: #252932;
--text-secondary: #667080;
--border: #dfe4ea;

--blue: #2563eb;
--green: #16a66a;
--purple: #7c3aed;
--orange: #f97316;
```

## Dark theme

```css
--background: #252932;
--surface: #303641;
--surface-raised: #39404c;
--text-primary: #f5f7fa;
--text-secondary: #b8c0cc;
--border: #48515f;

--blue: #4f7dff;
--green: #34d78d;
--purple: #a575ff;
--orange: #ff9a4d;
```

Translate these into semantic CSS variables that work cleanly with Tailwind and shadcn/ui.

Do not hard-code raw color values throughout components.

## Color roles

- Blue: primary actions, selected navigation, links, and focus
- Green: successful and completed states
- Purple: versions, experimentation, and change
- Orange: active cooking, timing, and immediate attention
- Red: destructive and error states only

## Theme behavior

- system;
- light;
- dark;
- no initial hydration flash;
- persisted preference;
- theme control in the signed-in account menu;
- public pages should also respect the selected/system theme.

## Visual treatment

Build a crisp, vibrant consumer application using:

- pale cool-gray backgrounds;
- clean white cards;
- smoky slate dark surfaces;
- moderate 12–16px radii;
- subtle borders;
- restrained shadows;
- generous whitespace;
- strong focus states;
- modular cards;
- occasional slim colored rails;
- purposeful transform/opacity motion;
- reduced-motion support.

Do not:

- use literal picture frames;
- create an orange-and-cream recipe aesthetic;
- create a black developer dashboard;
- use all accent colors equally;
- make the layout look like enterprise SaaS;
- overuse pills;
- force a bento grid onto every page.

---

# 7. Public Marketing Pages

Create a shared public header and footer.

## Public header

Include:

- DishFrame wordmark
- Home
- About
- Contact
- Sign in
- Primary CTA: Start building

The public layout should use normal horizontal navigation and a responsive mobile menu.

## `/` — Marketing home

### Hero copy

Headline:

> **A better framework for the way you cook.**

Supporting copy:

> Keep recipes organized, reuse what already works, and save what you learn each time you cook.

Primary action:

> **Start building**

Route it to `/sign-in`.

Secondary action:

> **Learn more**

It may scroll to or link to the product explanation.

### Hero visual

Create an original abstract product composition using interface cards, not a fake finished screenshot.

It may suggest:

- one recipe;
- Sauce, Rice, Chicken, and Finish sections;
- a saved-part marker;
- a version marker;
- one small note from a previous meal.

Use blue as the dominant accent, with restrained green, purple, and orange.

Do not use stock photography or generate a final logo in this milestone.

### Three product pillars

#### Reuse what you already know

> Save the sauces, grains, proteins, sides, and toppings you make often, then use them across any recipe.

#### Learn from every meal

> Keep ratings and notes from each time you cook, so you remember what worked and what you want to change.

#### Plan from what works

> Organize recipes your way, keep track of what you’re still practicing, and use recent meals to decide what belongs in the week ahead.

### Product loop

Add a concise visual flow:

```text
Organize → Cook → Review → Improve
```

Use ordinary home-cooking language. Do not describe software architecture.

### Final CTA

Reinforce the main promise and link to `/sign-in`.

Do not add:

- pricing;
- testimonials;
- fake user counts;
- fake product screenshots;
- unsupported claims;
- a social feed;
- AI messaging.

## `/about`

Use this opening:

> DishFrame began with a simple idea: cooking does not end when the meal is served. Every time you make something, you learn what worked, what changed, who liked it, and what you want to do differently next time.

Include:

### More workshop than recipe box

> DishFrame helps you keep the preparations you use often, organize complete recipes around them, and preserve each version as your cooking changes.

Explain the product philosophy without inventing a founder story, team, company history, customers, or traction.

## `/contact`

Use:

> Questions, ideas, or feedback about DishFrame? Send a note. The product is still taking shape, and practical feedback from real home cooks is especially useful.

Create a polished presentational form with:

- name;
- email;
- message.

Do not add an email provider or database model in this milestone.

The form must be honest:

- keep submission disabled or clearly marked as coming soon;
- do not display a fake success message;
- do not invent a contact email address.

## Public footer

Keep it small:

- DishFrame
- Home
- About
- Contact
- Sign in
- current year
- brief line about the product

Do not invent legal company language.

---

# 8. Sign-In Page

Route:

```text
/sign-in
```

Use a centered, polished authentication card with a restrained brand composition.

Copy:

Heading:

> **Welcome to DishFrame**

Supporting copy:

> Sign in to keep your recipes, reusable parts, and cooking history in one place.

Button:

> **Continue with Google**

Reassurance:

> Your recipes stay private unless you choose to share them.

The Google button must use the real Better Auth flow when credentials are configured.

Use a friendly error state when OAuth configuration is missing or sign-in fails.

Do not add email/password fields.

---

# 9. Signed-In Application Shell

Use a separate protected layout.

## Desktop

Use a compact left sidebar with:

- DishFrame wordmark
- Home
- Recipes
- Parts
- Help

Place the account control in the top-right area of the main content header or the lower sidebar, whichever creates the cleaner responsive system.

## Mobile and tablet

Create:

- a compact top app bar;
- accessible navigation drawer or sheet;
- no bottom navigation yet unless it clearly improves the four-item shell.

Cooking-specific mobile navigation will be designed later.

## Account menu

Include:

- user avatar/name;
- Profile;
- Theme submenu or control;
- Sign out.

---

# 10. Protected Placeholder Pages

## `/home`

Heading:

> **Start your DishFrame**

Supporting copy:

> Add your first recipe or bring one over from your existing notes. As you cook, DishFrame will help you remember what worked and improve it next time.

Show:

- Create a recipe
- Import a recipe

Because those features do not exist yet, route them to honest placeholder states or mark them as coming next. Do not fake CRUD.

Add empty sections:

- Recent Recipes
- Active Dishes
- Saved Parts
- Latest Notes

Each should have concise empty copy such as:

> Nothing here yet.

Do not show fake analytics or example user data.

## `/recipes`

Create a polished empty library shell with:

- page heading;
- short explanation;
- future search/filter area only if it does not imply working functionality;
- honest empty state;
- disabled or placeholder Create and Import actions.

Use “Recipes,” not “recipe assets.”

## `/parts`

Heading:

> **Reusable Parts**

Supporting copy:

> Save the sauces, sides, staples, and preparations you use across more than one recipe.

Create an honest empty state.

Navigation should use:

> Parts

## `/help`

Create a concise page explaining:

- what DishFrame is;
- the difference between a Recipe, Section, Part, Version, and Cooking Session;
- which features are coming later.

Do not create a large documentation center.

## `/profile`

Display real authenticated data when available:

- avatar;
- name;
- email.

Include:

- theme preference;
- sign-out action;
- Delete account section.

The Delete account button must be disabled and labeled as unavailable or coming later. Do not implement deletion.

---

# 11. User-Facing Vocabulary

Use these terms consistently:

| Concept                | Interface term                  |
| ---------------------- | ------------------------------- |
| Reusable component     | Part / Reusable Part            |
| Module inside a recipe | Section                         |
| Lifecycle              | Recipe Status                   |
| One period of cooking  | Cooking Session                 |
| Post-cook reflection   | Session Review / How did it go? |
| Actual yield           | Servings Made                   |
| Historical attempts    | Cooking History                 |
| Dashboard              | Home                            |

“Version” remains a normal user-facing term.

The app may be implemented using components and modules internally. Routine copy should not sound like software architecture.

Governing rule:

> **DishFrame thinks in systems but speaks like a capable home cook.**

---

# 12. Accessibility and Responsive Requirements

- Semantic HTML
- Visible keyboard focus
- Full keyboard navigation for menus and dialogs
- Correct labels and accessible names
- WCAG AA contrast
- Respect `prefers-reduced-motion`
- No color-only status communication
- Touch targets suitable for phones and tablets
- No horizontal overflow at common widths
- Test phone, tablet, laptop, and wide desktop sizes
- Ensure dark mode is fully usable, not merely inverted

---

# 13. Testing

Configure:

## Unit/component tests

Use Vitest and Testing Library for a small meaningful baseline:

- theme control behavior;
- navigation rendering;
- public copy smoke test;
- sign-in button behavior with mocked auth where appropriate;
- one auth-helper or protected-layout unit test if practical.

## End-to-end tests

Use Playwright for credential-free public flows:

- marketing home loads;
- About loads;
- Contact loads;
- Sign-in page loads;
- public navigation works;
- theme can change;
- mobile navigation opens and works.

Do not make CI depend on real Google OAuth.

Authenticated E2E coverage can be added after a reliable test-auth strategy exists.

---

# 14. CI and Scripts

Add useful scripts adapted to current package conventions:

```json
{
  "dev": "...",
  "build": "...",
  "start": "...",
  "lint": "...",
  "typecheck": "...",
  "test": "...",
  "test:watch": "...",
  "test:e2e": "...",
  "format": "...",
  "format:check": "...",
  "db:generate": "...",
  "db:migrate": "...",
  "db:studio": "..."
}
```

Create GitHub Actions CI that runs at minimum:

1. install with frozen lockfile;
2. lint;
3. typecheck;
4. unit tests;
5. production build.

Add public-page Playwright smoke tests to CI only if they run reliably without live OAuth and database credentials.

Use explicit lint commands because Next.js 16 does not run lint during build.

---

# 15. Environment and Documentation

Create:

- `.env.example`
- safe ignored local environment setup
- clear `README.md`

README must include:

- product summary;
- chosen stack;
- prerequisites;
- Node and pnpm setup;
- installation;
- environment variables;
- Neon setup;
- Google OAuth setup;
- exact callback URL;
- Prisma generation and migration commands;
- development command;
- test commands;
- build command;
- current route map;
- Milestone 1 scope;
- known external setup still required;
- explicit statement that recipe features are not built yet.

Do not commit secrets.

---

# 16. Health Endpoint

Create:

```text
/api/health
```

It should:

- return application status;
- verify database connectivity when configured;
- avoid leaking connection details or environment values;
- return a useful failure status if the database is unavailable.

Do not expose stack traces in production responses.

---

# 17. Scope Guardrails

Do not build:

- recipe schema;
- recipe CRUD;
- tags;
- recipe status;
- versions;
- cooking sessions;
- reusable-part schema;
- ratings;
- meal planning;
- grocery lists;
- import parsing;
- file uploads;
- image storage;
- contact-message storage;
- public recipe sharing;
- account deletion;
- sample or fake recipe data.

Do not create temporary domain models that will need removal later.

The purpose is a durable foundation and credible shell, not guessing the product specification.

---

# 18. Quality Standard

The scaffold should feel approximately 70% visually resolved, not like an untouched starter.

That means:

- coherent hierarchy;
- accurate DishFrame copy;
- responsive layouts;
- intentional empty states;
- polished public pages;
- correct theme behavior;
- no starter-template text;
- no lorem ipsum;
- no fake features;
- no dead navigation;
- no console errors;
- no TypeScript errors;
- no lint errors;
- production build passes.

Do not over-polish speculative feature screens.

---

# 19. Execution Order

1. Inspect repository and documentation.
2. Initialize or normalize the Next.js project.
3. Install and configure the stable stack.
4. Establish lint, formatting, testing, and CI.
5. Configure Tailwind, shadcn, fonts, themes, and tokens.
6. Configure Prisma 7 and Neon.
7. Configure Better Auth and generate auth schema.
8. Apply migration if credentials permit.
9. Build public layouts and pages.
10. Build sign-in page.
11. Build protected application shell.
12. Build Home, Recipes, Parts, Help, and Profile placeholders.
13. Add tests.
14. Run formatting, lint, typecheck, tests, and production build.
15. Review responsive and dark-mode behavior.
16. Update README.
17. Provide a concise final summary.

---

# 20. Final Verification

Before finishing, run and report:

- dependency installation;
- formatting check;
- lint;
- TypeScript check;
- unit tests;
- production build;
- Playwright public smoke tests if configured;
- Prisma generation;
- database connection/migration if credentials are available.

Also inspect:

- public navigation;
- signed-in navigation structure;
- phone layout;
- tablet layout;
- desktop layout;
- light theme;
- dark theme;
- missing-environment error states.

Fix issues rather than merely listing them whenever they are within the repository.

---

# 21. Final Response Format

## Summary

What was built.

## Stack

Actual installed major versions and deviations from this prompt.

## Routes

Public and protected routes.

## Authentication and database status

State clearly:

- what is fully working;
- whether live Neon and Google credentials were available;
- what exact external setup remains.

## Verification

Commands run and whether they passed.

## Important files

Main configuration and architecture files.

## Deferred scope

Confirm recipe-domain functionality remains intentionally unbuilt.

Do not include secrets, full lockfiles, or a long file-by-file changelog.
