/**
 * CALL_USER_LIVE_AGENT=on. Prod 2026-10-22: the owner asked Alex to call him,
 * and Twilio's own TTS read Alex's message (conversational-calls.ts builds
 * <Say> TwiML): not Alex's voice, not Cartesia, no conversation. With the
 * flag, a call the user asked for goes the way Ferni's own proactive calls do
 * (proactive-channels/self-call.ts): a signed agent dispatch as that persona,
 * then a LiveKit SIP dial, so the persona is live on the line in its own voice.
 * Without SIP (no trunk or LiveKit keys) the caller keeps the Twilio path.
 *
 * @module services/outreach/live-agent-call
 */
import { flagOn } from '../../config/env-flag.js';
import { runBackground } from '../../utils/background-task.js';
import { createLogger } from '../../utils/safe-logger.js';
import { canPlaceCalls, placeSelfCall } from './proactive-channels/self-call.js';

const log = createLogger({ module: 'LiveAgentCall' });

/** The reason call-user-adapter.ts gives a call the user asked for ("Alex, call me"). */
export const USER_REQUESTED_CALL = 'user_requested_call';

export interface LiveAgentCall {
  id: string;
  userId: string;
  phoneNumber: string;
  message: string;
  personaId: string;
  reason: string;
}

/** Where the outcome goes: the scheduled_calls row's status and outcome. */
export type RecordOutcome = (
  callId: string,
  status: 'completed' | 'failed',
  updates: Record<string, unknown>
) => Promise<void>;

/** This call rings with the persona's live agent instead of Twilio <Say>. */
export function ringsWithLiveAgent(call: Pick<LiveAgentCall, 'reason'>): boolean {
  return call.reason === USER_REQUESTED_CALL && flagOn('CALL_USER_LIVE_AGENT') && canPlaceCalls();
}

/**
 * Dispatch the persona and dial. The dial waits up to 40s for an answer, so it
 * runs in the background and the caller (the callUser tool) returns at once.
 */
export function placeLiveAgentCall(
  call: LiveAgentCall,
  record: RecordOutcome
): { success: true; callId: string; status: 'initiated' } {
  const trigger = { kind: 'promise' as const, reason: call.message, sourceId: call.id };
  const placed = placeSelfCall(call.userId, call.phoneNumber, trigger, undefined, call.personaId);
  runBackground(
    placed.then(async (outcome) =>
      // 'failed', not 'pending', on no answer: the per-minute job must not ring them again.
      record(call.id, outcome === 'answered' ? 'completed' : 'failed', {
        completedAt: new Date().toISOString(),
        outcome: `live_agent_${outcome}`,
      })
    ),
    { task: 'placeLiveAgentCall', userId: call.userId }
  );
  log.info({ userId: call.userId, callId: call.id, personaId: call.personaId }, 'Live agent call');
  return { success: true, callId: call.id, status: 'initiated' };
}
