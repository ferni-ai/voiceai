/**
 * ON_BEHALF_JOIN_WAIT (#4391): while a confirmed call waits for a cold worker, the member hears
 * "Still connecting, one moment." once, and never on a crisis turn (still-connecting.ts).
 *
 * These run the real callOnBehalf tool inside a real SDK AgentSession, set up by the real
 * installLiveCallBehaviors, with only Firestore, contacts and LiveKit's server API faked. The
 * room shows Ferni's agent `joinAfterMs` after the dispatch (real time). Every name and line
 * here is made up.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lk = vi.hoisted(() => ({ joinAfterMs: 0, dispatchedAt: 0 }));
const createSipParticipant = vi.hoisted(() => vi.fn(async () => ({ participantId: 'PA_1' })));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = vi.fn(async () => ({}));
    listParticipants = vi.fn(async () =>
      Date.now() - lk.dispatchedAt >= lk.joinAfterMs ? [{ identity: 'agent-AJ_1', kind: 4 }] : []
    );
    deleteRoom = vi.fn(async () => undefined);
  },
  AgentDispatchClient: class {
    createDispatch = vi.fn(async () => {
      lk.dispatchedAt = Date.now();
      return {};
    });
  },
  SipClient: class {
    createSipParticipant = createSipParticipant;
  },
}));
vi.mock('../../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../services/outreach/user-contact.js', () => ({
  getUserContactInfo: vi.fn(async () => ({ timezone: 'America/Denver' })),
}));
vi.mock('../../../services/outreach/deferred-calls.js', async (real) => ({
  ...(await real<Record<string, unknown>>()),
  holdForCallHours: vi.fn(async () => null),
  pendingCallTo: vi.fn(async () => null),
}));
vi.mock('../../../memory/entity-store/integration.js', () => ({
  isEntityStoreReady: () => false,
  findContactForTelephony: vi.fn(),
}));
vi.mock('../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: vi.fn(async () => [
    { id: 'c-mom', name: 'Mom', phone: '(303) 555-0100', relationship: 'mother' },
  ]),
  upsertContact: vi.fn(async () => undefined),
}));
vi.mock('../../../services/global-services.js', () => ({ getGlobalServicesSync: () => null }));

const { createCallOnBehalfTool } =
  await import('../../../tools/domains/telephony/call-on-behalf.js');
const { setStillConnectingPort } =
  await import('../../../tools/domains/telephony/call-not-placed.js');
const { installLiveCallBehaviors } = await import('../live-call-behaviors.js');
const { noteCrisisRisk, resetCrisisCallRisk } =
  await import('../../../services/safety/crisis-call-risk.js');

initializeLogger({ pretty: false, level: 'warn' });

const SESSION_ID = 'session-still-connecting-test';
/** What the member hears while the call is placed (call-not-placed.ts). */
const STILL_CONNECTING_LINE = 'Still connecting, one moment.';
const ASK = 'Call my mom and say good morning';
const saved = { ...process.env };

beforeEach(() => {
  Object.assign(process.env, {
    LIVEKIT_URL: 'wss://example.livekit.cloud',
    LIVEKIT_API_KEY: 'k',
    LIVEKIT_API_SECRET: 's',
    DISPATCH_SIGNING_SECRET: 'dispatch-secret',
    SIP_TRUNK_ID: 'ST_test',
    INTERRUPT_TRACE: 'off',
    BARGE_IN_FASTPATH: 'off',
    TURN_KEEPER: 'off',
  });
});
afterEach(() => {
  process.env = { ...saved };
  setStillConnectingPort(undefined);
  resetCrisisCallRisk();
  vi.clearAllMocks();
});

/** One turn: the caller asks for the call, the model runs callOnBehalf, the agent joins late. */
async function askForTheCall(opts: { joinAfterMs: number; crisis?: boolean }) {
  lk.joinAfterMs = opts.joinAfterMs;
  const tool = createCallOnBehalfTool({ userId: 'member-test', sessionId: SESSION_ID } as never);
  const model = new voice.testing.FakeLLM([
    {
      input: ASK,
      toolCalls: [
        {
          name: 'callOnBehalf',
          args: { contactQuery: 'my mom', purpose: 'say good morning', recordingConsent: false },
        },
      ],
    },
  ]);
  const agent = new voice.Agent({
    instructions: 'You are Ferni.',
    tools: { callOnBehalf: tool } as unknown as llm.ToolContext,
  });
  const session = new voice.AgentSession({ llm: model });
  const cleanupFunctions: Array<() => void> = [];
  installLiveCallBehaviors({
    session: session as never,
    sessionWithEvents: session as never,
    sessionEventHandlers: [],
    cleanupFunctions,
    sessionId: SESSION_ID,
    userId: 'member-test',
  });
  await session.start({ agent });
  if (opts.crisis) noteCrisisRisk(SESSION_ID); // a crisis read found risk on this call's turn
  await session.run({ userInput: ASK }).wait();
  await session.close();
  for (const cleanup of cleanupFunctions) cleanup();
  const { items } = session.history;
  const said = items.filter(
    (i) => i.type === 'message' && i.role === 'assistant' && i.textContent === STILL_CONNECTING_LINE
  );
  const lineAt = items.findIndex((i) => said.includes(i));
  const outputAt = items.findIndex((i) => i.type === 'function_call_output');
  return { said: said.length, lineAt, outputAt };
}

describe('the still-connecting line on a real session (ON_BEHALF_JOIN_WAIT)', () => {
  it('an agent at 6.5 s: the line is said once, before the tool returns, and the call dials', async () => {
    process.env.ON_BEHALF_JOIN_WAIT = 'on';
    const { said, lineAt, outputAt } = await askForTheCall({ joinAfterMs: 6_500 });

    expect(said).toBe(1); // once per attempt, never repeated while it waits
    expect(lineAt).not.toBe(-1);
    expect(lineAt).toBeLessThan(outputAt); // heard while the call was still being placed
    expect(createSipParticipant).toHaveBeenCalledOnce();
  }, 20_000);

  it('a crisis-held turn: no line, and the call still goes through the normal path', async () => {
    process.env.ON_BEHALF_JOIN_WAIT = 'on';
    const { said, outputAt } = await askForTheCall({ joinAfterMs: 3_600, crisis: true });

    expect(outputAt).not.toBe(-1); // the tool returned
    expect(said).toBe(0);
  }, 20_000);

  it('off: no line at 3.6 s (as on main), and the call dials', async () => {
    const { said, outputAt } = await askForTheCall({ joinAfterMs: 3_600 });

    expect(outputAt).not.toBe(-1); // the tool returned
    expect(said).toBe(0);
    expect(createSipParticipant).toHaveBeenCalledOnce();
  }, 20_000);
});
