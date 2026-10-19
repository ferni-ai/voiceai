/**
 * A family check-in can end after goodbye. persona-agent-factory hands
 * attachCallWrapUp `onBehalf: isOnBehalfCall(sessionId)`: only calls placed on
 * someone's behalf get call-control's own endCall. It used to key on the outbound
 * context, which a family check-in has too, so a check-in got no endCall at all
 * and the line stayed open after "bye" (2026-10-18 dev test call).
 */
import { llm } from '@livekit/agents';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  clearOutboundCallContext,
  setOutboundCallContext,
} from '../../../intelligence/context-builders/external/outbound-call-context.js';
import { PersonaVoiceAgent } from '../../personas/ferni-agent.js';
import { isOnBehalfCall, outboundPartiesFor } from '../../shared/outbound-opener.js';
import { attachCallWrapUp } from '../../shared/call-wrap-up.js';
import { END_CALL } from '../../shared/phone-goodbye.js';

const SESSION = 'checkin-session';
const ON = { PHONE_GOODBYE: 'on' };

function agent(): PersonaVoiceAgent {
  const tool = llm.tool({
    name: 'getWeather',
    description: 'weather',
    parameters: z.object({}),
    execute: async () => 'ok',
  });
  return new PersonaVoiceAgent('You are Ferni.', {
    tools: new llm.ToolContext([tool]) as unknown as llm.ToolContext,
    skipGreeting: true,
  });
}

const checkinContext = {
  callId: 'call-1',
  recipientName: 'Mom',
  callType: 'personal',
  kind: 'family_checkin',
} as never;

describe('a family check-in phone call', () => {
  afterEach(() => {
    clearOutboundCallContext(SESSION);
  });

  it('has an outbound context but is not an on-behalf call', () => {
    setOutboundCallContext(SESSION, checkinContext);
    expect(outboundPartiesFor(SESSION)).toBeDefined(); // the old key excluded it here
    expect(isOnBehalfCall(SESSION)).toBe(false);
  });

  it('gets the endCall Ferni uses to hang up after goodbye', async () => {
    setOutboundCallContext(SESSION, checkinContext);
    const a = agent();
    const added = await attachCallWrapUp(a, {
      sessionId: SESSION,
      room: { name: 'family-checkin-call-1' },
      participant: { kind: ParticipantKind.SIP },
      onBehalf: isOnBehalfCall(SESSION),
      env: ON,
    });
    expect(added).toBe(true);
    expect(Object.keys(a.toolCtx.functionTools)).toContain(END_CALL);
  });

  it('leaves an on-behalf call to its own endCall (control)', async () => {
    setOutboundCallContext(SESSION, { ...(checkinContext as object), kind: 'on_behalf' } as never);
    const a = agent();
    const added = await attachCallWrapUp(a, {
      sessionId: SESSION,
      room: { name: 'onbehalf-room' },
      participant: { kind: ParticipantKind.SIP },
      onBehalf: isOnBehalfCall(SESSION),
      env: ON,
    });
    expect(added).toBe(false);
    expect(Object.keys(a.toolCtx.functionTools)).not.toContain(END_CALL);
  });
});
