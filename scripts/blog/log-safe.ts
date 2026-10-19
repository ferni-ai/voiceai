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

/** The line an accepted draft prints: its title and slug. */
export function writtenSummary(title: string, file: string): string {
  return `Wrote ${JSON.stringify(title)} (slug ${path.basename(file, '.md')})`;
}

/** Every finding with the text it quotes. Only behind --details. */
export function issueDetails(issues: GateIssue[]): string[] {
  return issues.map((issue) => `  [${issue.rule}] ${issue.message}`);
}
