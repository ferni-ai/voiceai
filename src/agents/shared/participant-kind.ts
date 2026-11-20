/**
 * Which room participants are people: on the phone (SIP) or the web or app (STANDARD).
 * An agent, a recorder (EGRESS), a stream (INGRESS), a connector or a bridge is not.
 *
 * @module agents/shared/participant-kind
 */
import { ParticipantKind } from '@livekit/rtc-node';

export function isPersonKind(kind: ParticipantKind | undefined): boolean {
  return kind === ParticipantKind.SIP || kind === ParticipantKind.STANDARD;
}
