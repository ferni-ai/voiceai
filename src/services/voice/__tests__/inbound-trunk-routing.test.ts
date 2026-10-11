/**
 * SIP_TRUNK_ID is the outbound trunk (calls Ferni places). Setting it on the
 * UI server must not change how incoming calls are routed; only
 * SIP_INBOUND_TRUNK_ID does that.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function twimlWith(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { generateIncomingCallTwiml } = await import('../voice-call.js');
  const { generateInboundTwiml } = await import('../../../api/voice-auth/inbound-call-routes.js');
  const inbound = generateInboundTwiml({
    callSid: 'CA1',
    callerPhone: '+15555550100',
    isKnownCaller: false,
    isVoiceEnrolled: false,
    greeting: 'Hi',
  });
  return [generateIncomingCallTwiml(), inbound];
}

describe('inbound call routing ignores the outbound trunk', () => {
  it('does not dial LiveKit SIP for incoming calls when only SIP_TRUNK_ID is set', async () => {
    vi.stubEnv('SIP_INBOUND_TRUNK_ID', '');
    for (const twiml of await twimlWith({ SIP_TRUNK_ID: 'ST_outbound' })) {
      expect(twiml).not.toContain('<Sip>');
    }
  });

  it('dials LiveKit SIP when the inbound trunk is set', async () => {
    for (const twiml of await twimlWith({ SIP_INBOUND_TRUNK_ID: 'ST_inbound', SIP_TRUNK_ID: '' })) {
      expect(twiml).toContain('<Sip>');
    }
  });
});
