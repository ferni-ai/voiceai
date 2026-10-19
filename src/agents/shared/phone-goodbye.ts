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
 * Calls placed on the user's behalf get their own endCall (with how the call
 * ended) from outbound-call/call-control.ts; this one stays off them.
 *
 * @module agents/shared/phone-goodbye
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { z } from 'zod';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'phone-goodbye' });

export const END_CALL = 'endCall';

export const END_CALL_DESCRIPTION =
  'Hang up this phone call. Use it only once the caller has clearly wrapped up ' +
  '("okay bye", "that\'s all", "talk soon") and you have said a short, real goodbye in your reply. ' +
  'Never hang up mid-conversation, after a pause, or when they might have more to say. ' +
  'Your goodbye finishes playing before the line drops.';

export type HangUp = (roomName: string) => Promise<void>;

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

/** The endCall tool for a phone call in `roomName`. */
export function createEndCallTool(roomName: string, hangUp: HangUp = deleteRoom) {
  return llm.tool({
    name: END_CALL,
    description: END_CALL_DESCRIPTION,
    parameters: z.object({}),
    execute: async (_args, { ctx }) => {
      try {
        await ctx.waitForPlayout();
      } catch {
        // Hang up anyway: a cut-off goodbye beats a line left open
      }
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
    sessionId?: string;
    roomName: string;
    participant: { kind?: ParticipantKind } | undefined;
    onBehalf: boolean;
    env?: Env;
    hangUp?: HangUp;
  }
): Promise<boolean> {
  if (!phoneGoodbyeEnabled(call.env) || call.onBehalf) return false;
  if (call.participant?.kind !== ParticipantKind.SIP) return false;
  const added = await addEndCallTool(agent, () => createEndCallTool(call.roomName, call.hangUp));
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
