import { describe, expect, it } from 'vitest';

import {
  LIVE_JUDGE_CASES,
  LIVE_JUDGE_DAY,
  LIVE_FORMAT,
  LIVE_JUDGE_MAX_TOKENS,
  LIVE_RULE,
  liveJudgePrompt,
  parseLiveVerdict,
} from '../live/live-judge.js';
import { judgePrompt } from '../longmem-lib.js';

describe('liveJudgePrompt', () => {
  it("keeps the benchmark's prompt, adds the call's day and the live rule, and asks for a VERDICT line", () => {
    const base = judgePrompt('temporal', 'q', 'Friday 2026-10-09', 'It was Friday.').split('\n');
    const live = liveJudgePrompt(
      'temporal',
      'q',
      'Friday 2026-10-09',
      'It was Friday.',
      LIVE_JUDGE_DAY
    ).split('\n');
    expect(live).toEqual([
      ...base.slice(0, -1),
      `The call was on ${LIVE_JUDGE_DAY}.`,
      LIVE_RULE,
      LIVE_FORMAT,
    ]);
    expect(live.at(-1)).toMatch(/VERDICT: yes or VERDICT: no$/);
  });

  it('is only for live calls: the benchmark prompt has no live rule', () => {
    expect(judgePrompt('multi-session', 'q', 'g', 'r')).not.toContain(LIVE_RULE);
  });

  it('pins each false-wrong case with a wrong answer to the same question', () => {
    for (const right of LIVE_JUDGE_CASES.filter((c) => c.right)) {
      const control = LIVE_JUDGE_CASES.find(
        (c) => !c.right && c.ask === right.ask && c.gold === right.gold
      );
      expect(control?.response).toBeTruthy();
      expect(control?.response).not.toBe(right.response);
    }
    expect(LIVE_JUDGE_CASES.filter((c) => c.right)).toHaveLength(3);
  });
});

/**
 * The real judge on the six cases (Vertex, ~12 small calls):
 *   LIVE_JUDGE_CHECK=1 GOOGLE_CLOUD_PROJECT=johnb-2025 pnpm vitest run scripts/memory-eval/__tests__/live-judge.test.ts
 */
describe('parseLiveVerdict', () => {
  it('reads the VERDICT line, whatever the reasoning before it says', () => {
    expect(parseLiveVerdict('VERDICT: yes')).toBe(true);
    expect(
      parseLiveVerdict(
        'No, the reply does not name a day outright. It says Friday, which counts.\nVERDICT: yes'
      )
    ).toBe(true);
    expect(parseLiveVerdict('Yes, it names Thursday, which is wrong.\n\nVERDICT: no')).toBe(false);
    expect(parseLiveVerdict('Reasoning.\n**VERDICT: no**')).toBe(false);
  });
  it('takes the last VERDICT line when the judge writes more than one', () => {
    expect(parseLiveVerdict('VERDICT: no\nOn reflection:\nVERDICT: yes')).toBe(true);
  });
  it('is null without a VERDICT line: a bare yes, a truncated reply, or nothing', () => {
    expect(parseLiveVerdict('yes')).toBeNull();
    expect(parseLiveVerdict('The reply says Friday, which matches 2026-10-09 so')).toBeNull();
    expect(parseLiveVerdict('VERDICT: maybe')).toBeNull();
    expect(parseLiveVerdict(null)).toBeNull();
  });
});

describe.runIf(process.env.LIVE_JUDGE_CHECK === '1')('the live judge on the pinned cases', () => {
  it('says yes to the three right answers and no to their controls', async () => {
    const { callLLM } = await import('../../../src/services/llm-utils.js');
    const verdicts = await Promise.all(
      LIVE_JUDGE_CASES.map(async (c) =>
        parseLiveVerdict(
          await callLLM(liveJudgePrompt(c.category, c.ask, c.gold, c.response, LIVE_JUDGE_DAY), {
            temperature: 0,
            maxTokens: LIVE_JUDGE_MAX_TOKENS,
          })
        )
      )
    );
    expect(verdicts).toEqual(LIVE_JUDGE_CASES.map((c) => c.right));
  }, 60_000);
});
