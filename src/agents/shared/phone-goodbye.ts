/**
 * Phone calls end the way a person ends one: Ferni says a real goodbye when
 * the caller wraps up, then hangs up. PHONE_GOODBYE=on (default off).
 *
 * A phone caller (LiveKit SIP) has no app to close. Before this, an inbound
 * or app-dispatched phone call only ended when the caller hung up or the
 * room emptied: after "bye" the line stayed open in silence. The endCall
 * tool lets Ferni's goodbye finish playing, then deletes the call's room,
 * which drops the phone leg and ends the session.
 *
 * Ferni never hangs up a call that has had a crisis moment (crisis-call-risk.ts):
 * endCall then tells him to stay, and the call ends when the caller hangs up.
 * The app's endCall (call-wrap-up.ts) holds the same way.
 *
 * Calls placed on the user's behalf get their own endCall (with how the call
 * ended) from outbound-call/call-control.ts; this one stays off them.
 *
 * @module agents/shared/phone-goodbye
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { z } from 'zod';
import { flagOn, type Env } from '../../config/env-flag.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'phone-goodbye' });

export const END_CALL = 'endCall';

export const END_CALL_DESCRIPTION =
  'Hang up this phone call. Use it only once the caller has clearly wrapped up ' +
  '("okay bye", "that\'s all", "talk soon") and you have said a short, real goodbye in your reply. ' +
  'Never hang up mid-conversation, after a pause, or when they might have more to say. ' +
  'Your goodbye finishes playing before the line drops.';

export type HangUp = (roomName: string) => Promise<void>;

/** What endCall tells the model instead of hanging up a call with crisis risk. */
export const CRISIS_HOLD =
  "Don't hang up: this call has had a crisis moment. Stay with them; the call ends when they hang up.";

/** Where in the teardown the crisis check ran. */
export type CrisisHoldStage = 'before_playout' | 'after_playout' | 'before_delete';

/**
 * True when endCall must not end this call: crisis risk noted on it, or a
 * crisis read still in flight. Checked again after the goodbye plays (and
 * before the app's delayed room delete), since a read can start meanwhile.
 * Logs END_CALL_HELD_CRISIS so prod can see it.
 * Without a sessionId there is nothing to look up, so it does not hold.
 */
export function holdEndCallForCrisis(
  sessionId: string | undefined,
  tool: 'phone' | 'app',
  stage: CrisisHoldStage = 'before_playout'
): boolean {
  if (!sessionId || !crisisRiskThisCall(sessionId)) return false;
  log.warn({ sessionId, tool, stage }, 'END_CALL_HELD_CRISIS');
  return true;
}

/** PHONE_GOODBYE=on, true or 1 (flagOn). */
export function phoneGoodbyeEnabled(env: Env = process.env): boolean {
  return flagOn('PHONE_GOODBYE', env);
}

/** Deletes the call's room, which drops every participant and ends the session. */
export async function deleteRoom(roomName: string): Promise<void> {
  const { RoomServiceClient } = await import('livekit-server-sdk');
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error('LiveKit credentials not configured');
  await new RoomServiceClient(url, key, secret).deleteRoom(roomName);
}

/** The endCall tool for a phone call in `roomName`, session `sessionId`. */
export function createEndCallTool(
  roomName: string,
  hangUp: HangUp = deleteRoom,
  sessionId?: string
) {
  return llm.tool({
    name: END_CALL,
    description: END_CALL_DESCRIPTION,
    parameters: z.object({}),
    execute: async (_args, { ctx }) => {
      if (holdEndCallForCrisis(sessionId, 'phone')) return CRISIS_HOLD;
      try {
        await ctx.waitForPlayout();
      } catch {
        // Hang up anyway: a cut-off goodbye beats a line left open
      }
      if (holdEndCallForCrisis(sessionId, 'phone', 'after_playout')) return CRISIS_HOLD;
      try {
        await hangUp(roomName);
        log.info({ roomName }, 'Ferni hung up after the goodbye');
        return 'The call has ended.';
      } catch (error) {
        log.error({ error: String(error), roomName }, 'Failed to hang up');
        return "The line didn't drop. Stay quiet; the call will end when they hang up.";
      }
    },
  });
}

interface ToolHolder {
  readonly toolCtx: llm.ToolContext;
  updateTools(tools: llm.ToolContext): Promise<void>;
}

/**
 * Give a phone call's agent the endCall tool. Not for app callers, calls
 * placed on the user's behalf, or an agent that already has one. Logs
 * PHONE_GOODBYE_ATTACHED once per call when it does, so prod can be read.
 */
export async function attachPhoneHangUp(
  agent: object,
  call: {
    sessionId: string;
    roomName: string;
    participant: { kind?: ParticipantKind } | undefined;
    onBehalf: boolean;
    env?: Env;
    hangUp?: HangUp;
  }
): Promise<boolean> {
  if (!phoneGoodbyeEnabled(call.env) || call.onBehalf) return false;
  if (call.participant?.kind !== ParticipantKind.SIP) return false;
  const added = await addEndCallTool(agent, () =>
    createEndCallTool(call.roomName, call.hangUp, call.sessionId)
  );
  if (added) log.info({ sessionId: call.sessionId }, 'PHONE_GOODBYE_ATTACHED');
  return added;
}

/** Adds an endCall tool to the agent's tools, unless it already has one. */
export async function addEndCallTool(
  agent: object,
  create: () => llm.ToolContext['functionTools'][string]
): Promise<boolean> {
  const holder = agent as ToolHolder;
  const current = holder.toolCtx;
  if (END_CALL in current.functionTools) return false;
  await holder.updateTools(
    new llm.ToolContext([
      ...Object.values(current.functionTools),
      ...current.providerTools,
      ...current.toolsets,
      create(),
    ])
  );
  return true;
}
