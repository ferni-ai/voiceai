/**
 * Stores that never read before saving no longer write defaults over the stored doc.
 *
 * Voice prosody, motivational interviewing and reading-between-lines kept an in-memory map and
 * merge-saved it, but their loader was never called. The first save of every session replaced
 * the user's stored samples and baseline, change-talk history and unsaid-signal profile with
 * whatever this process had recorded (one sample, one statement). They now read the stored doc
 * before the first save and keep both. A failed read saves nothing until a read succeeds.
 *
 * Real consumers and the real persistence store on the Firestore merge fake; every assertion
 * reads the stored doc.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
const failed = new Set<string>();
state.failReads = failed;
/** The merge fake plus the batch API the store's flush uses. */
function fakeDb(s: MergeFakeState) {
  const db = createMergeFakeFirestore(s);
  type Ref = ReturnType<typeof db.doc>;
  const batch = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void ops.push(() => r.set(data, opts)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  };
  return { ...db, batch };
}
fake.db = fakeDb(state);

const mi = await import('../../therapeutic-frameworks/motivational-interviewing.js');
const voice = await import('../../trust-systems/voice-prosody-learning.js');
const unsaid = await import('../../trust/reading-between-lines.js');
const momentum = await import('../../trust-systems/celebration-momentum.js');

const ISO = '2026-10-01T09:00:00.000Z';
const writesTo = (path: string) => state.writes.filter((w) => w.path === path);
const field = <T>(path: string, name: string) => state.docs.get(path)?.[name] as T;
/** Let the read-then-save finish, then flush the store's batch. */
async function settle(flush: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  await flush();
}

beforeEach(() => {
  state.docs.clear();
  state.writes.length = 0;
  failed.clear();
});

describe('motivational interviewing change talk', () => {
  const PATH = 'bogle_users/u-mi/motivational_interviewing/change_talk';
  const stored = (n: number) => ({
    type: 'desire',
    statement: `stored ${n}`,
    strength: 0.6,
    timestamp: ISO,
  });
  const said = {
    type: 'need' as const,
    statement: 'I need to cut back',
    strength: 0.8,
    timestamp: new Date(),
  };

  it('the first save keeps the stored history and adds the new statement', async () => {
    state.docs.set(PATH, { history: [stored(1), stored(2)] });
    mi.recordChangeTalk('u-mi', [said]);
    await settle(mi.flushMotivationalInterviewingPersistence);

    const history = field<Array<{ statement: string }>>(PATH, 'history');
    expect(history.map((h) => h.statement)).toEqual(['stored 1', 'stored 2', 'I need to cut back']);
  });

  it('a failed read saves nothing; after recovery the next save keeps both', async () => {
    const path2 = 'bogle_users/u-mi-2/motivational_interviewing/change_talk';
    state.docs.set(path2, { history: [stored(1)] });
    failed.add(path2);
    mi.recordChangeTalk('u-mi-2', [said]);
    await settle(mi.flushMotivationalInterviewingPersistence);
    expect(writesTo(path2)).toEqual([]);

    failed.clear();
    mi.recordChangeTalk('u-mi-2', [said]);
    await settle(mi.flushMotivationalInterviewingPersistence);
    const history = field<Array<{ statement: string }>>(path2, 'history');
    expect(history[0]?.statement).toBe('stored 1');
    expect(history.length).toBe(3); // stored + both statements recorded in this process
  });
});

describe('voice prosody baseline and samples', () => {
  const PATH = 'bogle_users/u-voice/voice_prosody/data';
  const characteristics = { pitch: 180, pitchVariability: 0.3, energy: 0.5, speakingRate: 150 };

  it('the first save keeps the stored baseline and samples and adds the new sample', async () => {
    const baseline = {
      userId: 'u-voice',
      sampleCount: 40,
      establishedAt: ISO,
      lastUpdated: ISO,
      marker: 'stored',
    };
    const samples = Array.from({ length: 3 }, () => ({ timestamp: ISO, characteristics }));
    state.docs.set(PATH, { baseline, samples });

    await voice.loadVoiceProsodyUser('u-voice'); // session start (reload-before-save.ts)
    voice.recordVoiceSample('u-voice', characteristics as never);
    await settle(voice.flushVoiceProsodyPersistence);

    expect(field<unknown[]>(PATH, 'samples')).toHaveLength(4);
    expect(field<{ marker: string }>(PATH, 'baseline').marker).toBe('stored');
  });

  it('a failed read saves nothing; after recovery the next save keeps the stored samples', async () => {
    const path = 'bogle_users/u-voice-2/voice_prosody/data';
    state.docs.set(path, { samples: [{ timestamp: ISO, characteristics }] });
    failed.add(path);
    await expect(voice.loadVoiceProsodyUser('u-voice-2')).rejects.toThrow();
    voice.recordVoiceSample('u-voice-2', characteristics as never);
    await settle(voice.flushVoiceProsodyPersistence);
    expect(writesTo(path)).toEqual([]);

    failed.clear();
    await voice.loadVoiceProsodyUser('u-voice-2');
    voice.recordVoiceSample('u-voice-2', characteristics as never);
    await settle(voice.flushVoiceProsodyPersistence);
    expect(field<unknown[]>(path, 'samples')).toHaveLength(3);
  });
});

describe('reading between lines unsaid profile', () => {
  const PATH = 'bogle_users/u-unsaid/reading_between_lines/profile';

  it('the first save keeps the stored profile and adds the new signal', async () => {
    state.docs.set(PATH, {
      userId: 'u-unsaid',
      avoidedTopics: [
        { topic: 'father', avoidanceCount: 4, lastAvoided: ISO, deflectionPhrases: ['anyway'] },
      ],
      falseFines: [{ timestamp: ISO, context: 'stored fine' }],
      hangingThreads: [{ topic: 'job', lastMentioned: ISO, timesStarted: 2, neverFinished: true }],
      permissionMoments: [],
    });

    unsaid.detectUnsaidSignals('u-unsaid', "I'm fine", { detectedEmotion: 'sad' });
    await settle(unsaid.flushReadingBetweenLinesPersistence);

    expect(field<Array<{ topic: string }>>(PATH, 'avoidedTopics').map((t) => t.topic)).toEqual([
      'father',
    ]);
    expect(field<Array<{ topic: string }>>(PATH, 'hangingThreads').map((t) => t.topic)).toEqual([
      'job',
    ]);
    const fines = field<Array<{ context: string }>>(PATH, 'falseFines');
    expect(fines[0]?.context).toBe('stored fine');
    expect(fines).toHaveLength(2);
  });

  it('a failed read saves nothing; after recovery the next save keeps the stored profile', async () => {
    const path = 'bogle_users/u-unsaid-2/reading_between_lines/profile';
    const profile = {
      userId: 'u-unsaid-2',
      avoidedTopics: [],
      hangingThreads: [],
      permissionMoments: [],
    };
    state.docs.set(path, { ...profile, falseFines: [{ timestamp: ISO, context: 'stored fine' }] });
    failed.add(path);
    unsaid.detectUnsaidSignals('u-unsaid-2', "I'm fine", { detectedEmotion: 'sad' });
    await settle(unsaid.flushReadingBetweenLinesPersistence);
    expect(writesTo(path)).toEqual([]);

    failed.clear();
    unsaid.detectUnsaidSignals('u-unsaid-2', "I'm fine", { detectedEmotion: 'sad' });
    await settle(unsaid.flushReadingBetweenLinesPersistence);
    const fines = field<Array<{ context: string }>>(path, 'falseFines');
    expect(fines[0]?.context).toBe('stored fine');
    expect(fines.length).toBeGreaterThan(1); // the new signal landed too
  });
});

describe('celebration momentum profile', () => {
  const profile = (userId: string) => ({
    userId,
    wins: [{ id: 'old-win', type: 'effort_made', description: 'stored', detectedAt: ISO }],
    streaks: [],
    themes: [],
    momentumScore: 50,
    momentumTrend: 'stable',
    consistencyScore: 50,
    totalWins: 1,
    winsThisWeek: 0,
    winsThisMonth: 0,
    comebackDetected: false,
    breakthroughMoment: false,
    lastUpdated: ISO,
  });
  const win = { type: 'effort_made' as const, description: 'went for a run' };
  const winIds = (path: string) => field<Array<{ id: string }>>(path, 'wins').map((w) => w.id);

  it('the first save keeps the stored wins and adds the new one', async () => {
    const path = 'bogle_users/u-win/celebration_momentum/profile';
    state.docs.set(path, profile('u-win'));
    await momentum.loadMomentumUser('u-win'); // session start (reload-before-save.ts)
    momentum.recordWin('u-win', win as never);
    await settle(momentum.flushCelebrationMomentumPersistence);
    expect(winIds(path)[0]).toBe('old-win');
    expect(winIds(path)).toHaveLength(2);
  });

  it('a failed read saves nothing; after recovery the next save keeps the stored wins', async () => {
    const path = 'bogle_users/u-win-2/celebration_momentum/profile';
    state.docs.set(path, profile('u-win-2'));
    failed.add(path);
    await expect(momentum.loadMomentumUser('u-win-2')).rejects.toThrow();
    momentum.recordWin('u-win-2', win as never);
    await settle(momentum.flushCelebrationMomentumPersistence);
    expect(writesTo(path)).toEqual([]);

    failed.clear();
    await momentum.loadMomentumUser('u-win-2');
    momentum.recordWin('u-win-2', win as never);
    await settle(momentum.flushCelebrationMomentumPersistence);
    expect(winIds(path)[0]).toBe('old-win');
    expect(winIds(path).length).toBeGreaterThan(1); // the new win landed too
  });
});
