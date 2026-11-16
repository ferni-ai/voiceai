import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPost, repeatedRuns, type GateIssue } from '../brand-gate.js';
import { forbiddenTerms } from '../brand-terms.js';

const root = path.resolve(__dirname, '../../..');
const consumer = forbiddenTerms(root, 'consumer');
const developer = forbiddenTerms(root, 'developer');
const sourceText =
  'PR #1498: fix(travel): say live fares are unavailable. Replies take 2.5 seconds; 40% fewer retries.';

function post(body: string, front: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    title: '"Why We Stopped Guessing Fares"',
    excerpt: '"Saying we do not know beats making something up."',
    author: '"The Ferni Team"',
    authorInitials: '"FE"',
    authorColor: '"#4a6741"',
    date: '2026-10-19',
    category: '"Building in Public"',
    readTime: '3',
    sources: '\n  - "PR #1498: fix(travel): say live fares are unavailable"',
    ...front,
  };
  const yaml = Object.entries(fields)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${yaml}\n---\n\n${body}\n`;
}

const CLEAN =
  'When Ferni had no live fares, it used to guess. Now it says so, and that change is in [#1498](https://github.com/ferni-ai/voiceai/pull/1498). Replies take 2.5 seconds, and there were 40% fewer retries. Here are three things we learned.';
const rules = (issues: GateIssue[]) => issues.map((i) => i.rule);
const check = (md: string, terms = consumer) => checkPost(md, { terms, sourceText });

describe('the brand gate', () => {
  it('passes a clean, grounded post', () => {
    expect(check(post(CLEAN))).toEqual([]);
  });

  it('fails a post missing a required front-matter field', () => {
    const issues = check(post(CLEAN, { sources: '' }));
    expect(issues).toEqual([
      { rule: 'front-matter', message: 'missing front-matter field "sources"' },
    ]);
  });

  it('fails em dashes, spaced en dashes and ellipses, also in the title', () => {
    expect(rules(check(post(`${CLEAN} It was hard—really hard.`)))).toEqual(['em-dash']);
    expect(rules(check(post(`${CLEAN} It was hard – really hard.`)))).toEqual(['em-dash']);
    expect(rules(check(post(`${CLEAN} And then...`)))).toEqual(['ellipsis']);
    expect(rules(check(post(CLEAN, { title: '"Guessing… no more"' })))).toEqual(['ellipsis']);
  });

  it('ignores dashes and ellipses inside code', () => {
    expect(check(post(`${CLEAN}\n\n\`\`\`ts\nconst all = [...items];\n\`\`\``))).toEqual([]);
  });

  it('fails forbidden words from brand-guardrails.json, as whole words', () => {
    expect(rules(check(post(`${CLEAN} Our users love it.`)))).toContain('forbidden-word');
    expect(rules(check(post(`${CLEAN} We leverage memory.`)))).toEqual(['forbidden-word']);
    expect(check(post(`${CLEAN} We sat at the bottom of the page.`))).toEqual([]); // "bot" in "bottom"
  });

  it('lets a developer post say "platform" but not a consumer post', () => {
    const md = post(`${CLEAN} The platform handles it.`);
    expect(rules(check(md))).toEqual(['forbidden-word']);
    expect(check(md, developer)).toEqual([]);
  });

  it('fails retired-stack names', () => {
    expect(rules(check(post(`${CLEAN} It runs on Gemini Live.`)))).toEqual(['retired-stack']);
    expect(rules(check(post(`${CLEAN} We moved off GCE.`)))).toEqual(['retired-stack']);
    expect(rules(check(post(`${CLEAN} Sonata voices it.`)))).toEqual(['retired-stack']);
  });

  it('fails people or stories presented as real, unless a composite label is there', () => {
    for (const claim of [
      'These are real stories from our community.',
      'Names changed, permission granted.',
      'One user told us it helped.',
      '"Ferni gets me." - Sarah, 34',
    ]) {
      expect(rules(check(post(`${CLEAN}\n\n${claim}`))), claim).toContain('real-claim');
    }
    const labelled = `${CLEAN}\n\nThese are not real stories: Sarah is a composite we wrote.`;
    expect(check(post(labelled))).toEqual([]);
  });

  it('fails numbers and percentages the sources do not have', () => {
    const issues = check(post(`${CLEAN} Retention went up 37% across 1,200 calls.`));
    expect(issues.map((i) => i.message.split('"')[1])).toEqual(['37%', '1,200']);
    expect(rules(issues)).toEqual(['number', 'number']);
  });

  it('skips the number rule only when it has no sources to check against', () => {
    const md = post(`${CLEAN} Retention went up 37%.`);
    expect(checkPost(md, { terms: consumer })).toEqual([]);
    expect(rules(checkPost(md, { terms: consumer, sourceText }))).toEqual(['number']);
  });

  it('fails a post outside its length band', () => {
    expect(
      rules(checkPost(post(CLEAN), { terms: consumer, words: { min: 500, max: 900 } }))
    ).toEqual(['length']);
  });
});

describe('the repetition rule (BLOG_REPEAT_GATE)', () => {
  const LINE = 'We would rather tell you we are not sure.';
  const repeats = (md: string) => checkPost(md, { terms: consumer, sourceText, repeats: true });
  const said = (md: string) => repeats(md).map((i) => i.message);

  it('is off unless asked for: a post that repeats itself passes as before', () => {
    const md = post(`${CLEAN} ${LINE} We fixed it. ${LINE}`);
    expect(check(md)).toEqual([]);
    expect(checkPost(md, { terms: consumer, sourceText, repeats: false })).toEqual([]);
  });

  it('passes a clean post with the rule on', () => {
    expect(repeats(post(CLEAN))).toEqual([]);
  });

  it('fails a line said twice, quoting the whole repeated stretch once', () => {
    expect(said(post(`${CLEAN} ${LINE} We fixed it. ${LINE}`))).toEqual([
      'said twice in the post: "we would rather tell you we are not sure". Say it once.',
    ]);
  });

  it('ignores repeats shorter than six words, and the case and apostrophes of a repeat', () => {
    expect(repeats(post(`${CLEAN} We do not know yet. Later, we do not know yet.`))).toEqual([]);
    expect(
      said(post(`${CLEAN} We don't know what comes next. Still, We don’t know what comes next.`))
    ).toEqual(['said twice in the post: "we don\'t know what comes next". Say it once.']);
  });

  it('ignores repeats inside code and link targets', () => {
    const code = '```ts\nconst answer = await ferni.recall(user, topic);\n```';
    expect(repeats(post(`${CLEAN}\n\n${code}\n\n${code}`))).toEqual([]);
  });

  it('fails an excerpt said again in the body, once however often it appears', () => {
    const echo = 'Saying we do not know beats making something up, every time.';
    const md = post(`${CLEAN} ${echo} We mean it. ${echo}`);
    expect(said(md)).toEqual([
      'said twice in the post: "saying we do not know beats making something up every time". Say it once.',
      'the excerpt is repeated in the body: "saying we do not know beats making something up". Say it in new words or leave it out of the body.',
    ]);
  });

  it('reports at most six repeats', () => {
    const lines = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'].map(
      (w) => `The ${w} team kept the notes nearby.`
    );
    const body = `${CLEAN} ${lines.join(' ')} Then again. ${lines.join(' Then. ')}`;
    expect(said(post(body))).toHaveLength(6);
  });
});

describe('repeatedRuns', () => {
  const w = (s: string) => s.split(' ');

  it('takes the longest match and does not report its tail again', () => {
    expect(repeatedRuns(w('a b c d e f g h x a b c d e f g h'))).toEqual(['a b c d e f g h']);
  });

  it('does not count a stretch that overlaps its own earlier copy', () => {
    expect(repeatedRuns(w('la la la la la la la'))).toEqual([]);
  });

  it('finds stretches of one text that appear in another', () => {
    expect(repeatedRuns(w('x a b c d e f y'), w('a b c d e f'))).toEqual(['a b c d e f']);
    expect(repeatedRuns(w('x a b c d e y'), w('a b c d e'))).toEqual([]);
  });
});
