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
 * The summary of the caller's last finished call, or '' when there is none, it is about a
 * topic they asked Ferni to forget, or their forgotten topics can't be read in time
 * (checkedText fails closed). Pass `currentConversationId` once this call's conversation has
 * started, so the call in progress is never read as "last time".
 */
export async function lastCallSummary(
  userId: string,
  currentConversationId?: string
): Promise<string> {
  const last = await getLastConversationContext(userId, currentConversationId);
  if (!last) return '';
  return checkedText(userId, last.summary || buildQuickSummary(last.turns));
}
