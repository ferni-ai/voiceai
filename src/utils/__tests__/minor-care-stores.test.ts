/**
 * MINOR_CARE=on: the session-end stores that sit behind a userId but don't
 * look like memory writers, for a caller who said they're under 18 and isn't a
 * verified owner: persona affinity (session-lifecycle-hooks.ts), the unified
 * trust flush (session-manager.ts endSession) and persona memories, which save
 * before their cache is cleared (session-data-manager.ts). Each still writes
 * for a verified owner and with the flag off; presence is cleared in every case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  delete: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
}));
vi.mock('../../memory/redis-cache.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRedisCache: () => redis,
}));
const affinity = vi.hoisted(() => ({
  updateAfterSession: vi.fn(async () => undefined),
  recordInteraction: vi.fn(async () => undefined),
}));
vi.mock('../../services/superhuman/persona-affinity.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  personaAffinity: affinity,
}));
const trustFlush = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../services/trust-systems/unified-persistence.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  onSessionEndUnified: trustFlush,
}));
const profiles = vi.hoisted(() => ({
  getProfile: vi.fn(async (userId: string): Promise<unknown> => ({ userId, name: 'Sam' })),
  getProfileStrict: vi.fn(async (userId: string): Promise<unknown> => ({ userId, name: 'Sam' })),
  saveProfile: vi.fn(async () => undefined),
  saveSummary: vi.fn(async () => undefined),
}));
vi.mock('../../memory/profile-store.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getProfileStore: async () => profiles,
}));
vi.mock('../../services/global-services.js', () => ({
  getGlobalServices: async () => ({ store: profiles }),
}));
vi.mock('../../services/data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));

import { onSessionEnd } from '../../services/session/session-lifecycle-hooks.js';
import { createSessionServices } from '../../services/session/session-manager.js';
import { getSessionDataManager } from '../../services/session-data-manager.js';
import {
  registerWithSessionDataManager,
  remember,
  touchMemory,
} from '../../services/memory/persona-memories.js';
import { memoryHeld, noteCallerWords, resetMinorCare, setVerifiedOwnerCheck } from '../minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

/** A session in the given state: held (flag on, said 16), a verified owner who said 16, or flag off. */
function sessionFor(c: Case): string {
  const sessionId = `stores-${c}-${++n}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  noteCallerWords(sessionId, "I'm 16 years old and kind of bored");
  return sessionId;
}

beforeEach(() => {
  for (const fn of [...Object.values(redis), ...Object.values(affinity), trustFlush]) fn.mockClear();
  profiles.saveProfile.mockClear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

const SESSION = {
  personaId: 'ferni',
  duration: 12,
  topics: ['school'],
  sentiment: 'neutral' as const,
  userEngagement: 'medium' as const,
};

describe.each<[Case, boolean]>([
  ['held', false],
  ['owner', true],
  ['off', true],
])('%s: stores = %s', (c, stores) => {
  it('onSessionEnd: persona affinity and interaction (topics, sentiment)', async () => {
    const sessionId = sessionFor(c);
    await onSessionEnd('u1', sessionId, SESSION);
    expect(affinity.updateAfterSession).toHaveBeenCalledTimes(stores ? 1 : 0);
    expect(affinity.recordInteraction).toHaveBeenCalledTimes(stores ? 1 : 0);
    expect(redis.delete).toHaveBeenCalledWith('presence:u1'); // presence clears in every case
  });

  it('endSession: unified trust flush', async () => {
    const sessionId = sessionFor(c);
    const services = await createSessionServices(sessionId, `user-${sessionId}`);
    await services.endSession();
    expect(trustFlush).toHaveBeenCalledTimes(stores ? 1 : 0);
  });

  it('session data manager: persona memories saved before their cache is dropped', async () => {
    const sessionId = sessionFor(c);
    const userId = `user-${sessionId}`;
    await registerWithSessionDataManager();
    const memory = await remember(userId, 'jack-b', { type: 'preference', name: 'jazz' } as never);
    await touchMemory(memory.id); // dirty again: the session end would save it
    profiles.saveProfile.mockClear();
    // cleanup-handler passes { save: !memoryHeld(sessionId) }
    await getSessionDataManager().sessionEnded(userId, { save: !memoryHeld(sessionId) });
    expect(profiles.saveProfile).toHaveBeenCalledTimes(stores ? 1 : 0);
  });
});
