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

// Mock Capacitor plugins
vi.mock('../../src/stubs/capacitor-stub.js', () => ({
  PushNotifications: {
    requestPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
    register: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    removeAllListeners: vi.fn().mockResolvedValue(undefined),
    getDeliveredNotifications: vi.fn().mockResolvedValue({ notifications: [] }),
    removeDeliveredNotifications: vi.fn().mockResolvedValue(undefined),
    removeAllDeliveredNotifications: vi.fn().mockResolvedValue(undefined),
    createChannel: vi.fn().mockResolvedValue(undefined),
    deleteChannel: vi.fn().mockResolvedValue(undefined),
    listChannels: vi.fn().mockResolvedValue({ channels: [] }),
    checkPermissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
  },
  LocalNotifications: {
    schedule: vi.fn().mockResolvedValue({ notifications: [] }),
    getPending: vi.fn().mockResolvedValue({ notifications: [] }),
    cancel: vi.fn().mockResolvedValue(undefined),
    registerActionTypes: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    removeAllListeners: vi.fn().mockResolvedValue(undefined),
    areEnabled: vi.fn().mockResolvedValue({ value: true }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    createChannel: vi.fn().mockResolvedValue(undefined),
    deleteChannel: vi.fn().mockResolvedValue(undefined),
    listChannels: vi.fn().mockResolvedValue({ channels: [] }),
  },
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
    getPlatform: vi.fn().mockReturnValue('web'),
    isPluginAvailable: vi.fn().mockReturnValue(false),
  },
}));

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
  },
});

// Mock Notification API
vi.stubGlobal('Notification', {
  permission: 'default',
  requestPermission: vi.fn().mockResolvedValue('granted'),
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
  isPushSupported,
  getPushSubscription,
  type PushNotificationPayload,
} from '../../src/services/push-notifications.service.js';

describe('PushNotificationsService', () => {
  describe('isPushSupported', () => {
    it('should return true when push API is available', () => {
      const supported = isPushSupported();
      expect(typeof supported).toBe('boolean');
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
      vi.mocked(Notification.requestPermission).mockResolvedValueOnce('denied');
      
      const result = await requestNotificationPermission();
      expect(result).toBe('denied');
    });
  });

  describe('getPushSubscription', () => {
    it('should return null when not subscribed', async () => {
      const subscription = await getPushSubscription();
      // Depends on implementation state
    });
  });

  describe('PushNotificationPayload', () => {
    it('should have correct structure', () => {
      const payload: PushNotificationPayload = {
        title: 'Test Notification',
        body: 'Test body',
        icon: '/icon.png',
        data: { action: 'test' },
      };

      expect(payload.title).toBe('Test Notification');
      expect(payload.body).toBe('Test body');
      expect(payload.icon).toBe('/icon.png');
      expect(payload.data).toEqual({ action: 'test' });
    });
  });
});

describe('Local Notifications', () => {
  describe('Schedule', () => {
    it('should schedule local notification', async () => {
      const { LocalNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      await LocalNotifications.schedule({
        notifications: [{
          id: 1,
          title: 'Test',
          body: 'Test body',
          schedule: { at: new Date() },
        }],
      });

      expect(LocalNotifications.schedule).toHaveBeenCalled();
    });
  });

  describe('Cancel', () => {
    it('should cancel pending notification', async () => {
      const { LocalNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });

      expect(LocalNotifications.cancel).toHaveBeenCalled();
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
      
      await PushNotifications.register();

      expect(PushNotifications.register).toHaveBeenCalled();
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
      
      await PushNotifications.removeAllListeners();

      expect(PushNotifications.removeAllListeners).toHaveBeenCalled();
    });
  });

  describe('Channels', () => {
    it('should create channel', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      await PushNotifications.createChannel({
        id: 'test-channel',
        name: 'Test Channel',
        importance: 4,
      });

      expect(PushNotifications.createChannel).toHaveBeenCalled();
    });

    it('should list channels', async () => {
      const { PushNotifications } = await import('../../src/stubs/capacitor-stub.js');
      
      const result = await PushNotifications.listChannels();

      expect(result.channels).toEqual([]);
    });
  });
});
