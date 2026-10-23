/**
 * CALL_USER_LIVE_AGENT=on. Prod 2026-10-22: the owner asked Alex to call him,
 * and Twilio's own TTS read Alex's message (conversational-calls.ts builds
 * <Say> TwiML): not Alex's voice, not Cartesia, no conversation. With the
 * flag, a call the user asked for goes the way Ferni's own proactive calls do
 * (proactive-channels/self-call.ts): a signed agent dispatch as that persona,
 * then a LiveKit SIP dial, so the persona is live on the line in its own voice.
 * Without SIP (no trunk or LiveKit keys) the caller keeps the Twilio path.
 *
 * CALL_PROACTIVE_LIVE_AGENT=on does the same for every other call that goes
 * through scheduleProactiveCall to the account's own verified phone (check-ins,
 * follow-ups, reminders): Ferni rings live instead of a robot reading a script.
 *
 * @module services/outreach/live-agent-call
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { flagOn } from '../../config/env-flag.js';
import { runBackground } from '../../utils/background-task.js';
import { createLogger } from '../../utils/safe-logger.js';
import { toE164 } from './checkin-replies.js';
import { canPlaceCalls, placeSelfCall, type CallOutcome } from './proactive-channels/self-call.js';
import { userReach } from './user-reach.js';

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

/**
 * This call rings with the persona's live agent instead of Twilio <Say>.
 *
 * The dispatch tells the agent the person on the line IS the account holder,
 * with their memory. `reason` is free text that other paths copy from their
 * own context (makeConversationalCall), so it is not trusted on its own: the
 * number must be the account's verified phone, re-read here (the same
 * userReach the adapter uses). Any other number keeps the Twilio path.
 */
export async function ringsWithLiveAgent(
  call: Pick<LiveAgentCall, 'reason' | 'userId' | 'phoneNumber'>
): Promise<boolean> {
  const asked = call.reason === USER_REQUESTED_CALL;
  if (!(asked ? flagOn('CALL_USER_LIVE_AGENT') : flagOn('CALL_PROACTIVE_LIVE_AGENT'))) return false;
  if (!canPlaceCalls()) return false;
  const { phone } = await userReach(call.userId, 'voice_call', { standingOptIn: false });
  const dialed = toE164(call.phoneNumber);
  if (!phone || !dialed || dialed !== phone) {
    log.warn({ userId: call.userId, tail: dialed?.slice(-2) }, 'Not the verified phone; no agent');
    return false;
  }
  return true;
}

/** The opener reads the first 160 chars of the reason (greeting-direction.ts). */
const QUOTE_MAX = 120;

/**
 * Why the agent called, for its opener. The signed dispatch makes this trusted
 * context, so the frame is ours; the persona's own message (model-written,
 * possibly shaped by content it read) rides along only as a short, labelled
 * quote with markup, brackets, quotes and control characters removed. The
 * quote comes early and stays short so the opener's window holds all of it.
 */
export function liveCallReason(message: string, asked = true): string {
  const quote = message
    .replace(/[\p{Cc}<>[\]{}`"]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUOTE_MAX)
    .trim();
  const frame = asked ? 'They asked you to call' : "You're calling to check in";
  return quote ? `${frame}. Your words: "${quote}"` : `${frame}${asked ? ' them' : ''}.`;
}

/**
 * CALL_ME_MOVES_TO_PHONE: a "call me" from an app call points the phone agent
 * at that call's conversation (its id: the agent reads the turns from the
 * caller's memory store), and gets the dial back to end the app call once the
 * phone is answered (call-user-adapter.ts, call-me-moves-to-phone.ts).
 */
export interface PhoneMove {
  userId: string;
  conversationId?: string;
  dial?: Promise<CallOutcome>;
}

/**
 * The move travels with its own request (async context), never in a per-user
 * slot: two "call me"s placed at once each get their own reference and dial.
 */
const moves = new AsyncLocalStorage<PhoneMove>();

/** Places the call with `move` waiting for the live dial `place` makes; it never outlives `place`. */
export async function movingToPhone<T>(move: PhoneMove, place: () => Promise<T>): Promise<T> {
  return moves.run(move, place);
}

/**
 * Dispatch the persona and dial. The dial waits up to 40s for an answer, so it
 * runs in the background and the caller (the callUser tool) returns at once.
 */
export function placeLiveAgentCall(
  call: LiveAgentCall,
  record: RecordOutcome
): { success: true; callId: string; status: 'initiated'; live: true } {
  const asked = call.reason === USER_REQUESTED_CALL;
  const store = asked ? moves.getStore() : undefined;
  // Its own user's request, and one dial per move
  const move = store?.userId === call.userId && !store.dial ? store : undefined;
  const trigger = {
    kind: asked ? ('promise' as const) : ('follow_up' as const),
    reason: liveCallReason(call.message, asked),
    sourceId: call.id,
    ...(move?.conversationId ? { movedFrom: move.conversationId } : {}),
  };
  const placed = placeSelfCall(call.userId, call.phoneNumber, trigger, undefined, call.personaId);
  // e.g. the LiveKit SDK failed to load: never left in_progress
  const ended = placed.catch(() => 'failed' as const);
  if (move) move.dial = ended;
  runBackground(
    ended.then(async (outcome) =>
      // 'failed', not 'pending', on no answer: the per-minute job must not ring them again.
      record(call.id, outcome === 'answered' ? 'completed' : 'failed', {
        completedAt: new Date().toISOString(),
        outcome: `live_agent_${outcome}`,
      })
    ),
    { task: 'placeLiveAgentCall', userId: call.userId }
  );
  log.info({ userId: call.userId, callId: call.id, personaId: call.personaId }, 'Live agent call');
  return { success: true, callId: call.id, status: 'initiated', live: true };
}
