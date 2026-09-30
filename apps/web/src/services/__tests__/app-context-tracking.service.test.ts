/**
 * Tests for App Context Tracking Service
 *
 * Screen views and interactions are batched and sent to the backend in the
 * shape it expects, so the voice agent knows what the user was just doing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const api = vi.hoisted(() => ({
  apiPost: vi.fn(),
  userId: 'test-user-123' as string | null,
}));

vi.mock('../../utils/api.js', () => ({
  apiPost: (...args: unknown[]) => api.apiPost(...args),
  getUserId: () => api.userId,
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

type Tracking = typeof import('../app-context-tracking.service.js');

async function loadTracking(): Promise<Tracking> {
  // Module state (queue, current screen) starts fresh for each test
  vi.resetModules();
  return import('../app-context-tracking.service.js');
}

describe('AppContextTrackingService', () => {
  let tracking: Tracking;

  beforeEach(async () => {
    vi.useFakeTimers();
    api.apiPost.mockReset().mockResolvedValue({ ok: true, status: 200 });
    api.userId = 'test-user-123';
    tracking = await loadTracking();
  });

  afterEach(() => {
    tracking.disposeAppContextTracking();
    vi.useRealTimers();
  });

  describe('screen views', () => {
    it('sends the latest screen with how long the user spent', async () => {
      tracking.trackScreenView('goals');
      vi.advanceTimersByTime(3000);
      tracking.trackScreenView('habits');

      await tracking.flushEvents();

      expect(api.apiPost).toHaveBeenCalledTimes(1);
      expect(api.apiPost).toHaveBeenCalledWith('/api/context/screen-view', {
        userId: 'test-user-123',
        screenName: 'habits',
        durationSeconds: 3,
      });
      expect(tracking.getCurrentScreen()).toBe('habits');
    });

    it('reports at least one second', async () => {
      tracking.trackScreenView('goals');
      await tracking.flushEvents();

      expect(api.apiPost).toHaveBeenCalledWith(
        '/api/context/screen-view',
        expect.objectContaining({ screenName: 'goals', durationSeconds: 1 })
      );
    });

    it('ignores a repeat of the current screen', async () => {
      tracking.trackScreenView('home'); // already the starting screen
      await tracking.flushEvents();

      expect(api.apiPost).not.toHaveBeenCalled();
    });
  });

  describe('interactions', () => {
    it('sends interactions as readable browsing context', async () => {
      tracking.trackInteraction({ element: 'goal-card', action: 'tap', value: 'career' });
      tracking.trackInteraction({ element: 'streak-badge', action: 'expand' });

      await tracking.flushEvents();

      expect(api.apiPost).toHaveBeenCalledWith('/api/context/browsing', {
        userId: 'test-user-123',
        screens: [],
        interactions: ['tap on goal-card: career', 'expand on streak-badge'],
      });
    });

    it('keeps only the last 10 interactions', async () => {
      for (let i = 0; i < 12; i++) {
        tracking.trackInteraction({ element: `card-${i}`, action: 'tap' });
      }

      await tracking.flushEvents();

      const [, body] = api.apiPost.mock.calls[0] as [string, { interactions: string[] }];
      expect(body.interactions).toHaveLength(10);
      expect(body.interactions[0]).toBe('tap on card-2');
    });

    it('withTracking wraps a click handler', async () => {
      tracking.withTracking('settings-button', 'click')(new Event('click'));
      await tracking.flushEvents();

      expect(api.apiPost).toHaveBeenCalledWith(
        '/api/context/browsing',
        expect.objectContaining({ interactions: ['click on settings-button'] })
      );
    });
  });

  describe('browsing summaries', () => {
    it('sends each summary as its own browsing entry', async () => {
      tracking.trackBrowsingSummary('Looked at 3 goals');
      await tracking.flushEvents();

      expect(api.apiPost).toHaveBeenCalledWith('/api/context/browsing', {
        userId: 'test-user-123',
        screens: [],
        interactions: ['Looked at 3 goals'],
      });
    });
  });

  describe('batching', () => {
    it('flushes on its own after 5 seconds', async () => {
      tracking.trackScreenView('calendar');
      expect(api.apiPost).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);

      expect(api.apiPost).toHaveBeenCalledWith(
        '/api/context/screen-view',
        expect.objectContaining({ screenName: 'calendar' })
      );
    });

    it('flushes immediately once 20 events are queued', async () => {
      for (let i = 0; i < 20; i++) {
        tracking.trackInteraction({ element: `item-${i}`, action: 'scroll' });
      }
      await vi.advanceTimersByTimeAsync(0);

      expect(api.apiPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure handling', () => {
    it('skips sending when the user is not signed in', async () => {
      api.userId = null;
      tracking.trackScreenView('goals');

      await tracking.flushEvents();

      expect(api.apiPost).not.toHaveBeenCalled();
    });

    it('drops the batch quietly when the API fails', async () => {
      api.apiPost.mockRejectedValueOnce(new Error('offline'));
      tracking.trackScreenView('journal');

      await expect(tracking.flushEvents()).resolves.toBeUndefined();

      api.apiPost.mockClear();
      await tracking.flushEvents();
      expect(api.apiPost).not.toHaveBeenCalled(); // best-effort, not re-queued
    });
  });

  it('remembers the voice session id', () => {
    tracking.initAppContextTracking('session-1');
    expect(tracking.getCurrentSessionId()).toBe('session-1');

    tracking.setSessionId(null);
    expect(tracking.getCurrentSessionId()).toBeNull();
  });
});
