// DishFrame service worker (docs/OFFLINE_IMPLEMENTATION_PLAN.md).
//
// Plain, hand-written, no-bundler script — Next 16's own PWA guide
// (node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md)
// points at Serwist for a fully bundled approach, but this app's caching
// rules are narrow and custom enough (see below) that a small hand-written
// script is more transparent than adopting a generic precache-everything
// strategy library. This file is NOT run through the Next/Turbopack build
// — it is served as-is from `public/`, which is also why the Background
// Sync handler at the bottom re-implements (in vanilla JS) a reduced
// version of `src/lib/offline/sync-engine.ts`'s drain loop rather than
// importing it: a service worker script has no bundler step here to pull
// in a TypeScript module. If the mutation-application contract in that
// file changes, this file's `applyMutation`/drain logic below needs the
// same change made by hand — that's a real, documented maintenance cost of
// not adopting a bundler-integrated SW library, not an oversight.
//
// Cache-key correctness (the plan's explicit risk area): Next's App Router
// serves three fundamentally different response kinds from what looks like
// the same URL — a full HTML document (a real navigation), an RSC/Flight
// payload (client-side navigation and prefetch fetches, `RSC: 1` request
// header), and everything else (static assets, API routes). Using one
// shared cache keyed by URL alone would let an HTML response and an RSC
// response for the same path silently collide. This script avoids that
// entirely by using a SEPARATE Cache Storage cache per response kind
// (`dishframe-documents` vs. `dishframe-rsc`) rather than relying on Vary-
// header matching semantics within one cache.

const STATIC_CACHE = "dishframe-static";
const DOCUMENTS_CACHE = "dishframe-documents";
const RSC_CACHE = "dishframe-rsc";
const IMAGES_CACHE = "dishframe-images";
const ALL_CACHES = [STATIC_CACHE, DOCUMENTS_CACHE, RSC_CACHE, IMAGES_CACHE];

// Precached at install so the app has *something* to boot into offline
// immediately, without depending on the user having visited any route
// first. This is deliberately small — see the plan's "Do not assume
// precaching JS/CSS alone creates a usable offline app shell" note:
// `/_next/static/*` chunks are cached opportunistically as they're
// fetched (cache-first below, safe because they're content-hashed and
// therefore immutable per build), not precached by filename here, since
// this script has no build-time manifest of those hashed paths.
const PRECACHE_URLS = ["/offline.html", "/manifest.webmanifest"];

const IMAGE_CACHE_MAX_ENTRIES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE_URLS).catch(() => {
        // A single missing precache URL (e.g. offline.html not yet built
        // in a dev environment) shouldn't fail the whole install.
      });
      await precacheOfflineShells();
      // Do not auto-activate — see sw-register.tsx's update-lifecycle
      // handling. Activating immediately would replace the running
      // version mid-session, which is exactly what the "Update available
      // — Reload" prompt exists to gate, especially during Cooking Mode.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("dishframe-") && !ALL_CACHES.includes(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// account-scope.ts wipes caches directly via `caches.delete()` on an
// account switch/sign-out; this handler exists only so a service worker
// already mid-handling a fetch for the *old* account doesn't keep serving
// a response it read from cache a moment earlier. There is no per-account
// state kept in this script to actually clear — the cache names are fixed
// and account-scope.ts already deleted their contents by the time this
// fires — so today this is a no-op notification point, kept as an explicit
// hook for any future per-request in-flight state.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "dishframe:account-changed") {
    // No in-worker state to clear today; see comment above.
  }
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html"))
  );
}

function isRscRequest(request) {
  // Next's App Router client fetches (navigation, prefetch, revalidation)
  // carry `RSC: 1`; some also carry `Next-Router-State-Tree`/`Next-Url`.
  // Checking `RSC` alone is sufficient to route these into their own
  // cache, separate from full-document HTML.
  return (
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-State-Tree")
  );
}

function isNextStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isImageAssetRoute(url) {
  return url.pathname.startsWith("/api/images/");
}

function isApiRoute(url) {
  return url.pathname.startsWith("/api/");
}

// --- Generic offline route-shell fallback --------------------------------
//
// A cached response for one specific dynamic URL (e.g. `/recipes/abc123`)
// is useless once the user navigates to `/recipes/xyz789` while offline —
// that exact URL was never fetched. Every dynamic record route listed below
// has a client-side "offline boundary" component
// (`components/domain/*/*-offline-boundary.tsx`) that derives its record's
// identity from the browser's real URL via `useParams()` — never from
// anything embedded in the server-rendered payload — so a mismatched shell
// is always safe to paint from while the boundary swaps in the real record
// from the IndexedDB replica.
//
// Route-shell safety correction: the shell used for that mismatch window
// must be a NEUTRAL bootstrap render, never another real record's rendered
// payload — reusing Record A's response as Record B's shell would let
// Record A's content visibly paint (even briefly) at Record B's URL, which
// every offline boundary's own hydration-safety design (`serverProps: null`
// / `OFFLINE_SHELL_SENTINEL`) exists specifically to prevent. So a shell is
// never captured reactively from a real navigation — it's PRECACHED at
// `install` time (see `precacheOfflineShells` below) by fetching each
// pattern's reserved sentinel URL, which every route's page.tsx recognizes
// *before* any auth/data dependency and renders as `serverProps={null}` —
// the same inert bootstrap shell every offline boundary already renders for
// this case. That makes the first-ever offline visit to any of these
// patterns work without depending on having visited a real record of that
// pattern online first. A shell is stored in, and only ever read back from,
// the SAME cache its exact-URL entries already use — this never mixes the
// document/RSC split above; it only adds one extra synthetic cache key per
// cache.
//
// Keep `OFFLINE_SHELL_SENTINEL` and each `sentinelPath` below in sync with
// `src/lib/offline/shell-sentinel.ts` and the page.tsx sentinel checks —
// this plain script has no build step to import that constant directly.
const OFFLINE_SHELL_SENTINEL = "_offline_shell_";

const SHELL_ROUTES = [
  {
    pattern: /^\/recipes\/[^/]+$/,
    sentinelPath: `/recipes/${OFFLINE_SHELL_SENTINEL}`,
  },
  {
    pattern: /^\/parts\/[^/]+$/,
    sentinelPath: `/parts/${OFFLINE_SHELL_SENTINEL}`,
  },
  {
    pattern: /^\/recipes\/[^/]+\/cook$/,
    sentinelPath: `/recipes/${OFFLINE_SHELL_SENTINEL}/cook`,
  },
  {
    pattern: /^\/parts\/[^/]+\/cook$/,
    sentinelPath: `/parts/${OFFLINE_SHELL_SENTINEL}/cook`,
  },
  {
    pattern: /^\/recipes\/[^/]+\/versions\/[^/]+$/,
    sentinelPath: `/recipes/${OFFLINE_SHELL_SENTINEL}/versions/${OFFLINE_SHELL_SENTINEL}`,
  },
  {
    pattern: /^\/parts\/[^/]+\/versions\/[^/]+$/,
    sentinelPath: `/parts/${OFFLINE_SHELL_SENTINEL}/versions/${OFFLINE_SHELL_SENTINEL}`,
  },
  {
    pattern: /^\/recipes\/[^/]+\/compare$/,
    sentinelPath: `/recipes/${OFFLINE_SHELL_SENTINEL}/compare`,
  },
  {
    pattern: /^\/parts\/[^/]+\/compare$/,
    sentinelPath: `/parts/${OFFLINE_SHELL_SENTINEL}/compare`,
  },
  {
    pattern: /^\/cook\/[^/]+$/,
    sentinelPath: `/cook/${OFFLINE_SHELL_SENTINEL}`,
  },
  {
    pattern: /^\/cook\/[^/]+\/review$/,
    sentinelPath: `/cook/${OFFLINE_SHELL_SENTINEL}/review`,
  },
  {
    pattern: /^\/meal-plans\/[^/]+$/,
    sentinelPath: `/meal-plans/${OFFLINE_SHELL_SENTINEL}`,
  },
  {
    pattern: /^\/meal-plans\/[^/]+\/edit$/,
    sentinelPath: `/meal-plans/${OFFLINE_SHELL_SENTINEL}/edit`,
  },
  {
    pattern: /^\/grocery-lists\/[^/]+$/,
    sentinelPath: `/grocery-lists/${OFFLINE_SHELL_SENTINEL}`,
  },
];

function shellKeyForPathname(pathname) {
  for (const { pattern } of SHELL_ROUTES) {
    if (pattern.test(pathname)) return pattern.source;
  }
  return null;
}

// A synthetic same-origin request used purely as a Cache Storage key —
// never actually sent over the network.
function shellRequestFor(patternSource) {
  return new Request(
    `${self.location.origin}/__offline-shell__?pattern=${encodeURIComponent(patternSource)}`,
  );
}

// Fetches each route pattern's neutral sentinel URL — as both a document
// and an RSC request, matching the two caches real navigations use — and
// stores the result under that pattern's shell key. Best-effort per route:
// one failed fetch (e.g. offline during an update install) doesn't block
// the others or fail the whole `install` event.
async function precacheOfflineShells() {
  const documentsCache = await caches.open(DOCUMENTS_CACHE);
  const rscCache = await caches.open(RSC_CACHE);

  await Promise.all(
    SHELL_ROUTES.map(async ({ pattern, sentinelPath }) => {
      const shellKey = shellRequestFor(pattern.source);
      try {
        const docResponse = await fetch(sentinelPath, {
          headers: { Accept: "text/html" },
        });
        if (docResponse && docResponse.ok) {
          await documentsCache.put(shellKey, docResponse.clone());
        }
      } catch {
        // See function doc comment.
      }
      try {
        const rscResponse = await fetch(sentinelPath, {
          headers: { RSC: "1", Accept: "text/x-component" },
        });
        if (rscResponse && rscResponse.ok) {
          await rscCache.put(shellKey, rscResponse.clone());
        }
      } catch {
        // See function doc comment.
      }
    }),
  );
}

async function networkFirstWithShellFallback(
  request,
  cacheName,
  pathname,
  fallbackUrl,
) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const shellKey = shellKeyForPathname(pathname);
    if (shellKey) {
      const shell = await cache.match(shellRequestFor(shellKey));
      if (shell) return shell;
    }
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
    if (maxEntries) await trimCache(cache, maxEntries);
  }
  return response;
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // Simple FIFO eviction (oldest-inserted first) — Cache Storage doesn't
  // track access recency itself, and this app's images are immutable per
  // asset id, so FIFO is an entirely reasonable stand-in for LRU here: a
  // recently-created asset is also a recently-cached one in the common
  // case (viewing a Recipe you just added a photo to).
  const overflow = keys.length - maxEntries;
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // mutations always go to the network untouched

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImageAssetRoute(url)) {
    event.respondWith(
      cacheFirst(request, IMAGES_CACHE, IMAGE_CACHE_MAX_ENTRIES),
    );
    return;
  }

  // Every other API route (including /api/sync/*) is network-only — their
  // offline behavior is owned by the IndexedDB-backed sync engine in page
  // JS, not by this service worker's cache.
  if (isApiRoute(url)) return;

  if (isNextStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isRscRequest(request)) {
    event.respondWith(
      networkFirstWithShellFallback(request, RSC_CACHE, url.pathname, null),
    );
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      networkFirstWithShellFallback(
        request,
        DOCUMENTS_CACHE,
        url.pathname,
        "/offline.html",
      ),
    );
    return;
  }

  // Fonts, the manifest, icons, and anything else same-origin: opportunistic
  // cache-first, refreshed implicitly whenever the browser's own HTTP cache
  // expires the underlying response.
  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// --- Background Sync ------------------------------------------------------
//
// See this file's header comment: this is a hand-maintained, reduced
// mirror of `src/lib/offline/sync-engine.ts`'s drain loop, kept only
// well enough in sync to safely apply queued mutations when no tab is
// open — full reconciliation detail (conflict surfacing, retry backoff
// bookkeeping) still happens in page JS the next time a tab is open,
// exactly like the "foreground recovery" path for browsers that don't
// support Background Sync at all.

const DB_NAME = "dishframe-offline";
const MUTATIONS_STORE = "mutations";

const OP_NAMESPACE_TO_ENDPOINT = {
  dish: "/api/sync/dishes",
  cooking: "/api/sync/cooking",
  mealplan: "/api/sync/mealplans",
  grocery: "/api/sync/grocery",
};

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Mirrors src/lib/offline/queue.ts's DIRECT_ATTEMPT_LEASE_MS — a
// "syncing" mutation is `runOrQueueMutation`'s own direct-attempt lease
// (see mutate.ts), not this drain's to touch while it might still be
// live in some page's foreground JS. Only once the lease is old enough
// to mean that attempt was abandoned (the page was torn down mid-fetch)
// does this background drain treat it as eligible, same as the
// foreground `listPendingMutations`.
const DIRECT_ATTEMPT_LEASE_MS = 20000;

function isSyncingLeaseExpired(mutation, now) {
  if (!mutation.lastAttemptAt) return true;
  return (
    now - new Date(mutation.lastAttemptAt).getTime() >= DIRECT_ATTEMPT_LEASE_MS
  );
}

async function backgroundDrain() {
  let db;
  try {
    db = await openOfflineDb();
  } catch {
    return; // No local database yet (e.g. never bootstrapped) — nothing to drain.
  }

  const now = Date.now();
  const mutations = (await idbGetAll(db, MUTATIONS_STORE))
    .filter((m) => {
      if (m.terminal) return false;
      if (m.status === "pending" || m.status === "failed") return true;
      return m.status === "syncing" && isSyncingLeaseExpired(m, now);
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const blockedEntities = new Set();

  for (const mutation of mutations) {
    const entityKey = `${mutation.entityType}:${mutation.entityId}`;
    if (blockedEntities.has(entityKey)) continue;

    const namespace = mutation.op.split(".")[0];
    const endpoint = OP_NAMESPACE_TO_ENDPOINT[namespace];
    if (!endpoint) continue;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutationId: mutation.mutationId,
          op: mutation.op,
          entityId: mutation.entityId,
          payload: mutation.payload,
        }),
      });

      if (response.ok) {
        // Applied (or already-applied, replayed via the idempotency
        // receipt) — remove it. Full local-replica reconciliation (writing
        // the returned snapshot back into the `entities` store) is left to
        // page JS's own next `runIncrementalPull()`, which every trigger
        // path (including this Background Sync event's own client message
        // below) also calls — this keeps the two implementations from
        // needing to agree on the full `EntityRecord` shape.
        await idbDelete(db, MUTATIONS_STORE, mutation.mutationId);
        continue;
      }

      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        // Terminal from here (auth/validation/not-found/conflict) — leave
        // it for a real client to classify and surface via the full
        // drain loop rather than guessing at status-code semantics twice.
        blockedEntities.add(entityKey);
        continue;
      }

      // 5xx/429 — transient, stop for this entity and let the next
      // Background Sync tick (or a foreground drain) retry it.
      blockedEntities.add(entityKey);
    } catch {
      // Network error — still offline, or the origin is unreachable. Stop
      // this entity's remaining mutations and let the platform retry the
      // whole sync event later (returning a rejected promise from the
      // `sync` handler asks the browser to reschedule it).
      blockedEntities.add(entityKey);
      throw new Error("dishframe-sync: network error, will retry");
    }
  }

  // Tell any open tabs to refresh their own view of the queue/replica now
  // that some mutations may have applied out from under them.
  const clientsList = await self.clients.matchAll({ type: "window" });
  for (const client of clientsList) {
    client.postMessage({ type: "dishframe:drain-sync-queue" });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "dishframe-sync") {
    event.waitUntil(backgroundDrain());
  }
});
