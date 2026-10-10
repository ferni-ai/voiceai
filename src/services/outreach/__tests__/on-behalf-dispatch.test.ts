import { describe, expect, it } from 'vitest';
import {
  buildOnBehalfDispatch,
  isTrustedOnBehalfDispatch,
  parseOnBehalfDispatch,
  signOnBehalfDispatch,
} from '../on-behalf-dispatch.js';
import { identifyFromMetadata } from '../../identity/user-identification.js';

const input = {
  callId: 'call-1',
  requester: {
    userId: 'user-1',
    name: 'Seth',
    timezone: 'America/New_York',
    originalSessionId: 'session-orig',
  },
  contact: { name: 'Mom', phone: '+15555550100', relationship: 'mother' },
  purpose: 'ask how her appointment went',
  objective: 'check_in' as const,
  callType: 'personal' as const,
};

describe('on-behalf dispatch contract', () => {
  it('round-trips through JSON as the agent receives it', () => {
    const wire = JSON.parse(JSON.stringify(buildOnBehalfDispatch(input)));
    expect(parseOnBehalfDispatch(wire)).toMatchObject({
      type: 'on_behalf_call',
      callId: 'call-1',
      requester: input.requester,
      contact: input.contact,
      objective: 'check_in',
    });
  });

  it('does not give the call session the requester as its user', async () => {
    const wire = JSON.parse(JSON.stringify(buildOnBehalfDispatch(input)));
    expect(wire.userId).toBeUndefined();
    expect(wire.user_id).toBeUndefined();
    expect(wire.userName).toBeUndefined();

    // The agent identifies its session from this payload
    const identity = await identifyFromMetadata(wire);
    expect(identity.source.type).toBe('anonymous');
    expect(String(identity.userId)).not.toContain('user-1');
    expect(String(identity.userId)).toContain('onbehalf:call-1');
  });

  it('still reads calls dispatched in the old top-level shape', () => {
    const legacy = {
      type: 'on_behalf_call',
      callId: 'call-old',
      userId: 'user-1',
      userName: 'Seth',
      originalSessionId: 'session-orig',
      contact: { name: 'Mom', phone: '+15555550100' },
      purpose: 'check in',
    };
    expect(parseOnBehalfDispatch(legacy)?.requester).toEqual({
      userId: 'user-1',
      name: 'Seth',
      timezone: 'UTC',
      originalSessionId: 'session-orig',
    });
  });

  it('refuses payloads it could not report back on', () => {
    const wire = buildOnBehalfDispatch(input) as unknown as Record<string, unknown>;
    expect(parseOnBehalfDispatch({ ...wire, callId: '' })).toBeNull();
    expect(parseOnBehalfDispatch({ ...wire, requester: { userId: 'unknown' } })).toBeNull();
    expect(parseOnBehalfDispatch({ callId: 'x' })).toBeNull();
  });

  it('trusts only payloads signed with the server secret, after the wire round-trip', () => {
    const signed = signOnBehalfDispatch(buildOnBehalfDispatch(input), 'server-secret');
    const received = parseOnBehalfDispatch(JSON.parse(JSON.stringify(signed)));
    if (!received) throw new Error('signed payload did not parse');

    expect(isTrustedOnBehalfDispatch(received, 'server-secret')).toBe(true);
    expect(isTrustedOnBehalfDispatch(received, 'other-secret')).toBe(false);
    expect(isTrustedOnBehalfDispatch(received, undefined)).toBe(false);
  });

  it('rejects unsigned payloads and signatures moved onto another requester', () => {
    const unsigned = parseOnBehalfDispatch(
      JSON.parse(JSON.stringify(buildOnBehalfDispatch(input)))
    );
    if (!unsigned) throw new Error('payload did not parse');
    expect(isTrustedOnBehalfDispatch(unsigned, 'server-secret')).toBe(false);

    const signed = signOnBehalfDispatch(buildOnBehalfDispatch(input), 'server-secret');
    const retargeted = { ...signed, requester: { ...signed.requester, userId: 'victim' } };
    expect(isTrustedOnBehalfDispatch(retargeted, 'server-secret')).toBe(false);
  });
});
