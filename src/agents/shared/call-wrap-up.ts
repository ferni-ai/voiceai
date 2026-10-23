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
 * Until the room closes, crisis risk on the call or the caller saying more
 * than a goodbye reopens it (wrap-up-window.ts, #2291): the app is sent
 * `conversation_continue`, which cancels its disconnect, and the call is no
 * longer closing, so Ferni may speak and the farewell watcher arms again. So
 * does a crisis hold just before the room would be deleted. While the caller
 * is still talking, the app holds its hang-up (`conversation_hold`), and the
 * room is not deleted while they are mid-utterance or a crisis read is in
 * flight (holdWhileBusy, caller-activity.ts), on a phone call too.
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
 * line once the caller is quiet: there is no app to leave on its own. With CALL_WRAP_UP
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
import { clearFarewell, markFarewell, reopenFarewell, watchFarewell } from './call-farewell.js';
import { holdWhileBusy, waitForQuiet, watchCaller, type CallerWatch } from './caller-activity.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import {
  clearSessionClosing,
  isSessionClosing,
  markSessionClosing,
} from './session-closing-tracker.js';
import {
  openWrapUpWindow,
  type ContinueReason,
  type HoldReason,
  type WrapUpWindow,
} from './wrap-up-window.js';

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

/**
 * How long the app keeps its goodbye on screen before it disconnects. Long
 * enough for a crisis read of the caller's last words (transcription plus up
 * to ~1.5 s of classifier) to land and send `conversation_continue` first
 * (#2291; was 800 ms).
 */
export const DISCONNECT_DELAY_MS = 2_500;
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
  /** The caller's words and voice activity, watched while the call ends (attachCallWrapUp). */
  caller?: CallerWatch;
  /** The clock for spacing `conversation_hold`s (tests). */
  now?: () => number;
}

/** Calls whose wrap-up has started and not yet closed the room. */
const wrapping = new Set<string>();

/**
 * Ends the call: playout, closing, `conversation_end`, then the room after a
 * grace period. Returns false, doing nothing, when the call is already ending,
 * or ending nothing when crisis risk appeared while the goodbye played or the
 * call reopened while `conversation_end` went out.
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
  const graceMs = call.graceMs ?? REMOVAL_GRACE_MS;
  const app = graceMs > 0; // a phone call has no app to tell; its grace is 0
  const setTimer = call.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  // From here until the room closes, crisis risk or the caller carrying on reopens the call
  const win = openWrapUpWindow({
    sessionId,
    caller: call.caller,
    callerInRoom: call.callerInRoom,
    setTimer,
    now: call.now,
    onContinue: (why) => carryOn(call, app ? signal : undefined, why),
    ...(app && { onHold: (why: HoldReason) => holdAppEnd(sessionId, signal, why) }),
  });
  const sent = await signal(
    'conversation_end',
    { reason, disconnectDelay: DISCONNECT_DELAY_MS, timestamp: Date.now() },
    sessionId
  ).catch((error: unknown) => {
    log.warn({ sessionId, error: String(error) }, 'CALL_WRAP_UP conversation_end failed');
    return false;
  });
  log.info({ sessionId, reason, sent }, 'CALL_WRAP_UP conversation_end');
  if (win.continued) return false; // reopened while the signal went out: ending nothing
  setTimer(() => void closeRoomIfStillThere(call, reason, win, setTimer), graceMs);
  return true;
}

/**
 * Reopen a call whose wrap-up began: the app cancels its disconnect, Ferni may
 * speak again, and the farewell watcher (and a later wrap-up) can arm again.
 */
function carryOn(
  call: WrapUpCall,
  signal: typeof sendFrontendSignal | undefined,
  reason: ContinueReason
): void {
  const { sessionId } = call;
  clearSessionClosing(sessionId);
  reopenFarewell(sessionId);
  wrapping.delete(sessionId);
  log.warn({ sessionId, reason }, 'CALL_WRAP_UP continued');
  void signal?.('conversation_continue', { reason, timestamp: Date.now() }, sessionId).catch(
    (error: unknown) =>
      log.error({ sessionId, error: String(error) }, 'CALL_WRAP_UP conversation_continue failed')
  );
}

/** The caller is still talking: the app holds its hang-up (it never reopens the call). */
function holdAppEnd(
  sessionId: string,
  signal: typeof sendFrontendSignal,
  reason: HoldReason
): void {
  log.info({ sessionId, reason }, 'CALL_WRAP_UP conversation_hold');
  void signal('conversation_hold', { reason, timestamp: Date.now() }, sessionId).catch(
    (error: unknown) =>
      log.warn({ sessionId, error: String(error) }, 'CALL_WRAP_UP conversation_hold failed')
  );
}

async function closeRoomIfStillThere(
  call: WrapUpCall,
  reason: WrapUpReason,
  win: WrapUpWindow,
  setTimer: (fn: () => void, ms: number) => unknown
): Promise<void> {
  const { sessionId, roomName } = call;
  // Not while the caller is mid-utterance or a crisis read of their words is due or in flight
  const done = (): boolean => win.continued || !call.callerInRoom();
  const busy = (): boolean => (call.caller?.busy() ?? false) || win.readPending();
  await holdWhileBusy({ sessionId, busy, done, setTimer });
  if (win.continued) return; // the call carried on; a later wrap-up owns the room
  try {
    if (!call.callerInRoom()) {
      win.tearDown(); // the app left on its own
      return;
    }
    if (holdEndCallForCrisis(sessionId, 'app', 'before_delete')) {
      win.reopen('crisis_hold');
      return;
    }
    win.tearDown();
    await (call.hangUp ?? deleteRoom)(roomName);
    log.info({ sessionId, roomName, reason }, 'CALL_WRAP_UP room deleted; caller was still in it');
  } catch (error) {
    log.error({ sessionId, roomName, error: String(error) }, 'CALL_WRAP_UP room not deleted');
  } finally {
    if (!win.continued) wrapping.delete(sessionId);
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
    now?: () => number;
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
    now: call.now,
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
  // After the farewell watcher, so a reopening line reaches it while the call is still closing
  if (call.session) wrap.caller = watchCaller(call.session);
  if (phone) {
    // PHONE_GOODBYE's endCall hangs up only after a short quiet with no crisis read due
    const holdFirst = async (): Promise<'quiet' | 'talking' | 'risk'> =>
      waitForQuiet({
        sessionId: call.sessionId,
        caller: wrap.caller,
        gone: () => !wrap.callerInRoom(),
        setTimer: call.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms)),
      });
    return attachPhoneHangUp(agent, { ...call, roomName, holdFirst });
  }
  if (!wrapUp) return false;
  return addEndCallTool(agent, () => createWrapUpTool(wrap));
}
