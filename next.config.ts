import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
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
    ];
  },
};

export default nextConfig;
