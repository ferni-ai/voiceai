/**
 * Check-in Service Tests
 *
 * Tests the live proactive-outreach polling logic that replaced the old
 * checkin-badge UI module (which is now a deprecated compat shim). The badge's
 * visual concerns moved to unified-indicator.ui.ts; everything covered here is
 * the service's own behaviour:
 * - Polling schedule (initial delay + periodic interval) and idempotent init
 * - Auth gating
 * - Dismissal cooldown
 * - Event dispatch contract
 * - Disposal and re-initialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS - must be declared before the dynamic import of the service
// ============================================================================

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

const mockGetAuthState = vi.fn();
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: () => mockGetAuthState(),
}));

// ============================================================================
// HELPERS
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 3000;
const DISMISS_DURATION_MS = 60 * 60 * 1000;
const STORAGE_KEY = 'ferni_checkin_dismissed';
const ENDPOINT = '/api/outreach/pending-checkin';

const sampleCheckin = {
  id: 'checkin-1',
  type: 'thinking_of_you' as const,
  message: 'Ferni wants to check in',
  personaId: 'ferni',
  timestamp: '2026-09-20T12:00:00.000Z',
};

/** Response shaped like a real apiGet success carrying a pending check-in. */
const withCheckin = () => ({ ok: true, data: { hasCheckin: true, checkin: sampleCheckin } });
/** Response shaped like a real apiGet success with nothing pending. */
const withoutCheckin = () => ({ ok: true, data: { hasCheckin: false } });

type CheckinModule = typeof import('../../src/services/checkin.service.js');

async function loadService(): Promise<CheckinModule> {
  vi.resetModules();
  return import('../../src/services/checkin.service.js');
}

describe('CheckinService', () => {
  let service: CheckinModule;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    mockApiGet.mockReset();
    mockGetAuthState.mockReset();
    // Default: signed in, nothing pending
    mockGetAuthState.mockReturnValue({ isAuthenticated: true });
    mockApiGet.mockResolvedValue(withoutCheckin());
    service = await loadService();
  });

  afterEach(() => {
    service.disposeCheckinService();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ==========================================================================
  // MODULE EXPORTS
  // ==========================================================================

  describe('Module exports', () => {
    it('should export the service functions', () => {
      expect(typeof service.initCheckinService).toBe('function');
      expect(typeof service.disposeCheckinService).toBe('function');
      expect(typeof service.dismissCheckin).toBe('function');
      expect(typeof service.getCurrentCheckin).toBe('function');
      expect(typeof service.hasCheckin).toBe('function');
      expect(typeof service.forceCheck).toBe('function');
    });

    it('should export a checkinService facade wired to those functions', () => {
      expect(service.checkinService.init).toBe(service.initCheckinService);
      expect(service.checkinService.dispose).toBe(service.disposeCheckinService);
      expect(service.checkinService.dismiss).toBe(service.dismissCheckin);
      expect(service.checkinService.forceCheck).toBe(service.forceCheck);
      expect(service.default).toBe(service.checkinService);
    });
  });

  // ==========================================================================
  // POLLING SCHEDULE
  // ==========================================================================

  describe('Polling schedule', () => {
    it('should not call the API before the initial delay elapses', async () => {
      service.initCheckinService();

      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS - 1);

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('should check once the initial delay elapses', async () => {
      service.initCheckinService();

      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

      expect(mockApiGet).toHaveBeenCalledTimes(1);
      expect(mockApiGet).toHaveBeenCalledWith(ENDPOINT);
    });

    it('should keep checking on the periodic interval', async () => {
      service.initCheckinService();

      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
      expect(mockApiGet).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(mockApiGet).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(mockApiGet).toHaveBeenCalledTimes(3);
    });

    it('should be idempotent - a second init must not double the polling', async () => {
      service.initCheckinService();
      service.initCheckinService();

      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // AUTH GATING
  // ==========================================================================

  describe('Auth gating', () => {
    it('should not hit the API when the user is not authenticated', async () => {
      mockGetAuthState.mockReturnValue({ isAuthenticated: false });

      await service.forceCheck();

      expect(mockApiGet).not.toHaveBeenCalled();
      expect(service.hasCheckin()).toBe(false);
    });

    it('should hit the API when the user is authenticated', async () => {
      await service.forceCheck();

      expect(mockApiGet).toHaveBeenCalledWith(ENDPOINT);
    });
  });

  // ==========================================================================
  // CHECK-IN AVAILABILITY + EVENT CONTRACT
  // ==========================================================================

  describe('Check-in availability', () => {
    it('should dispatch ferni:checkin-available with the check-in detail', async () => {
      mockApiGet.mockResolvedValue(withCheckin());
      const listener = vi.fn();
      window.addEventListener('ferni:checkin-available', listener);

      await service.forceCheck();

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({
        id: sampleCheckin.id,
        message: sampleCheckin.message,
        type: sampleCheckin.type,
        personaId: sampleCheckin.personaId,
      });

      window.removeEventListener('ferni:checkin-available', listener);
    });

    it('should expose the pending check-in through the public API', async () => {
      mockApiGet.mockResolvedValue(withCheckin());

      expect(service.hasCheckin()).toBe(false);
      await service.forceCheck();

      expect(service.hasCheckin()).toBe(true);
      expect(service.getCurrentCheckin()).toEqual(sampleCheckin);
    });

    it('should stay empty and dispatch nothing when nothing is pending', async () => {
      const listener = vi.fn();
      window.addEventListener('ferni:checkin-available', listener);

      await service.forceCheck();

      expect(listener).not.toHaveBeenCalled();
      expect(service.hasCheckin()).toBe(false);
      expect(service.getCurrentCheckin()).toBeNull();

      window.removeEventListener('ferni:checkin-available', listener);
    });

    it('should swallow API errors without dispatching or throwing', async () => {
      mockApiGet.mockRejectedValue(new Error('network down'));
      const listener = vi.fn();
      window.addEventListener('ferni:checkin-available', listener);

      await expect(service.forceCheck()).resolves.toBeUndefined();

      expect(listener).not.toHaveBeenCalled();
      expect(service.hasCheckin()).toBe(false);

      window.removeEventListener('ferni:checkin-available', listener);
    });
  });

  // ==========================================================================
  // DISMISSAL + COOLDOWN
  // ==========================================================================

  describe('Dismissal', () => {
    it('should record the dismissal time, clear state and dispatch the event', async () => {
      mockApiGet.mockResolvedValue(withCheckin());
      await service.forceCheck();
      expect(service.hasCheckin()).toBe(true);

      const listener = vi.fn();
      window.addEventListener('ferni:checkin-dismissed', listener);

      service.dismissCheckin();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(service.hasCheckin()).toBe(false);
      expect(service.getCurrentCheckin()).toBeNull();
      expect(Number(localStorage.getItem(STORAGE_KEY))).toBe(Date.now());

      window.removeEventListener('ferni:checkin-dismissed', listener);
    });

    it('should not poll during the one-hour cooldown after dismissal', async () => {
      service.dismissCheckin();
      mockApiGet.mockClear();

      await vi.advanceTimersByTimeAsync(DISMISS_DURATION_MS - 1000);
      await service.forceCheck();

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('should poll again once the cooldown expires', async () => {
      service.dismissCheckin();
      mockApiGet.mockClear();

      await vi.advanceTimersByTimeAsync(DISMISS_DURATION_MS + 1000);
      await service.forceCheck();

      expect(mockApiGet).toHaveBeenCalledWith(ENDPOINT);
    });
  });

  // ==========================================================================
  // DISPOSAL
  // ==========================================================================

  describe('Disposal', () => {
    it('should stop polling after dispose', async () => {
      service.initCheckinService();
      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);
      expect(mockApiGet).toHaveBeenCalledTimes(1);

      service.disposeCheckinService();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);

      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    it('should cancel a pending initial check that has not fired yet', async () => {
      service.initCheckinService();
      service.disposeCheckinService();

      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS * 2);

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('should clear the current check-in on dispose', async () => {
      mockApiGet.mockResolvedValue(withCheckin());
      await service.forceCheck();
      expect(service.hasCheckin()).toBe(true);

      service.disposeCheckinService();

      expect(service.hasCheckin()).toBe(false);
      expect(service.getCurrentCheckin()).toBeNull();
    });

    it('should allow re-initialization after dispose', async () => {
      service.initCheckinService();
      service.disposeCheckinService();

      service.initCheckinService();
      await vi.advanceTimersByTimeAsync(INITIAL_DELAY_MS);

      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });
  });
});
