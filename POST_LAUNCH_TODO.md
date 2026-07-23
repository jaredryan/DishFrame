# DishFrame — Post-Launch To-Do

Durable tracking of deferred and manual work from Milestone 2 (production
polish, SEO, and launch readiness). Update this file as items are
completed or as new deferred work is identified — it is not a one-time
snapshot.

Production URL: `https://dish-frame.vercel.app`

---

## A. Immediate manual checks after deployment

Do these once Milestone 2 is merged and redeployed to production.

- [ ] Redeploy `main` on Vercel after merging Milestone 2 (a passing CI run
      does not itself deploy).
- [ ] Inspect `https://dish-frame.vercel.app/robots.txt` — confirm it
      allows `/`, `/about`, `/contact`, disallows the signed-in app and
      `/api/*`, and references the production sitemap.
- [ ] Inspect `https://dish-frame.vercel.app/sitemap.xml` — confirm it
      lists only `/`, `/about`, `/contact` at the production origin.
- [ ] Inspect the homepage JSON-LD (View Source or a structured-data
      tester) at `https://dish-frame.vercel.app/` — confirm valid JSON, the
      correct `url` and `name`, and no fabricated rating/review/pricing
      fields.
- [ ] Inspect canonical tags on `/`, `/about`, and `/contact` in production
      — confirm each resolves to `https://dish-frame.vercel.app/...` with
      no stale `dishframe.vercel.app` (no hyphen) references.
- [ ] Inspect the Open Graph image by pasting
      `https://dish-frame.vercel.app/` into a social-share debugger (e.g.
      Facebook Sharing Debugger, Twitter Card Validator, or
      `https://www.opengraph.xyz/`) — confirm the temporary DishFrame image
      renders correctly.
- [ ] Test the 404 page at a nonexistent path, e.g.
      `https://dish-frame.vercel.app/does-not-exist` — confirm the branded
      "This page could not be found" UI renders (not the Next.js default).
- [ ] Verify noindex on private routes — view source on
      `https://dish-frame.vercel.app/sign-in` and confirm
      `<meta name="robots" content="noindex, nofollow">` is present.
- [ ] Enable or confirm **Speed Insights** is turned on for the
      `dishframe` project in the Vercel dashboard (Project → Speed
      Insights). The `<SpeedInsights />` component is already mounted in
      `src/app/layout.tsx`; the dashboard toggle is a separate step.
- [ ] Inspect production runtime and build logs (`vercel logs`, or the
      deployment's Runtime Logs in the dashboard) for unexpected errors
      after the new routes (`/sitemap.xml`, `/robots.txt`,
      `/manifest.webmanifest`, `/icon`, `/apple-icon`,
      `/opengraph-image`, `/twitter-image`) go live.

## B. Search launch

- [ ] Wait until public copy and page structure stabilize (avoid
      submitting to Search Console while content is still actively
      changing).
- [ ] Add `https://dish-frame.vercel.app` as a property in
      [Google Search Console](https://search.google.com/search-console).
- [ ] Submit the sitemap: `https://dish-frame.vercel.app/sitemap.xml`.
- [ ] Inspect indexing status for `/`, `/about`, and `/contact` in Search
      Console.
- [ ] Request indexing for the key public pages if they haven't been
      crawled after a reasonable wait.
- [ ] Repeat this entire section for the final custom domain once one is
      attached (see section C) — Search Console properties are
      origin-specific and do not transfer automatically.

## C. Custom domain

- [ ] Choose and purchase a final domain.
- [ ] Attach the domain to the Vercel project (Project Settings →
      Domains).
- [ ] Decide apex vs. `www` and set up the corresponding redirect in
      Vercel.
- [ ] Update `NEXT_PUBLIC_APP_URL` in Vercel (Production + Preview) to the
      new domain — this drives `metadataBase`, canonical URLs, the
      sitemap, `robots.txt`, JSON-LD, and the manifest via
      `src/lib/site.ts`.
- [ ] Update `BETTER_AUTH_URL` to the new domain.
- [ ] Update the Better Auth trusted origins if the new domain isn't
      already covered by `src/lib/auth/auth.ts`'s `trustedOrigins` list.
- [ ] Update the Google OAuth **authorized JavaScript origin** to the new
      domain (Google Cloud Console → Credentials).
- [ ] Update the Google OAuth **authorized redirect URI** to
      `https://<new-domain>/api/auth/callback/google`.
- [ ] Re-verify canonical tags, Open Graph URLs, the sitemap, and
      `robots.txt` all reflect the new domain after redeploying.
- [ ] Add/verify the new domain in Google Search Console (see section B).
- [ ] Preserve redirects from `dish-frame.vercel.app` to the new domain so
      existing links and any indexed pages don't 404.

## D. Resend domain upgrade

Email already works via `onboarding@resend.dev`. This is an optional
future upgrade, not a defect.

- [ ] Verify a DishFrame-owned domain or subdomain in the Resend
      dashboard.
- [ ] Configure the SPF record Resend provides for that domain.
- [ ] Configure the DKIM record Resend provides for that domain.
- [ ] Replace `onboarding@resend.dev` with the verified address in
      `CONTACT_FROM_EMAIL` (Vercel env vars, Production + Preview).
- [ ] Retest the contact form and confirm `replyTo` still resolves to the
      submitter's email (see `src/app/(marketing)/contact/actions.ts`).
- [ ] Keep `CONTACT_TO_EMAIL` private — it is not, and should not become,
      public-facing.

## E. Security hardening

- [ ] Evaluate a Content-Security-Policy in **report-only** mode first
      (`Content-Security-Policy-Report-Only`) — Milestone 2 intentionally
      shipped only the conservative headers in `next.config.ts`
      (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
      `poweredByHeader: false`), no CSP.
- [ ] Inspect the required script, style, image, and connect sources
      before drafting a policy — Better Auth, Google OAuth, `next/font`
      (Google Fonts), and Next.js image handling all need explicit
      allowances.
- [ ] Enforce the CSP only after report-only mode shows no unexpected
      violations for a reasonable period.
- [ ] Review dependency vulnerabilities periodically (`pnpm audit`, or
      Vercel/GitHub's automated dependency alerts).
- [ ] Review Better Auth's session-cookie configuration
      (`src/lib/auth/auth.ts`) — current settings (30-day sessions, no
      device limit) were chosen as "responsible but proportionate to a
      personal recipe product" (see `docs/PRODUCT_ROADMAP.md`); revisit if
      the product opens up beyond personal/family use.
- [ ] Review Contact-form abuse protection — the current honeypot +
      time-trap in `src/app/(marketing)/contact/actions.ts` is a spam
      deterrent, not a hard security boundary.
- [ ] Consider durable rate limiting (e.g. Vercel Firewall, or an
      Upstash-backed limiter) for `/api/*` and the contact form only once
      real public traffic warrants it.

## F. Monitoring and analytics

Optional future decisions — do not install until there's a concrete need.

- [ ] Vercel Web Analytics (distinct from Speed Insights, which is already
      installed).
- [ ] Error monitoring (e.g. Sentry) for uncaught exceptions beyond what
      `error.tsx` / `global-error.tsx` surface to users.
- [ ] Uptime monitoring for the production URL and `/api/health`.
- [ ] Neon usage/compute alerts.
- [ ] Resend delivery monitoring (bounce/complaint rates).
- [ ] Database storage and compute alerts as usage grows.

## G. Preview/environment isolation

- [ ] Create a separate Neon branch/database for Vercel Preview
      deployments, distinct from the production database.
- [ ] Confirm Preview `DATABASE_URL` / `DIRECT_URL` point at that branch
      in Vercel's environment-variable scoping (Preview vs. Production).
- [ ] Decide a preview OAuth strategy — Google OAuth redirect URIs are
      origin-specific, and Preview deployments get unique URLs
      (`VERCEL_URL`, already trusted in `src/lib/auth/auth.ts`) that
      aren't individually registered with Google.
- [ ] Decide preview Resend restrictions (e.g. a test-only `RESEND_API_KEY`
      or a fixed `CONTACT_TO_EMAIL` override) so preview traffic can't
      send from the production sender identity.
- [ ] Prevent Preview deployments from sending real contact-form
      notifications to the production `CONTACT_TO_EMAIL` inbox.

## H. Final brand assets

Milestone 2 shipped temporary, easily-replaceable assets — the nested-frame
mark from `src/components/branding/mark.tsx`, rendered via `next/og` in
`src/app/icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, and
`twitter-image.tsx`.

- [ ] Final logo.
- [ ] Final favicon / app icon set (replacing `src/app/icon.tsx` and
      `apple-icon.tsx`).
- [ ] Final social card (replacing `src/app/opengraph-image.tsx` and
      `twitter-image.tsx`).
- [ ] Final typography review (Manrope/Inter are provisional per
      `docs/BRANDING.md`).
- [ ] Final contrast testing across light and dark themes.
- [ ] Replace the temporary manifest icons in `src/app/manifest.ts` once
      final icons exist.

## I. PWA and cooking-mode enhancements

Dependent on the future cooking-mode specification (see
`docs/PRODUCT_ROADMAP.md`, Tier 3 §5). Explicitly out of scope for
Milestone 2's manifest, which has no service worker.

- [ ] Installable PWA (install prompts, `beforeinstallprompt` handling).
- [ ] Offline recipe viewing.
- [ ] Offline cooking mode.
- [ ] Service worker.
- [ ] Background sync.
- [ ] Wake lock (keep the screen on during cooking mode).
- [ ] Timer persistence across navigation/refresh (target end time, not
      just elapsed time).
- [ ] Home-screen icons tuned for the installed/standalone context.

## J. Legal/public policy

Future decisions — no legal copy has been drafted or implied anywhere in
the product.

- [ ] Privacy Policy.
- [ ] Terms of Use.
- [ ] Cookie disclosure, if analytics (section F) later requires it.
- [ ] Account deletion policy and flow.
- [ ] Data export.
- [ ] Public recipe-sharing policy (relevant once Tier 2 sharing features,
      per `docs/PRODUCT_ROADMAP.md`, are built).
