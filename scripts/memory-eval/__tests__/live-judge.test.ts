import { describe, expect, it } from 'vitest';

import {
  LIVE_JUDGE_CASES,
  LIVE_JUDGE_DAY,
  LIVE_JUDGE_MAX_TOKENS,
  LIVE_RULE,
  liveJudgePrompt,
  parseLiveVerdict,
} from '../live/live-judge.js';
import { judgePrompt } from '../longmem-lib.js';

describe('liveJudgePrompt', () => {
  it("keeps the benchmark's prompt and adds the live rule before the format line", () => {
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
      base.at(-1),
    ]);
    expect(live.at(-1)).toBe('Reply with exactly one word: yes or no.');
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
  it('reads a bare verdict, or the last word after reasoning', () => {
    expect(parseLiveVerdict('yes')).toBe(true);
    expect(parseLiveVerdict('No.')).toBe(false);
    expect(parseLiveVerdict('Friday is 2026-10-09, so it matches.\n\nyes')).toBe(true);
    expect(parseLiveVerdict('It names Thursday, not Friday.\n\n**No**')).toBe(false);
  });
  it('is null when there is no verdict (a judge failure, not a no)', () => {
    expect(parseLiveVerdict('To determine if the response is')).toBeNull();
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
