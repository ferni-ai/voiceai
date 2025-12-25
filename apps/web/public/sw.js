/**
 * Service Worker for Ferni PWA
 *
 * Features:
 * - Offline caching for static assets
 * - Push notifications
 * - Background sync
 * - Periodic sync for ritual reminders
 *
 * Cache Strategy:
 * - Static assets: Cache-first (fonts, icons, CSS)
 * - API calls: Network-first with cache fallback
 * - HTML: Network-first
 */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `ferni-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `ferni-dynamic-${CACHE_VERSION}`;
const API_CACHE = `ferni-api-${CACHE_VERSION}`;

// Assets to pre-cache during install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/design-system/tokens.css',
  '/design-system/components.css',
  '/design-system/app-components.css',
  '/voice-engine.js',
  '/icons/favicon-32x32.png',
  '/icons/android-chrome-192x192.png',
  '/manifest.json',
];

// API routes to cache responses for offline access
const CACHEABLE_API_ROUTES = [
  '/api/agents',
  '/api/user/profile',
  '/api/engagement/progress',
  '/api/relationship/stage',
];

// ============================================================================
// INSTALLATION - Pre-cache static assets
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.warn('[SW] Pre-cache failed (non-critical):', error);
        return self.skipWaiting();
      })
  );
});

// ============================================================================
// ACTIVATION - Clean up old caches
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old version caches
              return name.startsWith('ferni-') && 
                     name !== STATIC_CACHE && 
                     name !== DYNAMIC_CACHE &&
                     name !== API_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================================================
// FETCH - Cache strategies based on request type
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests (except fonts)
  if (!url.origin.includes(self.location.origin) && 
      !url.origin.includes('fonts.googleapis.com') &&
      !url.origin.includes('fonts.gstatic.com')) {
    return;
  }
  
  // Font requests - Cache-first (long-lived)
  if (url.origin.includes('fonts.googleapis.com') || 
      url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // API requests - Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route))) {
      event.respondWith(networkFirstWithCache(request, API_CACHE));
    }
    return;
  }
  
  // Static assets (CSS, JS, images) - Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // HTML pages - Network-first
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE));
    return;
  }
  
  // Everything else - Network with dynamic cache
  event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE));
});

// ============================================================================
// CACHE STRATEGIES
// ============================================================================

/**
 * Cache-first: Try cache, fall back to network
 * Good for: static assets, fonts, icons
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    // Only cache complete responses (status 200)
    // Partial responses (206) cannot be cached - browsers reject them
    // This happens with audio/video streams that use Range requests
    if (response.ok && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline fallback if available
    return caches.match('/offline.html') || 
           new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first: Try network, fall back to cache
 * Good for: API data, HTML pages
 */
async function networkFirstWithCache(request, cacheName) {
  try {
    const response = await fetch(request);
    // Only cache complete responses (status 200)
    // Partial responses (206) cannot be cached
    if (response.ok && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    // For API requests, return offline indicator
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ offline: true, error: 'You are offline' }),
        { 
          status: 503, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // For HTML, return offline page
    return caches.match('/offline.html') || 
           new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Check if pathname is a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = [
    '.css', '.js', '.woff', '.woff2', '.ttf', '.otf',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.mp3', '.wav', '.ogg'
  ];
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = {
    title: 'Ferni',
    body: 'You have a new message',
    type: 'general',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    console.warn('[SW] Failed to parse push data:', e);
  }

  // Notification options
  const options = {
    body: data.body,
    icon: getIconForType(data.type),
    badge: '/icons/badge-72.png',
    tag: data.type,
    data: data,
    vibrate: [200, 100, 200],
    requireInteraction: data.type === 'team_huddle',
    actions: getActionsForType(data.type),
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ============================================================================
// NOTIFICATION CLICK
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  // Handle actions
  let url = '/';
  
  if (action === 'open-ritual') {
    url = '/?panel=engagement';
  } else if (action === 'open-predictions') {
    url = '/?panel=predictions';
  } else if (action === 'dismiss') {
    return; // Just close the notification
  } else {
    // Default: open app based on notification type
    switch (data.type) {
      case 'ritual_reminder':
        url = '/?panel=engagement';
        break;
      case 'prediction_result':
        url = '/?panel=predictions';
        break;
      case 'team_huddle':
        url = '/?panel=huddle';
        break;
      case 'streak_milestone':
        url = '/?panel=analytics';
        break;
      default:
        url = '/';
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already an open window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Send message to open the right panel
            client.postMessage({
              type: 'notification-click',
              notification: data,
            });
            return client.focus();
          }
        }
        // No window open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ============================================================================
// NOTIFICATION CLOSE
// ============================================================================

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
  
  // Could track dismissed notifications here
  const data = event.notification.data || {};
  
  // Send analytics event (optional)
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'notification-dismissed',
        notification: data,
      });
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getIconForType(type) {
  const icons = {
    ritual_reminder: '/icons/ritual-192.png',
    streak_milestone: '/icons/streak-192.png',
    prediction_result: '/icons/prediction-192.png',
    team_huddle: '/icons/team-192.png',
    ferni_checkin: '/icons/ferni-192.png',
    engagement: '/icons/engagement-192.png',
    general: '/icons/icon-192.png',
  };
  return icons[type] || icons.general;
}

function getActionsForType(type) {
  switch (type) {
    case 'ritual_reminder':
      return [
        { action: 'open-ritual', title: 'Start Practice' },
        { action: 'dismiss', title: 'Later' },
      ];
    case 'prediction_result':
      return [
        { action: 'open-predictions', title: 'View Result' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'team_huddle':
      return [
        { action: 'open-huddle', title: 'Join Huddle' },
        { action: 'dismiss', title: 'Skip' },
      ];
    default:
      return [];
  }
}

// ============================================================================
// BACKGROUND SYNC (for scheduled notifications)
// ============================================================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'check-scheduled-notifications') {
    event.waitUntil(checkScheduledNotifications());
  }
});

async function checkScheduledNotifications() {
  // This would check with the server for any pending scheduled notifications
  // that should be shown now
  try {
    const response = await fetch('/api/notifications/pending');
    const notifications = await response.json();
    
    for (const notification of notifications) {
      await self.registration.showNotification(notification.title, {
        body: notification.body,
        icon: getIconForType(notification.type),
        badge: '/icons/badge-72.png',
        tag: notification.id,
        data: notification,
      });
    }
  } catch (error) {
    console.warn('[SW] Failed to check scheduled notifications:', error);
  }
}

// ============================================================================
// PERIODIC BACKGROUND SYNC (for ritual reminders)
// ============================================================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'ritual-reminder-check') {
    event.waitUntil(checkRitualReminders());
  }
});

async function checkRitualReminders() {
  try {
    const response = await fetch('/api/rituals/due');
    const rituals = await response.json();
    
    if (rituals.length > 0) {
      await self.registration.showNotification('Daily Practice Time', {
        body: `${rituals.length} ritual${rituals.length > 1 ? 's' : ''} ready for you`,
        icon: '/icons/ritual-192.png',
        badge: '/icons/badge-72.png',
        tag: 'ritual-reminder',
        data: { type: 'ritual_reminder', rituals },
        actions: [
          { action: 'open-ritual', title: 'Start Now' },
          { action: 'dismiss', title: 'Later' },
        ],
      });
    }
  } catch (error) {
    console.warn('[SW] Failed to check ritual reminders:', error);
  }
}

