#!/usr/bin/env npx tsx
/**
 * Run the brand gate on a post, and with --live the live check too.
 *
 *   pnpm tsx scripts/blog/check-post.ts <file.md> [--meta draft-meta.json] [--live]
 *     [--date YYYY-MM-DD]
 *
 * With --meta (written by draft-post.ts --meta-out) numbers are checked
 * against the draft's grounding. --live fetches every PR the post links to or
 * lists in `sources` (needs `gh`) and fails the post if any is not merged or
 * not live (live-check.ts); without --meta, numbers are then checked against
 * those PRs and the house facts. With neither, the number rule is skipped.
 */

import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { checkPost, type GateIssue } from './brand-gate.js';
import { forbiddenTerms } from './brand-terms.js';
import { HOUSE_FACTS, renderPack, runGh, type Source } from './grounding.js';
import { citedPrNumbers, notLiveReason, offFlags, type LiveContext } from './live-check.js';
import { unsafeOutput } from './untrusted-text.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    meta: { type: 'string' },
    live: { type: 'boolean', default: false },
    date: { type: 'string' },
  },
});
const file = positionals[0];
if (!file) {
  console.error('usage: check-post.ts <file.md> [--meta draft-meta.json] [--live]');
  process.exit(2);
}

interface RestPr {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
}

/** The live check's findings, and the cited PRs as grounding. */
function liveCheck(markdown: string, ctx: LiveContext): { issues: GateIssue[]; sources: Source[] } {
  const off = offFlags(ctx.root);
  const issues: GateIssue[] = [];
  const sources: Source[] = [];
  for (const n of citedPrNumbers(markdown)) {
    const pr = JSON.parse(ctx.gh(['api', `repos/${ctx.repo}/pulls/${n}`])) as RestPr;
    const body = pr.body ?? '';
    sources.push({
      label: `PR #${n}: ${pr.title}`,
      url: pr.html_url,
      text: `${pr.title}\n\n${body}`,
    });
    const reason = pr.merged_at
      ? notLiveReason({ number: n, title: pr.title, body, mergedAt: pr.merged_at }, ctx, off)
      : 'is not merged';
    if (reason) issues.push({ rule: 'not-live', message: `PR #${n} ${reason}` });
  }
  return { issues, sources };
}

const markdown = fs.readFileSync(file, 'utf-8');
const audience = file.includes('developers-portal/') ? 'developer' : 'consumer';
const ctx: LiveContext = {
  root: process.cwd(),
  repo: process.env.GITHUB_REPOSITORY || 'ferni-ai/voiceai',
  gh: runGh,
  today: values.date ?? new Date().toISOString().slice(0, 10),
};
const live = values.live ? liveCheck(markdown, ctx) : undefined;
const sourceText = values.meta
  ? (JSON.parse(fs.readFileSync(values.meta, 'utf-8')) as { sourceText: string }).sourceText
  : live && renderPack([...live.sources, HOUSE_FACTS]);
const issues = [
  ...checkPost(markdown, { terms: forbiddenTerms(process.cwd(), audience), sourceText }),
  ...unsafeOutput(markdown),
  ...(live?.issues ?? []),
];

if (sourceText === undefined)
  console.log('Numbers not checked: no --meta or --live to ground them.');
if (!live) console.log('Live check skipped: no --live.');
const checks = live ? 'brand gate and live check' : 'brand gate';
if (issues.length === 0) {
  console.log(`${file}: passes the ${checks} (${audience} rules).`);
} else {
  console.error(`${file}: ${issues.length} issue(s) from the ${checks} (${audience} rules):`);
  for (const issue of issues) console.error(`  [${issue.rule}] ${issue.message}`);
  process.exit(1);
}
