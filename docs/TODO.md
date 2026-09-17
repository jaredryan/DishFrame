# DishFrame — TODO

Track only unfinished software work, manual QA, and open product decisions here.
Remove completed implementation work rather than keeping a changelog in this file.
Conditional work for a broader public launch belongs in `POST_LAUNCH_TODO.md`;
optional product ideas belong in `PRODUCT_ROADMAP.md`.

Production: https://dish-frame.vercel.app

## 1. Remaining targeted product/UI work

- [ ] Resolve the sitewide small colored badge-text contrast gap documented in
  `BRANDING.md`. Compact status badges such as Proven, Saved part, Version tags,
  and star-rating treatments currently use colored text on light tints that can
  fall below the 4.5:1 WCAG AA text threshold. Decide on and apply an accessible
  accent-text treatment without weakening the established color semantics.

All targeted engineering work from the September 2026 cleanup sequence is
complete: optimization/warning cleanup, current-use security hardening,
Grocery List resync reconciliation, offline/PWA support, and composable
ingredient-level nutrition.

## 2. Remaining manual QA

- [ ] **Website recipe import:** test representative real sites, review/edit/save
  behavior, and graceful handling of unsupported or failed sources.
- [ ] **Recipe Gallery importer + DishFrame JSON round trip:** use representative
  real inputs and confirm content, structure, metadata, Parts, and nutrition
  survive as expected.
- [ ] **Meal Plans / Grocery Lists:** hands-on review of generation, linked-list
  resync, `Sync now` discoverability, manual-change keep/discard reconciliation,
  repeated syncs, source changes, and offline/reconnect behavior.
- [ ] **Composable nutrition:** manually exercise ingredient contributions,
  Section overrides, whole-Recipe/Part overrides, Partial/Calculated/Manual
  states, nested-Part version pinning, scaling, More nutrients, import/export,
  print/share/history/compare, and offline behavior.
- [ ] **Real-device PWA/offline:** iOS/Android install/standalone behavior;
  first-route offline navigation; Recipe/Part viewing/editing; Cooking Setup and
  Cooking Mode; cook → finish → close → reopen offline → review; historical
  Version view/compare/promotion; reconnect/conflict behavior; Background Sync
  where supported; wake lock; timer suspend/resume behavior.
- [ ] **Multi-Recipe direct sharing production checklist:**
  - real two-account Google-sign-in smoke test for claim-on-signup and `/share`
    reconciliation;
  - approximately 12-Recipe collection timing;
  - 50-Recipe maximum-size stress check for Vercel/Neon timeouts and atomicity;
  - seeded-state visual/UX review of collection dialogs and Sent/Received;
  - if stress checks expose share-graph latency, revisit sequential sibling
    PartLink traversal without weakening all-or-nothing behavior.
- [ ] **Barcode scanning on real devices:** iOS Safari and Android Chrome;
  permission allow/deny; immediate close during startup; camera shutdown after
  success; cancel/timeout/close; recognized and unrecognized codes; desktop
  fallback.
- [ ] **Account/security:** multi-device session listing/revocation, sign out
  other sessions, stale-session reauthentication, disposable account deletion,
  survival of another user's accepted copy/shared image, and sender rendering
  after recipient-account deletion.
- [ ] **Print/PDF:** Chrome and Safari Print Preview / Save as PDF; Letter/A4;
  long Recipes and nested Parts; page breaks; Safari margins.
- [ ] **Cuisine datalist:** cross-browser visual acceptability.

## 3. Maintenance notes

- Re-run dependency review periodically (for example monthly or before a
  production release). The remaining `deepmerge-ts` advisory is accepted while
  it remains dev-only under Prisma and requires a risky major-version override.
- Keep the broad-engineering-audit guardrail: the comprehensive audit completed
  on 2026-08-27 should not be repeated wholesale. Future reviews should target
  changed areas or concrete concerns.
- Do not infer manual-QA completion from automated verification. Owner-run
  verification and the hands-on checks above are separate.
