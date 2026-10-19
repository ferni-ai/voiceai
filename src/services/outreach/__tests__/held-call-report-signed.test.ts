/**
 * A held on-behalf call, placed later by the deferred-calls job on the web
 * server, reports back to the user who asked for it, end to end: the web
 * signs the dispatch with DISPATCH_SIGNING_SECRET, the agent verifies it, the
 * person on the line talks and hangs up, and captureCallResult runs for the
 * requester.
 *
 * Prod 2026-10-18: the web did not have DISPATCH_SIGNING_SECRET yet and signed
 * with its own LiveKit secret, which the agent (on LiveKit Cloud, with an
 * injected LiveKit secret) can't verify. The agent rightly refused to report,
 * but said so in a line nobody watched, and the unsigned dispatch still wrote
 * "answered" into the named user's call record.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type Row } from '../../scheduling/__tests__/fake-firestore.js';

let rows: Row[] = [];
const db = () => {
  const base = fakeFirestore(rows);
  return {
    ...base,
    collection: (name: string) => ({
      doc: (id: string) => ({
        ...base.collection().doc(id),
        get: async () => ({ exists: false, data: () => undefined }),
      }),
    }),
  };
};
/** What answered-by wrote: bogle_users/{uid}/on_behalf_calls/{callId}. */
const callRecords = () =>
  rows.filter((r) => r.collection === 'on_behalf_calls').map((r) => `${r.userId}/${r.id}`);
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db() }));
vi.mock('../user-contact.js', () => ({
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/New_York' })),
}));

const createDispatch = vi.fn(
  async (_room: string, _agent: string, _opts: { metadata: string }) => ({})
);
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
  },
  AgentDispatchClient: class {
    createDispatch = createDispatch;
  },
  SipClient: class {
    createSipParticipant = vi.fn(async () => ({ participantId: 'PA_1' }));
  },
}));
vi.mock('@livekit/agents', () => ({
  llm: { tool: (config: Record<string, unknown>) => config },
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => []),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../global-services.js', () => ({ getGlobalServicesSync: () => null }));

// The report itself and the LLM read of the call are the edges of this test.
const captureCallResult = vi.fn(async () => undefined);
vi.mock('../call-result-capture.js', () => ({ captureCallResult }));
vi.mock('../call-transcript-intelligence.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../call-transcript-intelligence.js')>()),
  analyzeCompletedCall: vi.fn(async () => null),
}));

const warnings: Array<{ fields: unknown; msg: unknown }> = [];
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) => {
      const logger = real.createLogger(...args);
      return new Proxy(logger, {
        get(target, prop, receiver) {
          if (prop === 'warn')
            return (fields: unknown, msg: unknown) => warnings.push({ fields, msg });
          return Reflect.get(target, prop, receiver) as unknown;
        },
      });
    },
  };
});

const SHARED = 'dispatch-signing-secret';
process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'k';
process.env.SIP_TRUNK_ID = 'ST_test';

const { createCallOnBehalfTool } =
  await import('../../../tools/domains/telephony/call-on-behalf.js');
const { executeDueDeferredCalls } = await import('../deferred-calls.js');
const { setupCallTypeContexts, finishCallTypeContexts } =
  await import('../../../agents/voice-agent-entry/metadata-parser.js');
const { wrapServicesForOnBehalfCapture } =
  await import('../../../agents/integrations/on-behalf-transcript-capture.js');
const { getOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');
const { recordAnsweredBy } = await import('../answered-by.js');
const { UNSIGNED_RESULT_DROPPED } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');

const ELEVEN_PM_LA = new Date('2026-10-14T06:00:00Z');
const NINE_AM_LA_NEXT = new Date('2026-10-14T16:01:00Z');

/** The web server: the user asks at 11pm their mom's time, the job places it at 9am. */
async function webPlacesHeldCall(webEnv: Record<string, string>): Promise<string> {
  for (const [k, v] of Object.entries(webEnv)) vi.stubEnv(k, v);
  const tool = createCallOnBehalfTool({
    userId: 'owner-1',
    sessionId: 's1',
  } as never) as unknown as {
    execute: (p: Record<string, unknown>) => Promise<string>;
  };
  vi.setSystemTime(ELEVEN_PM_LA);
  await tool.execute({
    contactQuery: 'Mom',
    phoneNumber: '213-555-0100',
    purpose: 'check in on her',
    recordingConsent: false,
  });
  vi.setSystemTime(NINE_AM_LA_NEXT);
  expect(await executeDueDeferredCalls()).toMatchObject({ placed: 1 });
  expect(createDispatch).toHaveBeenCalledTimes(1);
  vi.unstubAllEnvs();
  return createDispatch.mock.calls[0][2].metadata;
}

/** The agent on LiveKit Cloud: its own LiveKit secret, the shared signing secret. */
async function agentRunsCall(raw: string, sessionId: string): Promise<void> {
  vi.stubEnv('LIVEKIT_API_SECRET', 'agent-cloud-livekit-secret');
  vi.stubEnv('DISPATCH_SIGNING_SECRET', SHARED);
  const metadata = JSON.parse(raw) as Record<string, unknown>;
  await setupCallTypeContexts(metadata, 'on_behalf_call', sessionId, `room-${sessionId}`, raw);
  const services: { addTurn?: (role: 'user' | 'assistant', text: string) => void } = {
    addTurn: () => undefined,
  };
  wrapServicesForOnBehalfCapture(sessionId, services);
  const call = getOutboundCallContext(sessionId);
  if (call) await recordAnsweredBy(call, 'human');
  services.addTurn?.('assistant', 'Hi, this is Ferni calling for the owner.');
  services.addTurn?.('user', "Oh hi! I'm just heading out the door to church.");
  services.addTurn?.('user', 'Tell him he needs to go to church too. Bye now.');
  // The person hangs up: the session ends and the call type is finished.
  await finishCallTypeContexts(metadata, 'on_behalf_call', sessionId, 66_000, raw);
}

beforeEach(() => {
  rows = [];
  warnings.length = 0;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CALL_HOURS_GUARD', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('a held on-behalf call placed by the deferred-calls job', () => {
  it('signed with DISPATCH_SIGNING_SECRET: reports a completed call to the requester', async () => {
    const raw = await webPlacesHeldCall({
      DISPATCH_SIGNING_SECRET: SHARED,
      LIVEKIT_API_SECRET: 'web-livekit-secret',
    });
    expect(JSON.parse(raw)).toHaveProperty('requesterSignature');

    await agentRunsCall(raw, 'agent-signed');

    expect(captureCallResult).toHaveBeenCalledTimes(1);
    const [, outcome, request] = captureCallResult.mock.calls[0] as unknown as [
      string,
      { status: string; transcriptSummary?: string },
      { userId: string },
    ];
    expect(request.userId).toBe('owner-1');
    expect(outcome.status).toBe('completed');
    expect(outcome.transcriptSummary).toContain('go to church too');
    expect(callRecords()).toEqual([`owner-1/${String(JSON.parse(raw).callId)}`]);
  });

  it('signed only with the web LiveKit secret (prod 2026-10-18): drops the result loudly and writes nothing for the named user', async () => {
    const raw = await webPlacesHeldCall({ LIVEKIT_API_SECRET: 'web-livekit-secret' });

    await agentRunsCall(raw, 'agent-unsigned');

    expect(captureCallResult).not.toHaveBeenCalled();
    expect(callRecords()).toEqual([]);
    expect(warnings).toContainEqual({
      fields: expect.objectContaining({ reason: UNSIGNED_RESULT_DROPPED }),
      msg: 'On-behalf call result dropped: unsigned dispatch',
    });
  });

  it('unsigned and reaching voicemail: never reports a voicemail to the named user', async () => {
    const raw = await webPlacesHeldCall({ LIVEKIT_API_SECRET: 'web-livekit-secret' });
    vi.stubEnv('DISPATCH_SIGNING_SECRET', SHARED);
    const metadata = JSON.parse(raw) as Record<string, unknown>;
    await setupCallTypeContexts(metadata, 'on_behalf_call', 'agent-vm', 'room-vm', raw);

    const call = getOutboundCallContext('agent-vm');
    expect(call?.requesterUserId).toBeUndefined();
    if (call) await recordAnsweredBy(call, 'voicemail');
    expect(captureCallResult).not.toHaveBeenCalled();
  });
});
