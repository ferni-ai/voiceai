/** Which facts each post type is grounded in. */

import { HOUSE_FACTS, docSource, fetchMergedPrs, type GhRunner, type Source } from './grounding.js';
import { liveOnly } from './live-check.js';
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

/** The sources for a type. An empty list of PRs means there is nothing to write about. */
export function collectSources(
  type: PostType,
  ctx: SourceContext
): { prs: Source[]; docs: Source[] } {
  const { root } = ctx;
  switch (type.id) {
    case 'whats-new':
      return { prs: prs(ctx, 40, 'any'), docs: [] };
    case 'building-in-public':
      return { prs: prs(ctx, 15, 'noticeable'), docs: [HOUSE_FACTS] };
    case 'how-ferni-works': {
      const aims = docSource(root, 'brand/FERNI-CAPABILITIES.md', { maxChars: 4000 });
      aims.label += ' [what we are aiming for, not what has shipped]';
      return { prs: prs(ctx, 20, 'feature'), docs: [aims, HOUSE_FACTS] };
    }
    case 'mission-essay':
      return {
        prs: [],
        docs: [
          docSource(root, 'design-system/docs/brand/FERNI-BRAND-GUIDELINES.md', BRAND_OVERVIEW),
          docSource(root, 'brand/voice-tone/README.md', { fromHeading: '## The Philosophy' }),
          docSource(root, LESS_ALONE, { fromHeading: "## What AI Can (And Can't) Do" }),
          docSource(root, LESS_ALONE, { fromHeading: '## What "Less Alone" Actually Means' }),
          HOUSE_FACTS,
        ],
      };
    case 'team-letter':
      return { prs: [], docs: [...personaSources(root, ctx.persona), HOUSE_FACTS] };
    default:
      throw new Error(`no sources defined for post type "${type.id}"`);
  }
}

/** Types that need merged PRs to have anything to say. */
export const NEEDS_PRS = new Set(['whats-new', 'building-in-public', 'how-ferni-works']);
