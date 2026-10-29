/**
 * HANDOFF_DESK (plan S1): the caller asks Ferni to call their mom, Ferni reads the call
 * back through the real outbound gate, and the caller asks for Alex before saying yes. The
 * real orchestrator hands off through initializeMultiAgentSession. With the flag on, Alex's
 * prompt holds the ask and the waiting call, and his first line names it; with it off, the
 * pre_briefings read and the canned line are as before. An empty desk never yields a line
 * that claims a briefing, and contact data never reaches the desk.
 * Orchestrator, entry, desk, outbound gate and call read-back are real; agents, stores and
 * banter are fakes. Names and numbers are fictional (555-01xx).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonaAgent } from '../orchestrator.js';
import type { SessionServices } from '../../../services/types.js';
import type { ToolDefinition } from '../../../tools/registry/types.js';

const seen = vi.hoisted(() => ({
  summaries: new Map<string, string | undefined>(),
  said: new Map<string, string[]>(),
  sessions: new Map<string, object>(),
  preBriefingReads: 0,
  arriving: 'Alex here. Let us sort this out.',
}));

function fakeAgent(personaId: string): PersonaAgent {
  const said: string[] = [];
  seen.said.set(personaId, said);
  return {
    id: `${personaId}-${Math.random().toString(36).slice(2)}`,
    personaId,
    isActive: false,
    session: seen.sessions.get(personaId) ?? {},
    cleanup: vi.fn(async () => undefined),
    say: vi.fn((text: string) => said.push(text)),
    setMuted: vi.fn(),
    interrupt: vi.fn(),
  };
}

vi.mock('../persona-agent-factory.js', () => ({
  createPersonaAgentFactory:
    () => async (personaId: string, ctx: { conversationSummary?: string }) => {
      seen.summaries.set(personaId, ctx.conversationSummary);
      return fakeAgent(personaId);
    },
}));
vi.mock('../../realtime/frontend-publisher.js', () => ({ initializeFrontendPublisher: vi.fn() }));
vi.mock('../../../services/team-engagement/banter.js', () => ({
  getHandoffBanter: () => 'Over to Alex!',
  getArrivingBanter: () => seen.arriving,
}));
vi.mock('../../../services/automation/predictive-handoff.js', () => ({
  getPreBriefing: vi.fn(async () => {
    seen.preBriefingReads++;
    return null;
  }),
  markBriefingUsed: vi.fn(async () => undefined),
}));
// The read-back's store lookups (nothing set for later, no call just placed)
vi.mock('../../../tools/domains/telephony/call-on-behalf.js', () => ({
  wantsCallNow: () => false,
  pendingCallTo: async () => undefined,
  alreadySetReply: () => '',
  findContact: async () => null,
}));
vi.mock('../../../tools/domains/telephony/call-status-tool.js', () => ({
  statusBeforeReadBack: async () => undefined,
}));

const { initializeMultiAgentSession } = await import('../multi-agent-entry.js');
const { gateOutboundTool } = await import('../../../tools/registry/outbound-gate.js');
const { getLogger } = await import('../../../utils/safe-logger.js');
const { arrivalFromDesk, formatDesk, writeDesk } = await import('../handoff-desk.js');

const userId = 'Rk2pXy7LmN4qTs9Wd3Fb8Hc00042'; // a member uid
const ASK = "Can you call my mom and tell her I'll be late for dinner? Her number is 727-555-0142.";
let n = 0;

const msg = (role: 'user' | 'assistant', text: string) => ({
  type: 'message',
  role,
  content: [text],
  textContent: text,
});

/** Ferni's session: the ask, the read-back through the real gate, then "Can I talk to Alex?" */
async function ferniSessionWithWaitingCall(): Promise<object> {
  const items: unknown[] = [msg('user', 'Hey Ferni, long day.'), msg('user', ASK)];
  const session = { history: { items } };
  const def = {
    id: 'callOnBehalf',
    create: () => ({ execute: vi.fn(async () => 'Calling now.') }),
  } as unknown as ToolDefinition;
  const tool = gateOutboundTool(def).create({ userId } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  const args = {
    contactQuery: 'my mom',
    phoneNumber: '727-555-0142',
    purpose: "tell her I'll be late for dinner",
  };
  const output = await tool.execute(args, { ctx: { session }, toolCallId: 'fc-1' });
  items.push(
    { type: 'function_call', callId: 'fc-1', name: 'callOnBehalf', args: JSON.stringify(args) },
    { type: 'function_call_output', callId: 'fc-1', name: 'callOnBehalf', output: String(output) },
    msg('assistant', `Just to check: ${String(output)}`),
    msg('user', 'Actually, can I talk to Alex first?')
  );
  return session;
}

/** Every logger made while importing (the orchestrator's among them), kept past mock clears. */
const infoLogs = vi
  .mocked(getLogger)
  .mock.results.map((r) => (r.value as { info: ReturnType<typeof vi.fn> }).info);

function hadPreBriefing(): unknown[] {
  return infoLogs
    .flatMap((info) => info.mock.calls)
    .filter(([, m]) => typeof m === 'string' && m.includes('New agent spawned'))
    .map(([o]) => (o as { hadPreBriefing?: unknown }).hadPreBriefing);
}

async function handToAlex(flag: 'on' | 'off', ferniSession: object): Promise<void> {
  vi.stubEnv('HANDOFF_DESK', flag);
  seen.sessions.set('ferni', ferniSession);
  const sessionId = `session-S1_${++n}-1792867440000`;
  const { orchestrator } = await initializeMultiAgentSession({
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    initialPersonaId: 'ferni',
    services: { sessionId, userId, personaId: 'ferni' } as unknown as SessionServices,
    userData: {} as never,
    sessionId,
    userId,
    enableFullHandlers: false,
  });
  const result = await orchestrator.handoff({ targetPersonaId: 'alex-chen', reason: 'planning' });
  expect(result.success).toBe(true);
}

const alexFirstLine = (): string => seen.said.get('alex-chen')?.[0] ?? '';

afterEach(() => {
  seen.summaries.clear();
  seen.said.clear();
  seen.sessions.clear();
  seen.preBriefingReads = 0;
  seen.arriving = 'Alex here. Let us sort this out.';
  for (const info of infoLogs) info.mockClear();
  vi.unstubAllEnvs();
});

describe('HANDOFF_DESK: Ferni hands a waiting call to Alex', () => {
  it('flag on: Alex is handed the ask and the waiting call, and his first line names it', async () => {
    await handToAlex('on', await ferniSessionWithWaitingCall());

    const summary = seen.summaries.get('alex-chen') ?? '';
    expect(summary).toContain(
      'They said: "Can you call my mom and tell her I\'ll be late for dinner?'
    );
    expect(summary).toContain('Waiting on their yes: a call to your mom');
    expect(alexFirstLine()).toBe(
      "You wanted a call to your mom, to tell her you'll be late for dinner. Want me to go ahead?"
    );
    expect(seen.preBriefingReads).toBe(0); // the dead pre_briefings read is replaced
    expect(hadPreBriefing()).toEqual([true]);
    // The number Ferni read back never reaches Alex's prompt or line
    for (const text of [summary, alexFirstLine()]) expect(text).not.toMatch(/555|0142|727/);
  });

  it("flag off: today's handoff (pre_briefings read, canned line, no desk)", async () => {
    await handToAlex('off', await ferniSessionWithWaitingCall());

    expect(seen.summaries.get('alex-chen') ?? '').not.toContain('HANDOFF DESK');
    expect(alexFirstLine()).toBe('Alex here. Let us sort this out.');
    expect(seen.preBriefingReads).toBe(1);
    expect(hadPreBriefing()).toEqual([false]);
  });
});

describe('HANDOFF_DESK: an empty desk claims no briefing', () => {
  const askedForAlexOnly = () => ({
    history: { items: [msg('user', 'Hi there.'), msg('user', 'Can I talk to Alex?')] },
  });

  it('flag on: the claiming line is not said, the prompt says nothing was passed on', async () => {
    seen.arriving = 'Ferni caught me up on your garden plans.';
    await handToAlex('on', askedForAlexOnly());

    expect(alexFirstLine()).toBe("Hey, it's Alex.");
    expect(alexFirstLine()).not.toMatch(/caught me up|filled me in/i);
    expect(seen.summaries.get('alex-chen')).toContain('Ferni passed you nothing from this call');
    expect(hadPreBriefing()).toEqual([false]);
  });

  it('flag off: the same line is said as before', async () => {
    seen.arriving = 'Ferni caught me up on your garden plans.';
    await handToAlex('off', askedForAlexOnly());
    expect(alexFirstLine()).toBe('Ferni caught me up on your garden plans.');
  });

  it.each([
    'Peter caught me up on the garden plans.',
    'Ferni filled me in, so where were we?',
    "Hi! It's Nate. I've heard a little, tell me more.",
  ])('a director or canned line %j becomes a plain hello', (line) => {
    const desk = writeDesk({ personaId: 'peter-john', session: askedForAlexOnly() }, 'alex-chen', {
      HANDOFF_DESK: 'on',
    });
    expect(arrivalFromDesk(desk, line)).toBe("Hey, it's Alex.");
  });
});

describe('HANDOFF_DESK: contact data never enters the desk', () => {
  it.each([
    ['a phone number', 'Can you text my sister at 727-555-0187 that I landed?', /555|0187/],
    ['an email', 'Please email rosa.vega@example.com and tell her I landed.', /@|example/],
    ['a spoken number', 'Call five five five oh one nine nine for me.', /five five five/i],
  ])('%s in the ask is not in the desk, its prompt or the first line', (_k, ask, leak) => {
    const desk = writeDesk(
      { personaId: 'ferni', session: { history: { items: [msg('user', ask)] } } },
      'alex-chen',
      { HANDOFF_DESK: 'on' }
    );
    if (!desk) throw new Error('the flag is on: a desk is written');
    for (const text of [JSON.stringify(desk), formatDesk(desk), arrivalFromDesk(desk, '') ?? ''])
      expect(text).not.toMatch(leak);
  });

  it('keeps what the caller asked once the number is out', () => {
    const desk = writeDesk(
      { personaId: 'ferni', session: { history: { items: [msg('user', ASK)] } } },
      'alex-chen',
      { HANDOFF_DESK: 'on' }
    );
    expect(desk?.asked).toEqual(["Can you call my mom and tell her I'll be late for dinner?"]);
    expect(arrivalFromDesk(desk, undefined)).toBe(
      "You wanted me to call your mom and tell her you'll be late for dinner. Still want that?"
    );
  });
});
