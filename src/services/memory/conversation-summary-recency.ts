/**
 * Conversation Summary Recency
 *
 * Decides whether a freshly written conversation summary may replace the
 * user's `lastConversationSummary`. A catch-up job summarizing an old dropped
 * call must never overwrite the summary of a later conversation.
 *
 * @module services/memory/conversation-summary-recency
 */

/** Best-effort conversion of a Firestore Timestamp / Date / string / number to Date. */
export function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const maybeTs = value as { toDate?: () => Date };
  if (typeof maybeTs.toDate === 'function') {
    const d = maybeTs.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * When the conversation last had activity: endedAt, else lastActivityAt,
 * else startedAt.
 */
export function conversationEndTime(conversation: Record<string, unknown>): Date | null {
  return (
    toDateOrNull(conversation.endedAt) ??
    toDateOrNull(conversation.lastActivityAt) ??
    toDateOrNull(conversation.startedAt)
  );
}

/**
 * True when the summary of a conversation that ended at `conversationEndedAt`
 * is at least as recent as whatever the user document already holds.
 *
 * The user doc's own marker is `lastConversationSummaryAt`. Older documents
 * written by the profile saver only carry `lastContact`; when a summary is
 * present without a marker, `lastContact` stands in for it.
 */
export function isSummaryNewer(
  conversationEndedAt: Date | null,
  userDoc: Record<string, unknown> | undefined
): boolean {
  if (!conversationEndedAt) return false;
  if (!userDoc) return true;
  const marker =
    toDateOrNull(userDoc.lastConversationSummaryAt) ??
    (userDoc.lastConversationSummary ? toDateOrNull(userDoc.lastContact) : null);
  if (!marker) return true;
  return conversationEndedAt.getTime() >= marker.getTime();
}
