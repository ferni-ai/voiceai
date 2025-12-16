/**
 * Service Worker for Push Notifications
 *
 * Handles background push notifications for the Ferni app.
 * Works when the app is closed or in the background.
 */

const CACHE_NAME = 'ferni-v1';

// ============================================================================
// INSTALLATION
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  event.waitUntil(self.clients.claim());
});

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

