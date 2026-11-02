/**
 * Whether the greeting's line asked a follow-up, so it claims the call opener
 * (opener-claim.ts) and the first recall note leaves its thread line out.
 *
 * A check-in or a pondered item the greeting was given claims when the line asks
 * about it. So does last call's topic, which the director opens on unprompted ("how
 * is Pepper holding up with that cone?", dev 2026-10-21), but only:
 * - when a thread line could follow (OPENER_FOLLOW_UP or FOLLOW_THROUGH_OPENER on),
 *   since a claim also holds back the week's predictions note;
 * - when the line is a question about the topic itself: their name, a persona's
 *   name or "evening" in both is no ask ("Hey Sam, how's your evening going?"
 *   after a summary that starts "Sam decided...").
 *
 * @module agents/multi-agent/greeting-claim
 */

import { contentWords } from '../../memory/recall/session-recall.js';
import { claimOpenerFollowUp } from '../../memory/recall/opener-claim.js';
import { openerFollowUpEnabled } from '../../memory/recall/opener.js';
import { sharedWords } from '../personas/caller-greeting.js';

/** True when the spoken line is about the item: they share a real word. */
export function lineAsks(line: string, item: string): boolean {
  const said = contentWords(line);
  return [...contentWords(item)].some((w) => said.has(w));
}

/** The line asks about `topic` itself: a shared word that isn't a name or small talk. */
export function asksAboutTopic(line: string, topic: string, userName?: string): boolean {
  return line.includes('?') && sharedWords(topic, line, userName ? [userName] : []).length > 0;
}

export interface GreetingThreads {
  checkIn?: string;
  pondered?: string;
  lastTopic?: string;
  userName?: string;
}

/** Claims the opener for `userId` when the spoken greeting asked one of its threads. */
export function claimIfAsked(
  userId: string,
  spoken: string,
  threads: GreetingThreads,
  env: Record<string, string | undefined> = process.env
): void {
  const given = threads.checkIn ?? threads.pondered;
  const lineFollows = openerFollowUpEnabled(env) || env.FOLLOW_THROUGH_OPENER === 'on';
  const asked = given
    ? lineAsks(spoken, given)
    : lineFollows &&
      threads.lastTopic !== undefined &&
      asksAboutTopic(spoken, threads.lastTopic, threads.userName);
  if (asked) claimOpenerFollowUp(userId, 'greeting');
}
