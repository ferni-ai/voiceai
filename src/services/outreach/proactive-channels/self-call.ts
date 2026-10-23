/**
 * Ferni rings the user: a signed `proactive_outreach` dispatch to the voice
 * agent, then a SIP call (LiveKit, the outbound trunk) to the phone on their
 * Firebase account and nowhere else.
 *
 * The dispatch carries why Ferni is calling (triggerReason). The agent turns
 * it into the call's check-in context, and with PROACTIVE_REASON_OPENER (#631)
 * Ferni opens by saying why she called instead of a generic hello. It is
 * signed with dispatchSigningSecret() like every call the server places
 * (on-behalf-dispatch.ts), so the agent can tell it came from us.
 *
 * Nothing is placed without SIP_TRUNK_ID. The call waits up to 30s for an
 * answer, and how it ended (answered, no answer, busy, declined) comes back
 * for the outreach log, which is what backs calls off.
 *
 * @module services/outreach/proactive-channels/self-call
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../../../utils/safe-logger.js';
import { dispatchSigningSecret, signDispatch } from '../on-behalf-dispatch.js';
import type { OutreachOutcome } from './outreach-log.js';
import type { ProactiveTrigger } from './types.js';

const log = createLogger({ module: 'ProactiveSelfCall' });

const RING_SECONDS = 30;

export type CallOutcome = Extract<
  OutreachOutcome,
  'answered' | 'no_answer' | 'busy' | 'declined' | 'failed'
>;

/** The LiveKit calls this makes; tests stub them (the SDK edge). */
export interface SipApi {
  createRoom: (name: string) => Promise<void>;
  dispatchAgent: (room: string, metadata: string) => Promise<void>;
  dial: (trunkId: string, phone: string, room: string, callId: string) => Promise<void>;
}

export function canPlaceCalls(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SIP_TRUNK_ID && env.LIVEKIT_URL && env.LIVEKIT_API_SECRET);
}

/**
 * What the agent job gets: the user on the line is the user, why we called,
 * and who calls (the agent speaks as persona_id, in that persona's voice).
 */
export function selfCallDispatch(
  userId: string,
  callId: string,
  trigger: Pick<ProactiveTrigger, 'kind' | 'reason' | 'sourceId'>,
  personaId = 'ferni'
): Record<string, unknown> {
  return {
    type: 'proactive_outreach',
    callId,
    userId,
    persona_id: personaId,
    triggerType: trigger.kind,
    triggerReason: trigger.reason,
    triggerId: trigger.sourceId,
    openerStyle: 'warm',
  };
}

/** How a dial that didn't connect ended, from the SIP status LiveKit reports. */
export function outcomeOf(error: unknown): CallOutcome {
  const meta = (error as { metadata?: Record<string, string> }).metadata ?? {};
  const status = Number(meta.sip_status_code ?? /\b([4-6]\d\d)\b/.exec(String(error))?.[1]);
  if (status === 486 || status === 600) return 'busy';
  if (status === 603) return 'declined';
  if ([408, 480, 487].includes(status) || /timeout|no answer/i.test(String(error))) {
    return 'no_answer';
  }
  return 'failed';
}

async function livekitSip(): Promise<SipApi> {
  const { AgentDispatchClient, RoomServiceClient, SipClient } = await import('livekit-server-sdk');
  const url = process.env.LIVEKIT_URL ?? '';
  const key = process.env.LIVEKIT_API_KEY ?? '';
  const secret = process.env.LIVEKIT_API_SECRET ?? '';
  const agentName = process.env.AGENT_NAME || 'voice-agent';
  return {
    async createRoom(name) {
      await new RoomServiceClient(url, key, secret).createRoom({
        name,
        emptyTimeout: 300,
        maxParticipants: 2,
      });
    },
    async dispatchAgent(room, metadata) {
      await new AgentDispatchClient(url, key, secret).createDispatch(room, agentName, { metadata });
    },
    async dial(trunkId, phone, room, callId) {
      await new SipClient(url, key, secret).createSipParticipant(trunkId, phone, room, {
        participantIdentity: `phone_${callId}`,
        participantName: 'You',
        playDialtone: false,
        ringingTimeout: RING_SECONDS,
        waitUntilAnswered: true,
        timeout: RING_SECONDS + 10,
      });
    },
  };
}

export async function placeSelfCall(
  userId: string,
  phone: string,
  trigger: Pick<ProactiveTrigger, 'kind' | 'reason' | 'sourceId'>,
  sip?: SipApi,
  personaId = 'ferni'
): Promise<CallOutcome> {
  const trunkId = process.env.SIP_TRUNK_ID;
  const secret = dispatchSigningSecret();
  if (!canPlaceCalls() || !trunkId || !secret) {
    log.info({ userId }, 'No SIP trunk or LiveKit credentials; not calling');
    return 'failed';
  }
  const callId = randomUUID();
  const room = `proactive-${callId}`;
  const api = sip ?? (await livekitSip());
  try {
    await api.createRoom(room);
    const signed = signDispatch(selfCallDispatch(userId, callId, trigger, personaId), secret);
    await api.dispatchAgent(room, JSON.stringify(signed));
    await api.dial(trunkId, phone, room, callId);
    log.info(
      { userId, callId, kind: trigger.kind, tail: phone.slice(-2) },
      'Proactive call answered'
    );
    return 'answered';
  } catch (error) {
    const outcome = outcomeOf(error);
    log.info({ userId, callId, outcome, error: String(error) }, 'Proactive call not answered');
    return outcome;
  }
}
