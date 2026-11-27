/**
 * The per-turn learners keep nothing under a try-first visitor's id (#4293).
 *
 * A try-first visitor (`device:demo_…`) is told nothing is kept, and no profile is ever loaded
 * or saved for them. recordAllLearningData still ran every learner with that id, so
 * bogle_users/device:demo_… got a record holding only their time-of-day pattern (prod: the
 * InvalidStoredProfileError lines on device: ids), and corrections, preferences, shared moments
 * and trust data were kept too. With LEARNING_OWNER_GATE on, the learners run with no id for a
 * try-first visitor or an on-behalf call (ownerWriteId); a member still learns.
 *
 * learnTemporalPattern is real, over the in-memory merge Firestore fake; the other learners are
 * spies. Synthetic ids and words only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => fake.db }));
vi.mock('../index.js', () => ({ recordTrustSystemsData: vi.fn(async () => undefined) }));
vi.mock('../../../intelligence/context-builders/relationship/deep-relationship.js', () => ({
  recordSharedMoment: vi.fn(async () => undefined),
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
vi.mock('../../../intelligence/index.js', () => ({
  analyzeUserEngagement: vi.fn(() => ({ score: 0.8 })),
  recordResponseForLearning: vi.fn(async () => undefined),
  recordBreakthroughForLearning: vi.fn(),
  recordStoryForLearning: vi.fn(),
}));

const { recordAllLearningData } = await import('../turn-learning.js');
const { recordTrustSystemsData } = await import('../index.js');
const { recordSharedMoment } =
  await import('../../../intelligence/context-builders/relationship/deep-relationship.js');
const { userCorrections } = await import('../../../services/superhuman/user-corrections.js');
const { recordResponseForLearning } = await import('../../../intelligence/index.js');
const { isAnonymousDemoUser } = await import('../../../utils/synthetic-user.js');

const DEMO = 'device:demo_test0101';
const ONBEHALF = 'onbehalf:call-test-0101';
const MEMBER = 'user-test-0101';

let state: MergeFakeState;

/** Every spy call made with this id, across the learners that are not real here. */
function spyCallsFor(id: string): number {
  const calls: unknown[][] = [
    ...vi.mocked(recordTrustSystemsData).mock.calls,
    ...vi.mocked(recordSharedMoment).mock.calls,
    ...vi.mocked(userCorrections.autoRecord).mock.calls,
    ...vi.mocked(userCorrections.recordImplicitPreference).mock.calls,
    ...vi.mocked(recordResponseForLearning).mock.calls,
  ];
  return calls.filter((args) => JSON.stringify(args).includes(id)).length;
}
const userWrites = () => state.writes.filter((w) => w.path.startsWith('bogle_users/'));

/** Five turns (temporal learning runs on the 5th), each a correction, preference and high emotion. */
async function fiveTurns(userId: string): Promise<void> {
  for (let turnCount = 1; turnCount <= 5; turnCount++) {
    await recordAllLearningData({
      userId,
      sessionId: 'session-test-0101',
      personaId: 'ferni',
      turnCount,
      userText: 'no, i meant i prefer quiet evenings by the lake',
      emotionalResult: { primary: 'joy', intensity: 0.9, distressLevel: 0 },
      injections: [{ category: 'topics', content: 'evenings and the lake' }],
      turnResult: { emotional: { primary: 'joy', intensity: 0.9 }, context: {} },
      crisisTurn: false,
    });
  }
  await new Promise((resolve) => {
    setTimeout(resolve, 20); // fire-and-forget writes settle
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state = newMergeFakeState();
  fake.db = createMergeFakeFirestore(state);
  state.docs.set(`bogle_users/${MEMBER}`, { id: MEMBER, name: 'Robin Testcase' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it('the demo id is the real try-first shape', () => {
  expect(isAnonymousDemoUser(DEMO)).toBe(true);
});

describe('LEARNING_OWNER_GATE on', () => {
  beforeEach(() => vi.stubEnv('LEARNING_OWNER_GATE', 'on'));

  it('a try-first visitor: five turns keep nothing, in bogle_users or any learner', async () => {
    await fiveTurns(DEMO);

    expect(userWrites()).toEqual([]);
    expect(state.docs.has(`bogle_users/${DEMO}`)).toBe(false);
    expect(spyCallsFor(DEMO)).toBe(0);
  });

  it('an on-behalf call: five turns keep nothing either', async () => {
    await fiveTurns(ONBEHALF);

    expect(userWrites()).toEqual([]);
    expect(spyCallsFor(ONBEHALF)).toBe(0);
  });

  it('a member still learns: temporal patterns and every learner', async () => {
    await fiveTurns(MEMBER);

    expect(state.docs.get(`bogle_users/${MEMBER}`)).toMatchObject({
      id: MEMBER,
      temporalPatterns: { preferredTimes: { preferenceStrength: 0.1 } },
    });
    expect(vi.mocked(recordTrustSystemsData)).toHaveBeenCalledTimes(5);
    expect(vi.mocked(userCorrections.autoRecord)).toHaveBeenCalled();
    expect(vi.mocked(userCorrections.recordImplicitPreference)).toHaveBeenCalled();
    expect(vi.mocked(recordSharedMoment)).toHaveBeenCalled();
    expect(spyCallsFor(MEMBER)).toBeGreaterThan(5);
  });
});

describe('LEARNING_OWNER_GATE off: as before', () => {
  beforeEach(() => vi.stubEnv('LEARNING_OWNER_GATE', 'off'));

  it('a try-first visitor gets a record holding only temporalPatterns, and every learner runs', async () => {
    await fiveTurns(DEMO);

    expect(Object.keys(state.docs.get(`bogle_users/${DEMO}`) ?? {})).toEqual(['temporalPatterns']);
    expect(vi.mocked(recordTrustSystemsData)).toHaveBeenCalledTimes(5);
    expect(spyCallsFor(DEMO)).toBeGreaterThan(5);
  });
});
