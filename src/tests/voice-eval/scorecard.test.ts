import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import {
  assemble,
  DIMENSIONS,
  evalValues,
  followThroughOf,
  panelOf,
  reviewedValues,
} from '../../../scripts/voice-eval/scorecard.mjs';

const call = (over: Record<string, unknown> = {}) => ({
  env: 'prod',
  userKind: 'owner',
  metrics: {
    callerTurns: 40,
    replyGapMs: { p50: 1082, source: 'reply-gap' },
    callerTalkShare: 0.16,
    unbackedActionClaims: 1,
    fallbacks: { summary: 1, generateReplyFailed: 1, directorNoReply: 0, hedgedBackupWins: 3 },
  },
  judge: { scores: { feltUnderstood: null, feltValidated: 2, callbackTact: 4 }, fakedKnowledge: 2 },
  ...over,
});

describe('scorecard values', () => {
  it('reads one reviewed call into dimension values', () => {
    expect(reviewedValues(call())).toMatchObject({
      speed: 1082,
      listening: 0.16,
      feltUnderstood: null,
      feltValidated: 2,
      callbackTact: 4,
      honesty: 3,
      fallbacks: 2, // hedged backup wins are not a fallback the caller hears
    });
  });

  it('skips a session with no real conversation in it', () => {
    expect(reviewedValues(call({ metrics: { ...call().metrics, callerTurns: 0 } }))).toEqual({});
  });

  it('leaves speed out when the gap was only estimated', () => {
    const est = call({
      metrics: { ...call().metrics, replyGapMs: { p50: 900, source: 'turn-metrics-estimate' } },
    });
    expect(reviewedValues(est).speed).toBeNull();
  });

  it('scores recall from the scenario facts and reads backchannel timing', () => {
    const run = {
      meta: { scenario: 'facts-recall' },
      events: [{ t: 1, who: 'agent', text: 'Hey, nothing to recall here.' }],
    };
    const v = evalValues(
      run,
      { scores: { feltUnderstood: 4 } },
      { presence: { bcHeardOffsetMs: { p50: 640 } } }
    );
    expect(v).toMatchObject({ feltUnderstood: 4, recall: 0, backchannelTiming: 640 });
    expect(
      evalValues({ meta: { scenario: 'story' }, events: [] }, null, null).recall
    ).toBeUndefined();
  });
});

describe('scorecard follow-through', () => {
  it('rates kept over kept+missed for promises due in the window', () => {
    const r = followThroughOf(
      [
        { outcome: 'kept', dueBy: '2026-10-05T10:00:00Z' },
        { outcome: 'missed', dueBy: '2026-10-05T12:00:00Z' },
        { outcome: 'kept', dueBy: '2026-10-06T10:00:00Z' },
        { outcome: 'unknown', dueBy: '2026-10-06T11:00:00Z' },
        { outcome: 'kept', dueBy: '2026-09-01T10:00:00Z' }, // before the window
        { outcome: 'open' }, // no due time
      ],
      '2026-09-27T00:00:00Z',
      '2026-10-11T00:00:00Z'
    );
    expect(r.overall).toEqual({ value: 0.67, n: 3, due: 4 });
    expect(followThroughOf([], 'a', 'z').overall).toEqual({ value: null, n: 0, due: 0 });
    expect(r.byDate).toEqual({ '2026-10-05': 0.5, '2026-10-06': 1 });
  });
});

describe('scorecard assembly', () => {
  it('splits prod-real from dev-eval and keeps a dated trend', () => {
    const rows = [
      { date: '2026-10-10', side: 'prodReal', values: { speed: 1000 } },
      { date: '2026-10-11', side: 'prodReal', values: { speed: 1200 } },
      { date: '2026-10-11', side: 'prodReal', values: { speed: 1400 } },
      { date: '2026-10-11', side: 'devEval', values: { speed: 1500 } },
    ];
    const card = assemble(rows, { overall: { value: 1, n: 2 }, byDate: { '2026-10-09': 1 } }, {});
    expect(Object.keys(card.dimensions)).toEqual(Object.keys(DIMENSIONS));
    expect(card.dimensions.speed.current).toEqual({
      prodReal: { value: 1200, n: 3 },
      devEval: { value: 1500, n: 1 },
    });
    expect(card.dimensions.speed.trend).toEqual([
      { date: '2026-10-10', prodReal: 1000, devEval: null },
      { date: '2026-10-11', prodReal: 1300, devEval: 1500 },
    ]);
    expect(card.dimensions.speed.human).toMatchObject({ value: 380, range: [200, 500] });
    expect(card.dimensions.recall.current).toEqual({ prodReal: null, devEval: null });
    expect(card.dimensions.followThrough.current).toEqual({
      prodReal: { value: 1, n: 2 },
      devEval: null,
    });
    expect(card.dimensions.followThrough.trend).toEqual([
      { date: '2026-10-09', prodReal: 1, devEval: null },
    ]);
  });
});

describe('scorecard human panel', () => {
  const report = (round: string, listeners: number, scores: string[]) => ({
    round,
    listeners,
    rows: scores.map((s, i) => ({ version: String(i), 'human score': s })),
  });

  it("takes the latest round's mean version score, with listeners as n", () => {
    const p = panelOf([
      { date: '2026-10-12', report: report('r2', 3, ['3.00', '4.00']) },
      { date: '2026-10-10', report: report('r1', 2, ['2.50']) },
      { date: '2026-10-13', report: report('r3', 0, ['5.00']) }, // nobody rated it yet
    ]);
    expect(p.current).toEqual({ value: 3.5, n: 3, round: 'r2' });
    expect(p.trend).toEqual([
      { date: '2026-10-10', prodReal: null, devEval: 2.5 },
      { date: '2026-10-12', prodReal: null, devEval: 3.5 },
    ]);
  });

  it('puts the panel first and leaves it null until someone listens', () => {
    const card = assemble([], { overall: null, byDate: {} }, {}, panelOf([]));
    expect(Object.keys(card.dimensions)[0]).toBe('humanPanel');
    expect(card.dimensions.humanPanel.current).toEqual({ prodReal: null, devEval: null });
    expect(card.dimensions.humanPanel.human).toBeNull();
  });
});
