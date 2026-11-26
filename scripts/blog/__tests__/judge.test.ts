import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  editorNotes,
  DIMENSIONS,
  belowBar,
  claudeJudge,
  judgePost,
  judgePrompt,
  parseVerdict,
  scorecard,
  truthPack,
  type Dimension,
  type JudgeModel,
  type JudgeResult,
  type Verdict,
  rewriteIsBetter,
} from '../judge.js';
import { offFlags } from '../live-check.js';
import { POST_TYPES } from '../post-types.js';
import { buildPrompt } from '../prompt.js';

const root = path.resolve(__dirname, '../../..');
const POST = '---\ntitle: "A post"\n---\n\nWe built a small thing.\n';

/** A judge answer with every dimension at `all`, overridden per dimension. */
const answer = (all: number, over: Partial<Record<Dimension, number>> = {}): string =>
  JSON.stringify({
    ...Object.fromEntries(
      DIMENSIONS.map((d) => [d, { score: over[d] ?? all, reason: `${d} because` }])
    ),
    summary: 'Fine.',
  });

const model = (...replies: Array<string | null>): JudgeModel & { calls: () => number } => {
  const generate = vi.fn(async () => (replies.length > 1 ? replies.shift()! : replies[0]));
  return { name: 'fake-judge', generate, calls: () => generate.mock.calls.length };
};

describe('parseVerdict', () => {
  it('reads six scores and reasons, with or without a code fence', () => {
    const v = parseVerdict(`\`\`\`json\n${answer(4, { honesty: 5 })}\n\`\`\``);
    expect(v?.scores.honesty).toEqual({ score: 5, reason: 'honesty because' });
    expect(v?.scores.craft.score).toBe(4);
    expect(v?.summary).toBe('Fine.');
  });

  it('rejects a missing dimension, a score out of range, a fraction, or no JSON', () => {
    const missing = JSON.parse(answer(5)) as Record<string, unknown>;
    delete missing.impact;
    expect(parseVerdict(JSON.stringify(missing))).toBeUndefined();
    expect(parseVerdict(answer(5, { craft: 6 }))).toBeUndefined();
    expect(parseVerdict(answer(5, { craft: 0 }))).toBeUndefined();
    expect(parseVerdict(answer(4.5))).toBeUndefined();
    expect(parseVerdict('I would give it a 5')).toBeUndefined();
    expect(parseVerdict(null)).toBeUndefined();
  });
});

describe('belowBar', () => {
  const v = (all: number, over: Partial<Record<Dimension, number>> = {}) =>
    parseVerdict(answer(all, over))!;

  it('passes a consumer post at 4 everywhere and honesty 5', () => {
    expect(belowBar(v(4, { honesty: 5 }), 'consumer')).toEqual([]);
  });

  it('fails a consumer post with any dimension at 3', () => {
    expect(belowBar(v(5, { impact: 3 }), 'consumer')).toEqual(['impact 3 (needs 4)']);
  });

  it('fails a consumer post with honesty 4, even when everything else is 5', () => {
    expect(belowBar(v(5, { honesty: 4 }), 'consumer')).toEqual(['honesty 4 (needs 5)']);
  });

  it('passes a developer post at 3 with honesty 5, and fails it at 2 or honesty 4', () => {
    expect(belowBar(v(3, { honesty: 5 }), 'developer')).toEqual([]);
    expect(belowBar(v(3, { honesty: 5, craft: 2 }), 'developer')).toEqual(['craft 2 (needs 3)']);
    expect(belowBar(v(5, { honesty: 4 }), 'developer')).toEqual(['honesty 4 (needs 5)']);
  });
});

describe('judgePost', () => {
  const deps = (m: JudgeModel) => ({ model: m, truth: 'TRUTH', sourceText: 'SOURCES' });

  it('passes a post the judge scores over the bar, in one call', async () => {
    const m = model(answer(4, { honesty: 5 }));
    const r = await judgePost(POST, 'consumer', deps(m));
    expect(r).toMatchObject({ status: 'pass', model: 'fake-judge', failures: [] });
    expect(m.calls()).toBe(1);
  });

  it('fails a post under the bar and says which dimension', async () => {
    const r = await judgePost(POST, 'consumer', deps(model(answer(5, { meaningful: 2 }))));
    expect(r.status).toBe('fail');
    expect(r.failures).toEqual(['meaningful 2 (needs 4)']);
  });

  it('asks once more after an unreadable answer', async () => {
    const m = model('not json', answer(5));
    expect((await judgePost(POST, 'developer', deps(m))).status).toBe('pass');
    expect(m.calls()).toBe(2);
  });

  it('fails closed when the judge is unreachable or never answers readably', async () => {
    const r = await judgePost(POST, 'developer', deps(model(null)));
    expect(r.status).toBe('error');
    expect(r.verdict).toBeUndefined();
    expect(scorecard(r, 'developer')).toMatch(/ERROR[\s\S]*can't publish without a verdict/);
  });

  // 2026-10-26 to 2026-11-09: the repo had no ANTHROPIC_API_KEY, the judge never
  // called Claude, and every post was held as "no readable verdict".
  it('names the missing key, and calls no model, when the judge has no ANTHROPIC_API_KEY', async () => {
    const judge = claudeJudge({});
    const generate = vi.spyOn(judge, 'generate');
    const r = await judgePost(POST, 'consumer', deps(judge));
    expect(r.status).toBe('error');
    expect(r.failures).toEqual([
      'ANTHROPIC_API_KEY is not set, so the judge never ran (add it as a repo secret)',
    ]);
    expect(generate).not.toHaveBeenCalled();
    expect(scorecard(r, 'consumer')).toMatch(/ANTHROPIC_API_KEY is not set/);
  });

  it('has no missing-key reason when the key is set', () => {
    expect(claudeJudge({ ANTHROPIC_API_KEY: 'test-key' }).unavailable).toBeUndefined();
  });
});

describe('judgePrompt and truthPack', () => {
  it('gives the judge the post, the sources, the bar and the truth', () => {
    const p = judgePrompt(POST, 'consumer', 'TRUTH-PACK', 'SOURCE-PACK');
    for (const d of DIMENSIONS) expect(p).toContain(`- ${d}: `);
    expect(p).toContain('honesty is 5');
    expect(p).toContain('every score is 4 or more');
    expect(p).toMatch(/TRUTH-PACK[\s\S]*SOURCE-PACK[\s\S]*<post>\n---\ntitle: "A post"/);
    expect(judgePrompt(POST, 'developer', 'T')).toContain('every score is 3 or more');
  });

  it('holds the privacy data and every off-by-default flag, the split-out blocks included', () => {
    const truth = truthPack(root);
    expect(truth).toContain('"lastReviewed"');
    expect(truth).toMatch(/^PAYWALL$/m); // flag-manifest-entries.ts
    expect(truth).toMatch(/^EMOTION_LIFT: Ferni rests calm/m); // flag-manifest-blocks.ts
    expect(offFlags(root).has('EMOTION_LIFT')).toBe(true);
    expect(truth).toMatch(/^ALEX_CHIEF_OF_STAFF: Alex keeps/m);
  });
});

describe('scorecard', () => {
  it('tables each score and reason, without links, HTML or pipes from the model', async () => {
    const reply = JSON.parse(answer(4, { honesty: 5 })) as Record<string, { reason: string }>;
    reply.craft.reason = 'Bad | table <script>x</script> see https://evil.example.com now';
    const r = await judgePost(POST, 'consumer', {
      model: model(JSON.stringify(reply)),
      truth: 'T',
    });
    const card = scorecard(r, 'consumer');
    expect(card).toContain('| honesty | 5 | honesty because |');
    expect(card).toMatch(/\| craft \| 4 \| Bad \/ table +see +now \|/);
    expect(card).not.toMatch(/evil|<script/);
  });
});

describe('the drafter prompt', () => {
  it('tells the model a judge and the owner review consumer posts, and never "Nobody reviews it"', () => {
    const consumer = buildPrompt(POST_TYPES['how-ferni-works'], [], [], []);
    const developer = buildPrompt(POST_TYPES['whats-new'], [], [], []);
    for (const prompt of [consumer, developer]) {
      expect(prompt).not.toMatch(/nobody reviews/i);
      expect(prompt).toMatch(/A judge scores it/);
    }
    expect(consumer).toMatch(/Ferni's owner reads it/);
    expect(developer).not.toMatch(/owner/);
  });
});

describe('editorNotes', () => {
  const scores = (reason: string) =>
    Object.fromEntries(
      DIMENSIONS.map((d) => [d, { score: d === 'craft' ? 2 : 5, reason }])
    ) as Verdict['scores'];

  it('gives one note per failure, with the reason stripped of markup and capped', () => {
    const reason = `See [this](https://evil.example/x) <b>line</b>. ${'y'.repeat(900)}`;
    const [note, ...rest] = editorNotes({
      status: 'fail',
      model: 'judge',
      verdict: { scores: scores(reason), summary: '' },
      failures: ['craft 2 (needs 4)'],
    });
    expect(rest).toEqual([]);
    expect(note.startsWith('craft 2 (needs 4): See this line')).toBe(true);
    for (const bad of ['http', '<b>', '](']) expect(note).not.toContain(bad);
    expect(note.length).toBeLessThanOrEqual(
      'craft 2 (needs 4): '.length + 600 + ' [truncated]'.length
    );
    expect(note).toMatch(/\[truncated\]$/);
  });

  it('gives no notes when there is no verdict', () => {
    expect(editorNotes({ status: 'error', model: 'judge', failures: ['no verdict'] })).toEqual([]);
  });
});

describe('rewriteIsBetter', () => {
  const DIMS = ['on_message', 'brand_voice', 'honesty', 'meaningful', 'impact', 'craft'] as const;
  /** A consumer verdict from six scores in DIMENSIONS order. */
  const judged = (...scores: number[]): JudgeResult => {
    const failures = DIMS.flatMap((d, i) => {
      const need = d === 'honesty' ? 5 : 4;
      return scores[i] < need ? [`${d} ${scores[i]} (needs ${need})`] : [];
    });
    return {
      status: failures.length ? 'fail' : 'pass',
      model: 'judge',
      verdict: {
        scores: Object.fromEntries(DIMS.map((d, i) => [d, { score: scores[i], reason: 'r' }])),
        summary: 's',
      } as JudgeResult['verdict'],
      failures,
    };
  };
  const none: JudgeResult = { status: 'error', model: 'judge', failures: ['no verdict'] };

  it('never keeps a rewrite the judge gave no verdict on, or an error with scores', () => {
    expect(rewriteIsBetter(judged(3, 3, 4, 3, 3, 3), none)).toBe(false);
    expect(
      rewriteIsBetter(judged(3, 3, 4, 3, 3, 3), { ...judged(4, 3, 4, 3, 3, 3), status: 'error' })
    ).toBe(false);
  });

  it('keeps a rewrite that passes over a draft that failed, even if one score fell', () => {
    expect(rewriteIsBetter(judged(4, 4, 5, 4, 5, 3), judged(4, 4, 5, 4, 4, 4))).toBe(true);
  });

  it('keeps a rewrite with a verdict over a draft without one', () => {
    expect(rewriteIsBetter(none, judged(3, 3, 4, 3, 3, 3))).toBe(true);
  });

  it('drops the rewrite from run 44515303932: 19 down to 17, honesty 5 down to 4', () => {
    expect(rewriteIsBetter(judged(4, 3, 5, 2, 3, 2), judged(3, 2, 4, 2, 3, 3))).toBe(false);
  });

  it('drops a rewrite that trades one dimension for another', () => {
    expect(rewriteIsBetter(judged(4, 3, 5, 3, 4, 3), judged(4, 3, 4, 3, 4, 4))).toBe(false);
    expect(rewriteIsBetter(judged(4, 3, 5, 3, 4, 3), judged(4, 4, 5, 2, 4, 4))).toBe(false);
  });

  it('drops a rewrite that scores exactly the same', () => {
    expect(rewriteIsBetter(judged(4, 3, 5, 3, 4, 3), judged(4, 3, 5, 3, 4, 3))).toBe(false);
  });

  it('keeps a rewrite that is better on every failing dimension and worse on none', () => {
    expect(rewriteIsBetter(judged(3, 2, 4, 2, 4, 2), judged(4, 3, 4, 3, 4, 3))).toBe(true);
  });
});
