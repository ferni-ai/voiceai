#!/usr/bin/env npx tsx
/**
 * Run the editorial judge (judge.ts) on a post.
 *
 *   pnpm tsx scripts/blog/judge-post.ts <file.md> [--meta draft-meta.json] [--out scorecard.md]
 *
 * Needs ANTHROPIC_API_KEY (and ANTHROPIC_WORKSPACE_ID for an organization key);
 * BLOG_JUDGE_MODEL and BLOG_JUDGE_EFFORT override the model and effort.
 * --meta (from draft-post.ts --meta-out) gives the judge the draft's sources.
 * --out writes the scorecard for the PR body. Exits 0 when the post passes,
 * 1 when it fails or the judge gave no verdict.
 *
 * The workflow's log is public, so this prints scores and the dimensions under
 * the bar only; the reasons, which quote the post, go to --out.
 */

import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { DIMENSIONS, claudeJudge, judgePost, scorecard, truthPack } from './judge.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { meta: { type: 'string' }, out: { type: 'string' } },
});
const file = positionals[0];
if (!file) {
  console.error('usage: judge-post.ts <file.md> [--meta draft-meta.json] [--out scorecard.md]');
  process.exit(2);
}

const audience = file.includes('developers-portal/') ? 'developer' : 'consumer';
const sourceText = values.meta
  ? (JSON.parse(fs.readFileSync(values.meta, 'utf-8')) as { sourceText?: string }).sourceText
  : undefined;
const result = await judgePost(fs.readFileSync(file, 'utf-8'), audience, {
  model: claudeJudge(),
  truth: truthPack(process.cwd()),
  sourceText,
});

if (values.out) fs.writeFileSync(values.out, `${scorecard(result, audience)}\n`);
const scores = result.verdict
  ? DIMENSIONS.map((d) => `${d} ${result.verdict!.scores[d].score}`).join(', ')
  : 'no verdict';
console.log(`Judge (${result.model}, ${audience}): ${result.status} (${scores})`);
if (result.status !== 'pass') {
  console.error(`  below the bar: ${result.failures.join('; ')}`);
  process.exit(1);
}
