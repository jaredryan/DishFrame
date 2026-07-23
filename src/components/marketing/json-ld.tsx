import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web",
};

/** Escapes `<` so the serialized JSON can't be interpreted as HTML when inlined. */
function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(jsonLd) }}
    />
  );
}
