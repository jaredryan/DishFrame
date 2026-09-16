import type { NextConfig } from "next";

// Used only to build the Report-To header's absolute endpoint URL below —
// read directly from process.env (not src/lib/env/server's validated
// `env`) because this file runs in the Next config-loading context, not a
// request, and shouldn't require every server env var just to compute a
// header value.
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Report-only for now — see docs/TODO.md "Security hardening" for exactly
 * what's required before this can enforce instead of just report:
 * - `script-src`/`style-src` both carry `'unsafe-inline'`. Real inline
 *   sources today: next-themes' flash-prevention bootstrap script (and its
 *   `disableTransitionOnChange` inline <style>, `ThemeProvider` in
 *   src/app/layout.tsx), the JSON-LD `<script type="application/ld+json">`
 *   in components/marketing/json-ld.tsx, and inline `style` attributes
 *   Radix UI/@dnd-kit set for positioning/drag transforms. Dropping
 *   `'unsafe-inline'` from `script-src` needs a nonce-issuing middleware
 *   (Next's documented CSP-nonce pattern) threaded into both of those; the
 *   inline `style` *attributes* are governed by `style-src-attr` (falls
 *   back to `style-src`), which has no practical nonce path for
 *   JS-computed per-element values — 'unsafe-inline' there is expected to
 *   stay even after script-src tightens.
 * - No `upgrade-insecure-requests`: it's a no-op under Report-Only per
 *   spec, and would break local http dev if added while this is still
 *   report-only — add it when this becomes enforced (production is
 *   already all-https via Vercel).
 * - Reports land at /api/csp-report (rate-limited, logged only — nothing
 *   is persisted). Watch it for a while before flipping to enforced.
 */
const cspReportOnly = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src 'self'`,
  `media-src 'self'`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `report-uri /api/csp-report`,
  `report-to csp-endpoint`,
].join("; ");

const reportTo = JSON.stringify({
  group: "csp-endpoint",
  max_age: 10886400,
  endpoints: [{ url: `${appUrl}/api/csp-report` }],
});

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // docs/OFFLINE_IMPLEMENTATION_PLAN.md: real (fetch-failure-based, not
  // navigator.onLine-only) connectivity detection + automatic retry of
  // navigations/prefetches/Server Actions once the connection returns.
  // This is the base network-status signal `src/lib/offline/network.ts`
  // builds on; it does not by itself provide the local-replica/sync-queue
  // behavior the offline-capable domains (Cooking Mode, Dishes, Meal
  // Plans, Grocery Lists) implement explicitly.
  experimental: {
    useOffline: true,
  },

  async headers() {
    return [
      {
        // Never let a stale service worker script linger in an
        // intermediate cache — the update-lifecycle (`sw-register.tsx`)
        // depends on the browser re-checking this file on every
        // registration.update() call.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            // camera=(self): the in-app barcode scanner
            // (src/lib/nutrition/barcode-scanner.ts, @zxing/browser) calls
            // getUserMedia for same-origin video — camera=() blocked that
            // outright (pre-existing bug this pass found while reviewing
            // this header, unrelated to CSP itself).
            value:
              "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
          { key: "Report-To", value: reportTo },
        ],
      },
      // Slice 16 correction pass: the public share token is a bearer
      // credential embedded directly in the URL path (`/s/[token]`), unlike
      // every other route's cookie-based session. The site-wide
      // `strict-origin-when-cross-origin` default already strips the path
      // for cross-origin requests, but still sends the FULL URL (token
      // included) as `Referer` on same-origin navigation (e.g. a viewer
      // clicking "Sign in" from the share page). `no-referrer` closes that
      // remaining gap — declared after the general rule above so it wins
      // for this specific header/path (Next.js applies same-header
      // overrides in declaration order).
      {
        source: "/s/:token*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      // Slice 18 correction: the public print route embeds the same
      // ShareLink token in its path (`/print/s/[token]`) — same bearer
      // credential, same leak vector, same fix.
      {
        source: "/print/s/:token*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
