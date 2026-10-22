/** Which facts each post type is grounded in. */

import { docSource, fetchMergedPrs, type GhRunner, type Source } from './grounding.js';
import { liveOnly, prFiles } from './live-check.js';
import { personaSources, type LetterPersona } from './team-letter.js';
import type { PostType } from './post-types.js';
import { trustedAuthor, type PrAuthor } from './untrusted-text.js';

export interface SourceContext {
  root: string;
  repo: string;
  gh: GhRunner;
  /** ISO date: PRs merged on or after it count. */
  since: string;
  /** YYYY-MM-DD: for the live check's settling period. */
  today: string;
  persona: LetterPersona;
  /** PRs earlier posts in this blog cite; whats-new leaves them out. */
  covered?: Set<number>;
}

/** What someone outside the repo could notice (any change, or features only). */
const KINDS = { any: /./, noticeable: /^(?:feat|fix|perf)\b/, feature: /^feat\b/ };
const BRAND_OVERVIEW = { fromHeading: '# 1. Brand Overview', maxChars: 3000 };
const LESS_ALONE = 'apps/website/ferni-website/src/blog/ai-should-make-you-feel-less-alone.md';

/** Merged PRs of a kind that are live (live-check.ts): developer posts publish with no person reviewing them. */
function prs(ctx: SourceContext, limit: number, kind: keyof typeof KINDS): Source[] {
  const candidates = fetchMergedPrs(ctx.since, ctx.repo, ctx.gh).filter((pr) =>
    KINDS[kind].test(pr.title)
  );
  return liveOnly(candidates, ctx, limit);
}

/** What developers building on Ferni use: the developer portal (not its blog) and the developer API. */
export const DEVELOPER_PATHS =
  /^(?:apps\/website\/developers-portal\/(?!src\/blog\/)|src\/api\/v1\/developers\/)/;

/**
 * The drafter's own branch name (blog-drafts.yml), with the run id it adds when
 * that day's branch already exists.
 */
const DRAFT_BRANCH = /^blog\/draft-whats-new-\d{4}-\d{2}-\d{2}(?:-\d+)?$/;

interface OpenPr extends PrAuthor {
  head: { ref: string; repo: { full_name: string } | null };
  body: string | null;
}

/** The PRs the drafter's generated `### Sources` list names ("- PR #N: ..."), and nothing else. */
export function sourcesListPrs(body: string): number[] {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === '### Sources');
  if (start < 0) return [];
  const found: number[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^- PR #(\d+): /.exec(line);
    if (m) found.push(Number(m[1]));
    else if (line.trim() !== '' || found.length > 0) break;
  }
  return found;
}

/**
 * PRs the open whats-new drafts cite, so a second draft doesn't repeat a first
 * still in review. A PR anyone can open must not hide real changes from the
 * changelog, so only a draft from this repo (no fork), on the drafter's branch
 * name, by an org member or collaborator (the drafter's token is one) counts,
 * and only its generated Sources list is read.
 */
function openDraftCitations(ctx: SourceContext): number[] {
  const url = `repos/${ctx.repo}/pulls?state=open&per_page=100`;
  const open = JSON.parse(ctx.gh(['api', url])) as OpenPr[];
  const trusted = new Map<string, boolean>();
  return open
    .filter(
      (pr) =>
        pr.head.repo?.full_name === ctx.repo &&
        DRAFT_BRANCH.test(pr.head.ref) &&
        trustedAuthor(pr, ctx.repo, ctx.gh, trusted)
    )
    .flatMap((pr) => sourcesListPrs(pr.body ?? ''));
}

/**
 * whats-new: live merged PRs that touch DEVELOPER_PATHS and no earlier dev
 * post or open draft cites. None means nothing to draft.
 */
function developerPrs(ctx: SourceContext, limit: number): Source[] {
  const covered = new Set([...(ctx.covered ?? []), ...openDraftCitations(ctx)]);
  const files = new Map<string, string>(); // the live check reads the same files again
  const gh: GhRunner = (args) => {
    const key = args.join(' ');
    if (!files.has(key)) files.set(key, ctx.gh(args));
    return files.get(key)!;
  };
  const candidates = fetchMergedPrs(ctx.since, ctx.repo, ctx.gh).filter(
    (pr) =>
      !covered.has(pr.number) &&
      prFiles(pr.number, ctx.repo, gh).some((f) => DEVELOPER_PATHS.test(f.filename))
  );
  return liveOnly(candidates, { ...ctx, gh }, limit);
}

/** The sources for a type. An empty list of PRs means there is nothing to write about. */
export function collectSources(
  type: PostType,
  ctx: SourceContext
): { prs: Source[]; docs: Source[] } {
  const { root } = ctx;
  switch (type.id) {
    case 'whats-new':
      return { prs: developerPrs(ctx, 40), docs: [] };
    case 'building-in-public':
      return { prs: prs(ctx, 15, 'noticeable'), docs: [] };
    case 'how-ferni-works': {
      const aims = docSource(root, 'brand/FERNI-CAPABILITIES.md', { maxChars: 4000 });
      aims.label += ' [what we are aiming for, not what has shipped]';
      return { prs: prs(ctx, 20, 'feature'), docs: [aims] };
    }
    case 'mission-essay':
      return {
        prs: [],
        docs: [
          docSource(root, 'design-system/docs/brand/FERNI-BRAND-GUIDELINES.md', BRAND_OVERVIEW),
          docSource(root, 'brand/voice-tone/README.md', { fromHeading: '## The Philosophy' }),
          docSource(root, LESS_ALONE, { fromHeading: "## What AI Can (And Can't) Do" }),
          docSource(root, LESS_ALONE, { fromHeading: '## What "Less Alone" Actually Means' }),
        ],
      };
    case 'team-letter':
      return { prs: [], docs: personaSources(root, ctx.persona) };
    default:
      throw new Error(`no sources defined for post type "${type.id}"`);
  }
}

/** Types that need merged PRs to have anything to say. */
export const NEEDS_PRS = new Set(['whats-new', 'building-in-public', 'how-ferni-works']);
