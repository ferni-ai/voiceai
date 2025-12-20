/**
 * Ferni Service Worker
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Caches landing page assets and AI-generated content for:
 * - Offline support
 * - Faster subsequent loads
 * - Reduced API calls (cost savings)
 * 
 * Cache Strategy:
 * - Static assets: Cache First (CSS, JS, images)
 * - AI content: Stale While Revalidate (cached + background refresh)
 * - API responses: Network First with Cache Fallback
 */

const CACHE_VERSION = 'ferni-v1.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const AI_CONTENT_CACHE = `ai-content-${CACHE_VERSION}`;

// Static assets to pre-cache
const STATIC_ASSETS = [
  '/',
  '/story-brand/',
  '/css/styles.css',
  '/css/story-brand.css',
  '/css/ai-storytelling.css',
  '/css/ai-copy-magic.css',
  '/js/landing-animations.js',
  '/js/ai-storytelling.js',
  '/js/ai-copy-magic.js',
  '/images/ferni-avatar.svg',
];

// AI content patterns to cache
const AI_CONTENT_PATTERNS = [
  /\/api\/landing\/ai\/personalized-hero/,
  /\/api\/landing\/ai\/social-proof/,
  /\/api\/landing\/ai\/late-night-scenario/,
  /\/api\/landing\/time-content/,
];

// ═══════════════════════════════════════════════════════════════════════════
// INSTALL - Pre-cache static assets
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to pre-cache:', error);
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVATE - Clean up old caches
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== AI_CONTENT_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleaned');
        return self.clients.claim();
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// FETCH - Handle requests with appropriate strategy
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip cross-origin requests (except API)
  if (!url.origin.includes(self.location.hostname) && 
      !url.pathname.includes('/api/landing')) {
    return;
  }
  
  // Check if this is an AI content request
  const isAIContent = AI_CONTENT_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (isAIContent) {
    // Stale While Revalidate for AI content
    event.respondWith(staleWhileRevalidate(request, AI_CONTENT_CACHE));
    return;
  }
  
  // Check if this is a static asset
  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname.endsWith(asset)) ||
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|woff2?)$/);
  
  if (isStaticAsset) {
    // Cache First for static assets
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // Default: Network First
  event.respondWith(networkFirst(request, STATIC_CACHE));
});

// ═══════════════════════════════════════════════════════════════════════════
// CACHE STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cache First - Try cache, fall back to network
 * Best for: Static assets that rarely change
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Cache hit:', request.url);
    return cachedResponse;
  }
  
  console.log('[SW] Cache miss, fetching:', request.url);
  const networkResponse = await fetch(request);
  
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

/**
 * Network First - Try network, fall back to cache
 * Best for: HTML pages, API data
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page if available
    return cache.match('/offline.html');
  }
}

/**
 * Stale While Revalidate - Return cached, update in background
 * Best for: AI content that can be slightly stale
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Fetch fresh content in background
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
        console.log('[SW] Updated AI cache:', request.url);
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Background fetch failed:', error);
      return null;
    });
  
  // Return cached immediately if available
  if (cachedResponse) {
    console.log('[SW] Returning stale AI content:', request.url);
    return cachedResponse;
  }
  
  // Otherwise wait for network
  console.log('[SW] No cached AI content, waiting for network:', request.url);
  return fetchPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_AI_CACHE') {
    caches.delete(AI_CONTENT_CACHE)
      .then(() => {
        console.log('[SW] AI content cache cleared');
        event.ports[0].postMessage({ success: true });
      });
  }
  
  if (event.data.type === 'GET_CACHE_STATS') {
    Promise.all([
      getCacheSize(STATIC_CACHE),
      getCacheSize(AI_CONTENT_CACHE),
    ]).then(([staticSize, aiSize]) => {
      event.ports[0].postMessage({
        static: staticSize,
        aiContent: aiSize,
        total: staticSize + aiSize,
      });
    });
  }
});

async function getCacheSize(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  return keys.length;
}

console.log('[SW] Service worker loaded');
