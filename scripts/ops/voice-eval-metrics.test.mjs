import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  evaluateBargeInFromEval,
  evaluateFirstAudioFromEval,
  evaluateMemoryFromRecall,
  metricsSource,
  readEvalJson,
} from './voice-eval-metrics.mjs';

const pooled = readEvalJson(resolve(__dirname, 'fixtures/voice-eval-pooled.json'));
const recall = readEvalJson(resolve(__dirname, 'fixtures/voice-eval-recall.json'));

describe('metricsSource', () => {
  it('reads the voice-eval file when it is given, even with OBS_URL set', () => {
    expect(metricsSource({ VOICE_EVAL_RESULT: 'p.json', OBS_URL: 'http://x' })).toEqual({
      kind: 'eval',
      path: 'p.json',
    });
  });

  it('keeps the observability path when only OBS_URL is set', () => {
    expect(metricsSource({ OBS_URL: 'http://localhost:8080/api/observability' })).toEqual({
      kind: 'obs',
      url: 'http://localhost:8080/api/observability',
    });
  });

  it('has no default URL: with neither, it says what to pass', () => {
    const source = metricsSource({});
    expect(source.kind).toBe('missing');
    expect(source.error).toMatch(/VOICE_EVAL_RESULT=/);
    expect(source.error).toMatch(/OBS_URL=/);
  });

  it('names the check-specific variable', () => {
    expect(metricsSource({}, 'VOICE_EVAL_RECALL').error).toMatch(/VOICE_EVAL_RECALL=/);
  });
});

describe('readEvalJson', () => {
  it('fails clearly on a missing file', () => {
    expect(() => readEvalJson('/nonexistent/pooled.json')).toThrow(/Cannot read voice-eval result/);
  });
});

describe('evaluateFirstAudioFromEval', () => {
  it('passes when reply delay p50 is within the SLO', () => {
    expect(evaluateFirstAudioFromEval(pooled, 3000)).toMatchObject({
      ok: true,
      replyDelayP50Ms: 1180,
      replyDelayP90Ms: 1920,
      samples: 24,
    });
  });

  it('fails when reply delay p50 is over the SLO', () => {
    expect(evaluateFirstAudioFromEval(pooled, 1000).ok).toBe(false);
  });

  it('fails as not measured when there are no reply delays', () => {
    const result = evaluateFirstAudioFromEval(
      { replyDelayMs: { p50: null, p90: null, n: 0 } },
      3000
    );
    expect(result).toMatchObject({ ok: false, notMeasured: true });
    expect(result.reason).toMatch(/Not measured/);
  });
});

describe('evaluateBargeInFromEval', () => {
  it('passes when every interrupt stopped the agent within the SLO', () => {
    expect(evaluateBargeInFromEval(pooled, 500)).toMatchObject({
      ok: true,
      interruptStopP50Ms: 420,
      interrupts: 3,
    });
  });

  it('fails when stop latency p50 is over the SLO', () => {
    expect(evaluateBargeInFromEval(pooled, 400).ok).toBe(false);
  });

  it('fails when the agent talked through an interrupt', () => {
    const result = evaluateBargeInFromEval(
      { talkOver: { ...pooled.talkOver, interruptYielded: 2 } },
      500
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/kept talking through 1 interrupt/);
  });

  it('fails as not measured without talk-over runs instead of skipping', () => {
    const result = evaluateBargeInFromEval({ replyDelayMs: pooled.replyDelayMs }, 500);
    expect(result).toMatchObject({ ok: false, notMeasured: true });
    expect(result.reason).toMatch(/talk-over/);
  });
});

describe('evaluateMemoryFromRecall', () => {
  it('passes when the pooled recall rate meets the minimum', () => {
    expect(evaluateMemoryFromRecall(recall, 0.1)).toMatchObject({
      ok: true,
      recallRate: 0.63,
      calls: 4,
    });
  });

  it('fails when the recall rate is under the minimum', () => {
    expect(evaluateMemoryFromRecall({ ...recall, mean: 0.05 }, 0.1).ok).toBe(false);
  });

  it('fails as not measured when given score.mjs output instead of recall output', () => {
    expect(evaluateMemoryFromRecall(pooled, 0.1)).toMatchObject({ ok: false, notMeasured: true });
  });
});
