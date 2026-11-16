/**
 * API calls wait for Firebase Auth's first answer, and per-person work started
 * at load uses the signed-in uid (app audit 2026-11-16, item 6).
 *
 * Before: utils/api.ts raced initAuth() against a setTimeout it never cleared,
 * so "Auth init timed out after 5s" was logged 5 s into every load even when a
 * restored session had answered in milliseconds; and app.ts started team
 * insights and voice events with appState's device id, so a signed-in user's
 * GET /api/team-insights carried ?userId=device_....
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
let uid: string | null = null;
let answerAuth: () => void = () => undefined;
const initAuth = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      answerAuth = () => {
        uid = 'uid-signed-in'; // the persisted session, restored by the SDK
        resolve();
      };
    })
);
const initCrossTeamNotifications = vi.fn();
const initVoiceEvents = vi.fn();

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  initAuth: () => initAuth(),
  getFirebaseUid: () => uid,
  getAuthToken: async () => (uid ? `token-for-${uid}` : null),
}));
vi.mock('../../src/services/cross-team-notifications.service.js', () => ({
  initCrossTeamNotifications: (id: string) => initCrossTeamNotifications(id),
}));
vi.mock('../../src/services/voice-events.service.js', () => ({
  initVoiceEvents: (id: string) => initVoiceEvents(id),
}));

const timedOut = () => warn.mock.calls.filter(([msg]) => String(msg).includes('timed out'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  warn.mockReset();
  initAuth.mockClear();
  initCrossTeamNotifications.mockReset();
  initVoiceEvents.mockReset();
  uid = null;
  localStorage.clear();
  localStorage.setItem('voiceai_deviceId', 'device_1794062223025_test');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('auth-ready API headers', () => {
  it('waits for a restored session and logs no timeout once auth has answered', async () => {
    const { getApiHeadersAsync } = await import('../../src/utils/api.js');
    const pending = getApiHeadersAsync();
    await vi.advanceTimersByTimeAsync(300);
    answerAuth();
    const headers = (await pending) as Record<string, string>;

    expect(headers['Authorization']).toBe('Bearer token-for-uid-signed-in');
    expect(headers['X-User-Id']).toBe('uid-signed-in');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(timedOut()).toHaveLength(0);
  });

  it('still bounds the wait when auth never answers', async () => {
    const { getApiHeadersAsync } = await import('../../src/utils/api.js');
    const pending = getApiHeadersAsync();
    await vi.advanceTimersByTimeAsync(5_000);
    const headers = (await pending) as Record<string, string>;

    expect(headers['Authorization']).toBeUndefined();
    expect(timedOut()).toHaveLength(1);
  });
});

describe('per-person streams at load', () => {
  it('start with the authed uid of a restored session, not the device id', async () => {
    const { startPerPersonStreams } = await import('../../src/app/per-person-streams.js');
    const started = startPerPersonStreams();
    await vi.advanceTimersByTimeAsync(300);
    expect(initCrossTeamNotifications).not.toHaveBeenCalled(); // nothing goes out before auth answers
    answerAuth();

    await expect(started).resolves.toBe('uid-signed-in');
    expect(initCrossTeamNotifications).toHaveBeenCalledWith('uid-signed-in');
    expect(initVoiceEvents).toHaveBeenCalledWith('uid-signed-in');
    const ids = [...initCrossTeamNotifications.mock.calls, ...initVoiceEvents.mock.calls].flat();
    expect(ids.some((id) => String(id).startsWith('device_'))).toBe(false);
  });

  it('do not start for a signed-out visitor', async () => {
    const { startPerPersonStreams } = await import('../../src/app/per-person-streams.js');
    const started = startPerPersonStreams();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(started).resolves.toBeNull();
    expect(initCrossTeamNotifications).not.toHaveBeenCalled();
    expect(initVoiceEvents).not.toHaveBeenCalled();
  });
});
