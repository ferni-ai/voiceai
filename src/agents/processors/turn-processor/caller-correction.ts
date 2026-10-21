/**
 * After each caller turn, against the reply just before it: record a
 * correction (user-corrections.ts, as before), with FRIEND_REPAIR on keep a
 * fact correction for later calls and retire the fact it corrects
 * (personas/friend-repair.ts), and with DISPUTE_DENIED_FACTS on, stop recall
 * serving a memory the caller just denied ("What contracts?", "I never said
 * that"; memory/recall/dispute.ts).
 *
 * @module agents/processors/turn-processor/caller-correction
 */
import { flagOn } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'CallerCorrection' });

/** userId comes from the session (services.userId), never from the turn text. */
export async function recordCallerCorrection(
  userId: string,
  callerLine: string,
  previousReply: string,
  personaId: string | undefined,
  callId?: string
): Promise<void> {
  if (flagOn('FRIEND_REPAIR')) {
    const { recordFriendRepair } = await import('../../personas/friend-repair.js');
    // Its own failure is logged here so the loose record below still runs.
    await recordFriendRepair({
      userId,
      said: callerLine,
      ferni: [previousReply],
      ...(callId && { callId }),
      ...(personaId && { personaId }),
    }).catch((error: unknown) =>
      log.warn({ error: String(error), userId: userId.slice(0, 8) }, 'FRIEND_REPAIR not kept')
    );
  }
  const { userCorrections } = await import('../../../services/superhuman/user-corrections.js');
  await userCorrections.autoRecord(userId, callerLine, previousReply, personaId);
  if (!flagOn('DISPUTE_DENIED_FACTS')) return;
  const { disputeForCaller } = await import('../../../memory/recall/dispute.js');
  const { firestoreDisputeStore } = await import('../../../memory/storage/dispute-store.js');
  await disputeForCaller(userId, callerLine, previousReply, firestoreDisputeStore);
}
