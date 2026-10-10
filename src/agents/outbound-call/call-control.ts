/**
 * Call control for on-behalf phone calls: lets Ferni end the call itself.
 *
 * On a phone call there is no app to close, so before this the call only
 * ended when the other person hung up (or a timeout fired). A person on the
 * phone says goodbye and hangs up; after leaving a voicemail they hang up.
 * The `endCall` tool does the same: it records how the call ended, lets
 * Ferni's last words finish playing, then deletes the call's LiveKit room,
 * which drops the phone leg and ends the session (the lifecycle then reports
 * the call, using the recorded disposition).
 *
 * The tool exists only in on-behalf call sessions.
 *
 * @module agents/outbound-call/call-control
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'outbound-call-control' });

export const END_CALL = 'endCall';

export const CALL_DISPOSITIONS = [
  'completed',
  'voicemail_left',
  'refused',
  'wrong_number',
] as const;
export type CallDisposition = (typeof CALL_DISPOSITIONS)[number];

interface CallSession {
  callId: string;
  roomName: string;
}

// Both keyed by the agent session, never by the dispatch's callId: a session
// can only record or read how its own call ended.
const sessions = new Map<string, CallSession>();
const dispositions = new Map<string, CallDisposition>();

/** Remember which room an on-behalf call session is in, so it can hang up. */
export function registerOnBehalfCallRoom(
  sessionId: string,
  callId: string,
  roomName: string
): void {
  sessions.set(sessionId, { callId, roomName });
}

/** How Ferni said this session's call ended, if it hung up itself. Read once. */
export function takeCallDisposition(sessionId: string): CallDisposition | undefined {
  const disposition = dispositions.get(sessionId);
  dispositions.delete(sessionId);
  return disposition;
}

export function forgetOnBehalfCallRoom(sessionId: string): void {
  sessions.delete(sessionId);
}

export type HangUp = (roomName: string) => Promise<void>;

async function deleteRoom(roomName: string): Promise<void> {
  const { RoomServiceClient } = await import('livekit-server-sdk');
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error('LiveKit credentials not configured');
  await new RoomServiceClient(url, key, secret).deleteRoom(roomName);
}

/**
 * The endCall tool for an on-behalf call session, or null for any other session.
 */
export function createEndCallTool(sessionId: string, hangUp: HangUp = deleteRoom) {
  const call = sessions.get(sessionId);
  if (!call) return null;

  return llm.tool({
    description:
      'Hang up this phone call. Call it right after your goodbye, once you have left a voicemail, ' +
      "if they won't talk with an AI, or if you reached the wrong person. Your last words finish " +
      'playing before the line drops.',
    parameters: z.object({
      outcome: z
        .enum(CALL_DISPOSITIONS)
        .describe(
          'completed: you talked and said goodbye; voicemail_left: you left a message; ' +
            "refused: they didn't want to talk; wrong_number: it wasn't the right person"
        ),
    }),
    execute: async ({ outcome }, { ctx }) => {
      dispositions.set(sessionId, outcome);
      try {
        await ctx.waitForPlayout();
      } catch {
        // Hang up anyway; a cut-off goodbye beats a line left open
      }
      try {
        await hangUp(call.roomName);
        log.info({ callId: call.callId, outcome }, 'Ferni hung up the call');
        return 'The call has ended.';
      } catch (error) {
        log.error({ error: String(error), callId: call.callId }, 'Failed to hang up');
        return "The line didn't drop. Stay quiet; the call will end when they hang up.";
      }
    },
  });
}
