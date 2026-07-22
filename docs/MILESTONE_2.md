# DishFrame — Milestone 2: Production Polish, SEO & Launch Readiness

## Instructions for Claude

Implement this milestone now. Do not stop at a plan.

Read the repository and existing documentation first:

- `PRODUCT_ROADMAP.md`
- `BRANDING.md` or `DishFrame_BRANDING.md`
- `MILESTONE_1.md`, if present
- `README.md`

Preserve all working infrastructure and application behavior. Do not push or deploy unless explicitly instructed.

---

# 1. Current Production State

Production URL:

```text
https://dish-frame.vercel.app
```

The following are already complete and working:

- GitHub repository
- Vercel deployment
- Neon PostgreSQL
- Prisma migrations
- Better Auth
- Google OAuth
- protected routes
- `/api/health`
- Resend
- Contact form
- required local and Vercel environment variables
- public Home, About, Contact, and Sign-in pages
- signed-in Home, Recipes, Parts, Help, and Profile shells
- light and dark themes

Do not redo, replace, or reconfigure these systems unless you discover a concrete defect.

This milestone is only for production polish, metadata, search readiness, social sharing, error handling, quality checks, and deferred-launch documentation.

---

# 2. Milestone Goal

Bring the existing DishFrame scaffold to a strong production baseline.

Implement:

- complete public metadata;
- canonical URLs;
- Open Graph and Twitter metadata;
- a temporary DishFrame social image;
- favicon and application icons;
- valid JSON-LD;
- `sitemap.xml`;
- `robots.txt`;
- noindex handling for private routes;
- a web manifest;
- branded 404, error, and appropriate loading states;
- conservative security headers;
- Vercel Speed Insights;
- production-focused tests;
- updated README documentation;
- a durable `POST_LAUNCH_TODO.md`.

Do not build recipe-domain functionality.

---

# 3. Production Origin

Use:

```text
https://dish-frame.vercel.app
```

Prefer reading it through:

```text
NEXT_PUBLIC_APP_URL
```

Use the configured origin for:

- `metadataBase`;
- canonical URLs;
- Open Graph URLs;
- sitemap;
- robots sitemap reference;
- JSON-LD;
- manifest URLs;
- documentation.

Search for and remove any stale reference to:

```text
https://dishframe.vercel.app
```

Avoid scattering hard-coded origins when a centralized helper is more appropriate.

---

# 4. Root Metadata

Use the Next.js App Router Metadata API.

## Default title

```text
DishFrame — A better framework for the way you cook
```

## Title template

```text
%s | DishFrame
```

## Description

```text
Keep recipes organized, reuse what already works, and save what you learn each time you cook.
```

Configure:

- `metadataBase`;
- application name;
- default title;
- title template;
- description;
- canonical homepage URL;
- Open Graph metadata;
- Twitter card metadata;
- icons;
- manifest reference;
- factual author, creator, or publisher values only when appropriate.

Do not invent a company, organization, team, pricing, users, reviews, ratings, awards, or traction.

---

# 5. Page Metadata

Add accurate metadata for:

## `/`

Title:

```text
DishFrame — A better framework for the way you cook
```

Description:

```text
Keep recipes organized, reuse what already works, and save what you learn each time you cook.
```

## `/about`

Title:

```text
About
```

Description:

```text
Learn how DishFrame helps home cooks organize recipes, reuse familiar preparations, and improve dishes over time.
```

## `/contact`

Title:

```text
Contact
```

Description:

```text
Share questions, ideas, or practical feedback about DishFrame.
```

## `/sign-in`

Title:

```text
Sign in
```

Description:

```text
Sign in to access your DishFrame recipes, reusable parts, and cooking history.
```

The sign-in page must be noindex.

Never expose private user data through metadata.

---

# 6. Canonical URLs

Add correct canonical URLs for public pages:

```text
https://dish-frame.vercel.app/
https://dish-frame.vercel.app/about
https://dish-frame.vercel.app/contact
```

Avoid:

- duplicate canonicals;
- stale non-hyphenated domains;
- malformed URLs;
- inconsistent trailing slashes;
- public canonicals on protected pages.

---

# 7. Open Graph and Social Sharing

Add complete Open Graph and Twitter metadata using:

- DishFrame name;
- current public description;
- canonical URL;
- temporary social image;
- appropriate dimensions and alt text;
- `website` Open Graph type.

Do not use fake recipe screenshots, user data, or stock-food photography.

---

# 8. Temporary Social Image

Create a replaceable DishFrame social image using current Next.js metadata-image conventions or `ImageResponse`.

Suggested content:

- DishFrame wordmark;
- `A better framework for the way you cook.`;
- pale cool-gray or smoky slate foundation;
- vivid blue as the primary accent;
- restrained green;
- optional small purple or orange detail;
- subtle modular-card or section motif.

Do not imply this is the final logo.

Do not use literal ornate frames, fake data, or stock photography.

Verify the image route builds and renders correctly.

---

# 9. Favicon and App Icons

Create a temporary DishFrame icon system using a simple:

- `D`;
- `DF`;
- modular mark;
- or restrained framed-section motif.

Use current DishFrame colors.

Provide appropriate files for:

- favicon;
- application icon;
- Apple touch icon where practical;
- manifest icons.

Keep everything easy to replace later.

Do not attempt a final logo system.

---

# 10. JSON-LD

Add safely serialized JSON-LD to the homepage.

Use accurate schema such as:

- `WebSite`;
- `WebApplication`;
- or truthful `SoftwareApplication`.

Use only factual properties:

- name;
- URL;
- description;
- suitable application category;
- operating system: Web;
- current availability only if accurate.

Do not invent:

- ratings;
- reviews;
- users;
- pricing tiers;
- app-store links;
- company details;
- awards;
- downloads;
- mobile apps.

Do not add `Recipe` structured data yet.

Escape unsafe characters such as `<`.

Add tests that verify:

- valid JSON;
- correct production URL;
- correct product name;
- no fabricated review or rating fields.

---

# 11. Sitemap

Create the appropriate Next.js sitemap file.

Include only:

```text
/
/about
/contact
```

Exclude:

```text
/sign-in
/home
/recipes
/parts
/help
/profile
/api/*
```

Use the configured production origin.

Do not invent misleading `lastModified` values.

---

# 12. Robots

Create the appropriate Next.js robots file.

Requirements:

- allow public marketing pages;
- disallow private application areas where appropriate;
- disallow API routes;
- reference:

```text
https://dish-frame.vercel.app/sitemap.xml
```

Robots rules alone are not enough; private pages also need explicit noindex metadata.

---

# 13. Noindex Private Routes

Apply explicit noindex metadata to:

- `/sign-in`
- `/home`
- `/recipes`
- `/parts`
- `/help`
- `/profile`
- the protected app layout generally

Use the current Next.js equivalent of:

```text
index: false
follow: false
```

Do not expose private information in metadata.

Verify rendered output.

---

# 14. Web Manifest

Add a basic Next.js web manifest containing:

- name: DishFrame;
- short name: DishFrame;
- description;
- start URL;
- display mode;
- theme color;
- background color;
- temporary icons.

Do not add:

- service worker;
- offline caching;
- background sync;
- push notifications;
- install prompts;
- offline mutation queues.

Those belong to a later PWA/cooking-mode milestone.

---

# 15. Branded Error and Loading States

Add or improve:

- `not-found.tsx`;
- route-level `error.tsx`;
- `global-error.tsx`;
- loading UI only where real server loading exists.

Use DishFrame styling and calm copy.

Suggested language:

```text
Something went wrong.
```

```text
This page could not be found.
```

```text
Try again or return home.
```

Do not expose stack traces, database details, OAuth internals, or environment values.

Avoid cutesy food jokes and untouched Next.js starter screens.

---

# 16. Security Headers

Inspect existing Vercel and Next.js behavior first.

Add a conservative baseline where appropriate:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy
```

Disable:

```text
X-Powered-By
```

Use a restrained Permissions Policy that disables unused browser capabilities without breaking current functionality.

Do not break:

- Better Auth;
- Google OAuth;
- Resend;
- next-themes;
- Next.js image handling;
- social image generation;
- Vercel deployment.

Do not add an enforcing Content Security Policy in this milestone.

Add CSP evaluation as a future report-only task in `POST_LAUNCH_TODO.md`.

---

# 17. Vercel Speed Insights

Check whether Speed Insights already exists.

If not:

1. install the official Vercel package;
2. add it to the appropriate root layout;
3. verify SSR, hydration, tests, and builds;
4. document any Vercel dashboard action.

Do not add Web Analytics unless already present.

Any manual dashboard step must appear in `POST_LAUNCH_TODO.md`.

---

# 18. Production Review

Check for:

- lorem ipsum;
- default Next.js text;
- stale project names;
- stale `dishframe.vercel.app` references;
- dead navigation;
- fake success states;
- console errors;
- hydration warnings;
- client-exposed secrets;
- missing accessible labels;
- broken dark mode;
- public indexing of private routes;
- invalid canonical URLs;
- duplicate metadata;
- placeholder company/legal language.

Do not redesign the pages.

Small production, consistency, and accessibility fixes are appropriate.

---

# 19. Tests

Add or update tests for:

## Unit/integration

- root title and description;
- metadata base;
- canonical URLs;
- valid JSON-LD;
- correct JSON-LD URL;
- no fabricated ratings or reviews;
- sitemap contents;
- private-route exclusion;
- robots sitemap URL;
- noindex metadata;
- manifest basics;
- security-header configuration where practical.

## Playwright

- Home loads;
- About loads;
- Contact loads;
- Sign-in loads;
- 404 renders;
- public navigation works;
- metadata essentials exist;
- canonical tags are correct;
- sign-in is noindex;
- light and dark themes remain usable.

Do not send real email or require real Google OAuth in automated tests.

---

# 20. Quality Script

Review existing scripts.

Add a convenience command such as:

```text
pnpm check
```

It should run existing equivalents of:

1. format check;
2. lint;
3. TypeScript check;
4. unit tests;
5. production build.

Do not duplicate scripts.

Keep Playwright separate if including it makes routine checks slow or unreliable.

---

# 21. Required Post-Launch To-Do Document

Create:

```text
POST_LAUNCH_TODO.md
```

This is required.

Use Markdown checkboxes:

```text
- [ ] Task
```

For implementation tasks, include:

- why it matters;
- where to configure it;
- relevant environment variables;
- exact URLs;
- dependencies;
- verification steps.

Organize it into these sections.

## A. Immediate manual checks after deployment

Include:

- redeploy after Milestone 2 is merged;
- inspect `/robots.txt`;
- inspect `/sitemap.xml`;
- inspect homepage JSON-LD;
- inspect canonical tags;
- inspect Open Graph image;
- test 404;
- verify noindex on private routes;
- enable or confirm Speed Insights in Vercel;
- inspect production runtime and build logs.

Use exact production URLs.

## B. Search launch

Include:

- wait until public copy and structure stabilize;
- add the production site to Google Search Console;
- submit:

```text
https://dish-frame.vercel.app/sitemap.xml
```

- inspect indexing;
- request indexing for key public pages if appropriate;
- repeat for a future custom domain.

## C. Custom domain

Include:

- choose and purchase a final domain;
- attach it to Vercel;
- select apex or `www`;
- update `NEXT_PUBLIC_APP_URL`;
- update Better Auth URL;
- update trusted origins;
- update Google OAuth origin;
- update Google OAuth callback;
- verify canonicals and metadata;
- update Search Console;
- preserve appropriate redirects.

## D. Resend domain upgrade

Email already works.

Document the optional future upgrade:

- verify a DishFrame-owned domain or subdomain;
- configure SPF;
- configure DKIM;
- replace `onboarding@resend.dev`;
- update `CONTACT_FROM_EMAIL`;
- retest `replyTo`;
- keep `CONTACT_TO_EMAIL` private.

Do not reimplement email now.

## E. Security hardening

Include:

- evaluate CSP in report-only mode;
- inspect required OAuth, image, and script sources;
- enforce only after reports are clean;
- review dependency vulnerabilities;
- review session-cookie configuration;
- review Contact-form abuse protection;
- consider durable rate limiting only when public traffic warrants it.

## F. Monitoring and analytics

Include optional future decisions:

- Vercel Web Analytics;
- Sentry or similar error monitoring;
- uptime monitoring;
- Neon usage alerts;
- Resend delivery monitoring;
- database storage and compute alerts.

Do not install these now unless already necessary.

## G. Preview/environment isolation

Include:

- separate Neon branch/database for previews;
- protect production data;
- preview OAuth strategy;
- preview Resend restrictions;
- prevent previews from sending production contact messages accidentally.

## H. Final brand assets

Include:

- final logo;
- final favicon;
- final social card;
- final typography review;
- final contrast testing;
- replacement of temporary icons.

## I. PWA and cooking-mode enhancements

Include:

- installable PWA;
- offline recipe viewing;
- offline cooking mode;
- service worker;
- background sync;
- wake lock;
- timer persistence;
- home-screen icons.

Mark these as dependent on the future cooking-mode specification.

## J. Legal/public policy

Include future decisions:

- Privacy Policy;
- Terms of Use;
- cookie disclosure if analytics later requires it;
- account deletion policy;
- data export;
- public recipe-sharing policy.

Do not invent legal copy now.

---

# 22. README Updates

Update README with:

- production URL;
- metadata/SEO architecture;
- sitemap location;
- robots location;
- JSON-LD location;
- social image implementation;
- manifest;
- Speed Insights;
- `pnpm check`;
- reference to `POST_LAUNCH_TODO.md`.

State accurately that:

- deployment works;
- database works;
- authentication works;
- Contact email works.

Do not imply infrastructure is incomplete.

---

# 23. Scope Guardrails

Do not build:

- recipe schema;
- recipe CRUD;
- reusable-parts schema;
- cooking sessions;
- versions;
- ratings;
- meal planning;
- grocery lists;
- recipe import;
- image upload;
- public recipe pages;
- service workers;
- offline mode;
- Search Console integration;
- custom-domain setup;
- enforcing CSP;
- analytics beyond Speed Insights;
- Sentry;
- legal-policy content.

Do not replace working infrastructure or redesign the app.

---

# 24. Verification

Run the project’s actual equivalents of:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Verify local production output for:

- `/robots.txt`;
- `/sitemap.xml`;
- metadata;
- canonicals;
- JSON-LD;
- Open Graph image;
- favicon/icons;
- manifest;
- noindex;
- security headers;
- 404;
- error boundaries;
- no exposed secrets;
- no stale production URL.

Do not claim live deployment verification unless deployed.

---

# 25. Final Response Format

## Summary

What was completed.

## SEO

Metadata, canonicals, Open Graph, JSON-LD, sitemap, robots, and noindex.

## Brand assets

Temporary social image, icons, and manifest.

## Production reliability

Error states, headers, Speed Insights, and quality checks.

## Tests

Commands and results.

## Post-launch document

Confirm creation of:

```text
POST_LAUNCH_TODO.md
```

Summarize major deferred categories.

## Manual actions

List only actions still requiring the user after deployment.

## Deployment status

State whether anything was pushed or deployed.

Do not include secrets or a long file-by-file changelog.
