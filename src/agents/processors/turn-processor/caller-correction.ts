/**
 * After each caller turn, against the reply just before it: record a
 * correction (user-corrections.ts, as before) and, with DISPUTE_DENIED_FACTS
 * on, stop recall serving a memory the caller just denied ("What contracts?",
 * "I never said that"; memory/recall/dispute.ts).
 *
 * @module agents/processors/turn-processor/caller-correction
 */
import { flagOn } from '../../../config/env-flag.js';

/** userId comes from the session (services.userId), never from the turn text. */
export async function recordCallerCorrection(
  userId: string,
  callerLine: string,
  previousReply: string,
  personaId: string | undefined
): Promise<void> {
  const { userCorrections } = await import('../../../services/superhuman/user-corrections.js');
  await userCorrections.autoRecord(userId, callerLine, previousReply, personaId);
  if (!flagOn('DISPUTE_DENIED_FACTS')) return;
  const { disputeForCaller } = await import('../../../memory/recall/dispute.js');
  const { firestoreDisputeStore } = await import('../../../memory/storage/dispute-store.js');
  await disputeForCaller(userId, callerLine, previousReply, firestoreDisputeStore);
}
