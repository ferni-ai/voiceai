import { describe, expect, it } from 'vitest';
import {
  METRICS,
  byCall,
  compare,
  parseArms,
  quantile,
  quantileDiff,
  report,
  shares,
} from '../ab-receipts.mjs';

const receipt = (sessionId, turn, timing = {}, extra = {}) => ({
  event: 'TURN_RECEIPT',
  sessionId,
  turn,
  timing: { eouDelayMs: 300, llmTtftMs: 800, llmReadyMs: 1100, firstAudioMs: 1400, ...timing },
  tokens: { prompt: 10000, promptCached: 0, completion: 20 },
  pauseHoldMs: 0,
  turnDetection: 'stt',
  ...extra,
});

/** An arm of `calls` calls, 5 turns each, with the model's first token at ttft (+ a little spread). */
function arm(name, calls, ttft, extra = {}) {
  const receipts = [];
  for (let c = 0; c < calls; c++) {
    for (let t = 1; t <= 5; t++) {
      receipts.push(
        receipt(`${name}_${c}`, t, { llmTtftMs: ttft + ((c * 7 + t * 13) % 40) }, extra)
      );
    }
  }
  return { name, receipts };
}

describe('quantile', () => {
  it('interpolates between ranks', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, 0, 20], 0.5)).toBe(10);
    expect(quantile([0, 100], 0.9)).toBe(90);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe('byCall', () => {
  it('groups values by call and drops turns without one', () => {
    const rs = [
      receipt('A', 1, { llmTtftMs: 500 }),
      receipt('A', 2, { llmTtftMs: null }),
      receipt('B', 1, { llmTtftMs: 700 }),
      receipt('A', 3, { llmTtftMs: 600 }),
    ];
    expect(byCall(rs, (r) => r.timing.llmTtftMs)).toEqual([[500, 600], [700]]);
  });
});

describe('quantileDiff', () => {
  it('finds a 300 ms cut with an interval that excludes zero', () => {
    const off = byCall(arm('off', 12, 800).receipts, (r) => r.timing.llmTtftMs);
    const on = byCall(arm('on', 12, 500).receipts, (r) => r.timing.llmTtftMs);
    const d = quantileDiff(off, on, 0.5);
    expect(d.diff).toBeGreaterThan(-320);
    expect(d.diff).toBeLessThan(-280);
    expect(d.high).toBeLessThan(0);
    expect(d.low).toBeLessThanOrEqual(d.diff);
  });

  it('gives an interval spanning zero when the arms are the same', () => {
    const a = byCall(arm('a', 12, 800).receipts, (r) => r.timing.llmTtftMs);
    const b = byCall(arm('b', 12, 800).receipts, (r) => r.timing.llmTtftMs);
    const d = quantileDiff(a, b, 0.5);
    expect(d.low).toBeLessThanOrEqual(0);
    expect(d.high).toBeGreaterThanOrEqual(0);
  });

  it('draws no interval from a single call', () => {
    expect(quantileDiff([[1, 2]], [[3], [4]], 0.5)).toBeNull();
  });

  it('prints the same numbers on every run', () => {
    const a = byCall(arm('a', 6, 800).receipts, (r) => r.timing.llmTtftMs);
    const b = byCall(arm('b', 6, 700).receipts, (r) => r.timing.llmTtftMs);
    expect(quantileDiff(a, b, 0.9)).toEqual(quantileDiff(a, b, 0.9));
  });
});

describe('compare', () => {
  it('reports the cached share and the change against the first arm', () => {
    const off = arm('off', 4, 800);
    const on = arm('on', 4, 600, { tokens: { prompt: 10000, promptCached: 9000, completion: 20 } });
    const result = compare([off, on]);
    const cached = result.metrics.find((m) => m.metric === 'cachedPct');
    expect(cached.arms[0].p50).toBe(0);
    expect(cached.arms[1].p50).toBe(90);
    expect(cached.arms[1].vsBase.p50.diff).toBe(90);
    const ttft = result.metrics.find((m) => m.metric === 'llmTtftMs');
    expect(ttft.arms[0].vsBase).toBeUndefined();
    expect(ttft.arms[1].vsBase.p50.diff).toBeLessThan(-150);
    expect(ttft.arms[1]).toMatchObject({ n: 20, calls: 4 });
  });

  it('counts which turn detector ended the turns in each arm', () => {
    const ink = arm('ink', 2, 800);
    const det = arm('detector', 2, 800, { eot: { model: 'turn-detector-v1' } });
    det.receipts[0].eot = { model: 'turn-detector-v1-mini' };
    det.receipts.forEach((r) => (r.turnDetection = 'model'));
    const result = compare([ink, det]);
    expect(result.labels[0]).toMatchObject({ turnDetection: { stt: 10 }, eotModel: {} });
    expect(result.labels[1].eotModel).toEqual({
      'turn-detector-v1': 9,
      'turn-detector-v1-mini': 1,
    });
    expect(report(result)).toMatch(
      /detector: turns 10 {2}turnDetection \{"model":10\} {2}eot model/
    );
  });
});

describe('shares', () => {
  it('skips turns without the label', () => {
    expect(shares([{ a: 'x' }, { a: 'x' }, {}, { a: null }], (r) => r.a)).toEqual({ x: 2 });
  });
});

describe('parseArms', () => {
  it('reads name=session,session', () => {
    expect(parseArms(['off=RM_a,RM_b', 'on=RM_c'])).toEqual([
      { name: 'off', sessions: ['RM_a', 'RM_b'] },
      { name: 'on', sessions: ['RM_c'] },
    ]);
  });

  it('wants two arms, names and sessions, and no call in two arms', () => {
    expect(() => parseArms(['off=RM_a'])).toThrow(/at least two/);
    expect(() => parseArms(['off', 'on=RM_c'])).toThrow(/name=session/);
    expect(() => parseArms(['off=RM_a', 'on=RM_a'])).toThrow(/more than one arm/);
  });
});

describe('tool-turn metrics', () => {
  const pick = (name, r) => METRICS.find((m) => m.name === name).pick(r);
  it('reads the answer, requests and tool run time from a tool turn', () => {
    const r = receipt(
      'A',
      1,
      {
        firstAudioMs: 1300,
        requests: [
          { startMs: -400, ttftMs: null, durationMs: 300, cancelled: true },
          { startMs: 150, ttftMs: 950, durationMs: 1200 },
          { startMs: 2000, ttftMs: 900, durationMs: 1500 },
        ],
      },
      {
        tools: { called: ['getWeather'], execMs: { getWeather: 120, getNews: 30 } },
        audio: { answerAudioMs: 3100, ackClipMs: null },
      }
    );
    expect(pick('toolFirstAudioMs', r)).toBe(1300);
    expect(pick('answerAudioMs', r)).toBe(3100);
    expect(pick('llmRequests', r)).toBe(2); // the dropped preemptive one is not counted
    expect(pick('toolExecMs', r)).toBe(150);
  });

  it('leaves no-tool turns and older receipts out', () => {
    const r = receipt('A', 1, {}, { tools: { called: [] } });
    for (const name of [
      'toolFirstAudioMs',
      'answerAudioMs',
      'ackClipMs',
      'llmRequests',
      'toolExecMs',
    ])
      expect(pick(name, r) ?? null).toBeNull();
  });
});
