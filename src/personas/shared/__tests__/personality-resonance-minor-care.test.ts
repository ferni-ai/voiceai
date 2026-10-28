/**
 * MINOR_CARE=on: personality resonance for a caller who said "I'm only 14." The store keeps the
 * topics a caller mentions (and how they react to Ferni's lines) in a per-user cache, saves it to
 * bogle_users/{uid}/personality_resonance/profile after a 5 s debounce, and flushes it at the end
 * of a call. None of that ran a hold check, so a held caller's topics were written during the
 * call, and the cache survived for a later call's flush. Now the record* functions keep nothing
 * for a held caller, and the save itself refuses while the hold is on (a topic recorded before the
 * age statement, saved after it).
 *
 * The real store runs with only Firestore faked; a verified owner and the flag off write as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as { path: string; data: unknown }[]);
vi.mock('@google-cloud/firestore', () => {
  const ref = (path: string): Record<string, unknown> => ({
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ exists: false, data: () => undefined }),
    set: async (data: unknown) => void writes.push({ path, data }),
  });
  return {
    Firestore: class {
      collection(name: string) {
        return { doc: (id: string) => ref(`${name}/${id}`) };
      }
    },
  };
});

import {
  flushResonanceProfile,
  getCachedResonance,
  recordResonanceEvent,
  recordUserTopicMention,
  recordVulnerabilityResponse,
} from '../personality-resonance-store.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
const CASES: Case[] = ['held', 'owner', 'off'];
const TOPIC = 'fight with my best friend';
let n = 0;

/** A call for a fresh user; say() makes the caller say "I'm only 14." */
function call(c: Case): { userId: string; say14: () => void } {
  n++;
  const sessionId = `session-resonance-${n}`;
  const userId = `user-resonance-${n}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId); // session-init-handler does this at session start
  const say14 = () => {
    heldAfter(sessionId, "I'm only 14.", { userId });
    expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  };
  return { userId, say14 };
}

const savedFor = (userId: string) => writes.filter((w) => w.path.includes(userId));

beforeEach(() => {
  writes.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: personality resonance for a caller who said "I\'m only 14."', () => {
  it.each(CASES)('keeps and saves none of their topics when held (%s)', async (c) => {
    const { userId, say14 } = call(c);
    say14();
    await recordUserTopicMention(userId, TOPIC);
    expect(getCachedResonance(userId)?.userMentionedTopics ?? []).toEqual(
      c === 'held' ? [] : [TOPIC]
    );
    await flushResonanceProfile(userId);
    expect(savedFor(userId).length).toBe(c === 'held' ? 0 : 1);
  });

  it.each(CASES)('keeps none of their reactions when held (%s)', async (c) => {
    const { userId, say14 } = call(c);
    say14();
    await recordResonanceEvent(userId, {
      theme: 'vulnerability',
      engagement: 'positive',
      personaId: 'ferni',
      context: { turnCount: 3, momentum: 'cruising' },
      timestamp: new Date(),
    });
    expect(getCachedResonance(userId) !== null).toBe(c !== 'held');
  });

  it.each(CASES)('keeps no vulnerability response when held (%s)', async (c) => {
    const { userId, say14 } = call(c);
    say14();
    await recordVulnerabilityResponse(userId, 'reciprocated');
    expect(getCachedResonance(userId) !== null).toBe(c !== 'held');
  });

  it.each(CASES)(
    'a topic from before the age statement: the debounced save writes nothing when held (%s)',
    async (c) => {
      const { userId, say14 } = call(c);
      await recordUserTopicMention(userId, TOPIC); // turn 1, before they said their age
      say14();
      await vi.advanceTimersByTimeAsync(5_001);
      expect(savedFor(userId).length).toBe(c === 'held' ? 0 : 1);
    }
  );

  it.each(CASES)(
    'a topic from before the age statement: the end-of-call flush writes nothing when held (%s)',
    async (c) => {
      const { userId, say14 } = call(c);
      await recordUserTopicMention(userId, TOPIC);
      say14();
      await flushResonanceProfile(userId); // cancels the debounced save, then saves now
      expect(savedFor(userId).length).toBe(c === 'held' ? 0 : 1);
      expect(JSON.stringify(savedFor(userId)).includes(TOPIC)).toBe(c !== 'held');
    }
  );
});
