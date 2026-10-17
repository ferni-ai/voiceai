import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPost, type GateIssue } from '../brand-gate.js';
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
