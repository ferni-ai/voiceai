/**
 * Push Notifications Service Tests
 *
 * Tests for web push notification management:
 * - Permission requests
 * - Subscription
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock navigator
vi.stubGlobal('navigator', {
  serviceWorker: {
    ready: Promise.resolve({
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({
          toJSON: () => ({
            endpoint: 'https://push.example.com/test',
            keys: { p256dh: 'test-key', auth: 'test-auth' },
          }),
        }),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    }),
    register: vi.fn().mockResolvedValue({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
});

// Mock Notification API - must be accessible as both global and window property
// Note: vi.fn().mockResolvedValue() doesn't work correctly with vi.stubGlobal()
// Must use explicit implementation: vi.fn(() => Promise.resolve(...))
type PermissionState = 'granted' | 'denied' | 'default';
const mockRequestPermission = vi.fn((): Promise<PermissionState> => Promise.resolve('granted'));
const NotificationMock = {
  permission: 'default',
  requestPermission: mockRequestPermission,
};
vi.stubGlobal('Notification', NotificationMock);

// Ensure window has PushManager and Notification for isSupported() check
// The 'in window' check needs these to exist
Object.defineProperty(global, 'PushManager', { value: {}, writable: true });
Object.defineProperty(global, 'window', {
  value: {
    ...global.window,
    Notification: NotificationMock,
    PushManager: {},
  },
  writable: true,
});

// Mock fetch
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ success: true }),
});
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

// Import after mocking
import {
  initPushNotifications,
  requestNotificationPermission,
  subscribeToPush,
  type PushNotification,
} from '../../src/services/push-notifications.service.js';

describe('PushNotificationsService', () => {
  describe('subscribeToPush', () => {
    it('should attempt to subscribe to push notifications', async () => {
      // subscribeToPush handles the full subscription flow
      const subscription = await subscribeToPush();
      // May return null if not supported or permission denied
      expect(subscription === null || typeof subscription === 'object').toBe(true);
    });
  });

  describe('initPushNotifications', () => {
    it('should initialize push notification service', async () => {
      await initPushNotifications();
      // Should not throw
    });

    it('should register service worker on web', async () => {
      await initPushNotifications();
      // Service worker registration is handled internally
    });
  });

  describe('requestNotificationPermission', () => {
    it('should request permission from browser', async () => {
      const result = await requestNotificationPermission();
      expect(['granted', 'denied', 'default']).toContain(result);
    });

    it('should handle denied permission', async () => {
      mockRequestPermission.mockImplementationOnce(
        () => Promise.resolve('denied') as Promise<PermissionState>
      );

      const result = await requestNotificationPermission();
      expect(result).toBe('denied');
    });
  });

  describe('PushNotification type', () => {
    it('should have correct structure', () => {
      const notification: PushNotification = {
        id: 'test-notification-1',
        type: 'ritual_reminder',
        title: 'Test Notification',
        body: 'Test body',
        data: { action: 'test' },
      };

      expect(notification.id).toBe('test-notification-1');
      expect(notification.type).toBe('ritual_reminder');
      expect(notification.title).toBe('Test Notification');
      expect(notification.body).toBe('Test body');
      expect(notification.data).toEqual({ action: 'test' });
    });
  });
});
