/**
 * MINOR_CARE=on: the relationship arc (bogle_users/{uid}/relationship_arc/data) keeps the caller's
 * first words, key moments and shared vocabulary. first-meeting-magic writes `firstWords` on turn
 * 1, and nothing in the arc held a caller who said they're under 18. The hold lives at the one
 * choke point every arc writer saves through (saveRelationshipArcData), plus the turn-1 builder,
 * which reads the words itself so a first line of "I'm only 14" can't race the writer.
 *
 * The real builder and storage run with only Firestore faked; the same writes still happen for a
 * verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written = vi.hoisted(() => [] as Array<{ path: string; data: unknown }>);
/** Documents as stored, by path. */
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());

/** A fake Firestore that records every write and serves `docs`. */
const fakeDb = vi.hoisted(() => {
  const ref = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id: string) => ref(`${path}/${id}`),
    get: async () => {
      const doc = docs.get(path);
      return { exists: !!doc, data: () => (doc ? structuredClone(doc) : undefined) };
    },
    set: async (data: unknown) => void written.push({ path, data }),
  });
  return ref('');
});

import { getFirestoreDb } from '../../../../../services/superhuman/firestore-utils.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../../../utils/minor-care.js';
import { purgeHeldUser } from '../../../../../agents/voice-agent/minor-care-purge.js';
import type { ContextBuilderInput } from '../../../index.js';
import { firstMeetingMagicBuilder } from '../first-meeting-magic.js';
import {
  addSharedVocabulary,
  clearAllArcCache,
  loadRelationshipArcData,
  markFirstWordsCallbackMade,
  recordFirstMeeting,
  recordKeyMoment,
} from '../storage.js';
import { createDefaultRelationshipArcData, type FirstMeetingData } from '../types.js';

type Case = 'held' | 'owner' | 'off';
const CASES: Case[] = ['held', 'owner', 'off'];
const RILEY = 'My best friend Riley and I had a fight today and I feel kind of awful.';
const FOURTEEN = "I'm only 14 and my best friend Riley and I had a fight today.";
let n = 0;

const arcPath = (userId: string) => `/bogle_users/${userId}/relationship_arc/data`;
const writesFor = (userId: string) => written.filter((w) => w.path === arcPath(userId));
const firstMeeting = (firstWords: string): FirstMeetingData => ({
  firstWords,
  detectedEnergy: 'low',
  timestamp: Date.now(),
  observations: [],
  firstWordsCallbackMade: false,
});

/** A call in the given state: session-init binds the user; held/owner have said they're 14 when `said`. */
function call(c: Case, said = true): { sessionId: string; userId: string } {
  n++;
  const sessionId = `session-AJ_arc${n}-1792867440000`;
  const userId = `anon:2c4e6a80-1b3d-4f5a-8c7e-${String(n).padStart(12, '0')}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  if (said) {
    heldAfter(sessionId, "I'm only 14.", { userId });
    expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  }
  return { sessionId, userId };
}

beforeEach(() => {
  vi.mocked(getFirestoreDb).mockReturnValue(fakeDb as never);
  written.length = 0;
  docs.clear();
  clearAllArcCache();
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: the relationship arc of a caller who said "I\'m only 14."', () => {
  it.each(CASES)('keeps no first words when held (%s)', async (c) => {
    const { userId } = call(c);
    await recordFirstMeeting(userId, firstMeeting(RILEY));
    expect(writesFor(userId).length).toBe(c === 'held' ? 0 : 1);
  });

  it.each(CASES)('keeps no key moment or shared vocabulary when held (%s)', async (c) => {
    const { sessionId, userId } = call(c);
    await recordKeyMoment(userId, {
      type: 'vulnerability',
      summary: 'a fight with their best friend',
      quote: RILEY,
      timestamp: Date.now(),
      sessionId,
      personaId: 'ferni',
    });
    await addSharedVocabulary(userId, { term: 'the Riley thing', meaning: 'the fight' });
    expect(writesFor(userId).length).toBe(c === 'held' ? 0 : 2);
  });

  it.each(CASES)('turn 1 "I\'m only 14" keeps none of their first words (%s)', async (c) => {
    // Nothing has read their words yet: the builder itself must, before it records them
    const { sessionId, userId } = call(c, false);
    expect(memoryHeld(sessionId)).toBe(false);
    const input = {
      userText: FOURTEEN,
      userData: { turnCount: 1 },
      services: { userId, sessionId },
    } as unknown as ContextBuilderInput;
    await firstMeetingMagicBuilder.build(input);
    expect(memoryHeld(sessionId)).toBe(c === 'held');
    if (c === 'held') {
      await new Promise((r) => {
        setTimeout(r, 25); // the write is fire-and-forget
      });
      expect(writesFor(userId)).toEqual([]);
    } else {
      await vi.waitFor(() => expect(writesFor(userId).length).toBe(1));
      expect(JSON.stringify(writesFor(userId)[0].data)).toContain('Riley');
    }
  });

  it.each(CASES)('a later read never sees the held first words in the cache (%s)', async (c) => {
    // A stored arc, loaded (and cached) before the age statement; recordFirstMeeting then
    // mutates that cached object in place. Held, the save is skipped, so the cache must go too.
    const { sessionId, userId } = call(c, false);
    docs.set(arcPath(userId), { ...createDefaultRelationshipArcData(userId) });
    await loadRelationshipArcData(userId);
    heldAfter(sessionId, "I'm only 14.", { userId });
    expect(memoryHeld(sessionId)).toBe(c === 'held');
    await recordFirstMeeting(userId, firstMeeting(RILEY));
    const later = await loadRelationshipArcData(userId);
    expect(later?.firstMeeting?.firstWords ?? null).toBe(c === 'held' ? null : RILEY);
  });

  it('a callback marker for a held caller is not written either', async () => {
    const { userId } = call('held');
    docs.set(arcPath(userId), {
      ...createDefaultRelationshipArcData(userId),
      firstMeeting: firstMeeting('hi'),
    });
    await markFirstWordsCallbackMade(userId);
    expect(writesFor(userId)).toEqual([]);
  });

  it('a placeholder id keeps no arc while MINOR_CARE is on, and does with it off', async () => {
    vi.stubEnv('MINOR_CARE', 'on');
    await recordFirstMeeting('anonymous', firstMeeting(RILEY));
    expect(writesFor('anonymous')).toEqual([]);
    vi.stubEnv('MINOR_CARE', 'off');
    await recordFirstMeeting('anonymous', firstMeeting(RILEY));
    expect(writesFor('anonymous').length).toBe(1);
  });

  it("purge drops the held caller's cached arc and none of another caller's", async () => {
    const a = call('held', false);
    const b = call('held', false);
    for (const { userId } of [a, b]) {
      docs.set(arcPath(userId), { ...createDefaultRelationshipArcData(userId), totalSessions: 2 });
      await loadRelationshipArcData(userId); // cached
      docs.set(arcPath(userId), { ...createDefaultRelationshipArcData(userId), totalSessions: 9 });
    }
    heldAfter(a.sessionId, "I'm only 14.", { userId: a.userId });
    purgeHeldUser(a.userId);
    expect((await loadRelationshipArcData(a.userId))?.totalSessions).toBe(9); // reloaded
    expect((await loadRelationshipArcData(b.userId))?.totalSessions).toBe(2); // still cached
  });
});
