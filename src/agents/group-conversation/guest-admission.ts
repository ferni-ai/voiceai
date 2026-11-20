/**
 * GROUP_CALL: who may be heard as the guest on the owner's call.
 *
 * Only a participant whose identity starts with `guest_` and who is on the phone (SIP)
 * or the web (STANDARD), and never the owner: an owner whose identity happens to start
 * with `guest_` is still the owner. A recorder (EGRESS), a stream (INGRESS), an agent,
 * or anyone else who reaches the room is never mixed into what Ferni hears as the guest.
 *
 * @module agents/group-conversation/guest-admission
 */
import type { ParticipantKind } from '@livekit/rtc-node';

import { isPersonKind } from '../shared/participant-kind.js';

const GUEST_IDENTITY_PREFIX = 'guest_';

export function isAdmittedGuest(
  person: { identity: string; kind?: ParticipantKind },
  ownerIdentity: string
): boolean {
  return (
    person.identity !== ownerIdentity &&
    person.identity.startsWith(GUEST_IDENTITY_PREFIX) &&
    isPersonKind(person.kind)
  );
}
