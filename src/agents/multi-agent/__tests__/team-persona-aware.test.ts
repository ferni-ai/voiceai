/**
 * DIRECTOR_PERSONA_AWARE, the handoff parts ported from #1296: after a handoff
 * the teammate is itself, not Ferni.
 *
 * Dev call 2026-10-12, Ferni → Peter: Peter echoed Ferni's phrasing, having
 * been handed Ferni's replies as his own, and his prompt said "654
 * conversations ... They trust you and share openly" about a caller he had
 * never met. (The director half is #1312, director-persona.ts.)
 *
 * Each part runs the production path: the history as swapPersona hands it
 * over, the director's transcript as linesFromChat reads it, and the prompt as
 * setupPersonaAgent and buildHandoffContext write it.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  director: [] as Array<{ system: string; prompt: string }>,
  instructions: [] as string[],
}));
const STOP = 'stop after the model instructions';

vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: vi.fn(async (opts: { systemInstruction: string }) => ({
    generateContent: async (prompt: string) => {
      captured.director.push({ system: opts.systemInstruction, prompt });
      return { response: { text: () => 'NONE' } };
    },
  })),
}));
vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  loadSystemPrompt: vi.fn(async () => '# Persona\nYou are on the team.'),
}));
vi.mock('../persona-tts.js', () => ({ createPersonaTTS: vi.fn(async () => ({})) }));
vi.mock('../../../tools/orchestrator/voice-agent-integration.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getToolsForAgent: vi.fn(async () => ({
    tools: {},
    meta: { toolCount: 0, mode: 'test', selectionTimeMs: 0 },
  })),
}));
vi.mock('../../model-provider/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../model-provider/index.js')>();
  const provider = actual.getModelProvider();
  return {
    ...actual,
    getModelProvider: () =>
      new Proxy(provider, {
        get(target, prop, receiver) {
          if (prop === 'createLLMModel') {
            return async (opts: { instructions: string }) => {
              captured.instructions.push(opts.instructions);
              throw new Error(STOP);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
  };
});

const { buildDirectorPrompt, linesFromChat } = await import('../../personas/director-notes.js');
const { swapPersona } = await import('../persona-swap.js');
const { setupPersonaAgent, buildHandoffContext } = await import('../agent-setup.js');

beforeEach(() => {
  captured.director.length = 0;
  captured.instructions.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// 2. The history the teammate is handed
// ---------------------------------------------------------------------------

type Swappable = {
  id: string;
  personaId: string;
  session: unknown;
  userData: { personaId?: string };
  ownsSession: boolean;
  release: () => Promise<void>;
  agent: {
    chatCtx?: llm.ChatContext;
    heard?: llm.ChatContext;
    updateChatCtx: (c: llm.ChatContext) => Promise<void>;
  };
};

function persona(id: string, session: unknown, chatCtx?: llm.ChatContext): Swappable {
  const agent: Swappable['agent'] = {
    chatCtx,
    updateChatCtx: async (c) => {
      agent.heard = c;
    },
  };
  return {
    id,
    personaId: id,
    session,
    userData: {},
    ownsSession: false,
    release: async () => undefined,
    agent,
  };
}

/** The call's session, as @livekit/agents 1.5.1 runs updateAgent: a transition task per swap. */
function callWith(chatCtx: llm.ChatContext) {
  const session = {
    currentAgent: { chatCtx } as unknown,
    updateActivityTask: undefined as { result: Promise<void> } | undefined,
    updateAgent(agent: unknown) {
      session.currentAgent = agent;
      session.updateActivityTask = { result: Promise.resolve() };
    },
  };
  return session;
}

function ferniCall(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: 'what have you been up to' });
  ctx.addMessage({ role: 'assistant', content: "Oh, the usual. Wyoming's getting cold already." });
  ctx.addMessage({ role: 'user', content: 'can you get Peter' });
  return ctx;
}

const texts = (ctx: llm.ChatContext | undefined) =>
  (ctx?.items ?? []).map((i) => (i.type === 'message' ? `${i.role}: ${i.textContent}` : i.type));

describe('the history a teammate is handed (DIRECTOR_PERSONA_AWARE)', () => {
  it("marks the outgoing persona's replies as theirs, keeping every line", async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const ctx = ferniCall();
    const session = callWith(ctx);
    const ferni = persona('ferni', session, ctx);
    const peter = persona('peter-john', session);
    await swapPersona(ferni as never, peter, () => undefined);
    expect(texts(peter.agent.heard)).toEqual([
      'user: what have you been up to',
      "assistant: (Ferni said:) Oh, the usual. Wyoming's getting cold already.",
      'user: can you get Peter',
    ]);
    // Ferni's own chat is untouched (copy() shares message objects)
    expect(texts(ctx)).toContain("assistant: Oh, the usual. Wyoming's getting cold already.");
  });

  it('keeps an earlier mark when the call moves on to another teammate', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const ctx = ferniCall();
    const session = callWith(ctx);
    const peter = persona('peter-john', session);
    await swapPersona(persona('ferni', session, ctx) as never, peter, () => undefined);
    peter.agent.heard!.addMessage({ role: 'assistant', content: 'Peter here. Coffee spend!' });
    session.currentAgent = { chatCtx: peter.agent.heard };
    const maya = persona('maya-santos', session);
    await swapPersona(peter as never, maya, () => undefined);
    expect(texts(maya.agent.heard).filter((t) => t.startsWith('assistant'))).toEqual([
      "assistant: (Ferni said:) Oh, the usual. Wyoming's getting cold already.",
      'assistant: (Peter said:) Peter here. Coffee spend!',
    ]);
  });

  it('hands Ferni her own lines back unmarked when the call swaps back to her', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const ctx = ferniCall();
    const session = callWith(ctx);
    const peter = persona('peter-john', session);
    await swapPersona(persona('ferni', session, ctx) as never, peter, () => undefined);
    peter.agent.heard!.addMessage({ role: 'assistant', content: 'Peter here. Coffee spend!' });
    session.currentAgent = { chatCtx: peter.agent.heard };
    const ferni = persona('ferni', session);
    await swapPersona(peter as never, ferni, () => undefined);
    expect(texts(ferni.agent.heard).filter((t) => t.startsWith('assistant'))).toEqual([
      "assistant: Oh, the usual. Wyoming's getting cold already.",
      'assistant: (Peter said:) Peter here. Coffee spend!',
    ]);
  });

  it('hands over the talk unchanged with the flag off', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'off');
    const ctx = ferniCall();
    const session = callWith(ctx);
    const peter = persona('peter-john', session);
    await swapPersona(persona('ferni', session, ctx) as never, peter, () => undefined);
    const nonSystem = ctx.items.filter((i) => !(i.type === 'message' && i.role === 'system'));
    expect(peter.agent.heard!.items).toEqual(nonSystem);
    peter.agent.heard!.items.forEach((item, i) => expect(item).toBe(nonSystem[i]));
  });
});

// ---------------------------------------------------------------------------
// 3. The teammate's prompt
// ---------------------------------------------------------------------------

const SAM = {
  preferredName: 'Sam',
  totalConversations: 654,
  relationshipStage: 'trusted_advisor',
  lastCallerSummary: "her sister's wedding plans",
};

async function modelInstructions(
  personaId: string,
  userProfile: object,
  from = 'ferni',
  isHandoff = Boolean(from)
): Promise<string> {
  captured.instructions.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: personaId, name: personaId } as never,
      isHandoff,
      previousPersonaId: from || undefined,
      ctx: {} as never,
      room: { name: 'team-room', on: vi.fn(), off: vi.fn() } as never,
      services: { userProfile } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      sessionId: `team-${Math.random()}`,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  expect(captured.instructions).toHaveLength(1);
  return captured.instructions[0];
}

describe('the director reads a marked reply (DIRECTOR_PERSONA_AWARE)', () => {
  const items = [
    { id: 'u1', type: 'message', role: 'user', textContent: 'what have you been up to' },
    {
      id: 'a1',
      type: 'message',
      role: 'assistant',
      textContent: "(Ferni said:) Oh, the usual. Wyoming's getting cold already.",
    },
    { id: 'a2', type: 'message', role: 'assistant', textContent: 'Peter here. Coffee spend!' },
  ];

  it('drops the mark and labels the line with who said it', () => {
    const lines = linesFromChat(items, (i) => (i.id === 'a2' ? 'Peter' : undefined));
    expect(lines[1]).toEqual({
      speaker: 'ferni',
      text: "Oh, the usual. Wyoming's getting cold already.",
      by: 'Ferni',
    });
    const prompt = buildDirectorPrompt(lines, 'Sam', 'Peter');
    expect(prompt).toContain("Ferni: Oh, the usual. Wyoming's getting cold already.");
    expect(prompt).toContain('Peter: Peter here. Coffee spend!');
    expect(prompt).not.toContain('said:)');
  });

  it('a line the speaker log knows keeps that name', () => {
    expect(linesFromChat(items, () => 'Ferni')[1].by).toBe('Ferni');
  });
});

describe("the teammate's prompt (DIRECTOR_PERSONA_AWARE)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it("gives Peter his own relationship, not Ferni's", async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', SAM);
    expect(out).toContain("You're meeting them through Ferni");
    expect(out).not.toContain('654');
    expect(out).not.toContain('They trust you and share openly');
    expect(out).toContain("Last time they called, they talked about: her sister's wedding plans");
    expect(out).not.toContain('Last time you talked about');
  });

  it("uses Peter's own count when the profile has one", async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', {
      ...SAM,
      humanizingState: { perPersonaMeetingCounts: { 'peter-john': 3 } },
    });
    expect(out).toContain("You've talked with them 3 times yourself.");
  });

  it("reads Peter's count where session end saves it (customData.meetingCounts)", async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', {
      ...SAM,
      customData: { meetingCounts: { ferni: 650, 'peter-john': 4 } },
    });
    expect(out).toContain("You've talked with them 4 times yourself.");
    expect(out).not.toContain('meeting them through');
  });

  it('names an unknown previous persona by its id, never "undefined"', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', SAM, 'guest-coach');
    expect(out).toContain("You're meeting them through guest-coach:");
    expect(out).not.toContain('undefined');
    const intro = await buildHandoffContext({
      persona: { id: 'peter-john' },
      isHandoff: true,
      previousPersonaId: 'guest-coach',
      userData: {},
    } as never);
    expect(intro).toContain('guest-coach was talking with them before you.');
    expect(intro).not.toContain('undefined');
  });

  it('keeps the old lines when the caller opened the call on Peter (no handoff)', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', SAM, '');
    expect(out).toContain("You've had 654 conversations together");
    expect(out).not.toContain('meeting them through');
    const notHandoff = await modelInstructions('peter-john', SAM, 'ferni', false);
    expect(notHandoff).toContain("You've had 654 conversations together");
  });

  it("is Ferni's relationship with the flag off", async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'off');
    const out = await modelInstructions('peter-john', SAM);
    expect(out).toContain("You've had 654 conversations together");
    expect(out).toContain('They trust you and share openly.');
  });

  it('is byte-identical for Ferni with the flag on and off', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'off');
    const off = await modelInstructions('ferni', SAM);
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const on = await modelInstructions('ferni', SAM);
    expect(on).toBe(off);
    expect(on).toContain("You've had 654 conversations together");
  });

  it("tells the teammate the earlier replies are the previous persona's", async () => {
    const config = {
      persona: { id: 'peter-john' },
      isHandoff: true,
      previousPersonaId: 'ferni',
      userData: {},
    } as never;
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const on = await buildHandoffContext(config);
    expect(on).toContain('You just joined this call; Ferni was talking with them before you.');
    expect(on).toContain('like "(Ferni said:)", were said by that person, not you.');
    expect(on).not.toContain('focus on helping');
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'off');
    const off = await buildHandoffContext(config);
    expect(off).toContain('You just received this conversation from ferni.');
    expect(off).toContain('focus on helping');
  });
});
