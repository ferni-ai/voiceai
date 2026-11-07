/**
 * An on-behalf call rings the contact only once Ferni's agent is in the room.
 *
 * LiveKit can accept an agent dispatch and then give the job to no worker. The
 * orchestrator used to dial about 40 ms after the dispatch was accepted, without
 * checking that an agent had joined. When no worker took the job, the contact
 * picked up to silence. The call result is captured inside the agent's own job,
 * so with no agent nothing was recorded, and the owner, told "I'll let you know
 * what she says", never heard back.
 *
 * Now the orchestrator waits up to AGENT_JOIN_WAIT_MS for an agent participant.
 * If none joins, it dials nothing and rejects with AgentNotJoinedError, so its
 * callers say the call wasn't placed (call-not-placed.ts). This module's watchdog
 * then closes the room and records the call as failed, with the outcome the
 * Twilio path records when its dispatch fails (twilio-call-status.ts).
 *
 * @module services/outreach/agent-join
 */
import { ParticipantInfo_Kind } from '@livekit/protocol';
import { getLogger } from '../../utils/safe-logger.js';
import {
  AGENT_NOT_JOINED,
  isAgentNotJoined,
  type CallOutcome,
  type OnBehalfCallRequest,
} from '../../tools/domains/telephony/index.js';

export { isAgentNotJoined };

const log = getLogger().child({ service: 'agent-join' });

/** Longest an on-behalf call waits for its agent before it gives up and dials nothing. */
export const AGENT_JOIN_WAIT_MS = 5_000;
/** How often the room is read while waiting. */
const AGENT_JOIN_POLL_MS = 250;

/** No agent joined the call's room in time, so nothing was dialled. */
class AgentNotJoinedError extends Error {
  readonly code = AGENT_NOT_JOINED;
  constructor() {
    super(`No agent joined the call room within ${AGENT_JOIN_WAIT_MS} ms; nothing was dialled`);
    this.name = 'AgentNotJoinedError';
  }
}

/** The one RoomServiceClient read the wait needs. */
interface ParticipantLookup {
  listParticipants(room: string): Promise<Array<{ kind?: number }>>;
}

/** The orchestrator's LiveKit keys. */
interface LiveKitKeys {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}

/** The call the watchdog closes. */
interface UnansweredCall {
  id: string;
  livekitRoomName?: string;
  request: OnBehalfCallRequest;
}

async function roomService(keys: LiveKitKeys) {
  const { RoomServiceClient } = await import('livekit-server-sdk');
  return new RoomServiceClient(keys.livekitUrl, keys.livekitApiKey, keys.livekitApiSecret);
}

/**
 * True once an agent participant is in `room`, false if none joined within
 * `waitMs`. A failed read counts as "not yet". The room is read one last time at
 * the deadline, so an agent that joins just before it still counts.
 */
async function waitForAgentJoin(
  rooms: ParticipantLookup,
  room: string,
  waitMs = AGENT_JOIN_WAIT_MS
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const people = await Promise.resolve()
      .then(() => rooms.listParticipants(room))
      .catch(() => []);
    if (people.some((p) => p.kind === ParticipantInfo_Kind.AGENT)) return true;
    const left = deadline - Date.now();
    if (left <= 0) return false;
    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(AGENT_JOIN_POLL_MS, left));
    });
  }
}

/** Resolves once the agent is in `room`; rejects with AgentNotJoinedError if it never comes. */
export async function awaitAgent(keys: LiveKitKeys, room: string, callId: string): Promise<void> {
  const started = Date.now();
  if (await waitForAgentJoin(await roomService(keys), room)) {
    log.info({ callId, joinMs: Date.now() - started }, 'ON_BEHALF_AGENT_JOINED');
    return;
  }
  log.error({ callId }, 'ON_BEHALF_NO_AGENT: no agent joined; the call was not dialled');
  throw new AgentNotJoinedError();
}

/** The failed result recorded when Ferni's agent never joined the call. */
export function agentNeverJoinedOutcome(callId: string, contactName: string): CallOutcome {
  return {
    callId,
    status: 'failed',
    objectiveAchieved: false,
    outcome: `Ferni couldn't connect the call to ${contactName}`,
    callbackRequired: true,
  };
}

/**
 * The no-agent watchdog. Nothing rang: record the call as failed with the reason,
 * then close the room, so an agent arriving late doesn't sit in it. Recording
 * comes first: closing the room ends a late agent's session, and that job reads
 * the record (neverPlaced) before it reports anything. Never throws.
 */
export async function endCallWithNoAgent(keys: LiveKitKeys, call: UnansweredCall): Promise<void> {
  try {
    const { captureCallResult } = await import('./call-result-capture.js');
    const contactName = call.request.resolvedContact?.name || call.request.contactQuery;
    const outcome = agentNeverJoinedOutcome(call.id, contactName);
    await captureCallResult(call.id, { ...outcome, notPlaced: AGENT_NOT_JOINED }, call.request);
  } catch (error) {
    log.error({ error: String(error), callId: call.id }, 'Could not record the call with no agent');
  }
  try {
    if (call.livekitRoomName) await (await roomService(keys)).deleteRoom(call.livekitRoomName);
  } catch (error) {
    log.warn({ error: String(error), callId: call.id }, 'Could not close the room with no agent');
  }
}

/**
 * True when the watchdog recorded this call as never placed. An agent that
 * reaches the room after the wait gave up hears no one; its job must not report
 * that as a missed call, which would overwrite the stored failure with no_answer
 * and, with CALL_FOLLOWTHROUGH, retry a call that never rang. A failed read is
 * false: the job reports as it did before this check.
 */
export async function neverPlaced(callId: string, userId: string): Promise<boolean> {
  const { getCallResult } = await import('./call-result-capture.js');
  const stored = await getCallResult(callId, userId).catch(() => null);
  if (stored?.outcome?.notPlaced !== AGENT_NOT_JOINED) return false;
  log.info({ callId }, 'ON_BEHALF_LATE_AGENT: the call was never placed; nothing reported');
  return true;
}
