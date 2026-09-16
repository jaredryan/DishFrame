import { consumeRateLimit, getClientIp } from "@/lib/rate-limit/limit";

/**
 * Receives Content-Security-Policy-Report-Only violation reports (see
 * next.config.ts's `report-uri`/`report-to`) so they show up in Vercel logs
 * during the report-only phase instead of only in a visiting browser's own
 * devtools console. Nothing is persisted — this is a diagnostic log sink,
 * not an audit trail. Public and unauthenticated by nature (every visiting
 * browser posts here — and, unlike a real browser, an attacker can send
 * whatever shape/size body they like), so every input below is treated as
 * untrusted: IP-rate-limited like the contact form, size-capped before and
 * after parsing, and logged only after stripping query strings/fragments
 * from URL-shaped fields and truncating everything else.
 *
 * Accepts both report formats browsers actually send: the legacy
 * `report-uri` shape (`Content-Type: application/csp-report`, one
 * `{"csp-report": {...}}` object) and the modern Reporting API `report-to`
 * shape (`Content-Type: application/reports+json`, an array of report
 * envelopes) — see the `report-to`/`Report-To` pairing in next.config.ts.
 */

// Real CSP reports are well under 1KB; this leaves generous headroom
// without letting an attacker force this endpoint to buffer/parse a large
// body every request.
const MAX_BODY_BYTES = 16 * 1024;
// A malformed/hostile Reporting API payload could be a huge array — only
// look at the first handful of entries regardless of how many are sent.
const MAX_ENTRIES = 20;
// Bounds any single logged string (a URL, a script sample, the policy
// text itself) and the number of fields read off of one report object.
const MAX_STRING_LENGTH = 300;
const MAX_FIELDS_PER_REPORT = 40;
// Field names (case-insensitive) that carry a URL in either report shape —
// query strings/fragments on these can carry the same kind of sensitive
// data this app already scrubs from the Referrer-Policy header for share
// links (next.config.ts), so they're stripped before logging, not just
// truncated.
const URL_FIELD_NAMES = new Set([
  "url",
  "document-uri",
  "documenturl",
  "blocked-uri",
  "blockedurl",
  "referrer",
  "source-file",
  "sourcefile",
]);

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request.headers);
  const rateLimit = await consumeRateLimit(`csp-report:${ip}`, {
    max: 60,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) {
    return new Response(null, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch (error) {
    console.error("[csp-report] Failed to read report body:", error);
    return new Response(null, { status: 204 });
  }
  // Content-Length can be absent or wrong — re-check the bytes actually
  // received before doing anything else with them.
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  try {
    const body: unknown = JSON.parse(text);
    for (const entry of normalizeReports(body).slice(0, MAX_ENTRIES)) {
      console.warn("[csp-report]", sanitizeReport(entry));
    }
  } catch (error) {
    console.error("[csp-report] Failed to parse report body:", error);
  }

  return new Response(null, { status: 204 });
}

function normalizeReports(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    // Reporting API envelope: [{ type, url, body: {...} }, ...]
    return body.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    );
  }
  if (
    typeof body === "object" &&
    body !== null &&
    "csp-report" in body &&
    typeof (body as { "csp-report": unknown })["csp-report"] === "object"
  ) {
    return [(body as { "csp-report": Record<string, unknown> })["csp-report"]];
  }
  return [];
}

function sanitizeReport(
  report: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  let fieldCount = 0;
  for (const [key, value] of Object.entries(report)) {
    if (++fieldCount > MAX_FIELDS_PER_REPORT) break;
    sanitized[key] = sanitizeValue(key, value);
  }
  return sanitized;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    const stripped = URL_FIELD_NAMES.has(key.toLowerCase())
      ? stripQueryAndFragment(value)
      : value;
    return truncate(stripped);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(key, item));
  }
  if (typeof value === "object" && value !== null) {
    return sanitizeReport(value as Record<string, unknown>);
  }
  return value;
}

function stripQueryAndFragment(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    // Not a parseable absolute URL (a relative path, or just garbage) —
    // there's no query/fragment structure to strip; truncation still applies.
    return value;
  }
}

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value;
}
