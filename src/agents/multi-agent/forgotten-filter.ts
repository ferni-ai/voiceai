/**
 * What the caller asked Ferni to forget (memory/recall/forget.ts), in the form
 * theory of mind takes it: a filter, or null when the list can't be read. The
 * live note (mind-note-hook.ts) and the after-call update
 * (agents/theory-of-mind-register.ts) both use it, so a forgotten topic stays
 * out of both, as it does out of recall.
 *
 * @module agents/multi-agent/forgotten-filter
 */
import type { IsForgotten } from '../../intelligence/theory-of-mind/types.js';
import {
  forgottenInProcess,
  forgottenTopicsOrNull,
  isForgotten,
} from '../../memory/recall/forget.js';
import { isForgottenPassage } from '../../memory/domain/index.js';

export async function forgottenFilter(userId: string): Promise<IsForgotten | null> {
  const topics = await forgottenTopicsOrNull(userId);
  return topics && ((text: string) => isForgotten(text, topics));
}

/**
 * The same list for a reader of the caller's raw words ("his number is 435 555 0188" for
 * "brother phone number"): any distinctive word of a topic leaves the text out, and a topic
 * forgotten later in this call counts from then on (#3995).
 */
export async function forgottenPassageFilter(userId: string): Promise<IsForgotten | null> {
  const topics = await forgottenTopicsOrNull(userId);
  return (
    topics &&
    ((text: string) => isForgottenPassage(text, [...topics, ...forgottenInProcess(userId)]))
  );
}
