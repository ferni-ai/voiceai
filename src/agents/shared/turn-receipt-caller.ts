/**
 * Who the caller is and how long the reply was, for the TURN_RECEIPT (turn-receipt.ts), as a
 * kind and a count: never the uid, never the words.
 *
 * @module agents/shared/turn-receipt-caller
 */

export type UserKind = 'owner' | 'eval' | 'other';

/** owner (TURN_RECEIPT_OWNER_UIDS), eval (voice-eval users) or other. Never the uid itself. */
export function userKindOf(
  userId: string | undefined,
  env: Record<string, string | undefined> = process.env
): UserKind {
  if (!userId) return 'other';
  if (userId.startsWith('voice-eval-')) return 'eval';
  const owners = (env.TURN_RECEIPT_OWNER_UIDS ?? '').split(',').map((s) => s.trim());
  return owners.includes(userId) ? 'owner' : 'other';
}

/** Sentences in a reply, counted and forgotten. */
export function sentenceCount(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) ?? []).length);
}
