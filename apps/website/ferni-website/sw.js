/**
 * Ferni Service Worker (Enhanced)
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

const CACHE_VERSION = 'ferni-v2.0.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const AI_CONTENT_CACHE = `ai-content-${CACHE_VERSION}`;

// Static assets to pre-cache
const STATIC_ASSETS = [
  '/',
  '/story-brand/',
  '/css/styles.css',
  '/css/design-tokens.css',
  '/css/story-brand.css',
  '/css/ai-storytelling.css',
  '/css/ai-copy-magic.css',
  '/js/main.js',
  '/js/landing-animations.js',
  '/js/ai-storytelling.js',
  '/js/ai-copy-magic.js',
  '/images/og-image.jpg',
  '/manifest.json',
];

// AI content patterns to cache with stale-while-revalidate
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
  console.log('[SW] Installing service worker v2...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        // Don't fail install if some assets don't exist yet
        return Promise.all(
          STATIC_ASSETS.map(asset =>
            cache.add(asset).catch(() => {
              console.log('[SW] Could not cache:', asset);
            })
          )
        );
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
  console.log('[SW] Activating service worker v2...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => 
              name !== STATIC_CACHE && 
              name !== AI_CONTENT_CACHE &&
              !name.startsWith('workbox-') // Preserve any workbox caches
            )
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
  
  // Skip cross-origin requests (except known API endpoints)
  const isOwnOrigin = url.origin === self.location.origin;
  const isAPICall = url.pathname.includes('/api/landing');
  
  if (!isOwnOrigin && !isAPICall) return;
  
  // Check if this is an AI content request
  const isAIContent = AI_CONTENT_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (isAIContent) {
    // Stale While Revalidate for AI content
    event.respondWith(staleWhileRevalidate(request, AI_CONTENT_CACHE));
    return;
  }
  
  // Check if this is a static asset
  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname.endsWith(asset)) ||
    url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|woff2?|webp|gif|ico)$/);
  
  if (isStaticAsset) {
    // Cache First for static assets
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // Default: Network First for HTML
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
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return offline page if available
    return cache.match('/') || new Response('Offline', { status: 503 });
  }
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
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for HTML requests
    if (request.headers.get('accept')?.includes('text/html')) {
      return cache.match('/') || new Response('Offline', { status: 503 });
    }
    
    return new Response('Offline', { status: 503 });
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
      }
      return networkResponse;
    })
    .catch(() => null);
  
  // Return cached immediately if available
  if (cachedResponse) {
    // Still update in background
    fetchPromise;
    return cachedResponse;
  }
  
  // Otherwise wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  // Last resort - return empty JSON
  return new Response('{}', { 
    status: 200, 
    headers: { 'Content-Type': 'application/json' } 
  });
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
        if (event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      });
  }
  
  if (event.data.type === 'GET_CACHE_STATS') {
    Promise.all([
      getCacheSize(STATIC_CACHE),
      getCacheSize(AI_CONTENT_CACHE),
    ]).then(([staticSize, aiSize]) => {
      if (event.ports[0]) {
        event.ports[0].postMessage({
          static: staticSize,
          aiContent: aiSize,
          total: staticSize + aiSize,
          version: CACHE_VERSION,
        });
      }
    });
  }
});

async function getCacheSize(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return 0;
  }
}

console.log('[SW] Service worker v2 loaded');
