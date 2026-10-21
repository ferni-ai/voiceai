/** Which facts each post type is grounded in. */

import { docSource, fetchMergedPrs, type GhRunner, type Source } from './grounding.js';
import { citedPrNumbers, liveOnly, prFiles } from './live-check.js';
import { personaSources, type LetterPersona } from './team-letter.js';
import type { PostType } from './post-types.js';

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

/** PRs the open whats-new drafts cite, so a second draft doesn't repeat a first still in review. */
function openDraftCitations(ctx: SourceContext): number[] {
  const url = `repos/${ctx.repo}/pulls?state=open&per_page=100`;
  const open = JSON.parse(ctx.gh(['api', url])) as Array<{
    head: { ref: string };
    body: string | null;
  }>;
  return open
    .filter((pr) => pr.head.ref.startsWith('blog/draft-whats-new'))
    .flatMap((pr) => citedPrNumbers(pr.body ?? ''));
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
