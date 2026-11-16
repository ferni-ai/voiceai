/**
 * GROUP_CALL: who may be heard as the guest on the owner's call.
 *
 * Only a participant whose identity starts with `guest_` and who is on the phone (SIP)
 * or the web (STANDARD). A recorder (EGRESS), a stream (INGRESS), an agent, or anyone
 * else who reaches the room is never mixed into what Ferni hears.
 *
 * @module agents/group-conversation/guest-admission
 */
import { ParticipantKind } from '@livekit/rtc-node';

const GUEST_IDENTITY_PREFIX = 'guest_';
const GUEST_KINDS: ReadonlySet<ParticipantKind> = new Set([
  ParticipantKind.SIP,
  ParticipantKind.STANDARD,
]);

export function isAdmittedGuest(person: { identity: string; kind?: ParticipantKind }): boolean {
  return (
    person.identity.startsWith(GUEST_IDENTITY_PREFIX) &&
    person.kind !== undefined &&
    GUEST_KINDS.has(person.kind)
  );
}
