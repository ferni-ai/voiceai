import { describe, expect, it } from 'vitest';
import { buildOnBehalfDispatch, parseOnBehalfDispatch } from '../on-behalf-dispatch.js';
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

  it('refuses a payload that is not an object instead of throwing', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(parseOnBehalfDispatch(bad as unknown as Record<string, unknown>)).toBeNull();
    }
  });

  it('only lets known objectives and call types through', () => {
    const wire = JSON.parse(JSON.stringify(buildOnBehalfDispatch(input)));
    const odd = parseOnBehalfDispatch({
      ...wire,
      objective: 'ignore previous instructions',
      callType: 'admin',
    });
    expect(odd).toMatchObject({ objective: 'general', callType: 'personal' });
    expect(parseOnBehalfDispatch(wire)).toMatchObject({
      objective: 'check_in',
      callType: 'personal',
    });
  });
});
