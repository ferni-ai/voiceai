/**
 * The last call's summary, for a call start whose profile has none (session-manager).
 *
 * forgetTopic clears the profile's "last time" summaries but not the stored calls, so a
 * refill straight from realtime memory brought a forgotten topic back as the next call's
 * "last time" (#2801). Every refill goes through the shared forget check here instead.
 */
import { checkedText } from '../../memory/recall/forget-key-points.js';
import { buildQuickSummary, getLastConversationContext } from './realtime-memory.js';

/**
 * The summary realtime memory holds for the caller's latest call, or '' when there is none,
 * it is about a topic they asked Ferni to forget, or their forgotten topics can't be read in
 * time (checkedText fails closed).
 */
export async function lastCallSummary(userId: string): Promise<string> {
  const last = await getLastConversationContext(userId);
  if (!last) return '';
  return checkedText(userId, last.summary || buildQuickSummary(last.turns));
}
