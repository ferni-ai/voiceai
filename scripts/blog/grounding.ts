/**
 * The grounding pack: every fact a draft may use, with where it came from.
 * The model is told to use only these, the gate checks numbers against them,
 * and the draft lists them as `sources` so a reader can check them.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_PR_BODY, stripMarkup, trustedAuthor } from './untrusted-text.js';

export interface Source {
  /** Short label for the draft's `sources` list, e.g. "PR #1498: fix(travel): ..." */
  label: string;
  url?: string;
  text: string;
}

/** A merged PR as a source; `title` lets callers pick which kinds of change to keep. */
export interface PrSource extends Source {
  number: number;
  title: string;
  /** The whole body, for the live check only: the model reads `text`. */
  body: string;
  mergedAt: string;
}

/** Runs `gh` with arguments; injectable so tests never touch the network. */
export type GhRunner = (args: string[]) => string;

export const runGh: GhRunner = (args) =>
  execFileSync('gh', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });

interface RestPr {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  updated_at: string;
  user: { login: string; type: string } | null;
  author_association?: string;
  head: { ref: string };
}

/**
 * Merged PRs since a date, newest first, via REST (GraphQL is unavailable to
 * some callers). Pages by `updated` and stops once a page is older than `since`.
 * Only PRs by org members or collaborators count (untrusted-text.ts); bot PRs
 * and earlier blog drafts are left out. What the model reads of a PR has no
 * comments, footers, HTML or URLs, and is cut to MAX_PR_BODY.
 */
export function fetchMergedPrs(since: string, repo: string, gh: GhRunner = runGh): PrSource[] {
  const prs: PrSource[] = [];
  const trusted = new Map<string, boolean>();
  for (let page = 1; page <= 10; page++) {
    const url = `repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`;
    const batch = JSON.parse(gh(['api', url])) as RestPr[];
    for (const pr of batch) {
      if (!pr.merged_at || pr.merged_at < since) continue;
      if (pr.head.ref.startsWith('blog/') || !trustedAuthor(pr, repo, gh, trusted)) continue;
      const body = (pr.body ?? '').replace(/<!--[\s\S]*?-->|🤖 Generated with[\s\S]*$/g, '').trim();
      const title = stripMarkup(pr.title);
      const clean = stripMarkup(body);
      const cut = clean.length > MAX_PR_BODY ? `${clean.slice(0, MAX_PR_BODY)} [truncated]` : clean;
      prs.push({
        label: `PR #${pr.number}: ${title}`,
        url: pr.html_url,
        text: `${title}\n\n${cut}`,
        number: pr.number,
        title,
        body,
        mergedAt: pr.merged_at,
      });
    }
    if (batch.length < 100 || batch[batch.length - 1].updated_at < since) break;
  }
  return prs.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
}

/**
 * A repo document, or the part of it from `fromHeading` to the next heading of
 * the same level, cut to `maxChars`. A missing file is an error: a draft must
 * not quietly lose its grounding.
 */
export function docSource(
  root: string,
  file: string,
  opts: { fromHeading?: string; maxChars?: number } = {}
): Source {
  let text = fs.readFileSync(path.join(root, file), 'utf-8');
  if (opts.fromHeading) {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.trim() === opts.fromHeading);
    if (start < 0) throw new Error(`${file}: heading "${opts.fromHeading}" not found`);
    const level = opts.fromHeading.match(/^#+/)?.[0] ?? '#';
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => new RegExp(`^#{1,${level.length}} `).test(l));
    text = [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
  }
  const max = opts.maxChars ?? 6000;
  const label = opts.fromHeading ? `${file} (${opts.fromHeading.replace(/^#+\s*/, '')})` : file;
  return { label, text: text.length > max ? `${text.slice(0, max)} [truncated]` : text };
}

/**
 * What's true about Ferni today, from PR #1176's audit of the blog. They are
 * constraints, not material: fed in as facts, the model wrote them into every
 * post word for word (the 2026-10-21 review), so the prompt says never to
 * contradict them and not to mention them unless the post is about them.
 * Consumer posts only, and never a character's letter.
 */
export const HOUSE_CONSTRAINTS = [
  'Ferni is new and has very few users. There are no user stories, quotes, testimonials or usage numbers, so never invent one.',
  'A reply from Ferni takes around two seconds today, slower than we want.',
  'Changes run on a development agent first and reach production later.',
];

/** The pack as the model reads it: numbered, each with its source. */
export function renderPack(sources: Source[]): string {
  return sources
    .map((s, i) => `[${i + 1}] ${s.label}${s.url ? ` <${s.url}>` : ''}\n${s.text.trim()}`)
    .join('\n\n---\n\n');
}

/** The draft's `sources` front-matter list. */
export function sourceList(sources: Source[]): string[] {
  return sources.map((s) => (s.url ? `${s.label} (${s.url})` : s.label));
}
