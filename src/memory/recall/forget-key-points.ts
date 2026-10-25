/**
 * The caller's forgotten topics as a check for a call's summary, and its key
 * points with the forgotten ones left out (#2767). The writers of the
 * profile's last summaries use it: session/last-summary.ts and the call-end
 * summary pass (realtime-memory summarizeConversationAsync).
 *
 * @module memory/recall/forget-key-points
 */
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { forgottenWithin, type ForgottenCheck } from './forget-every-reader.js';

/**
 * The check (the shared read, fail closed: null when it can't be read in
 * time). Nothing is stored for a non-member, so nothing is forgotten.
 */
export async function summaryCheck(
  userId: string | null | undefined,
  read: (userId: string) => Promise<ForgottenCheck | null> = (u) =>
    forgottenWithin(u, 'last-summary')
): Promise<ForgottenCheck | null> {
  return isMemberIdentity(userId) ? read(userId) : () => false;
}

/** Key points without those about a forgotten topic; none when the topics can't be read. */
export async function checkedPoints(
  userId: string | null | undefined,
  points: readonly string[]
): Promise<string[]> {
  const forgotten = await summaryCheck(userId);
  return forgotten ? points.filter((p) => !forgotten(p)) : [];
}
