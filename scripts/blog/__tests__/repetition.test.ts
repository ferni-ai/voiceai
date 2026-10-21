import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPost } from '../brand-gate.js';
import { forbiddenTerms } from '../brand-terms.js';
import { mentionedPrs, repeatedPhrases, words } from '../repetition.js';

const root = path.resolve(__dirname, '../../..');
const terms = forbiddenTerms(root, 'consumer');

const EARLIER = 'Today, a reply takes around two seconds, slower than we want. More soon.';

describe('repeatedPhrases', () => {
  it('finds a run of 8 words from an earlier post, ignoring case and punctuation', () => {
    const body = 'We hear you. A REPLY takes around two seconds; slower than we want, still.';
    expect(repeatedPhrases(body, [EARLIER])).toEqual([
      'a reply takes around two seconds slower than we want',
    ]);
  });

  it('lets a 7-word overlap through', () => {
    expect(repeatedPhrases('a reply takes around two seconds slower today', [EARLIER])).toEqual([]);
  });

  it('reports two separate repeats separately, and none against no posts', () => {
    const earlier = [EARLIER, 'the face settles at night and looks glad when you come back'];
    const body = `${EARLIER} Then, at last, the face settles at night and looks glad when you come back.`;
    expect(repeatedPhrases(body, earlier)).toHaveLength(2);
    expect(repeatedPhrases(body, [])).toEqual([]);
  });

  it("ignores the letter's character label, link targets and PR references", () => {
    const label =
      "*Peter is one of the characters you can talk to on Ferni. We wrote this letter in Peter's voice. Peter is a character, not a real person.*";
    const maya = label.replace(/Peter/g, 'Maya');
    expect(repeatedPhrases(`${maya}\n\nA new letter.`, [`${label}\n\nAn old one.`])).toEqual([]);
    expect(words('See [#12](https://github.com/ferni-ai/voiceai/pull/12) now')).toEqual([
      'see',
      'now',
    ]);
  });
});

describe('mentionedPrs', () => {
  it('reads #N, [#N] and /pull/N, but not an HTML entity', () => {
    const body = 'In #5 and [#6](x) and https://github.com/ferni-ai/voiceai/pull/7, not &#8.';
    expect([...mentionedPrs(body)].sort()).toEqual([5, 6, 7]);
  });
});

const post = (body: string, sources: string[]) => `---
title: "A post"
excerpt: "One line."
author: "The Ferni Team"
authorInitials: "FE"
authorColor: "#4a6741"
date: 2026-10-21
category: "Product"
readTime: 2
sources:
${sources.map((s) => `  - "${s}"`).join('\n')}
---

${body}
`;

describe('the brand gate on content', () => {
  const rules = (md: string, recentBodies?: string[]) =>
    checkPost(md, { terms, recentBodies }).map((i) => i.rule);

  it('rejects a PR listed as a source that the post never mentions', () => {
    const md = post('We changed it in [#1498](https://github.com/ferni-ai/voiceai/pull/1498).', [
      'PR #1498: fix(travel): say fares are unavailable',
      'PR #77: feat(face): settle at night',
      'brand/FERNI-CAPABILITIES.md',
    ]);
    const issues = checkPost(md, { terms });
    expect(issues).toEqual([
      { rule: 'uncited-source', message: 'lists PR #77 as a source but never mentions it' },
    ]);
    expect(rules(md.replace('pull/1498).', 'pull/1498), and #77.'))).toEqual([]);
  });

  it('rejects a post repeating 8 words of a recent post only when given the recent posts', () => {
    const md = post(`Small news. ${EARLIER}`, ['brand/FERNI-CAPABILITIES.md']);
    expect(rules(md, [EARLIER])).toEqual(['repeat-phrase']);
    expect(rules(md)).toEqual([]);
  });
});
