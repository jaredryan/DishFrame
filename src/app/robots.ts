import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/about", "/contact", "/privacy", "/terms"],
      disallow: [
        "/sign-in",
        "/home",
        "/recipes",
        "/parts",
        "/meal-plans",
        "/grocery-lists",
        "/share",
        "/settings",
        "/cook",
        "/help",
        "/profile",
        "/api/",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
