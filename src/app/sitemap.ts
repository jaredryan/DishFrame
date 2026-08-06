import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

const PUBLIC_ROUTES = ["/", "/about", "/contact", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route),
  }));
}
