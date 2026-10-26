/**
 * MINOR_CARE: a held caller's high-emotion turn writes no shared moment.
 *
 * Before: recordAllLearningData() wrote bogle_users/{uid}/shared_moments/* with the caller's own
 * sentence as origin.whatTheySaid on every third high-emotion turn, with no hold check, so a held
 * caller under 18 had it stored. The real turn-learning and the real shared-moment writer run;
 * only Firestore and the other learners are faked. A non-held adult's turn still writes one, with
 * the same fields as before. Synthetic uids and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../tests/helpers/snippet-leak.js';

/** Stored documents by path, written by the fake Firestore below. */
const docs = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../utils/firebase-admin-app.js', () => {
  const ref = (path: string): Record<string, unknown> => ({
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id: string) => ref(`${path}/${id}`),
    set: async (data: Record<string, unknown>) => void docs.set(path, structuredClone(data)),
  });
  return { getAdminFirestore: () => ref('') };
});
vi.mock('../index.js', () => ({ recordTrustSystemsData: vi.fn(async () => undefined) }));
vi.mock('../../../intelligence/index.js', () => ({
  analyzeUserEngagement: vi.fn(),
  recordResponseForLearning: vi.fn(),
  recordBreakthroughForLearning: vi.fn(),
  recordStoryForLearning: vi.fn(),
}));
vi.mock('../../../intelligence/context-builders/intelligence/temporal-intelligence.js', () => ({
  learnTemporalPattern: vi.fn(async () => undefined),
}));
vi.mock('../../../intelligence/capability-learning.js', () => ({
  onUserEngagedWithCapability: vi.fn(),
  getRecentlySurfacedDomains: vi.fn(() => []),
}));
vi.mock('../../../audio/music-player.js', () => ({
  getMusicPlayer: vi.fn(() => ({ getState: () => ({ isPlaying: false }) })),
}));
vi.mock('../../../services/trust-systems/our-songs.js', () => ({
  detectSignificantMoment: vi.fn(() => null),
  recordOurSong: vi.fn(async () => undefined),
}));
vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(async () => null),
    recordImplicitPreference: vi.fn(async () => null),
  },
}));

import { recordAllLearningData, type LearningContext } from '../turn-learning.js';
import { heldAfter, resetMinorCare } from '../../../utils/minor-care.js';

let n = 0;
const uid = (tag: string) => `ShMo${tag}${String(++n).padStart(3, '0')}kQ4vX8pLm2Rt`;
const momentsOf = (u: string) =>
  [...docs].filter(([p]) => p.startsWith(`/bogle_users/${u}/shared_moments/`)).map(([, d]) => d);
/** The writer is fire-and-forget: let its dynamic import and set settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

/** A high-emotion turn on a multiple of 3: the branch that records a shared moment. */
const turn = (userId: string, sessionId: string): LearningContext => ({
  userId,
  sessionId,
  personaId: 'ferni',
  turnCount: 6,
  userText: SENTINEL,
  emotionalResult: { primary: 'sad', intensity: 0.9, distressLevel: 0.2 },
  injections: [],
  turnResult: { emotional: { primary: 'sad', intensity: 0.9 }, context: {} },
});

beforeEach(() => {
  docs.clear();
  resetMinorCare();
  vi.stubEnv('MINOR_CARE', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('shared moments and MINOR_CARE', () => {
  it('a held caller (session held, bound to the user): no shared moment, no piece of the words', async () => {
    const u = uid('H');
    const s = `held-${u}`;
    expect(heldAfter(s, "I'm 15.", { userId: u })).toBe(true);
    await recordAllLearningData(turn(u, s));
    await settle();
    expect(momentsOf(u)).toEqual([]);
    expect(leakedPieces([...docs])).toEqual([]);
  });

  it('a held session not yet bound to the user writes none either', async () => {
    const u = uid('S');
    const s = `held-${u}`;
    expect(heldAfter(s, "I'm 15.")).toBe(true);
    await recordAllLearningData(turn(u, s));
    await settle();
    expect(momentsOf(u)).toEqual([]);
  });

  it('a non-held adult: one moment, with the same fields as before', async () => {
    const u = uid('A');
    const s = `adult-${u}`;
    expect(heldAfter(s, "I'm 34 and my week was long.", { userId: u })).toBe(false);
    await recordAllLearningData(turn(u, s));
    await vi.waitFor(() => expect(momentsOf(u)).toHaveLength(1));
    const [moment] = momentsOf(u);
    expect(moment).toMatchObject({
      type: 'callback_moment',
      content: 'sad',
      origin: { whatTheySaid: SENTINEL.slice(0, 200) },
      triggers: ['sad'],
      significance: 'meaningful',
      callbackCount: 0,
      callbackReception: 'unknown',
    });
    expect(Object.keys(moment).sort()).toEqual(
      [
        'callbackCount',
        'callbackReception',
        'content',
        'createdAt',
        'id',
        'origin',
        'significance',
        'triggers',
        'type',
      ].sort()
    );
  });

  it('MINOR_CARE off: a caller who says 15 still gets their moment (behaviour unchanged)', async () => {
    vi.stubEnv('MINOR_CARE', 'off');
    const u = uid('O');
    heldAfter(`off-${u}`, "I'm 15.", { userId: u });
    await recordAllLearningData(turn(u, `off-${u}`));
    await vi.waitFor(() => expect(momentsOf(u)).toHaveLength(1));
  });
});
