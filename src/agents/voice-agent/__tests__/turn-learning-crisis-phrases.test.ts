/**
 * The turn's learning recorders (turn-learning.ts recordAllLearningData) that keep the caller's
 * own phrase: a correction ("actually, it's ...") keeps the whole line, and an implicit
 * preference ("I always ...") keeps the phrase and a line of evidence. On a crisis turn, and on a
 * turn whose crisis read is unknown, neither keeps anything; on any other turn both keep the
 * phrase as on main.
 *
 * Only the corrections store is stubbed. Every line here is fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crisisReadTurn } from '../crisis-turn-memory.js';

const state = vi.hoisted(() => ({ kept: [] as string[] }));

vi.mock('../../../services/superhuman/user-corrections.js', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    userCorrections: {
      autoRecord: vi.fn(
        async (_user: string, line: string) => void state.kept.push(`correction:${line}`)
      ),
      recordImplicitPreference: vi.fn(
        async (_user: string, pref: { preference: string }) =>
          void state.kept.push(`preference:${pref.preference}`)
      ),
    },
  };
});

const { recordAllLearningData } = await import('../turn-learning.js');
type Ctx = Parameters<typeof recordAllLearningData>[0];

/** A correction and a preference in one line, on an even turn so the preference check runs. */
const LINE = "actually, it's the blue mug, i always drink my tea in the morning";

function learningTurn(crisisTurn: boolean): Ctx {
  return {
    userId: 'user-learning-phrases',
    sessionId: 'learning-phrases',
    personaId: 'ferni',
    turnCount: 4,
    userText: LINE,
    emotionalResult: { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    injections: [],
    turnResult: { emotional: { primary: 'neutral', intensity: 0.2 }, context: {} },
    crisisTurn,
  };
}

/** Runs the recorders and waits for their fire-and-forget writes to settle. */
async function keptFor(crisisTurn: boolean): Promise<string[]> {
  await recordAllLearningData(learningTurn(crisisTurn));
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  return [...state.kept].sort();
}

beforeEach(() => {
  state.kept = [];
});

describe('learning recorders keep no caller phrase of a crisis turn', () => {
  it('a crisis turn keeps no correction and no preference', async () => {
    expect(await keptFor(true)).toEqual([]);
  });

  it('a turn with no crisis read keeps none either', async () => {
    expect(await keptFor(crisisReadTurn(undefined))).toEqual([]);
  });

  it('any other turn keeps both, as on main', async () => {
    expect(await keptFor(false)).toEqual([
      `correction:${LINE}`,
      'preference:i always drink my tea in the morning',
    ]);
  });
});
