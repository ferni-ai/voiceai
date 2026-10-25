/**
 * A call where the caller never spoke (prod AJ_HQ5ShVbCN3CY, 2026-10-18: greeting,
 * then the caller left 6 s later) must not be counted as a conversation when
 * SILENT_CALL_SKIP_PROFILE=on. Drives the real endSession; only the global store,
 * its profile cache and the LLM summary are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserProfile, type UserProfile } from '../../../types/user-profile.js';

const store = vi.hoisted(() => ({
  getProfileForWrite: vi.fn(async (_userId: string): Promise<unknown> => null),
  saveProfile: vi.fn(async (_p: unknown) => undefined),
  saveSummary: vi.fn(async () => undefined),
}));

vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  summarizeWithLLM: async (sessionId: string) => ({
    id: `sum-${sessionId}`,
    sessionId,
    timestamp: new Date(),
    duration: 10,
    turnCount: 1,
    mainTopics: [],
    keyPoints: [],
    emotionalArc: '',
  }),
}));

import { getHistoryTracker } from '../../../memory/index.js';
import { createSessionServices } from '../session-manager.js';
import { shouldSkipProfileForSilentCall, silentCallSkipProfileEnabled } from '../silent-call.js';

const USER = 'user-silent-call';

async function endCall(callerSpeaks: boolean): Promise<void> {
  const sessionId = `silent-call-${callerSpeaks}-${Date.now()}`;
  const services = await createSessionServices(sessionId, USER);
  const tracker = getHistoryTracker(sessionId, USER);
  tracker.addAssistantTurn("Hey, what's going on this evening?");
  if (callerSpeaks) tracker.addUserTurn('Not much, just got home from work.');
  await services.endSession();
}

function savedConversationCounts(): number[] {
  return store.saveProfile.mock.calls.map((c) => (c[0] as UserProfile).totalConversations);
}

beforeEach(() => {
  store.saveProfile.mockClear();
  store.getProfileForWrite.mockImplementation(async (uid: string) => createUserProfile(uid, 'Sam'));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('silent-call flag', () => {
  it('is off unless SILENT_CALL_SKIP_PROFILE is exactly on', () => {
    expect(silentCallSkipProfileEnabled({})).toBe(false);
    expect(silentCallSkipProfileEnabled({ SILENT_CALL_SKIP_PROFILE: 'off' })).toBe(false);
    expect(silentCallSkipProfileEnabled({ SILENT_CALL_SKIP_PROFILE: 'on' })).toBe(true);
  });

  it('skips only when no turn came from the caller', () => {
    const on = { SILENT_CALL_SKIP_PROFILE: 'on' };
    expect(shouldSkipProfileForSilentCall([{ role: 'assistant' }], on)).toBe(true);
    expect(shouldSkipProfileForSilentCall([], on)).toBe(true);
    expect(shouldSkipProfileForSilentCall([{ role: 'assistant' }, { role: 'user' }], on)).toBe(
      false
    );
    expect(shouldSkipProfileForSilentCall([{ role: 'assistant' }], {})).toBe(false);
  });
});

describe('endSession on a call where the caller never spoke', () => {
  it('flag off: still counts it as a conversation (unchanged behaviour)', async () => {
    await endCall(false);
    expect(savedConversationCounts()).toEqual([1]);
  });

  it('flag on: does not save the profile, so the count stays at 0', async () => {
    vi.stubEnv('SILENT_CALL_SKIP_PROFILE', 'on');
    await endCall(false);
    expect(store.saveProfile).not.toHaveBeenCalled();
  });

  it('flag on: a call where the caller spoke is still counted', async () => {
    vi.stubEnv('SILENT_CALL_SKIP_PROFILE', 'on');
    await endCall(true);
    expect(savedConversationCounts()).toEqual([1]);
  });
});
