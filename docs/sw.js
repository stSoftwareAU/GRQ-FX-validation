// Service Worker for GRQ FX Validation Dashboard
// Version 1.0.109 - Correct pathname matching for data files (CSV + predictions.json)

const CACHE_NAME = "grq-fx-v1.0.109";
const STATIC_CACHE_NAME = "grq-fx-static-v1.0.109";
const DYNAMIC_CACHE_NAME = "grq-fx-dynamic-v1.0.109";

// Files to cache immediately (static assets)
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./index.js",
  "./safe-html.js",
  "./safe-card.js",
  "./safe-error-banner.js",
  "./yahoo-validate.js",
  "./sw-register.js",
  "./styles.css",
  "./manifest.json",
  "./logo.png",
  "./logo2.webp",
  // Bootstrap and Chart.js CDN resources — pinned with SRI from index.html
  // (issue #13). Bump CACHE_NAME whenever these pins change so the
  // service worker re-fetches and re-validates the integrity hashes.
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js",
];

// Files to cache on demand (dynamic content)
const DYNAMIC_PATTERNS = [
  /\/data\/.*\.csv$/,
  /\/\d{4}-\d{2}-\d{2}\/predictions\.json$/,
];

// Files that should use Network First strategy (always try fresh first)
const NETWORK_FIRST_PATTERNS = [
  /\/index\.json$/,
];

/**
 * Add diagnostic headers to a response.
 *
 * Note: Response headers are immutable; we must create a new Response.
 */
function withHeaders(response, extraHeaders) {
  const cloned = response.clone();
  const headers = new Headers(cloned.headers);
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(cloned.body, {
    status: cloned.status,
    statusText: cloned.statusText,
    headers,
  });
}

/**
 * Network-first for `index.json` so the date dropdown stays current.
 *
 * If the network fails, fall back to cached `index.json` with a warning header.
 */
async function networkFirstIndexJson(originalRequest) {
  const request = new Request(originalRequest, { cache: "no-store" });
  const cache = await caches.open(DYNAMIC_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn(
      "Service Worker: Network failed for index.json, using cache",
      request.url,
      error,
    );
    const cached = await cache.match(request);
    if (cached) {
      return withHeaders(cached, {
        "X-Served-From-Cache": "true",
        "X-Validation-Warning": "STALE-INDEX",
        "X-Cache-Timestamp": new Date().toISOString(),
      });
    }
    throw error;
  }
}

// Install event - aggressively cache static assets
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing version", CACHE_NAME);

  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log("Service Worker: Aggressively caching static assets");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log("Service Worker: Static assets cached successfully");
        // Force immediate activation to ensure new version takes over
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("Service Worker: Failed to cache static assets", error);
        // Still skip waiting even if caching fails
        return self.skipWaiting();
      }),
  );
});

// Activate event - clean up old caches and force version update
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating version", CACHE_NAME);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete ALL old caches to force fresh downloads
            if (cacheName.startsWith("grq-fx-")) {
              console.log("Service Worker: Deleting old cache", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        console.log("Service Worker: All old caches deleted, claiming clients");
        // Force claim all clients immediately
        return self.clients.claim();
      })
      .then(() => {
        // Notify all clients about the update and force reload
        return self.clients.matchAll();
      })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "SW_UPDATED",
            version: CACHE_NAME,
            timestamp: Date.now(),
            forceReload: true,
          });
        });
      }),
  );
});

// Fetch event - network first for JS/CSS, cache first for data when offline
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip external API calls (Yahoo Finance, etc.)
  if (
    url.origin !== location.origin &&
    !url.hostname.includes("cdn.jsdelivr.net")
  ) {
    return;
  }

  // Check if this is a data file (CSV or predictions)
  const isDataFile = DYNAMIC_PATTERNS.some((pattern) =>
    pattern.test(url.pathname)
  );

  // Check if this should use Network First strategy (index.json)
  const isNetworkFirst = NETWORK_FIRST_PATTERNS.some((pattern) =>
    pattern.test(url.pathname)
  );

  // Check if this is a static asset (JS, CSS, HTML)
  const isStaticAsset = url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html") ||
    url.pathname === "./" ||
    (url.pathname.endsWith(".json") && !isNetworkFirst && !isDataFile);

  if (isStaticAsset) {
    // For static assets: Cache first with version-based invalidation
    // Aggressive caching since version changes invalidate all caches
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log("Service Worker: Serving from cache", request.url);
            return cachedResponse;
          }

          // Not in cache, fetch from network and cache it
          console.log("Service Worker: Fetching from network", request.url);
          return fetch(request)
            .then((response) => {
              // If network request succeeds, cache it
              if (
                response && response.status === 200 && response.type === "basic"
              ) {
                const responseToCache = response.clone();
                caches.open(STATIC_CACHE_NAME)
                  .then((cache) => {
                    console.log(
                      "Service Worker: Caching fresh content",
                      request.url,
                    );
                    cache.put(request, responseToCache);
                  });
              }
              return response;
            })
            .catch((error) => {
              console.log(
                "Service Worker: Network failed, no cache available",
                request.url,
              );
              // If no cache and it's a navigation request, return offline page
              if (request.destination === "document") {
                return caches.match("./index.html");
              }
              throw error;
            });
        }),
    );
  } else if (isNetworkFirst) {
    // For index.json: Network first - keep the date dropdown current when online.
    event.respondWith(
      networkFirstIndexJson(request),
    );
  } else if (isDataFile) {
    // For data files: Network ONLY - cache is for emergency offline use only
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .then((response) => {
          // If network request succeeds, update cache and return fresh content
          if (
            response && response.status === 200 && response.type === "basic"
          ) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE_NAME)
              .then((cache) => {
                console.log("Service Worker: Updating data cache", request.url);
                cache.put(request, responseToCache);
              });
          }
          return response;
        })
        .catch((_error) => {
          console.warn(
            "Service Worker: Network failed for data file - VALIDATION MAY BE INVALID",
            request.url,
          );
          // Network failed - only use cache as last resort with strong warning
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return withHeaders(cachedResponse, {
                  "X-Served-From-Cache": "true",
                  "X-Validation-Warning": "CACHED-DATA",
                  "X-Cache-Timestamp": new Date().toISOString(),
                });
              }
              // No cache available - return error
              throw new Error(
                "No network connection and no cached data available. Cannot validate predictions.",
              );
            });
        }),
    );
  } else {
    // For other files: Cache first with version-based invalidation
    // Aggressive caching since version changes invalidate all caches
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log("Service Worker: Serving from cache", request.url);
            return cachedResponse;
          }

          // Not in cache, fetch from network and cache it
          console.log("Service Worker: Fetching from network", request.url);
          return fetch(request)
            .then((response) => {
              // If network request succeeds, cache it
              if (
                response && response.status === 200 && response.type === "basic"
              ) {
                const responseToCache = response.clone();
                caches.open(STATIC_CACHE_NAME)
                  .then((cache) => {
                    console.log(
                      "Service Worker: Caching fresh content",
                      request.url,
                    );
                    cache.put(request, responseToCache);
                  });
              }
              return response;
            })
            .catch((error) => {
              console.log(
                "Service Worker: Network failed, no cache available",
                request.url,
              );
              throw error;
            });
        }),
    );
  }
});

// Handle background sync (if supported)
self.addEventListener("sync", (event) => {
  console.log("Service Worker: Background sync", event.tag);

  if (event.tag === "background-sync") {
    event.waitUntil(
      // Perform background sync operations here
      // For example, sync any pending data when connection is restored
      Promise.resolve(),
    );
  }
});

// Handle push notifications (if needed in the future)
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push notification received");

  const options = {
    body: event.data ? event.data.text() : "New FX data available",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "View Dashboard",
        icon: "/icons/icon-96x96.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/icons/icon-96x96.png",
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification("GRQ FX Dashboard", options),
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("Service Worker: Notification clicked");

  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(
      clients.openWindow("/"),
    );
  }
});

// Message handling for communication with main thread
self.addEventListener("message", (event) => {
  console.log("Service Worker: Message received", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }

  if (event.data && event.data.type === "FORCE_UPDATE") {
    console.log("Service Worker: Force update requested");
    self.skipWaiting();
    // Notify all clients to reload
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: "FORCE_RELOAD" });
      });
    });
  }
});
