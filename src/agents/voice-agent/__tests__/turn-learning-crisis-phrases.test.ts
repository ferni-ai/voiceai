/**
 * The turn's learning recorders (turn-learning.ts recordAllLearningData) that keep the caller's
 * own words: a correction ("actually, it's ...") keeps the whole line, an implicit preference
 * ("I always ...") keeps the phrase and a line of evidence, and a high-emotion shared moment keeps
 * what they said. On a crisis turn, on a turn whose crisis read is unknown, and when the read is
 * missing from the context altogether, none keeps anything; on any other turn all three keep the
 * words as on main.
 *
 * Only the two stores are stubbed, completely: neither stub spreads the real module, so a store
 * write can only reach this file's capture. Every line here is fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crisisReadTurn } from '../crisis-turn-memory.js';

const state = vi.hoisted(() => ({ kept: [] as string[] }));

vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(
      async (_user: string, line: string) => void state.kept.push(`correction:${line}`)
    ),
    recordImplicitPreference: vi.fn(
      async (_user: string, pref: { preference: string }) =>
        void state.kept.push(`preference:${pref.preference}`)
    ),
  },
}));

vi.mock('../../../intelligence/context-builders/relationship/deep-relationship.js', () => ({
  recordSharedMoment: vi.fn(
    async (_user: string, moment: { whatTheySaid: string }) =>
      void state.kept.push(`shared:${moment.whatTheySaid}`)
  ),
}));

const { recordAllLearningData } = await import('../turn-learning.js');
type Ctx = Parameters<typeof recordAllLearningData>[0];

/** A correction and a preference in one line. */
const LINE = "actually, it's the blue mug, i always drink my tea in the morning";

/** Turn 6: even, so the preference check runs, and a multiple of 3, so the shared moment can. */
function learningTurn(crisisTurn: boolean | undefined): Ctx {
  const ctx = {
    userId: 'user-learning-phrases',
    sessionId: 'learning-phrases',
    personaId: 'ferni',
    turnCount: 6,
    userText: LINE,
    emotionalResult: { primary: 'happy', intensity: 0.9, distressLevel: 0 },
    injections: [],
    turnResult: { emotional: { primary: 'happy', intensity: 0.9 }, context: {} },
    crisisTurn,
  };
  return ctx as Ctx; // crisisTurn undefined: a context built without the read
}

/** Runs the recorders and waits for their fire-and-forget writes to settle. */
async function keptFor(crisisTurn: boolean | undefined): Promise<string[]> {
  state.kept = [];
  await recordAllLearningData(learningTurn(crisisTurn));
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  return [...state.kept].sort();
}

const ALL_THREE = [
  `correction:${LINE}`,
  'preference:i always drink my tea in the morning',
  `shared:${LINE}`,
];

beforeEach(() => {
  state.kept = [];
});

describe('learning recorders keep no caller words of a crisis turn', () => {
  it('a crisis turn keeps no correction, preference or shared moment', async () => {
    expect(await keptFor(true)).toEqual([]);
  });

  it('a turn with no crisis read keeps none either', async () => {
    expect(await keptFor(crisisReadTurn(undefined))).toEqual([]);
  });

  it('a context missing the read keeps none either (unknown holds)', async () => {
    expect(await keptFor(undefined)).toEqual([]);
  });

  it('any other turn keeps all three, as on main', async () => {
    expect(await keptFor(false)).toEqual(ALL_THREE);
  });

  it('a crisis turn, then an ordinary one, through the same recorders', async () => {
    expect(await keptFor(true)).toEqual([]);
    expect(await keptFor(false)).toEqual(ALL_THREE);
  });
});
