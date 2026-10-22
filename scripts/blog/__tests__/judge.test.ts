import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DIMENSIONS,
  belowBar,
  judgePost,
  judgePrompt,
  parseVerdict,
  scorecard,
  truthPack,
  type Dimension,
  type JudgeModel,
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
    expect(truth).toMatch(/^EMOTION_LIFT$/m); // flag-manifest-blocks.ts
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
  it('tells the model a judge reviews the post, and never "Nobody reviews it"', () => {
    for (const id of ['how-ferni-works', 'whats-new']) {
      const prompt = buildPrompt(POST_TYPES[id], [], [], []);
      expect(prompt).not.toMatch(/nobody reviews/i);
      expect(prompt).toMatch(/A judge scores it/);
    }
  });
});
