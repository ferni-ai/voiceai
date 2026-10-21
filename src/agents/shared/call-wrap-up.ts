/**
 * App calls end the way a person ends one: after a mutual goodbye, Ferni
 * hangs up. CALL_WRAP_UP=on (default off).
 *
 * Before this, a goodbye never ended a web or iOS call on the multi-agent
 * path: endCall existed only for calls placed on the user's behalf
 * (outbound-call/call-control.ts) and for phone callers (phone-goodbye.ts,
 * PHONE_GOODBYE). The caller said bye, Ferni said bye, and the room stayed
 * open until they pressed End.
 *
 * The endCall tool here, once Ferni's goodbye has finished playing:
 * 1. marks the call closing (session-closing-tracker.ts), so nothing else
 *    speaks into it, including NEVER_SILENT's fallback lines;
 * 2. sends the app `conversation_end` (reason `goodbye_complete`), which
 *    plays its goodbye and disconnects;
 * 3. if the caller is still in the room REMOVAL_GRACE_MS later, deletes the
 *    room, as the phone path does. The session then ends on #1077's path.
 * It runs once per call; a second call does nothing.
 *
 * Saying goodbye ends every call, app or phone, whatever the model does:
 * GOODBYE_ENDS_CALL (default on, a kill switch). The farewell watcher
 * (call-farewell.ts) sees the goodbyes, or the caller asking Ferni to hang
 * up, and after a short quiet window once Ferni's goodbye has played, ends
 * the call with reason `idle_after_goodbye` through wrapUpCall. Before it,
 * only the model calling endCall could end a call, and it rarely did: on
 * 2026-10-19 no prod call ended on a goodbye (7 phone calls had endCall; 1
 * used it, after three "hang up"s). It never ends a call with crisis risk.
 *
 * Phone callers keep PHONE_GOODBYE's own endCall. Their idle end hangs up the
 * line straight away: there is no app to leave on its own. With CALL_WRAP_UP
 * on, Ferni also stays quiet after the goodbyes (stayQuiet, call-farewell.ts).
 *
 * @module agents/shared/call-wrap-up
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { z } from 'zod';
import { flagOn, type Env } from '../../config/env-flag.js';
import { sendFrontendSignal } from '../../services/communication/frontend-signal.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  addEndCallTool,
  attachPhoneHangUp,
  CRISIS_HOLD,
  deleteRoom,
  END_CALL,
  holdEndCallForCrisis,
  type HangUp,
} from './phone-goodbye.js';
import { clearFarewell, markFarewell, watchFarewell } from './call-farewell.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { isSessionClosing, markSessionClosing } from './session-closing-tracker.js';

const log = createLogger({ module: 'call-wrap-up' });

export function callWrapUpEnabled(env: Env = process.env): boolean {
  return flagOn('CALL_WRAP_UP', env);
}

/** GOODBYE_ENDS_CALL: a goodbye ends the call without waiting on the model (default on). */
export function goodbyeEndsCallEnabled(env: Env = process.env): boolean {
  return flagOn('GOODBYE_ENDS_CALL', env);
}

export const WRAP_UP_DESCRIPTION =
  'End this call. Use it ONLY after a mutual goodbye: the caller has said goodbye and you have ' +
  'already said your own goodbye in this reply. Never mid-conversation, never after a pause or ' +
  'when they might have more to say. It never ends a call that has had a crisis moment: the ' +
  'caller ends that one. Your goodbye finishes playing before the call closes.';

/** The app's goodbye sound before it disconnects. */
export const DISCONNECT_DELAY_MS = 800;
/** How long the app gets to leave on its own before the room is closed. */
export const REMOVAL_GRACE_MS = 5_000;

export type WrapUpReason = 'goodbye_complete' | 'idle_after_goodbye';

export interface WrapUpCall {
  sessionId: string;
  roomName: string;
  /** Anyone besides Ferni still in the room. */
  callerInRoom: () => boolean;
  signal?: typeof sendFrontendSignal;
  hangUp?: HangUp;
  graceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

/** Calls whose wrap-up has started and not yet closed the room. */
const wrapping = new Set<string>();

/**
 * Ends the call: playout, closing, `conversation_end`, then the room after a
 * grace period. Returns false, doing nothing, when the call is already ending,
 * or ending nothing when crisis risk appeared while the goodbye played.
 */
export async function wrapUpCall(
  call: WrapUpCall,
  reason: WrapUpReason,
  playout?: () => Promise<void>
): Promise<boolean> {
  const { sessionId } = call;
  if (wrapping.has(sessionId) || isSessionClosing(sessionId)) return false;
  wrapping.add(sessionId);
  markFarewell(sessionId, 'end_call');
  log.info({ sessionId, reason }, 'CALL_WRAP_UP started');
  try {
    await playout?.();
  } catch (error) {
    // End anyway: a cut-off goodbye beats a room left open
    log.warn({ sessionId, error: String(error) }, 'CALL_WRAP_UP playout did not finish');
  }
  // Crisis risk that appeared while the goodbye played: the call carries on
  if (holdEndCallForCrisis(sessionId, 'app', 'after_playout')) {
    wrapping.delete(sessionId);
    clearFarewell(sessionId);
    return false;
  }
  markSessionClosing(sessionId);
  const signal = call.signal ?? sendFrontendSignal;
  const sent = await signal(
    'conversation_end',
    { reason, disconnectDelay: DISCONNECT_DELAY_MS, timestamp: Date.now() },
    sessionId
  ).catch((error: unknown) => {
    log.warn({ sessionId, error: String(error) }, 'CALL_WRAP_UP conversation_end failed');
    return false;
  });
  log.info({ sessionId, reason, sent }, 'CALL_WRAP_UP conversation_end');
  const setTimer = call.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  setTimer(() => void closeRoomIfStillThere(call, reason), call.graceMs ?? REMOVAL_GRACE_MS);
  return true;
}

async function closeRoomIfStillThere(call: WrapUpCall, reason: WrapUpReason): Promise<void> {
  const { sessionId, roomName } = call;
  try {
    if (!call.callerInRoom()) return;
    if (holdEndCallForCrisis(sessionId, 'app', 'before_delete')) return;
    await (call.hangUp ?? deleteRoom)(roomName);
    log.info({ sessionId, roomName, reason }, 'CALL_WRAP_UP room deleted; caller was still in it');
  } catch (error) {
    log.error({ sessionId, roomName, error: String(error) }, 'CALL_WRAP_UP room not deleted');
  } finally {
    wrapping.delete(sessionId);
  }
}

/**
 * The endCall tool for an app call. It asks for no reply: there is nothing left
 * to say. On a call with crisis risk it ends nothing and tells Ferni to stay.
 */
export function createWrapUpTool(call: WrapUpCall): llm.ToolContext['functionTools'][string] {
  return llm.tool({
    name: END_CALL,
    description: WRAP_UP_DESCRIPTION,
    parameters: z.object({}),
    execute: async (_args, { ctx }) => {
      if (holdEndCallForCrisis(call.sessionId, 'app')) return CRISIS_HOLD;
      const began = await wrapUpCall(call, 'goodbye_complete', async () => ctx.waitForPlayout());
      return began || !crisisRiskThisCall(call.sessionId) ? undefined : CRISIS_HOLD;
    },
  });
}

interface CallRoom {
  name?: string;
  remoteParticipants?: { size: number };
}

/**
 * Gives the agent its endCall: PHONE_GOODBYE's for a phone caller, this one
 * for an app caller with CALL_WRAP_UP on. With GOODBYE_ENDS_CALL or
 * CALL_WRAP_UP on, either kind of call also gets the farewell watcher, which
 * ends it after the goodbyes. Never for calls placed on the user's behalf, or
 * an agent that already has an endCall. Returns whether endCall was added.
 */
export async function attachCallWrapUp(
  agent: object,
  call: {
    sessionId: string;
    room: CallRoom;
    participant: { kind?: ParticipantKind } | undefined;
    onBehalf: boolean;
    env?: Env;
    hangUp?: HangUp;
    setTimer?: WrapUpCall['setTimer'];
    /** The call's AgentSession, watched for the goodbyes. */
    session?: object;
    clearTimer?: (handle: unknown) => void;
  }
): Promise<boolean> {
  const roomName = call.room.name ?? '';
  const phone = call.participant?.kind === ParticipantKind.SIP;
  const wrapUp = callWrapUpEnabled(call.env) && !call.onBehalf;
  const endOnGoodbye = goodbyeEndsCallEnabled(call.env) && !call.onBehalf;
  if (!phone && !wrapUp && !endOnGoodbye) return false;
  const wrap: WrapUpCall = {
    sessionId: call.sessionId,
    roomName,
    callerInRoom: () => (call.room.remoteParticipants?.size ?? 0) > 0,
    hangUp: call.hangUp,
    setTimer: call.setTimer,
    ...(phone && { graceMs: 0 }),
  };
  // A short quiet window after the goodbyes ends the call (call-farewell.ts)
  if ((wrapUp || endOnGoodbye) && call.session) {
    log.info({ sessionId: call.sessionId, phone }, 'GOODBYE_WATCH_ATTACHED');
    watchFarewell(call.session, {
      sessionId: call.sessionId,
      setTimer: call.setTimer,
      clearTimer: call.clearTimer,
      onIdle: () =>
        void wrapUpCall(wrap, 'idle_after_goodbye').catch((error: unknown) =>
          log.error(
            { sessionId: call.sessionId, error: String(error) },
            'CALL_WRAP_UP idle end failed'
          )
        ),
    });
  }
  if (phone) return attachPhoneHangUp(agent, { ...call, roomName });
  if (!wrapUp) return false;
  return addEndCallTool(agent, () => createWrapUpTool(wrap));
}
