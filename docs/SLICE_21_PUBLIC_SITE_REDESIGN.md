# Slice 21 — Public Site Content and Design Redesign

Deferred design-review work from Slice 21, implemented after the
functional product reached Slice 22. Redesigns and rewrites the public
(marketing) site: Home, About, Contact, the shared public header/footer,
and two new routes, Privacy and Terms. Desktop/light-theme-first pass
(~1440×900), with a sound mobile baseline. Does not touch the
authenticated app, dark theme, or product behavior.

## Positioning

Replaced the prior "A better framework for the way you cook" positioning
with the locked-in-this-pass idea: **recipes are living things that
improve through cooking**. DishFrame is a personal cooking framework, not
a recipe-discovery site. Primary hero headline: "Recipes that get better
every time you cook." Short brand line: "Cook. Refine. Repeat." Core
loop: Build → Cook → Improve, expanded on Home as Plan → Shop → Cook →
Review → Refine. `docs/BRANDING.md` §1, §16, §17, and §22 were updated in
place to this current truth (old copy kept, struck through, under a
"superseded" heading in §16 for history).

**Critical clarification carried through every page:** DishFrame is short
for *Dish Framework* — not picture frames. No framed-photo layouts,
gallery metaphors, or decorative borders justified by the name. This is
now stated explicitly in `BRANDING.md`'s §1 "Meaning" section, not just
implied.

## Design direction chosen: Connected Framework

One signature visual grammar — thin connector lines and small circular
nodes linking modular Recipe/Section/Part cards — reused with variation
across the hero, the Build→Cook→Improve timeline, the Parts moment, and
the Plan→Shop→Cook→Review→Refine path. It's the literal, restrained
expression of "framework": components linked into a structure, not a
static grid of feature cards. Existing brand tokens (cobalt blue primary,
blue-leaning green, restrained violet, cool neutrals) were reused as-is
from `globals.css` — no new color tokens were introduced.

**Alternatives considered and rejected:**
- *Editorial/magazine* (cream background, serif display, hairline rules)
  — this is one of the current AI-generated-design defaults the brief
  flagged, and the "warm cream, farmhouse" register is explicitly
  disallowed by `BRANDING.md` §4.
- *Dark high-contrast SaaS* (near-black background, single neon accent) —
  contradicts brand guardrails against black-and-neon and technical/dev
  styling, and this pass is light-theme-first by instruction.

Typography kept Manrope (display) / Inter (body) as already configured;
pushed the hero to a larger, tighter display size and added tabular-num
step badges rather than introducing a third typeface.

## Home (`(marketing)/page.tsx`)

Full rewrite, now an async server component reading session for truthful
CTAs. Sections in order: Hero (eyebrow, headline, supporting copy, dual
CTA, reassurance line, `HeroVisual`) → "A Recipe is more than a list of
ingredients" (two contrasting lists: what a working Recipe holds vs.
where that knowledge usually ends up) → Build→Cook→Improve as a
`WorkflowPath` node strip plus a numbered vertical timeline with concrete
per-step copy → a Reusable Parts moment (`PartsMoment`: one Part card
connected by lines to three Recipes that use it) → Plan→Shop→Cook→
Review→Refine as a second `WorkflowPath` use → one concise sharing
section (two chips + a `Share2` icon, no elaborate graphic) → closing CTA.

New components: `workflow-path.tsx` (shared connector-node strip, used
for both loops), `parts-moment.tsx` (Parts hub-and-spoke visual).
`hero-visual.tsx` was extended (not replaced) with a connector chip
("Also in 2 other Recipes") off the existing "Saved part" row, making
Part reuse visible in the hero itself, not just in its own section.

## About (`(marketing)/about/page.tsx`)

Full rewrite: hero ("Recipes aren't finished. They're learned."), the
origin story as two frustrations (hard to cook from; hard to improve and
maintain) each closing with a chip list of the features it produced,
a pull-quote transition, three product principles as a divided list
(not a card grid, to stay visually distinct from Home's product-visual
density), and the closing statement. No AI-tool mention, no repeated
Home feature inventory, per the content brief.

## Contact (`(marketing)/contact/page.tsx`)

Two-column desktop layout: form left, a new `ContactVisual` (a Cooking
Mode step with a note attached — reusing the app's own step-card
language, not a stock image) right, hidden below `lg`. Heading/copy
updated to "Help make DishFrame better." The existing form, schema, and
server action are untouched — no topic field was added, since the prompt
treats the working form as higher priority than that optional field and
adding it would have touched the schema, email template, and action
together. Added one privacy line near the submit button linking to
`/privacy`, directly in `contact-form.tsx`.

## Public header/footer

`PublicHeader` now takes a `signedIn` prop instead of always showing
"Sign in" / "Start building": signed-in visitors see a single "Open
DishFrame" button (→ `/home`); signed-out visitors see "Sign in" +
"Create your first Recipe" (→ `/sign-in`). `(marketing)/layout.tsx` and
`(share)/layout.tsx` both now fetch `getServerSession()` and pass the
boolean down — no session data itself reaches the client, and share-route
content resolution is untouched (still token-only, per its own comment).
`PublicFooter` gained Privacy/Terms links and the "Cook. Refine. Repeat."
line; no personal email is exposed.

## Privacy and Terms (new routes)

Both share `components/marketing/legal-page.tsx` (`LegalLayout`) for
consistent, plain typographic styling. Content was grounded in actual
implementation, inspected directly rather than assumed:

- Google Sign-In (name/email/image), no password stored.
- Recipes/Parts/Versions/Cooking Sessions/Reviews/Tasters/Meal
  Plans/grocery lists/tags/preferences — private by default (`PRODUCT_SPEC.md`
  §6.1), no visibility selector exists yet.
- Images stored via Vercel Blob.
- Direct-share recipient emails are stored only to match a future
  verified Google sign-in (`PRODUCT_SPEC.md` §85.2) — confirmed no email
  is sent to that address by DishFrame itself.
- Contact form: sent via Resend to the operator's inbox; confirmed not
  persisted to the database (`contact/actions.ts` has no Prisma write).
- Sessions: confirmed `Session` model stores `ipAddress`/`userAgent`
  (`prisma/schema.prisma`).
- Nutrition search sends query terms only to USDA FoodData Central
  (`lib/nutrition/fdc-client.ts`), no personal data.
- Hosting: Vercel + Neon; confirmed no analytics/tracking SDK installed
  (grepped for common analytics packages — none found) — no cookie
  banner added.
- Account export: confirmed JSON-only, no image binaries
  (`api/export/account/route.ts`).
- Account deletion: confirmed transactional DB deletion +
  `bestEffortDeleteBlob` for images — phrased as best-effort/asynchronous
  cleanup, not instant guaranteed deletion (`lib/account/service.ts`).

No company legal entity, mailing address, billing terms, or governing-law
jurisdiction was invented — none exist. `robots.ts` and `sitemap.ts` both
now include `/privacy` and `/terms`.

**Both documents are product-aligned baseline policies and need
professional legal review before a broad commercial launch.**

## Metadata

Updated `SITE_TITLE`/`SITE_DESCRIPTION` (`lib/site.ts`, cascades to
Home's default metadata via the root layout) and the per-page
`generateMetadata`/`metadata` exports for About, Contact, and the two new
legal routes to match the new copy. Restrained, no keyword stuffing.
Existing favicon/OpenGraph image assets were left untouched (out of
scope for this pass).

## Responsive baseline

All new sections use existing responsive patterns already proven
elsewhere on the site (stacking grids, `overflow-x-auto` on the
`WorkflowPath` node strips so a five-step path never forces page-level
horizontal scroll, visuals hidden below `sm`/`lg` where they'd crowd
narrow layouts). Not yet manually walked at 390×844 in this pass — see
Deferred below.

## Tests and verification

At the owner's direction, no test additions/updates and no manual
browser walkthrough were done in this pass — the design is expected to
keep iterating before it's finalized, and the owner will verify visually
and re-request test coverage once the direction settles. `page.test.tsx`
and `public-header.test.tsx` now assert stale copy ("Start building")
against the rewritten components and will fail as committed; this is
expected and intentionally left for the owner. No `tsc`, lint, build,
`verify:*`, Playwright, git, seed, Contact-form submission, or
external-service call was run.

## Deferred (explicitly out of scope for this pass)

- Full mobile/tablet design audit, dark-theme audit, comprehensive
  accessibility audit, SEO/social-image/favicon polish.
- Updating/adding automated tests for the redesigned pages.
- Manual desktop/mobile browser verification.
- Legal review of Privacy Policy and Terms of Use.
- Deciding whether to add a Contact topic selector (deliberately skipped
  this pass, see Contact section above).
