/**
 * MINOR_CARE: a held call's purge empties the user's in-memory trust stores, so the held call's
 * words are gone. Their older history is still stored, but each save writes what's in memory over
 * it, so the next call's save kept only that call's data: a real owner (or an adult the age check
 * got wrong) lost the rest for good. Learning style, voice prosody and celebration momentum were
 * never read back at all. Now a session start reads them back, and nothing is saved over a doc
 * this process hasn't read since the purge (or since a failed read).
 *
 * The stores, the purge, the session-start load and the session-end save run for real; only
 * Firestore is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeEngagementFirestore,
  type FakeEngagementFirestore,
} from '../../engagement/__tests__/fake-engagement-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'now' } }));
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fake.db }));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../superhuman/semantic-intelligence/index.js', () => ({
  clearSemanticIntelligenceCache: () => undefined,
}));

import { purgeHeldUser } from '../../../agents/voice-agent/minor-care-purge.js';
import { loadTrustProfiles, saveTrustProfiles } from '../persistence.js';
import { getLearningProfile, recordLearningSignals } from '../learning-style.js';
import { flushVoiceProsodyPersistence, recordVoiceSample } from '../voice-prosody-learning.js';
import { flushCelebrationMomentumPersistence, recordWin } from '../celebration-momentum.js';
import { exportBoundaries, updateProbingTolerance } from '../boundary-memory.js';
import { setUserEvents, type LifeEvent } from '../life-events.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  userHeld,
} from '../../../utils/minor-care.js';

const firestore: FakeEngagementFirestore = createFakeEngagementFirestore();
const batch = () => {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: (ref: { set: (d: unknown, o: unknown) => Promise<void> }, d: unknown, o: unknown) =>
      void ops.push(() => ref.set(d, o)),
    commit: async () => void (await Promise.all(ops.map((op) => op()))),
  };
};
fake.db = { ...firestore.db, batch };

const ASKS = 'Why does that happen? Show me the data.'; // two analytical signals
const VOICE = { pitchMean: 180, pitchRange: 20, pitchVariability: 0.3, energyMean: 60 };
let n = 0;
const uid = () => `TrRl${String(++n).padStart(3, '0')}xQ7mN2pLk9Vb4Hc8Zt`; // a member uid
const doc = (u: string, d: string) => `bogle_users/${u}/trust_profiles/${d}`;
const stored = (u: string, d: string) => {
  const raw = firestore.docs.get(doc(u, d))?.data;
  return raw === undefined ? undefined : JSON.parse(raw as string);
};
const speakVoice = (u: string, said: string, count: number) => {
  for (let i = 0; i < count; i++)
    recordVoiceSample(u, VOICE as never, { conversationContext: `${said} ${i}` });
};
/** What a call's end saves: the trust docs, and the voice and momentum stores' own docs. */
const endCall = async (u: string) => {
  await saveTrustProfiles(u);
  await flushVoiceProsodyPersistence();
  await flushCelebrationMomentumPersistence();
};

/** Older history, stored by this owner's earlier call in another process (none in memory here). */
async function seedHistory(u: string): Promise<void> {
  const other = `${u}Seed`; // the earlier process, played by the same stores under another id
  await loadTrustProfiles(other);
  for (let i = 0; i < 3; i++) recordLearningSignals(other, ASKS);
  speakVoice(other, 'OLD', 12);
  recordWin(other, { type: 'effort_made', description: 'OLD win', tags: [] });
  updateProbingTolerance(other, 'welcomed');
  await endCall(other);
  for (const [path, data] of [...firestore.docs].filter(([p]) => p.includes(`/${other}/`)))
    firestore.docs.set(
      path.replace(other, u),
      JSON.parse(JSON.stringify(data).replaceAll(other, u))
    );
  for (const d of ['learning_style', 'voice_prosody', 'celebration_momentum', 'boundaries'])
    expect(stored(u, d)).toBeDefined(); // the history the next calls must keep
}

/** A call by a member; held() says they're 15 and asserts that held them. */
function call(u: string) {
  const sessionId = `session-${u}-${++n}`;
  vi.stubEnv('MINOR_CARE', 'on');
  bindSessionUser(sessionId, u);
  return () => {
    heldAfter(sessionId, "I'm 15.", { userId: u });
    expect(memoryHeld(sessionId)).toBe(true);
  };
}

const asksForData = (u: string) => stored(u, 'learning_style')?.processing.indicators.asksForData;

afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
  firestore.failReads.match = null;
});

describe('MINOR_CARE: after a held call, the next call keeps the stored trust history', () => {
  it('learning style, voice and wins: older history survives, nothing from the held call', async () => {
    const u = uid();
    await seedHistory(u);
    const before = { asks: asksForData(u), samples: stored(u, 'voice_prosody').sampleCount };
    expect(before).toEqual({ asks: 6, samples: 12 });

    const hold = call(u); // call 1: a real owner's history loads, then the caller says they're 15
    await loadTrustProfiles(u);
    recordLearningSignals(u, ASKS);
    speakVoice(u, 'HELD', 4);
    recordWin(u, { type: 'effort_made', description: 'HELD win', tags: [] });
    hold();
    purgeHeldUser(u); // the held call's end
    expect(getLearningProfile(u)).toBeNull();

    resetMinorCare(); // call 2, an ordinary call (the hold lapsed)
    call(u);
    expect(userHeld(u)).toBe(false);
    await loadTrustProfiles(u);
    recordLearningSignals(u, ASKS);
    speakVoice(u, 'NEW', 10);
    recordWin(u, { type: 'effort_made', description: 'NEW win', tags: [] });
    await endCall(u);

    expect(asksForData(u)).toBe(before.asks + 2); // older history + call 2, not call 1
    expect(stored(u, 'voice_prosody').sampleCount).toBe(before.samples + 10);
    const wins = stored(u, 'celebration_momentum').wins.map(
      (w: { description: string }) => w.description
    );
    expect(wins).toEqual(['OLD win', 'NEW win']);
    expect(JSON.stringify([...firestore.docs].filter(([p]) => p.includes(u)))).not.toContain(
      'HELD'
    );
  });

  it('a live owner session saves nothing over them until a session start reads them back', async () => {
    const u = uid();
    await seedHistory(u);
    const docs = ['learning_style', 'boundaries', 'life_events'];
    await loadTrustProfiles(u);
    const hold = call(u);
    hold();
    purgeHeldUser(u);
    resetMinorCare(); // the owner's session, still live: no session start before its next save
    const event = { id: 'e1', userId: u, description: 'NEW move', date: new Date() };
    firestore.docs.set(doc(u, 'life_events'), { data: JSON.stringify([{ ...event, id: 'e0' }]) });
    const kept = docs.map((d) => firestore.docs.get(doc(u, d))?.data);
    recordLearningSignals(u, ASKS);
    updateProbingTolerance(u, 'resisted');
    setUserEvents(u, [event as LifeEvent]);
    await saveTrustProfiles(u);
    expect(docs.map((d) => firestore.docs.get(doc(u, d))?.data)).toEqual(kept);

    await loadTrustProfiles(u); // read back: saves resume, over what was read
    recordLearningSignals(u, ASKS);
    await saveTrustProfiles(u);
    expect(asksForData(u)).toBe(8);
    expect(exportBoundaries(u)?.depthPreferences.probingTolerance).toBe('high');
  });

  it('a failed read at session start keeps every doc it covers unwritten', async () => {
    const u = uid();
    await seedHistory(u);
    const kept = new Map(firestore.docs);
    firestore.failReads.match = new RegExp(u);
    await loadTrustProfiles(u);
    recordLearningSignals(u, ASKS);
    speakVoice(u, 'NEW', 10);
    recordWin(u, { type: 'effort_made', description: 'NEW win', tags: [] });
    updateProbingTolerance(u, 'resisted');
    await endCall(u);
    expect(new Map(firestore.docs)).toEqual(kept);
  });
});
