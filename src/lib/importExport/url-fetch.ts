import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

/**
 * Website-import's SSRF-sensitive boundary: the server fetches a
 * user-provided URL, so every hop (including redirects) is validated
 * against loopback/private/reserved destinations before it's requested,
 * with a size cap, timeout, and no forwarded credentials. Known limitation:
 * the DNS-resolution check and the actual TCP connect are two separate
 * steps (Node's `fetch` re-resolves internally), so a narrow DNS-rebinding
 * window remains — acceptable for a personal/family-tier recipe importer,
 * not claimed as airtight.
 */

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT = "DishFrameImporter/1.0 (+recipe import)";

export type UrlFetchResult =
  { ok: true; html: string } | { ok: false; message: string };

function isDisallowedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b, c] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 0) return true; // "this network"
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF/TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isDisallowedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;

  const mappedOrCompat = lower.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedOrCompat) return isDisallowedIpv4(mappedOrCompat[1]);

  const firstGroup = lower.split(":")[0];
  const firstValue = parseInt(firstGroup || "0", 16);
  if (Number.isNaN(firstValue)) return true;
  if (firstValue >= 0xfc00 && firstValue <= 0xfdff) return true; // unique local
  if (firstValue >= 0xfe80 && firstValue <= 0xfebf) return true; // link-local
  return false;
}

async function validateFetchTarget(
  url: URL,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "Only http and https URLs are supported." };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, message: "That URL points to a local address." };
  }

  const literalIpVersion = net.isIP(hostname);
  let candidateIps: string[];
  if (literalIpVersion) {
    candidateIps = [hostname];
  } else {
    try {
      const records = await dns.lookup(hostname, { all: true, verbatim: true });
      candidateIps = records.map((record) => record.address);
    } catch {
      return { ok: false, message: "Could not resolve that URL's host." };
    }
  }

  if (candidateIps.length === 0) {
    return { ok: false, message: "Could not resolve that URL's host." };
  }

  for (const ip of candidateIps) {
    const version = net.isIP(ip);
    const disallowed =
      version === 6 ? isDisallowedIpv6(ip) : isDisallowedIpv4(ip);
    if (disallowed) {
      return {
        ok: false,
        message: "That URL points to a private or internal address.",
      };
    }
  }

  return { ok: true };
}

type FetchOnceResult =
  | { kind: "html"; html: string }
  | { kind: "redirect"; location: string }
  | { kind: "error"; message: string };

async function readBodyWithLimit(response: Response): Promise<string | null> {
  if (!response.body) {
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? null : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function fetchOnce(url: URL): Promise<FetchOnceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      return { kind: "error", message: "That page took too long to respond." };
    }
    return { kind: "error", message: "Could not reach that URL." };
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      return {
        kind: "error",
        message: "That page redirected without a destination.",
      };
    }
    return { kind: "redirect", location };
  }

  if (!response.ok) {
    return {
      kind: "error",
      message: `That page could not be loaded (status ${response.status}).`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.includes("html") &&
    !contentType.includes("xml")
  ) {
    return { kind: "error", message: "That URL didn't return a webpage." };
  }

  const html = await readBodyWithLimit(response);
  if (html === null) {
    return { kind: "error", message: "That page was too large to import." };
  }
  return { kind: "html", html };
}

export async function fetchHtmlSafely(rawUrl: string): Promise<UrlFetchResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, message: "Enter a valid recipe URL." };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = await validateFetchTarget(current);
    if (!validation.ok) return validation;

    const result = await fetchOnce(current);
    if (result.kind === "error") return { ok: false, message: result.message };
    if (result.kind === "html") return { ok: true, html: result.html };

    try {
      current = new URL(result.location, current);
    } catch {
      return { ok: false, message: "Could not follow that page's redirect." };
    }
  }

  return { ok: false, message: "That page redirected too many times." };
}
