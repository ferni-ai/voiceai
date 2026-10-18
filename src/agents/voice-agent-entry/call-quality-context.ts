/**
 * For the call-quality SLOs (call-quality-slo.ts), once the caller joins: whether it is an
 * eval or key-check call, and when the caller could first hear Ferni ('call_answered'). A
 * phone Ferni dialed joins while still ringing (outbound-opener.ts), so that is its answer.
 *
 * @module agents/voice-agent-entry/call-quality-context
 */
import { isEvalTraffic } from '../../services/analytics/call-quality-slo.js';
import { markCallStage, recordCallEvent } from '../../services/analytics/call-quality-monitor.js';
import type { AttributeUpdates, SipParticipantLike } from './sip-caller.js';

const SIP_CALL_STATUS = 'sip.callStatus';
/** A dialed phone that hasn't answered by now never will (outbound-opener.ts waits 60 s). */
const ANSWER_WATCH_MS = 90_000;

type AttributesListener = Parameters<AttributeUpdates['on']>[1];

export function noteCallQualityContext(input: {
  participant: SipParticipantLike;
  room: AttributeUpdates & object;
  sessionId: string;
}): void {
  const { participant, room, sessionId } = input;
  const roomName = 'name' in room && typeof room.name === 'string' ? room.name : undefined;
  if (isEvalTraffic(roomName, participant.identity)) {
    recordCallEvent({
      callId: sessionId,
      timestamp: Date.now(),
      type: 'call_context',
      metadata: { traffic: 'eval' },
    });
  }

  const status = participant.attributes?.[SIP_CALL_STATUS];
  if (status === undefined || status === 'active') {
    markCallStage(sessionId, 'call_answered');
    return;
  }
  const stop = (): void => {
    clearTimeout(timer);
    room.off('participantAttributesChanged', onChange);
  };
  const onChange: AttributesListener = (changed, who) => {
    if (who.identity !== participant.identity) return;
    const next = changed[SIP_CALL_STATUS];
    if (next === 'active') markCallStage(sessionId, 'call_answered');
    if (next === 'active' || next === 'hangup') stop();
  };
  const timer = setTimeout(stop, ANSWER_WATCH_MS);
  timer.unref?.();
  room.on('participantAttributesChanged', onChange);
}
