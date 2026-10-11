/**
 * Only the account owner's yes may confirm a text, call or email
 * (outreach-confirm.ts). On calls where Ferni rang someone else, or a phone
 * caller recognition couldn't place, the person on the line is not the owner.
 */
import { describe, expect, it } from 'vitest';
import { setOutboundCallContext } from '../../../intelligence/context-builders/external/outbound-call-context.js';
import { rememberCallerRecognition } from '../../voice-agent-entry/caller-recognition.js';
import { speakerIsAccountOwner } from '../live-call-behaviors.js';

const outboundCall = (kind: 'on_behalf' | 'family_checkin') =>
  ({ callId: 'c', recipientName: 'Grandma', userName: 'Sam', callType: 'personal', kind }) as never;

describe('speakerIsAccountOwner', () => {
  it("is true on the owner's own call", () => {
    expect(speakerIsAccountOwner('own-session')).toBe(true);
  });

  it('is false on on-behalf and family check-in calls', () => {
    setOutboundCallContext('on-behalf-session', outboundCall('on_behalf'));
    setOutboundCallContext('checkin-session', outboundCall('family_checkin'));

    expect(speakerIsAccountOwner('on-behalf-session')).toBe(false);
    expect(speakerIsAccountOwner('checkin-session')).toBe(false);
  });

  it('is false for a phone caller recognition marked maybe or stranger, true when known', () => {
    rememberCallerRecognition('maybe-session', { status: 'maybe', attestation: 'none' });
    rememberCallerRecognition('stranger-session', { status: 'stranger', attestation: 'none' });
    rememberCallerRecognition('known-session', { status: 'known', attestation: 'none' } as never);

    expect(speakerIsAccountOwner('maybe-session')).toBe(false);
    expect(speakerIsAccountOwner('stranger-session')).toBe(false);
    expect(speakerIsAccountOwner('known-session')).toBe(true);
  });
});
