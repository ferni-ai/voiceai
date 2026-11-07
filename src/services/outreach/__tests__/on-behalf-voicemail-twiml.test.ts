/**
 * The TwiML the real orchestrator answers a machine with, on a call Sam asked
 * Ferni to place to Alex: the AI-friend greeting, Sam's request attributed,
 * the close, and no model asked for any of it. Voicemails Ferni leaves for
 * the user themselves are unchanged. Fictional people and 555-01xx numbers only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.hoisted(() => vi.fn<(prompt: string) => Promise<string | null>>());

vi.mock('../../llm-utils.js', () => ({ callLLM }));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
    listParticipants = vi.fn(async () => [{ identity: 'agent-AJ_1', kind: 4 }]);
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => ({}));
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
  },
}));
vi.mock('../call-retry.js', () => ({ isCallOptedOut: vi.fn(async () => false) }));
vi.mock('../deferred-calls.js', () => ({ holdForCallHours: vi.fn(async () => null) }));

vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
vi.stubEnv('LIVEKIT_API_KEY', 'k');
vi.stubEnv('LIVEKIT_API_SECRET', 's');
vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test');

const { getOnBehalfCallOrchestrator } = await import('../on-behalf-call-orchestrator.js');

const CLOSE = 'They wanted to make sure you got this message. Take care, and talk soon.';

const request = (userName: string, purpose: string, relationship = 'friend') =>
  ({
    userId: 'owner-1',
    userName,
    purpose,
    callType: 'personal',
    recordingConsent: false,
    resolvedContact: { name: 'Alex', phone: '+12135550101', relationship },
  }) as never;

/** What the <Say> speaks, unescaped, and how many model calls the machine answer made. */
async function voicemailSaid(
  userName: string,
  purpose: string,
  relationship?: string
): Promise<{ said: string; modelCalls: number }> {
  const orchestrator = getOnBehalfCallOrchestrator();
  const callId = await orchestrator.initiateCall(request(userName, purpose, relationship));
  callLLM.mockClear(); // the live call's script may use the model; the voicemail may not
  const twiml = (await orchestrator.handleMachineDetection(callId, 'machine_end_beep')) ?? '';
  const said = /<Say voice="Polly\.Joanna">([\s\S]*)<\/Say>/.exec(twiml)?.[1] ?? '';
  return {
    said: said
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'),
    modelCalls: callLLM.mock.calls.length,
  };
}

beforeEach(() => {
  callLLM.mockReset();
  // A model that would speak as Sam if it were ever asked
  callLLM.mockResolvedValue("Hi Alex! It's Sam. Just wanted to say hello.");
});

describe('the on-behalf voicemail TwiML', () => {
  it.each([
    [
      "we're at the park",
      "Sam asked me to pass on a message, in their words: we're at the park.",
      'friend',
    ],
    ['say hi', 'Sam says hi!', 'mom'],
    ['remind her to pick up the cake', 'Sam wanted to remind you to pick up the cake.', 'sister'],
  ])('is the fixed greeting, the request and the close: %j', async (purpose, relay, relation) => {
    const { said, modelCalls } = await voicemailSaid('Sam', purpose, relation);
    expect(said).toBe(`Hi Alex, it's Ferni, Sam's AI friend. ${relay} ${CLOSE}`);
    expect(modelCalls).toBe(0);
  });

  it('never asks the model, and names no one, when the request has no real requester name', async () => {
    // The fallback name the telephony tool and the gated call paths give a profile without one
    const { said, modelCalls } = await voicemailSaid('the user', "tell Alex it's Sam saying hi");
    expect(said).toBe(
      `Hi Alex, it's Ferni, an AI friend. Someone asked me to pass on a message, in their words: it's Sam saying hi. ${CLOSE}`
    );
    expect(modelCalls).toBe(0);
  });
});

describe('voicemails Ferni leaves for the user themselves (unchanged)', () => {
  it('sip-bridge persona voicemail', async () => {
    const { generateVoicemailTwiML } = await import('../sip-bridge.js');
    expect(generateVoicemailTwiML('ferni', 'Your weekly check-in is ready')).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Matthew">Hey! It's Ferni. Just wanted to reach out. Your weekly check-in is ready. I'll send you a text so you can respond when you have time. Take care!</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`
    );
  });

  it('conversational-call voicemail', async () => {
    const { getConversationalCallService } = await import('../conversational-calls.js');
    expect(
      await getConversationalCallService().handleMachineDetection?.('c1', 'machine_start')
    ).toBe(
      '<Response><Say>Hi, this is Ferni leaving a quick message. Talk to you soon!</Say></Response>'
    );
  });
});
