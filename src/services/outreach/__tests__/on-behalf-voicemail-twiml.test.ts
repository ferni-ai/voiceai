/**
 * The TwiML the real orchestrator answers a machine with, on a call Sam asked
 * Ferni to place to Alex: it opens with the AI-friend greeting whether the
 * model wrote the rest or the fallback did. Voicemails Ferni leaves for the
 * user themselves are unchanged. Fictional people and 555-01xx numbers only.
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
const { speaksAsRequester } = await import('../on-behalf-voicemail.js');

const request = () =>
  ({
    userId: 'owner-1',
    userName: 'Sam',
    purpose: 'say hello',
    callType: 'personal',
    recordingConsent: false,
    resolvedContact: { name: 'Alex', phone: '+12135550101', relationship: 'friend' },
  }) as never;

/** What the <Say> speaks, unescaped. */
async function voicemailSaid(): Promise<string> {
  const orchestrator = getOnBehalfCallOrchestrator();
  const callId = await orchestrator.initiateCall(request());
  const twiml = (await orchestrator.handleMachineDetection(callId, 'machine_end_beep')) ?? '';
  const said = /<Say voice="Polly\.Joanna">([\s\S]*)<\/Say>/.exec(twiml)?.[1] ?? '';
  return said
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

beforeEach(() => {
  callLLM.mockReset();
});

describe('the on-behalf voicemail TwiML', () => {
  it('opens with the AI-friend greeting before the written line', async () => {
    callLLM.mockImplementation(async (prompt) =>
      prompt.includes('leaving a voicemail') ? 'Sam wanted me to say hello. Take care.' : null
    );
    expect(await voicemailSaid()).toBe(
      "Hi Alex, it's Ferni, Sam's AI friend. Sam wanted me to say hello. Take care."
    );
  });

  it('never says the written line that speaks as Sam', async () => {
    callLLM.mockImplementation(async (prompt) =>
      prompt.includes('leaving a voicemail') ? "Hi Alex! It's Sam. Just wanted to say hello." : null
    );
    const said = await voicemailSaid();
    expect(said).toMatch(/^Hi Alex, it's Ferni, Sam's AI friend\. Sam wanted me to say hello\./);
    expect(speaksAsRequester(said, 'Sam')).toBe(false);
  });

  it('opens with the greeting on the fallback too', async () => {
    callLLM.mockResolvedValue(null);
    const said = await voicemailSaid();
    expect(said).toMatch(/^Hi Alex, it's Ferni, Sam's AI friend\. Sam wanted me to say hello\./);
    expect(speaksAsRequester(said, 'Sam')).toBe(false);
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
