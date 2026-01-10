import { describe, it, expect, vi } from 'vitest';

// Mock platform utilities to ensure web-mode testing
vi.mock('../../src/utils/platform.js', () => ({
  platform: 'web',
  isNative: () => false,
  isIOS: () => false,
  isAndroid: () => false,
  isWeb: () => true,
}));

// Mock Notification with explicit implementation
const mockRequestPermission = vi.fn(() => Promise.resolve('granted'));
vi.stubGlobal('Notification', {
  permission: 'default',
  requestPermission: mockRequestPermission,
});

// Mock navigator
vi.stubGlobal('navigator', {
  serviceWorker: {
    ready: Promise.resolve({
      pushManager: {
        subscribe: vi.fn(),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    }),
    register: vi.fn().mockResolvedValue({}),
    addEventListener: vi.fn(),
  },
});

// Mock localStorage
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
});

// Mock window
Object.defineProperty(global, 'PushManager', { value: {}, writable: true });
Object.defineProperty(global, 'window', {
  value: { ...global.window, Notification: { permission: 'default', requestPermission: mockRequestPermission }, PushManager: {} },
  writable: true,
});

// Mock fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

import { requestNotificationPermission, getPushNotificationsService } from '../../src/services/push-notifications.service.js';
import { isNative } from '../../src/utils/platform.js';

describe('Debug', () => {
  it('check isNative', () => {
    console.log('isNative():', isNative());
    expect(isNative()).toBe(false);
  });

  it('check Notification mock with explicit implementation', async () => {
    console.log('Notification.requestPermission:', Notification.requestPermission);
    const result = await Notification.requestPermission();
    console.log('Direct call result:', result);
    expect(result).toBe('granted');
  });

  it('check service requestPermission', async () => {
    const service = getPushNotificationsService();
    const result = await service.requestPermission();
    console.log('Service result:', result);
    expect(result).toBe('granted');
  });
  
  it('check exported function', async () => {
    const result = await requestNotificationPermission();
    console.log('Exported function result:', result);
    expect(result).toBe('granted');
  });
});
