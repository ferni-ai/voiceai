/**
 * What the drafter and the gate print. Their output lands in the public
 * GitHub Actions log, so a rejected draft must not reach it: a draft rejected
 * for an injected link or script would otherwise be published there instead
 * of on the site. A rejected draft or a failed gate prints its rule codes,
 * counts and source PR numbers only: never the draft, its link targets, or
 * the text a finding quotes. An accepted draft prints its title and slug.
 * `--details` prints everything, for a person running the script locally.
 */

import * as path from 'node:path';
import type { GateIssue } from './brand-gate.js';
import type { Source } from './grounding.js';
import type { JudgeResult } from './judge.js';
import { DIMENSIONS } from './rubric.js';

/** "em-dash x2, number x1": each rule once, in the order first found. */
export function ruleCounts(issues: GateIssue[]): string {
  const counts = new Map<string, number>();
  for (const { rule } of issues) counts.set(rule, (counts.get(rule) ?? 0) + 1);
  return [...counts].map(([rule, n]) => `${rule} x${n}`).join(', ');
}

/** Links in the post body (front matter left out): markdown targets, bare URLs and www. hosts. */
export function linkCount(markdown: string): number {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  return (body.match(/\]\([^)]*\)|https?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/gi) ?? []).length;
}

/** The PR numbers among the sources, ascending. */
export function prNumbers(sources: Source[]): number[] {
  return sources
    .map((s) => (s as { number?: unknown }).number)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b);
}

interface Rejected {
  type: string;
  issues: GateIssue[];
  sources: Source[];
  markdown?: string;
}

/** The lines a rejected draft may print: rule codes, counts and source PR numbers. */
export function rejectedSummary(r: Rejected): string[] {
  const prs = prNumbers(r.sources);
  const docs = r.sources.length - prs.length;
  const draft = r.markdown
    ? `${r.markdown.length} characters, ${linkCount(r.markdown)} links`
    : 'none readable';
  return [
    `The ${r.type} draft was rejected; nothing written.`,
    `  reasons: ${ruleCounts(r.issues)}`,
    `  draft: ${draft}`,
    `  sources: ${prs.length > 0 ? prs.map((n) => `#${n}`).join(', ') : 'no PRs'}, ${docs} docs`,
    '  The draft and the findings are not printed (this log is public); rerun with --details locally.',
  ];
}

/**
 * The judge's scores on the first clean draft and whether a rewrite replaced
 * it. Scores only: the reasons quote the post.
 */
export function reviewSummary(review: {
  before: JudgeResult;
  after?: JudgeResult;
  revised: boolean;
}): string {
  const { before, after, revised } = review;
  const scores = (r: JudgeResult) =>
    r.verdict
      ? `${r.status} (${DIMENSIONS.map((d) => `${d} ${r.verdict!.scores[d].score}`).join(', ')})`
      : `${r.status} (no verdict)`;
  const outcome = revised
    ? 'rewritten once with its notes, and the rewrite is kept'
    : after
      ? 'rewritten once with its notes, but the rewrite scored no better, so the first draft stands'
      : before.status === 'fail' && before.verdict
        ? "the rewrite wasn't kept (brand gate, unreadable or unsafe), so the first draft stands"
        : 'kept as drafted';
  const rewrite = after ? `; judge on the rewrite: ${scores(after)}` : '';
  return `Judge before revision: ${scores(before)}${rewrite}; ${outcome}`;
}

/** Which gate rules sent the first draft back, by name only: the findings quote the post. */
export function gateRetrySummary(rules: string[]): string {
  return `Brand gate sent the first draft back once (${rules.join(', ')}); the retry passed`;
}

/** The line an accepted draft prints: its title and slug. */
export function writtenSummary(title: string, file: string): string {
  return `Wrote ${JSON.stringify(title)} (slug ${path.basename(file, '.md')})`;
}

/** Every finding with the text it quotes. Only behind --details. */
export function issueDetails(issues: GateIssue[]): string[] {
  return issues.map((issue) => `  [${issue.rule}] ${issue.message}`);
}
