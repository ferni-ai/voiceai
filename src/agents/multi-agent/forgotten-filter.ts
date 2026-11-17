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
import { forgottenTopicsOrNull, isForgotten } from '../../memory/recall/forget.js';

export async function forgottenFilter(userId: string): Promise<IsForgotten | null> {
  const topics = await forgottenTopicsOrNull(userId);
  return topics && ((text: string) => isForgotten(text, topics));
}
