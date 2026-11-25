#!/usr/bin/env npx tsx
/**
 * Draft one blog post from merged PRs and the brand docs.
 *
 *   pnpm tsx scripts/blog/draft-post.ts --type <type> [--dry-run] [--since YYYY-MM-DD]
 *     [--persona maya] [--date YYYY-MM-DD] [--meta-out file.json] [--details]
 *
 * Types: see post-types.ts. --dry-run prints the prompt and sources and calls
 * no model. --meta-out writes what the workflow needs for the PR (the path,
 * the sources, and the grounding text the gate checks numbers against).
 * Exits 1 when the draft still fails the brand gate after a retry, or at once
 * when it links off the allowlist or carries raw HTML (untrusted-text.ts).
 *
 * The workflow's log is public, so a rejected draft prints only its rule
 * codes, counts and source PR numbers, and a written one its title and slug
 * (log-safe.ts). --details also prints a rejected draft and its findings, for
 * a person running this locally; the workflow never passes it.
 *
 * BLOG_REVISE=on (off by default) has the editorial judge score a draft that
 * passed the brand gate, and rewrites it once with the judge's notes when it
 * fails (draft.ts). It needs ANTHROPIC_API_KEY like judge-post.ts; without a
 * key the judge gives no verdict and the draft stands.
 */

import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { draftPost, reviseEnabled } from './draft.js';
import { renderPack, runGh, sourceList } from './grounding.js';
import { claudeJudge, judgePost, truthPack } from './judge.js';
import {
  gateRetrySummary,
  issueDetails,
  rejectedSummary,
  reviewSummary,
  writtenSummary,
} from './log-safe.js';
import { geminiModel } from './model.js';
import { getPostType } from './post-types.js';

const { values } = parseArgs({
  options: {
    type: { type: 'string' },
    since: { type: 'string' },
    persona: { type: 'string' },
    date: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'meta-out': { type: 'string' },
    details: { type: 'boolean', default: false },
  },
});

if (!values.type) {
  console.error('usage: draft-post.ts --type <type> [--dry-run] [--since YYYY-MM-DD] [--details]');
  process.exit(2);
}

const dryRun = values['dry-run'] ?? false;
const root = process.cwd();
const { audience } = getPostType(values.type);
const review =
  !dryRun && reviseEnabled()
    ? async (markdown: string, sourceText: string) =>
        judgePost(markdown, audience, { model: claudeJudge(), truth: truthPack(root), sourceText })
    : undefined;
const result = await draftPost(
  { type: values.type, since: values.since, persona: values.persona, dryRun },
  {
    root,
    repo: process.env.GITHUB_REPOSITORY || 'ferni-ai/voiceai',
    gh: runGh,
    today: values.date ?? new Date().toISOString().slice(0, 10),
    model: dryRun ? undefined : await geminiModel(),
    review,
  }
);

if (values['meta-out']) {
  const meta = {
    status: result.status,
    type: result.type,
    path: result.path,
    sources: sourceList(result.sources),
    sourceText: renderPack(result.sources),
  };
  fs.writeFileSync(values['meta-out'], JSON.stringify(meta, null, 2));
}

switch (result.status) {
  case 'dry-run':
    console.log(result.prompt);
    console.log(`\n${result.sources.length} sources. Dry run: no model called, nothing written.`);
    break;
  case 'nothing-to-draft':
    console.log(`No merged PRs to write a ${result.type} post from. Nothing written.`);
    break;
  case 'written':
    console.log(writtenSummary(result.title ?? '', result.path ?? ''));
    if (result.gateRetry?.length) console.log(gateRetrySummary(result.gateRetry));
    if (result.review) console.log(reviewSummary(result.review));
    break;
  case 'rejected':
    for (const line of rejectedSummary(result)) console.error(line);
    if (values.details) {
      for (const line of issueDetails(result.issues)) console.error(line);
      if (result.markdown) console.error(`\nLast draft:\n${result.markdown}`);
    }
    process.exit(1);
}
