#!/usr/bin/env npx tsx
/**
 * Run the brand gate on a post.
 *
 *   pnpm tsx scripts/blog/check-post.ts <file.md> [--meta draft-meta.json]
 *
 * With --meta (written by draft-post.ts --meta-out) numbers are checked
 * against the draft's grounding; without it that rule is skipped.
 */

import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { checkPost } from './brand-gate.js';
import { forbiddenTerms } from './brand-terms.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { meta: { type: 'string' } },
});
const file = positionals[0];
if (!file) {
  console.error('usage: check-post.ts <file.md> [--meta draft-meta.json]');
  process.exit(2);
}

const audience = file.includes('developers-portal/') ? 'developer' : 'consumer';
const sourceText = values.meta
  ? (JSON.parse(fs.readFileSync(values.meta, 'utf-8')) as { sourceText: string }).sourceText
  : undefined;
const issues = checkPost(fs.readFileSync(file, 'utf-8'), {
  terms: forbiddenTerms(process.cwd(), audience),
  sourceText,
});

if (sourceText === undefined)
  console.log('Numbers not checked: no --meta with the grounding sources.');
if (issues.length === 0) {
  console.log(`${file}: passes the brand gate (${audience} rules).`);
} else {
  console.error(`${file}: ${issues.length} brand gate issue(s) (${audience} rules):`);
  for (const issue of issues) console.error(`  [${issue.rule}] ${issue.message}`);
  process.exit(1);
}
