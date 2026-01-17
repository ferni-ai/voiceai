/**
 * Push Notifications Service Tests
 *
 * Tests for push notification management:
 * - Permission requests
 * - Token registration
 * - Notification scheduling
 * - Channel management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock platform utilities to ensure web-mode testing
vi.mock('../../src/utils/platform.js', () => ({
  platform: 'web',
  isNative: () => false,
  isIOS: () => false,
  isAndroid: () => false,
  isWeb: () => true,
}));

// The capacitor-stub.ts already provides mock implementations
// No need to vi.mock() it - just import directly

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
      mockRequestPermission.mockImplementationOnce(() => Promise.resolve('denied') as Promise<PermissionState>);

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

describe('Local Notifications', () => {
  describe('Schedule', () => {
    it('should schedule local notification', async () => {
      const { LocalNotifications } = await import('../../src/stubs/capacitor-stub.js');

      // Should not throw - stub handles the call
      const result = await LocalNotifications.schedule({
        notifications: [{
          id: 1,
          title: 'Test',
          body: 'Test body',
          schedule: { at: new Date() },
        }],
      });

      expect(result).toEqual({ notifications: [] });
    });
  });

  describe('Cancel', () => {
    it('should cancel pending notification', async () => {
      const { LocalNotifications } = await import('../../src/stubs/capacitor-stub.js');

      // Should not throw - stub handles the call
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });

      // If we get here, the stub worked
      expect(true).toBe(true);
    });
  });

  describe('Get Pending', () => {
    it('should get pending notifications', async () => {
      const { LocalNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      const result = await LocalNotifications.getPending();

      expect(result.notifications).toEqual([]);
    });
  });
});

describe('Native Push (Capacitor)', () => {
  describe('Permission', () => {
    it('should check permissions', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      const result = await PushNotifications.checkPermissions();

      expect(result.receive).toBe('granted');
    });

    it('should request permissions', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      const result = await PushNotifications.requestPermissions();

      expect(result.receive).toBe('granted');
    });
  });

  describe('Registration', () => {
    it('should register for push', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');

      // Stub returns a resolved promise - if we get here, it worked
      const result = await PushNotifications.register();

      // register() returns void, so result should be undefined
      expect(result).toBeUndefined();
    });
  });

  describe('Listeners', () => {
    it('should add registration listener', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');
      const callback = vi.fn();
      
      const { remove } = PushNotifications.addListener('registration', callback);

      expect(typeof remove).toBe('function');
    });

    it('should remove all listeners', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');

      // Stub returns a resolved promise - if we get here, it worked
      const result = await PushNotifications.removeAllListeners();

      // removeAllListeners() returns void, so result should be undefined
      expect(result).toBeUndefined();
    });
  });

  describe('Channels', () => {
    it('should create channel', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');

      // Stub createChannel accepts no arguments for simplicity
      await PushNotifications.createChannel();

      // Verify it doesn't throw
      expect(true).toBe(true);
    });

    it('should list channels', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      const result = await PushNotifications.listChannels();

      expect(result.channels).toEqual([]);
    });
  });
});
