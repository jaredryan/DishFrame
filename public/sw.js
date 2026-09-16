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

const CACHE_VERSION = "v1";
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
          .filter((name) => name.startsWith("dishframe-") && !ALL_CACHES.includes(name))
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
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

function isRscRequest(request) {
  // Next's App Router client fetches (navigation, prefetch, revalidation)
  // carry `RSC: 1`; some also carry `Next-Router-State-Tree`/`Next-Url`.
  // Checking `RSC` alone is sufficient to route these into their own
  // cache, separate from full-document HTML.
  return request.headers.get("RSC") === "1" || request.headers.has("Next-Router-State-Tree");
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

async function networkFirst(request, cacheName, fallbackUrl) {
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
    event.respondWith(cacheFirst(request, IMAGES_CACHE, IMAGE_CACHE_MAX_ENTRIES));
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
    event.respondWith(networkFirst(request, RSC_CACHE, null));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request, DOCUMENTS_CACHE, "/offline.html"));
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

function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

async function backgroundDrain() {
  let db;
  try {
    db = await openOfflineDb();
  } catch {
    return; // No local database yet (e.g. never bootstrapped) — nothing to drain.
  }

  const mutations = (await idbGetAll(db, MUTATIONS_STORE))
    .filter((m) => (m.status === "pending" || m.status === "failed") && !m.terminal)
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

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
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
