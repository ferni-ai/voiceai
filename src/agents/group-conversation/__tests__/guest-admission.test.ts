/**
 * GROUP_CALL: only a `guest_` caller on the phone or the web may be heard as the guest;
 * a stranger, a recorder, a stream or an agent on the room never is.
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';
import { isAdmittedGuest } from '../guest-admission.js';

describe('isAdmittedGuest', () => {
  it('admits a guest_ caller on the phone or the web', () => {
    expect(isAdmittedGuest({ identity: 'guest_123', kind: ParticipantKind.SIP })).toBe(true);
    expect(isAdmittedGuest({ identity: 'guest_web', kind: ParticipantKind.STANDARD })).toBe(true);
  });

  it('does not admit anyone without the guest_ prefix', () => {
    expect(isAdmittedGuest({ identity: 'eve', kind: ParticipantKind.STANDARD })).toBe(false);
    expect(isAdmittedGuest({ identity: 'sip_+15555550123', kind: ParticipantKind.SIP })).toBe(
      false
    );
    expect(isAdmittedGuest({ identity: 'my_guest_1', kind: ParticipantKind.SIP })).toBe(false);
  });

  it('does not admit a guest_ identity of another kind', () => {
    expect(isAdmittedGuest({ identity: 'guest_rec', kind: ParticipantKind.EGRESS })).toBe(false);
    expect(isAdmittedGuest({ identity: 'guest_in', kind: ParticipantKind.INGRESS })).toBe(false);
    expect(isAdmittedGuest({ identity: 'guest_bot', kind: ParticipantKind.AGENT })).toBe(false);
  });
});
