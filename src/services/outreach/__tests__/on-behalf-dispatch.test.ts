import { describe, expect, it } from 'vitest';
import {
  buildOnBehalfDispatch,
  parseOnBehalfDispatch,
  signOnBehalfDispatch,
  verifyOnBehalfDispatch,
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

  it('trusts only the dispatch exactly as the server signed it', () => {
    const wire = JSON.stringify(
      signOnBehalfDispatch(buildOnBehalfDispatch(input), 'server-secret')
    );
    expect(verifyOnBehalfDispatch(wire, 'server-secret')).toBe(true);
    expect(verifyOnBehalfDispatch(wire, 'other-secret')).toBe(false);
    expect(verifyOnBehalfDispatch(wire, undefined)).toBe(false);
    expect(
      verifyOnBehalfDispatch(JSON.stringify(buildOnBehalfDispatch(input)), 'server-secret')
    ).toBe(false);
    expect(verifyOnBehalfDispatch('not json', 'server-secret')).toBe(false);
  });

  it('rejects a signed payload with any field changed', () => {
    const signed = JSON.parse(
      JSON.stringify(signOnBehalfDispatch(buildOnBehalfDispatch(input), 'server-secret'))
    );
    const tampered = [
      { ...signed, requester: { ...signed.requester, userId: 'victim' } },
      { ...signed, requester: { ...signed.requester, originalSessionId: 'someone-elses-room' } },
      { ...signed, contact: { ...signed.contact, name: 'Your bank' } },
      { ...signed, purpose: 'say something else' },
      { ...signed, script: 'injected script' },
    ];
    for (const payload of tampered) {
      expect(verifyOnBehalfDispatch(JSON.stringify(payload), 'server-secret')).toBe(false);
    }
  });

  it('verifies regardless of key order on the wire', () => {
    const signed = signOnBehalfDispatch(buildOnBehalfDispatch(input), 'server-secret');
    const reordered = Object.fromEntries(Object.entries(signed).reverse());
    expect(verifyOnBehalfDispatch(JSON.stringify(reordered), 'server-secret')).toBe(true);
  });
});
