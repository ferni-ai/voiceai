/**
 * A clicked push notification opens the panel its data points at, whether the
 * app was already open (service worker message) or the click opened a window
 * at /?panel=<name>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

const { openPanelForNotificationType, openPanelFromUrl } = await import(
  '../src/services/notification-navigation.js'
);
const { initPushNotifications } = await import('../src/services/push-notifications.service.js');

const opened: string[] = [];
const EVENTS = ['ferni:open-engagement', 'ferni:open-predictions', 'ferni:open-team-huddle', 'ferni:open-analytics'];
const record = (e: Event) => opened.push(e.type);

beforeEach(() => {
  opened.length = 0;
  EVENTS.forEach((name) => window.addEventListener(name, record));
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  EVENTS.forEach((name) => window.removeEventListener(name, record));
});

describe('openPanelForNotificationType', () => {
  it.each([
    ['ritual_reminder', 'ferni:open-engagement'],
    ['prediction_result', 'ferni:open-predictions'],
    ['team_huddle', 'ferni:open-team-huddle'],
    ['streak_milestone', 'ferni:open-analytics'],
  ])('%s opens %s', (type, event) => {
    expect(openPanelForNotificationType(type)).toBe(true);
    expect(opened).toEqual([event]);
  });

  it.each(['general', 'ferni_checkin', undefined, 'constructor'])('%s opens nothing', (type) => {
    expect(openPanelForNotificationType(type)).toBe(false);
    expect(opened).toEqual([]);
  });
});

describe('openPanelFromUrl', () => {
  it('opens the named panel and drops the parameter, keeping the rest of the URL', () => {
    window.history.replaceState({}, '', '/?panel=predictions&ref=push#top');

    expect(openPanelFromUrl()).toBe(true);

    expect(opened).toEqual(['ferni:open-predictions']);
    expect(window.location.search).toBe('?ref=push');
    expect(window.location.hash).toBe('#top');
  });

  it('does nothing when there is no panel parameter', () => {
    expect(openPanelFromUrl()).toBe(false);
    expect(opened).toEqual([]);
  });

  it('drops an unknown panel without opening anything', () => {
    window.history.replaceState({}, '', '/?panel=toString');

    expect(openPanelFromUrl()).toBe(false);

    expect(opened).toEqual([]);
    expect(window.location.search).toBe('');
  });
});

describe('a notification click message from the service worker', () => {
  it('opens the panel for its type', async () => {
    const listeners: Array<(e: MessageEvent) => void> = [];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue({}),
        addEventListener: (_: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
      },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {} });

    await initPushNotifications();
    expect(listeners).toHaveLength(1);

    listeners[0]!({
      data: { type: 'notification-click', notification: { type: 'streak_milestone', title: 't' } },
    } as MessageEvent);

    expect(opened).toEqual(['ferni:open-analytics']);
  });
});
