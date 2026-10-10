import { describe, expect, it } from 'vitest';
import {
  buildOnBehalfDispatch,
  onBehalfDispatchFor,
  parseOnBehalfDispatch,
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

  it('carries the missed call a retry is for, so the retry is not retried', () => {
    const request = {
      contactQuery: 'Mom',
      resolvedContact: input.contact,
      purpose: input.purpose,
      objective: input.objective,
      callType: input.callType,
      originalSessionId: 'session-orig',
      userId: 'user-1',
      userTimezone: 'America/New_York',
      userName: 'Seth',
      recordingConsent: false,
    };
    const wire = (r: typeof request & { retryOf?: string }) =>
      JSON.parse(JSON.stringify(onBehalfDispatchFor('call-2', r)));
    expect(parseOnBehalfDispatch(wire({ ...request, retryOf: 'call-1' }))?.retryOf).toBe('call-1');
    expect(parseOnBehalfDispatch(wire(request))?.retryOf).toBeUndefined();
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
});
