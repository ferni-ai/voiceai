/**
 * A caller's forget requests ("forget about Mindy") applied to their stored
 * commitments (bogle_users/{uid}/commitments), for every reader that brings
 * one back: the call check-in, the between-call push, the proactive trigger,
 * the morning brief, commitment tools and panels.
 *
 * Only the morning brief and the follow-through importer checked forget
 * requests before, and only against the statement, so a forgotten commitment
 * could still be raised on a call. A row is checked on every field that says
 * who or what it is about, so "call your sister tomorrow" with person "Mindy"
 * is hidden once Mindy is forgotten. When the forget list can't be read,
 * nothing is shown: erring toward silence is the right side of a privacy
 * request (the same rule as the call summaries' readers).
 *
 * @module services/superhuman/commitment-forget
 */

import { forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';

/** The fields any commitment writer uses to say who or what it is about. */
const ABOUT = [
  'statement',
  'summary',
  'text',
  'content',
  'description',
  'quote',
  'originalQuote',
  'person',
  'personInvolved',
] as const;

/** All a stored commitment says about whom and what: its statement may not name the person. */
export function forgetText(d: Record<string, unknown>): string {
  return ABOUT.map((f) => d[f])
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

export type ForgottenLoader = (userId: string) => Promise<string[] | null>;

/** A forget list not loaded by then counts as unreadable: nothing is shown, nothing waits on it. */
export const SHOWN_TIMEOUT_MS = 3_000;

/**
 * Which of this person's stored commitments may be shown: none about a topic
 * they asked Ferni to forget, and none at all when that list can't be read.
 * Never throws.
 */
export async function commitmentsShown(
  userId: string,
  forgotten: ForgottenLoader = forgottenTopicsOrNull
): Promise<(d: Record<string, unknown>) => boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SHOWN_TIMEOUT_MS);
  });
  const topics = await Promise.race([forgotten(userId).catch(() => null), late]);
  clearTimeout(timer);
  if (topics === null) return () => false;
  return (d) => !isForgotten(forgetText(d), topics);
}
