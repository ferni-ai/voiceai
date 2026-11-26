/**
 * The editorial rubric, from the 2026-10-21 blog review: six dimensions scored
 * 1 to 5, and the bar a post must clear to publish. One copy, read by both
 * sides: the judge scores against it (judge.ts) and the drafter writes to it
 * (prompt.ts). A drafter that never saw the rubric wrote PR lists and
 * biography recitals, the two shapes the rubric scores 1.
 */

import type { Audience } from './post-types.js';

export const DIMENSIONS = [
  'on_message',
  'brand_voice',
  'honesty',
  'meaningful',
  'impact',
  'craft',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Consumer posts need every dimension 4 or more; developer posts 3 or more. Both need honesty 5. */
export const THRESHOLDS: Record<Audience, { min: number; honesty: number }> = {
  consumer: { min: 4, honesty: 5 },
  developer: { min: 3, honesty: 5 },
};

export const RUBRIC: Record<Dimension, string> = {
  on_message: `About one clear thing that matters to this reader. Consumer: why Ferni exists (a warm friend for the gaps, small human magic), told through one feature, idea or scene. Developer: what changed for people building on the Ferni SDK, API or developer portal. 1 if it wanders, is mostly biography, or is consumer-app news on the developer blog.`,
  brand_voice: `Warm, clear, plain, the way a thoughtful friend talks: contractions, short sentences, "you" and "people". Penalize internal jargon, ISO dates in prose, stiff phrasing ("Let us share"), sentences with no subject ("In #12, fixed..."), stock phrases rotated per paragraph, hype, and "AI coach" labels.`,
  honesty: `5 only if every product claim is true today by the TRUTH below and the sources. A feature behind an off-by-default flag described as live, a claim the privacy data contradicts, an invented or unsourced statistic, an absolute ("never", "simply doesn't"), a contradiction inside the post, or a character breaking frame with product status notes: 1 or 2. A product claim you can't check against the TRUTH or the sources: at most 4.`,
  meaningful: `A reader comes away feeling something specific or knowing something they can use. 1 for a recital (a bio read out in order, a list of PRs), a wish-list, or an off-topic ending.`,
  impact: `It points the reader to the right next step. Consumer: talk to Ferni, or call the character and try the idea. Not a GitHub link. Developer: something they can try or must change.`,
  craft: `Structure, rhythm and repetition. Penalize sentences repeated from earlier posts or within the post, cited sources the post never uses, personal handles, emails or payment links in prose, generic image alt text, and a composite named after a Ferni persona (Maya, Alex, Jordan, Nayan, Peter, Ferni).`,
};

/** The rubric as a list, one line per dimension. */
export function rubricLines(): string {
  return DIMENSIONS.map((d) => `- ${d}: ${RUBRIC[d]}`).join('\n');
}

/** The bar for an audience, in words. */
export function barText(audience: Audience): string {
  const bar = THRESHOLDS[audience];
  return `every score is ${bar.min} or more and honesty is ${bar.honesty}`;
}
