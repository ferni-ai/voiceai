/**
 * A caller held on another call (userHeld) has nothing from this call written during it: the real
 * addTurn saves no turn, the 30 s profile autosave saves nothing and services.saveProfile (what
 * the every-3-turns save, the name tools and endSession call) saves nothing, the same as for a
 * call held itself (memoryHeld). A hold that starts mid-call stops the next turn and both saves.
 * An unheld call still does all three. The store, the profile cache and realtime memory are faked;
 * the hold is MINOR_CARE's (a caller who said they're 16). Fixtures are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write: async () => ({ success: true, memoryId: 'm1' }) }),
}));
const store = vi.hoisted(() => ({
  getProfileForWrite: vi.fn(async (userId: string): Promise<unknown> => defaultProfile(userId)),
  saveProfile: vi.fn(async (profile: { id?: string }) => void profile),
  saveSummary: vi.fn(async () => undefined),
}));
vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));
/** Realtime memory: persistTurn writes each turn's text to the call's conversation. */
const realtime = vi.hoisted(() => ({
  startConversation: vi.fn(async (userId: string) => `conv-${userId}`),
  persistTurn: vi.fn(async () => undefined),
  endConversation: vi.fn(async () => undefined),
  summarizeConversationAsync: vi.fn(async () => undefined),
}));
vi.mock('../../memory/realtime-memory.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...realtime,
}));
/** The 30 s autosave timer: its callback is kept so a row can fire one tick. */
const autosave = vi.hoisted(() => ({
  start: vi.fn<(uid: string, tick: (uid: string) => Promise<void>) => void>(),
}));
vi.mock('../../intelligence-persistence.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startAutoSave: autosave.start,
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ add: async () => ({ id: 'x' }) }) }) }),
  }),
}));
vi.mock('../../../memory/embeddings.js', () => ({ embed: async () => [0.1] }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => undefined }),
}));

import {
  bindSessionUser,
  memoryHeld,
  noteCallerWords,
  resetMinorCare,
  userHeld,
} from '../../../utils/minor-care.js';
import { createSessionServices } from '../session-manager.js';

const UNDER_18 = "I'm 16 years old and kind of bored";
let n = 0;

/** A real default profile: the session save updates its lists in place. */
async function defaultProfile(userId: string) {
  const { createUserProfile } = await import('../../../types/user-profile.js');
  return createUserProfile(userId, 'Rob');
}

/** A caller with an earlier call; `said16` holds that earlier call (MINOR_CARE on). */
function caller(said16: boolean): { userId: string; earlier: string; now: string } {
  n++;
  const userId = `user-mid-call-${n}`;
  const earlier = `mid-call-earlier-${n}`;
  bindSessionUser(earlier, userId);
  if (said16) noteCallerWords(earlier, UNDER_18);
  return { userId, earlier, now: `mid-call-now-${n}` };
}

/**
 * Two real turns (`between` runs after the first), one autosave tick, one saveProfile. A save
 * that throws is reported as `threw`, so a row fails on its counts, never only on a throw.
 */
async function midCall(sessionId: string, userId: string, between?: () => void) {
  const services = await createSessionServices(sessionId, userId);
  const tick = autosave.start.mock.calls.find(([uid]) => uid === userId)?.[1];
  if (typeof tick !== 'function') throw new Error('the call started no autosave');
  realtime.persistTurn.mockClear();
  store.saveProfile.mockClear();
  services.addTurn('assistant', 'Hey, how was the weekend?');
  between?.();
  services.addTurn('user', 'Good, I repotted the fern on the porch.');
  await tick(userId);
  const autosaved = store.saveProfile.mock.calls.length;
  const threw = await services.saveProfile().then(
    () => false,
    () => true
  );
  return {
    turns: realtime.persistTurn.mock.calls.length,
    autosaved,
    saved: store.saveProfile.mock.calls.length - autosaved,
    threw,
  };
}

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  autosave.start.mockClear();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('mid-call writers (session-manager.ts addTurn, autosave, saveProfile)', () => {
  it('a caller held on another call: no turn, autosave or profile save', async () => {
    const { userId, now } = caller(true);
    expect(userHeld(userId)).toBe(true);
    expect(memoryHeld(now)).toBe(false);
    expect(await midCall(now, userId)).toEqual({ turns: 0, autosaved: 0, saved: 0, threw: false });
  });

  it('a call held itself: none of them either', async () => {
    const { userId, now } = caller(false);
    noteCallerWords(now, UNDER_18);
    expect(memoryHeld(now)).toBe(true);
    expect(await midCall(now, userId)).toEqual({ turns: 0, autosaved: 0, saved: 0, threw: false });
  });

  it('control: an unheld caller gets both turns, the autosave and the profile save', async () => {
    const { userId, now } = caller(false);
    expect(userHeld(userId) || memoryHeld(now)).toBe(false);
    // The unheld save runs to the store without throwing, on the caller's real profile: so a gate
    // that lets a held caller through is caught by `saved`, not by a throw.
    expect(await midCall(now, userId)).toEqual({ turns: 2, autosaved: 1, saved: 1, threw: false });
    expect(store.saveProfile.mock.calls.at(-1)?.[0]?.id).toBe(userId);
  });

  // Read on every turn, not once: the first turn is saved, the hold stops the rest.
  it('a hold that starts mid-call stops the next turn and both saves', async () => {
    const { userId, earlier, now } = caller(false);
    expect(userHeld(userId)).toBe(false);
    const result = await midCall(now, userId, () => {
      noteCallerWords(earlier, UNDER_18);
      expect(userHeld(userId)).toBe(true);
    });
    expect(result).toEqual({ turns: 1, autosaved: 0, saved: 0, threw: false });
  });
});
