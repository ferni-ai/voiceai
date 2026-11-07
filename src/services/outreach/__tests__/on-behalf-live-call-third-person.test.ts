/**
 * On a live call placed for Sam, Ferni speaks about Sam, never as Sam.
 *
 * The orchestrator used to put the enriched message ("Hey Alex! It's Sam...",
 * written in Sam's voice) into the call script, so Ferni could say it as Sam.
 * These run the real orchestrator against a fake LiveKit, with the enricher
 * returning first-person text on purpose, and read every input the live call
 * gets: the room metadata, the agent dispatch, and the prompt built from it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lk = vi.hoisted(() => ({ roomMetadata: '', dispatchMetadata: '' }));
const enrich = vi.hoisted(() => ({
  reply: undefined as string | undefined,
  outputs: [] as string[],
}));
const logged = vi.hoisted(() => [] as unknown[]);

vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async (opts: { metadata: string }) => {
      lk.roomMetadata = opts.metadata;
      return {};
    });
    listParticipants = vi.fn(async () => [{ identity: 'agent-AJ_1', kind: 4 }]);
    deleteRoom = vi.fn(async () => undefined);
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async (_room: string, _agent: string, opts: { metadata: string }) => {
      lk.dispatchMetadata = opts.metadata;
      return {};
    });
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
  },
}));
vi.mock('../call-retry.js', () => ({ isCallOptedOut: vi.fn(async () => false) }));
vi.mock('../deferred-calls.js', () => ({ holdForCallHours: vi.fn(async () => null) }));
vi.mock('../call-result-capture.js', () => ({ captureCallResult: vi.fn(async () => undefined) }));
vi.mock('../../llm-utils.js', () => ({ callLLM: vi.fn(async () => null) })); // no model
vi.mock('../message-enrichment.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../message-enrichment.js')>();
  return {
    ...real,
    enrichMessage: vi.fn(async (context: Parameters<typeof real.enrichMessage>[0]) => {
      const result =
        enrich.reply === undefined
          ? await real.enrichMessage(context)
          : {
              message: enrich.reply,
              metadata: {
                originalMessage: context.originalMessage,
                enrichedAt: new Date(),
                enrichmentType: 'llm' as const,
              },
            };
      enrich.outputs.push(result.message);
      return result;
    }),
  };
});
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record =
    () =>
    (...args: unknown[]) =>
      logged.push(args);
  const logger: Record<string, unknown> = {
    info: record(),
    warn: record(),
    error: record(),
    debug: record(),
    trace: record(),
    fatal: record(),
  };
  logger.child = () => logger;
  return { ...real, getLogger: () => logger, createLogger: () => logger };
});

vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
vi.stubEnv('LIVEKIT_API_KEY', 'k');
vi.stubEnv('LIVEKIT_API_SECRET', 's');
vi.stubEnv('DISPATCH_SIGNING_SECRET', 'dispatch-secret');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test');

const { getOnBehalfCallOrchestrator } = await import('../on-behalf-call-orchestrator.js');
const { AGENT_JOIN_WAIT_MS } = await import('../agent-join.js');
const { outboundCallContextBuilder, setOutboundCallContext, clearOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

type LiveContext = Parameters<typeof setOutboundCallContext>[1];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First-person self-introductions as the requester, curly apostrophes folded. */
function selfIntros(text: string, names: string[]): string[] {
  const folded = text.replace(/[‘’ʼ]/g, "'");
  const who = names.map(escapeRe).join('|');
  const intro = new RegExp(
    `\\b(?:it'?s|this is|i'?m|i am)\\s+(?:${who})\\b|\\b(?:${who})\\s+here\\b|\\bit'?s me\\b`,
    'gi'
  );
  return folded.match(intro) ?? [];
}

/** Place a personal call for `userName` and return every input the live call gets. */
async function liveInputs(userName: string, purpose: string, additionalContext?: string) {
  const placed = getOnBehalfCallOrchestrator().initiateCall({
    userId: 'owner-1',
    userName,
    contactQuery: 'Alex',
    purpose,
    callType: 'personal',
    userPreferences: { additionalContext },
    recordingConsent: false,
    resolvedContact: { name: 'Alex', phone: '+12135550142', relationship: 'friend' },
  } as never);
  await vi.advanceTimersByTimeAsync(AGENT_JOIN_WAIT_MS + 1_000);
  await placed;

  // What the agent job builds from the dispatch (voice-agent-entry/metadata-parser.ts).
  const dispatch = JSON.parse(lk.dispatchMetadata) as Record<string, unknown>;
  const contact = dispatch.contact as { name: string; phone: string };
  const requester = dispatch.requester as { name: string };
  const live = {
    callId: String(dispatch.callId),
    recipientName: contact.name,
    recipientPhone: contact.phone,
    purpose: String(dispatch.purpose),
    callType: 'personal',
    objective: String(dispatch.objective ?? dispatch.purpose),
    script: String(dispatch.script ?? ''),
    complianceScript: '',
    mustConfirm: [],
    mustNotDo: [],
    informationToGather: [],
    userName: requester.name,
    originalSessionId: '',
    kind: 'on_behalf',
  } as LiveContext;
  setOutboundCallContext('session-live', live);
  const injections = await outboundCallContextBuilder.build({
    services: { sessionId: 'session-live' },
  } as never);
  const prompt = injections.map((i) => i.content).join('\n\n');
  return { room: lk.roomMetadata, dispatch: lk.dispatchMetadata, prompt };
}

beforeEach(() => {
  vi.useFakeTimers();
  lk.roomMetadata = '';
  lk.dispatchMetadata = '';
  enrich.reply = undefined;
  enrich.outputs = [];
  logged.length = 0;
});
afterEach(() => {
  clearOutboundCallContext('session-live');
  vi.useRealTimers();
  vi.clearAllMocks();
});

const ENRICHER_OUTPUTS = [
  "Hey Alex! It's Sam. Just wanted to say hello... hope your week's going well.",
  'Hey Alex! It’s Sam Rivera... just thinking of you.', // curly apostrophe
  'Hi Alex, this is Sam. Just wanted to say hi... You have been on my mind.', // fallback shape
  "Hey Alex, it's me... love you, talk soon.", // fallback, close relationship
  'Sam here! Just calling to say hello.',
  "I'm Sam, and I wanted to say hello.",
];

describe('a live call placed for someone', () => {
  it.each(ENRICHER_OUTPUTS)('never speaks as the requester: %s', async (reply) => {
    enrich.reply = reply;
    const names = ['Sam Rivera', 'Sam'];
    expect(selfIntros(reply, names)).not.toEqual([]); // the enricher really spoke as Sam

    const inputs = await liveInputs('Sam Rivera', 'say hello to Alex');

    expect(enrich.outputs).toEqual([reply]); // enrichment ran on this call
    expect(selfIntros(inputs.room, names)).toEqual([]);
    expect(selfIntros(inputs.dispatch, names)).toEqual([]);
    expect(selfIntros(inputs.prompt, names)).toEqual([]);
    expect(inputs.prompt).toContain('"say hello to Alex"'); // the request itself still reaches the call
  });

  it("the real enricher's own output (no model) stays out of the call", async () => {
    const inputs = await liveInputs('Sam', 'say good morning');

    expect(enrich.outputs).toHaveLength(1);
    const [enriched] = enrich.outputs;
    expect(Object.values(inputs).some((text) => text.includes(enriched!))).toBe(false);
    for (const text of Object.values(inputs)) expect(selfIntros(text, ['Sam'])).toEqual([]);
  });

  it('a requester named Hope: "Hope here" never reaches the call, "I hope" in the request does', async () => {
    enrich.reply = 'Hope here! I hope you’re well... It’s Hope, just checking in.';
    expect(selfIntros(enrich.reply, ['Hope'])).toEqual(['Hope here', "It's Hope"]);
    expect(selfIntros("I hope you're well", ['Hope'])).toEqual([]);

    const inputs = await liveInputs('Hope', 'tell her I hope she feels better');

    for (const text of Object.values(inputs)) expect(selfIntros(text, ['Hope'])).toEqual([]);
    expect(inputs.prompt).toContain(
      `Purpose, in Hope's own words, for you to pass on as Hope's: "tell her I hope she feels better"`
    );
  });

  it('frames the request as a message from the requester that Ferni relays', async () => {
    const { prompt } = await liveInputs(
      'Sam',
      'tell Alex I am running late',
      "I'll bring the cake"
    );

    expect(prompt).toContain(
      `Purpose, in Sam's own words, for you to pass on as Sam's: "tell Alex I am running late"`
    );
    expect(prompt).toContain('Say it about Sam, in the third person');
    expect(prompt).toContain('Their "I" means Sam');
    expect(prompt).toContain('You are not Sam');
    expect(prompt).toContain(
      `### Additional Context (from Sam; their "I" means Sam)\nI'll bring the cake`
    );
  });

  it("a family check-in keeps the server's own purpose line, unframed", async () => {
    setOutboundCallContext('session-live', {
      callId: 'c1',
      recipientName: 'Alex',
      recipientPhone: '',
      purpose: 'Sam asked you to check in on Alex.',
      callType: 'personal',
      objective: 'See how Alex is doing.',
      script: '',
      complianceScript: '',
      mustConfirm: [],
      mustNotDo: [],
      informationToGather: [],
      userName: 'Sam',
      originalSessionId: '',
      kind: 'family_checkin',
    } as LiveContext);
    const [purpose] = await outboundCallContextBuilder.build({
      services: { sessionId: 'session-live' },
    } as never);

    expect(purpose!.content).toContain(
      'PRIMARY OBJECTIVE: See how Alex is doing.\n\nPurpose: Sam asked you to check in on Alex.\n'
    );
    expect(purpose!.content).not.toContain('own words');
  });

  it('logs no message text and no name while placing it', async () => {
    enrich.reply = "Hey Alex! It's Sam. Just wanted to say hello.";
    await liveInputs('Sam Rivera', 'say hello to Alex');

    expect(logged.length).toBeGreaterThan(0); // the capture saw the orchestrator's logs
    const text = JSON.stringify(logged);
    expect(text).not.toContain("It's Sam");
    expect(text).not.toContain('Sam Rivera');
    expect(text).not.toContain('say hello to Alex');
  });
});
