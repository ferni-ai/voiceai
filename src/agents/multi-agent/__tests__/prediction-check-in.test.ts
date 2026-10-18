/**
 * The week-end loop of Peter's prediction game (WEEKLY_PREDICTION): a
 * prediction 7+ days old puts one gentle line in the call's recall note,
 * built by buildEngagementContextPrompt from the engagement store. Only the
 * store is a fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredPrediction } from '../../../services/engagement/engagement-store.js';

const db = vi.hoisted(() => ({
  predictions: [] as StoredPrediction[],
  ritualReads: 0,
}));

vi.mock('../../../services/engagement/engagement-store.js', () => ({
  getEngagementStore: async () => ({
    getProfile: async (userId: string) => ({ userId, stats: {} }),
    getRecentPredictions: async () => db.predictions.map((p) => ({ ...p })),
    getRitualStreak: async () => {
      db.ritualReads++;
      return null;
    },
    getWeatherHistory: async () => [],
  }),
}));

import { createMemoryRecall } from '../memory-recall-hook.js';
import {
  createPredictionCheckIn,
  forgetPredictionCheckIns,
  predictionCheckInFor,
  type PredictionCheckIn,
} from '../prediction-check-in.js';
import {
  PREDICTION_TOPIC_PATTERNS,
  predictionTopicPatterns,
} from '../../../tools/dynamic-loader/prediction-topics.js';
import type { DatesRecall } from '../../../intelligence/world-model/dates/recall.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const prediction = (id: string, ageDays: number, done = false): StoredPrediction => ({
  id,
  weekOf: daysAgo(ageDays).slice(0, 10),
  predictions: { 'Deep work hours': 6, 'Exercise sessions': 3 },
  createdAt: daysAgo(ageDays),
  ...(done && { completedAt: daysAgo(1), actuals: { 'Deep work hours': 5 }, accuracy: 83 }),
});

const LINE =
  /they predicted their week with Peter's game \(Deep work hours: 6, Exercise sessions: 3\)/;

const emptyLedger = { save: async () => undefined, recent: async () => [] };
const withThread = {
  facts: async () => [],
  summaries: async () => [
    { callerProvenance: 1, followUpItems: ['Ask how the sourdough starter is doing'] },
  ],
};
const noDates: DatesRecall = { ready: Promise.resolve(), note: () => null, raised: () => {} };

async function recallWith(week: PredictionCheckIn, dates: DatesRecall = noDates) {
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    personaId: 'peter-john',
    store: withThread,
    ledgerStore: emptyLedger,
    dates,
    week,
    opener: true,
  });
  await Promise.all([recall.ready, week.ready]);
  return recall;
}

/** One caller turn: its final transcript's note, then the agent replies. */
function turn(recall: Awaited<ReturnType<typeof recallWith>>, said: string): string {
  const note = recall.noteFor(said, { final: true }) ?? '';
  recall.newTurn();
  return note;
}

beforeEach(() => {
  db.predictions = [];
  db.ritualReads = 0;
  forgetPredictionCheckIns();
  predictionTopicPatterns('u1'); // drop a check-in an earlier test asked
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the week-end prompt (buildEngagementContextPrompt, predictions only)', () => {
  it('asks about a prediction a week old, gently, and says how to record it', async () => {
    db.predictions = [prediction('p-old', 8)];
    const week = createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' });
    await week.ready;

    const line = week.note(true) ?? '';
    expect(line).toMatch(LINE);
    expect(line).toMatch(/Ask once, gently, how the week actually went/);
    expect(line).toMatch(/weeklyPrediction \(record-actuals\)/);
    expect(line).toMatch(/let it go/);
    // Predictions only: no ritual, milestone or weather prompts, and none of their reads.
    expect(line).not.toMatch(/streak|weather|milestone/i);
    expect(db.ritualReads).toBe(0);
  });

  it.each([
    ['not a week old yet', [prediction('p-new', 3)]],
    ['already resolved', [prediction('p-done', 10, true)]],
    ['no predictions', []],
  ])('says nothing when %s', async (_why, predictions) => {
    db.predictions = predictions;
    const week = createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' });
    await week.ready;
    expect(week.note(true)).toBeNull();
  });
});

describe('the prediction check-in in the recall note', () => {
  it('flag off: no line; flag on: one line on the first turn, then never again', async () => {
    db.predictions = [prediction('p-old', 8)];
    vi.stubEnv('WEEKLY_PREDICTION', 'off');
    const off = await recallWith(predictionCheckInFor('u1', 'peter-john'));
    expect(turn(off, 'Hey Peter, how are you?')).not.toMatch(LINE);

    vi.stubEnv('WEEKLY_PREDICTION', 'on');
    const on = await recallWith(predictionCheckInFor('u1', 'peter-john'));
    const first = turn(on, 'Hey Peter, how are you?');
    expect(first).toMatch(LINE);
    // It is the call's one follow-up: the open-thread opener stays out.
    expect(first).not.toContain('ask about the one open thread');
    expect(turn(on, 'Pretty good, busy week.')).not.toMatch(LINE);
  });

  it("asking loads the game for the caller's answer (prediction-topics.ts)", async () => {
    db.predictions = [prediction('p-old', 8)];
    const before = PREDICTION_TOPIC_PATTERNS.length;
    expect(predictionTopicPatterns('u1')).toHaveLength(before);
    const recall = await recallWith(
      createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' })
    );
    expect(turn(recall, 'Hey Peter!')).toMatch(LINE);
    expect(predictionTopicPatterns('u1')).toHaveLength(before + 1);
    expect(predictionTopicPatterns('u1')).toHaveLength(before); // once
  });

  it('waits for a final transcript', async () => {
    db.predictions = [prediction('p-old', 8)];
    const recall = await recallWith(
      createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' })
    );
    expect(recall.noteFor('Hey Pe', { final: false }) ?? '').not.toMatch(LINE);
    expect(recall.noteFor('Hey Peter, good to hear you.', { final: true }) ?? '').toMatch(LINE);
  });

  it.each([
    ['hard news', 'My dad passed away on Tuesday.'],
    ['a sad turn', "I'm just really sad and tired today."],
    ['a crisis turn', "Honestly I want to die, I can't do this."],
  ])('never on a call with %s, even on a lighter turn after', async (_why, said) => {
    db.predictions = [prediction('p-old', 8)];
    const recall = await recallWith(
      createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' })
    );
    expect(turn(recall, said)).not.toMatch(LINE);
    expect(turn(recall, 'Anyway, thanks for listening.')).not.toMatch(LINE);
  });

  it('never beside another follow-up, and not later in that call either', async () => {
    db.predictions = [prediction('p-old', 8)];
    let raised = 0;
    const dates: DatesRecall = {
      ready: Promise.resolve(),
      note: () => (raised ? null : "A date they told you about: Kate's interview was yesterday."),
      raised: () => void raised++,
    };
    const recall = await recallWith(
      createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' }),
      dates
    );
    const first = turn(recall, 'Hey Peter!');
    expect(first).toContain("Kate's interview");
    expect(first).not.toMatch(LINE);
    expect(turn(recall, 'Yeah it went well actually.')).not.toMatch(LINE);
  });

  it('once a day per caller: a handoff to Ferni does not ask again', async () => {
    db.predictions = [prediction('p-old', 8)];
    const peter = await recallWith(
      createPredictionCheckIn({ userId: 'u1', personaId: 'peter-john' })
    );
    expect(turn(peter, 'Hey Peter!')).toMatch(LINE);

    const ferni = await recallWith(createPredictionCheckIn({ userId: 'u1', personaId: 'ferni' }));
    expect(turn(ferni, 'Hi Ferni!')).not.toMatch(LINE);
  });
});
