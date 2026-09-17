# DishFrame — Conditional Public-Launch To-Do

This file tracks work that is **not required for the current personal/family
DishFrame deployment**. Use it only if DishFrame is prepared for a broader
public or commercial launch.

Current production origin: `https://dish-frame.vercel.app`

The current Vercel-origin Search Console property and sitemap submission are
already complete. Privacy/Terms pages, account deletion/export, sharing,
security hardening, durable rate limiting, and offline/PWA support are already
implemented; they are not future launch tasks.

## A. Custom domain and origin migration

- [ ] Choose and purchase the final domain.
- [ ] Attach it to the Vercel project.
- [ ] Choose apex vs. `www` and configure the canonical redirect.
- [ ] Update `NEXT_PUBLIC_APP_URL` for the new production origin.
- [ ] Update `BETTER_AUTH_URL`.
- [ ] Update Better Auth trusted origins if needed.
- [ ] Add the new Google OAuth authorized JavaScript origin.
- [ ] Add `https://<new-domain>/api/auth/callback/google` as an authorized
  redirect URI.
- [ ] Preserve an appropriate redirect from `dish-frame.vercel.app` so existing
  links continue to work.
- [ ] Recheck metadata, canonical URLs, Open Graph/Twitter URLs, JSON-LD,
  sitemap, `robots.txt`, and manifest URLs after the origin switch.

## B. Search Console for the final domain

Search Console properties are origin/domain specific; the current Vercel-origin
setup does not replace this future step.

- [ ] Add/verify the final domain in Google Search Console.
- [ ] Submit the final-domain sitemap.
- [ ] Inspect indexing for the public pages.
- [ ] Request indexing where useful after the domain and public copy have
  stabilized.

## C. Resend domain upgrade

The current Resend setup is adequate for present use. A branded sender becomes
worth doing for a public launch.

- [ ] Verify a DishFrame-owned domain or subdomain in Resend.
- [ ] Configure the required SPF and DKIM records.
- [ ] Replace the development/default sender with the verified DishFrame sender
  in production environment variables.
- [ ] Retest the Contact form and confirm `replyTo` remains the submitter's
  address.
- [ ] Keep the destination/support inbox private rather than exposing it in the
  public UI.

## D. Public-launch security and policy review

- [ ] Revisit the current **365-day rolling session** policy and unlimited
  concurrent-device model for broader public use. Do not shorten it merely
  because the product has a public domain; change it only if the public threat
  model warrants it.
- [ ] Review accumulated CSP report-only telemetry and decide whether enforcing
  CSP is worthwhile before broader public use. The report-only policy and
  reporting endpoint are already implemented and hardened.
- [ ] If expected public traffic materially differs from current personal/family
  use, reconsider the existing rate-limit thresholds. Durable rate limiting is
  already implemented.
- [ ] Re-run the established dependency/security review shortly before a public
  launch so the results are current.
- [ ] Obtain professional review of the existing Privacy Policy and Terms before
  broad commercial use.
- [ ] Revisit cookie disclosure only if analytics, advertising, or other new
  tooling introduces a reason for it.
- [ ] Define any additional public-content abuse/reporting policy needed by the
  actual publication surface offered at launch.

## E. Monitoring and analytics — only if justified

Do not install monitoring simply to satisfy a checklist. Add it when broader
usage makes the operational value concrete.

- [ ] Decide whether to enable Vercel Web Analytics.
- [ ] Decide whether error monitoring such as Sentry is warranted.
- [ ] Add uptime monitoring for the production origin / health endpoint if
  public availability expectations justify it.
- [ ] Configure Neon usage/storage/compute alerts as traffic grows.
- [ ] Configure Resend delivery/bounce/complaint monitoring if email volume
  grows.

## F. Preview/environment isolation

Before relying on public preview deployments for realistic launch testing:

- [ ] Use a separate Neon branch/database for Vercel Preview deployments.
- [ ] Scope Preview `DATABASE_URL` / `DIRECT_URL` to that database.
- [ ] Decide a workable Preview OAuth strategy for origin-specific Google OAuth
  redirects.
- [ ] Isolate Preview email credentials/destinations so previews cannot send
  production Contact notifications.

## G. Public-launch product polish

- [ ] **Yield-unit pluralization.** Extend the broader yield model to support
  appropriate singular/plural display forms rather than special-casing strings
  such as `Makes 1 servings`. This is not required for current personal/family
  use, but should be resolved before a broader public launch.

## H. Final launch verification after an origin change

- [ ] Inspect `robots.txt` and the sitemap on the final origin.
- [ ] Inspect canonical tags and JSON-LD on all public pages.
- [ ] Verify Open Graph/Twitter cards through external share debuggers.
- [ ] Verify the branded 404 page.
- [ ] Verify private/authenticated routes remain `noindex`.
- [ ] Confirm OAuth sign-in/callback behavior on the final domain.
- [ ] Confirm Contact email delivery from the final sender configuration.
- [ ] Review production build/runtime logs after launch for unexpected errors.
