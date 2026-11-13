/**
 * A crisis turn records no correction. The turn's correction (caller-correction.ts) is taken
 * as processTurn starts, and every return of processTurn passes its result through the
 * function made here: the correction is written only when that result's crisis field reads as
 * ordinary. A turn that read as a crisis, gave a soft check-in, or carries no crisis field
 * (crisisReadTurn fails closed) records nothing about the caller, and neither does a turn that
 * throws or never returns, since it never passes a result through.
 *
 * @module agents/processors/turn-processor/caller-correction-hold
 */
import { ownerWriteId } from '../../../services/identity/owner-write-gate.js';
import { safeFireAndForget } from '../../../utils/safe-fire-and-forget.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { crisisReadTurn } from '../../voice-agent/crisis-turn-memory.js';
import type { TurnContext, TurnProcessorResult } from '../types.js';
import { recordCallerCorrection } from './caller-correction.js';

const log = createLogger({ module: 'CallerCorrection' });

/** userId comes from the session (services.userId), never from the turn text. */
export function heldCallerCorrection(
  ctx: TurnContext
): (result: TurnProcessorResult) => TurnProcessorResult {
  const userId = ownerWriteId(ctx.services.userId);
  const previousReply = ctx.userData.lastAgentResponse;
  if (!userId || !ctx.userText.trim() || !previousReply) return (result) => result;
  const { userText } = ctx;
  const personaId = ctx.persona?.id;
  const callId = ctx.services.sessionId;
  return (result) => {
    if (crisisReadTurn(result.crisis)) {
      log.debug('Correction held on a crisis turn');
      return result;
    }
    safeFireAndForget(
      async () => {
        try {
          await recordCallerCorrection(userId, userText, previousReply, personaId, callId);
        } catch {
          // Non-blocking
        }
      },
      { context: 'turn-processor:autoRecordCorrection' }
    );
    return result;
  };
}
