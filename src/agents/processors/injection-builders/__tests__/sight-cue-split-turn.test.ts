/**
 * #3267 round-5 verify: a turn that arrives in pieces. "I can't see your text" and then, before
 * Ferni speaks, "and my face went numb". Main alarms on the first piece and the context pusher
 * keeps that safety note for the reply (withHeldSafety, #2642). With CRISIS_LEXICAL_V2 on, the
 * sight cue reads the caller's words since Ferni last spoke (callerWordsSinceFerni), so the
 * whole turn alarms; read piece by piece, neither piece would.
 *
 * Through the real pusher: createTurnContextPusher -> the turn hook -> buildContextInjections
 * -> injectTurnContext. With no turn words (any other call site) the cue never drops main's
 * alarm. All lines are fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => db.collection().doc().collection(),
          orderBy: () => db.collection().doc().collection(),
          limit: () => db.collection().doc().collection(),
          get: async () => ({ docs: [] }),
          add: async () => undefined,
        }),
      }),
    }),
  };
  return { db };
});
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fake.db,
}));
vi.mock('../../../../services/cross-persona/team-huddle.js', () => ({
  generateTeamHuddle: vi.fn(async () => ({ observations: [] })),
  formatTeamHuddleForLLM: () => '',
}));
vi.mock('../../../../services/outreach/conversation-context-bridge.js', () => ({
  buildOutreachBridgeInjection: vi.fn(async () => null),
}));
vi.mock('../../../../services/session/session-summary.js', () => ({
  getActiveUserContext: vi.fn(async () => null),
  formatContextForVoiceCall: () => '',
}));
vi.mock('../../../../intelligence/context-builders/external/pending-call-results.js', () => ({
  buildAllPendingResultsContext: vi.fn(async () => null),
}));

const { buildContextInjections } = await import('../../turn-processor/context-injections.js');
const { injectTurnContext } = await import('../../turn-processor/inject-context.js');
const { createTurnContextPusher } = await import('../../../multi-agent/turn-intelligence.js');
const { callerWordsSinceFerni } = await import('../../../multi-agent/caller-words-since-ferni.js');
const { humanTransfer } = await import('../../../../services/human-transfer/index.js');

afterEach(() => vi.unstubAllEnvs());

/** The medical alarm's note (human-transfer/index.ts buildTransferAwarenessContext). */
const MEDICAL_NOTE = /\[TRANSFER AWARENESS - Better Than Human\]/;

let n = 0;
async function injections(userText: string) {
  n += 1;
  const uid = `u-split-${n}`;
  const args = [
    {
      turnCtx: llm.ChatContext.empty(),
      services: { sessionId: `s-${uid}`, userId: uid },
      userData: { turnCount: 4, callerTurn: 2, relationshipStage: 'friend' },
      persona: { id: 'ferni', name: 'Ferni' },
      userText,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    },
    { analysis: { intent: 'chat', emotion: { primary: 'neutral', intensity: 0.2 }, topics: [] } },
    { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    { length: { guidance: 'Keep it short.' } },
    { needsReinforcement: false },
    null,
    undefined,
    {},
  ] as never as Parameters<typeof buildContextInjections>;
  return (await buildContextInjections(...args)).injections;
}

/** The crisis and safety notes, in full (the rest of the context varies at random). */
const safety = (inj: Array<{ category: string; content: string }>) =>
  inj.filter((i) => /crisis|safety|transfer|better_than_human|escalation/.test(i.category));

function setFlags(on: boolean): void {
  vi.unstubAllEnvs();
  vi.stubEnv('CRISIS_GUARD_MODE', 'live');
  vi.stubEnv('VOICE_PIPELINE', 'cartesia-cascade');
  vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', 'off');
  vi.stubEnv('CRISIS_LEXICAL_V2', on ? 'on' : 'off');
}

/**
 * Two pieces of one caller turn: the first note is still building when Ferni starts thinking,
 * and the caller cuts in before Ferni speaks. The safety guidance the reply's context carries.
 */
async function splitTurn(first: string, second: string, committed: boolean): Promise<string> {
  const hook = async (turnCtx: llm.ChatContext, msg: llm.ChatMessage) => {
    const inj = await injections(msg.textContent ?? '');
    injectTurnContext(turnCtx, { context: { injections: inj } } as never, {
      sessionId: 'split',
      turnNumber: 2,
    });
  };
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'system', content: 'You are Ferni.' });
  chat.addMessage({ role: 'assistant', content: 'Hey, how is your day going?' });
  const agent = {
    chatCtx: chat,
    updateChatCtx: async (ctx: llm.ChatContext) => {
      agent.chatCtx = ctx;
    },
  };
  const pusher = createTurnContextPusher(hook as never, agent as never);
  agent.chatCtx.addMessage({ role: 'user', content: first });
  const firstNote = pusher.onFinalTranscript(first);
  await pusher.onAgentState('thinking');
  await firstNote;
  await pusher.onUserState('speaking');
  await pusher.onAgentState('listening');
  // The second piece: already in the chat context when its final arrives, or not yet.
  if (committed) agent.chatCtx.addMessage({ role: 'user', content: second });
  await pusher.onFinalTranscript(second);
  await pusher.onUserState('listening');
  return agent.chatCtx.items
    .map((item) => (item.type === 'message' ? item.extra?.turnContextSafety : undefined))
    .filter((safety): safety is string => typeof safety === 'string')
    .join('\n');
}

const ALARMS: Array<[string, string]> = [
  ["I can't see your text", 'and my face went numb'],
  ["I can't see the screen", 'and my arm went numb'],
  ["I can't see your text", 'my head is pounding'],
];

describe.each([true, false])('a split turn (second piece in the context: %s)', (committed) => {
  it.each(ALARMS)('"%s" / "%s": flag on alarms, with main\'s guidance', async (a, b) => {
    setFlags(false);
    const main = await splitTurn(a, b, committed);
    setFlags(true);
    const on = await splitTurn(a, b, committed);
    expect(main).toMatch(MEDICAL_NOTE);
    expect(on).toBe(main);
  });

  it('"I can\'t see your text" / "can you resend it": no medical alarm with the flag on', async () => {
    setFlags(false);
    expect(await splitTurn("I can't see your text", 'can you resend it', committed)).toMatch(
      MEDICAL_NOTE
    );
    setFlags(true);
    // Only the medical note goes. Early-warning's own "end it" (in "resend it") stays as on main.
    const on = await splitTurn("I can't see your text", 'can you resend it', committed);
    expect(on).not.toMatch(MEDICAL_NOTE);
    expect(on).not.toMatch(/988/);
  });
});

describe('no turn words: main', () => {
  const SCREEN = ["I can't see your text", "I can't see your message", "I can't see the screen"];

  it.each(SCREEN)('"%s" read with no turn words alarms as main does', async (line) => {
    setFlags(false);
    const main = {
      signals: humanTransfer.detectCrisisSignals(line),
      inj: safety(await injections(line)),
    };
    setFlags(true);
    const on = {
      signals: humanTransfer.detectCrisisSignals(line),
      inj: safety(await injections(line)),
    };
    expect(main.signals.medicalEmergency).toBe(true);
    expect(main.inj.some((i) => MEDICAL_NOTE.test(i.content))).toBe(true);
    expect(on).toEqual(main);
  });
});

describe('callerWordsSinceFerni', () => {
  const user = (textContent: string) => ({ type: 'message', role: 'user', textContent });
  const ferni = (textContent: string) => ({ type: 'message', role: 'assistant', textContent });

  it('the caller words since Ferni spoke, with this transcript once', () => {
    expect(callerWordsSinceFerni([ferni('hi'), user('a b')], 'c')).toBe('a b c');
    expect(callerWordsSinceFerni([ferni('hi'), user('a b'), user('c')], 'c')).toBe('a b c');
    expect(callerWordsSinceFerni([ferni('hi'), user('a')], 'a b')).toBe('a b');
    expect(callerWordsSinceFerni([user('old'), ferni('hi')], 'c')).toBe('c');
    expect(callerWordsSinceFerni([], 'c')).toBe('c');
  });

  it('a pushed turn note is not the caller speaking', async () => {
    const { TURN_CONTEXT_HEADER } = await import('../../../multi-agent/turn-context-header.js');
    const note = user(`${TURN_CONTEXT_HEADER}\nsomething`);
    expect(callerWordsSinceFerni([ferni('hi'), user('a'), note], 'b')).toBe('a b');
  });

  it("unreadable items: undefined, so the cue never drops main's alarm", () => {
    expect(callerWordsSinceFerni(null as never, 'c')).toBeUndefined();
  });
});
