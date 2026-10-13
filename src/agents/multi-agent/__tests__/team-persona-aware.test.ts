/**
 * TEAM_PERSONA_AWARE: after a handoff the teammate is itself, not Ferni.
 *
 * Dev call 2026-10-12, Ferni → Peter: the director (written for Ferni) told
 * Peter "Match his minimal energy"; Peter echoed Ferni's phrasing, having been
 * handed Ferni's replies as his own; and his prompt said "654 conversations ...
 * They trust you and share openly" about a caller he had never met.
 *
 * Each part runs the production path: the director as installDirectorNotes
 * builds it (with the model call mocked), the history as swapPersona hands it
 * over, and the prompt as setupPersonaAgent and buildHandoffContext write it.
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

const { installDirectorNotes } = await import('../turn-observers.js');
const { DIRECTOR_SYSTEM } = await import('../../personas/director-notes.js');
const { swapPersona } = await import('../persona-swap.js');
const { setupPersonaAgent, buildHandoffContext } = await import('../agent-setup.js');

beforeEach(() => {
  captured.director.length = 0;
  captured.instructions.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// 1. The director
// ---------------------------------------------------------------------------

type Item = { type: 'message'; role: 'user' | 'assistant'; textContent: string };
const msg = (role: Item['role'], textContent: string): Item => ({
  type: 'message',
  role,
  textContent,
});

/** One reply finished on a call whose persona is `personaId`: what the director sends the model. */
async function directorAfterReply(personaId: string, items: Item[]) {
  vi.stubEnv('DIRECTOR_NOTES', 'on');
  const handlers: Array<(ev: unknown) => void> = [];
  const session = { on: (_e: string, h: (ev: unknown) => void) => handlers.push(h), off: () => {} };
  await installDirectorNotes({
    session: session as never,
    sessionId: `team-${Math.random()}`,
    userName: 'Sam',
    agent: () => ({ chatCtx: { items } }),
    cleanupFunctions: [],
    personaId: () => personaId,
  });
  handlers.forEach((h) => h({ newState: 'speaking' }));
  handlers.forEach((h) => h({ newState: 'listening' }));
  await vi.waitFor(() => expect(captured.director).toHaveLength(1), { timeout: 5000 });
  return captured.director[0];
}

const AFTER_HANDOFF = [
  msg('user', 'what have you been up to'),
  msg('assistant', "(Ferni said:) Oh, the usual. Wyoming's getting cold already."),
  msg('user', 'can you look at my spending'),
  msg('assistant', 'Peter here. Your coffee spend doubles every exam week.'),
  msg('user', 'huh'),
];
const FERNI_ONLY = [
  msg('user', 'what have you been up to'),
  msg('assistant', "Oh, the usual. Wyoming's getting cold already."),
  msg('user', 'ha'),
];

describe('the director after a handoff (TEAM_PERSONA_AWARE)', () => {
  it('describes the teammate and labels each line by who said it', async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
    const { system, prompt } = await directorAfterReply('peter-john', AFTER_HANDOFF);
    expect(system).not.toContain('Wyoming');
    expect(system).toContain('Peter (The Quant');
    expect(system).toContain("whisper at most two private notes for Peter's next reply");
    expect(system).not.toMatch(/\bFerni\b|\bhim\b|\bhis\b|\bhimself\b|\bhe's\b/);
    expect(prompt).toContain("Ferni: Oh, the usual. Wyoming's getting cold already.");
    expect(prompt).toContain('Peter: Peter here. Your coffee spend');
    expect(prompt).toContain('Sam: huh');
    expect(prompt).not.toContain('(Ferni said:)');
    expect(prompt.endsWith("Your notes for Peter's next reply:")).toBe(true);
  });

  it('is written for Ferni with the flag off, even for Peter', async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'off');
    const { system, prompt } = await directorAfterReply('peter-john', AFTER_HANDOFF);
    expect(system).toBe(DIRECTOR_SYSTEM);
    expect(prompt.endsWith("Your notes for Ferni's next reply:")).toBe(true);
    expect(prompt).toContain('Ferni: Peter here.');
  });

  it('sends exactly the same for a Ferni-only call with the flag on as off', async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'off');
    const off = await directorAfterReply('ferni', FERNI_ONLY);
    captured.director.length = 0;
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
    const on = await directorAfterReply('ferni', FERNI_ONLY);
    expect(on).toEqual(off);
    expect(on.system).toBe(DIRECTOR_SYSTEM);
    expect(on.prompt).toBe(
      "The call so far:\nSam: what have you been up to\nFerni: Oh, the usual. Wyoming's getting cold already.\nSam: ha\n\nYour notes for Ferni's next reply:"
    );
  });
});

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

describe('the history a teammate is handed (TEAM_PERSONA_AWARE)', () => {
  it("marks the outgoing persona's replies as theirs, keeping every line", async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
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
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
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

  it('hands over the talk unchanged with the flag off', async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'off');
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
  lastConversationSummary: "her sister's wedding plans",
};

async function modelInstructions(personaId: string, userProfile: object): Promise<string> {
  captured.instructions.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: personaId, name: personaId } as never,
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

describe("the teammate's prompt (TEAM_PERSONA_AWARE)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it("gives Peter his own relationship, not Ferni's", async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', SAM);
    expect(out).toContain("You're meeting them through Ferni");
    expect(out).not.toContain('654');
    expect(out).not.toContain('They trust you and share openly');
    expect(out).toContain("Last time they talked with Ferni about: her sister's wedding plans");
    expect(out).not.toContain('Last time you talked about');
  });

  it("uses Peter's own count when the profile has one", async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
    const out = await modelInstructions('peter-john', {
      ...SAM,
      humanizingState: { perPersonaMeetingCounts: { 'peter-john': 3 } },
    });
    expect(out).toContain("You've talked with them 3 times yourself.");
  });

  it("is Ferni's relationship with the flag off", async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'off');
    const out = await modelInstructions('peter-john', SAM);
    expect(out).toContain("You've had 654 conversations together");
    expect(out).toContain('They trust you and share openly.');
  });

  it('is byte-identical for Ferni with the flag on and off', async () => {
    vi.stubEnv('TEAM_PERSONA_AWARE', 'off');
    const off = await modelInstructions('ferni', SAM);
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
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
    vi.stubEnv('TEAM_PERSONA_AWARE', 'on');
    const on = await buildHandoffContext(config);
    expect(on).toContain('Replies marked "(Ferni said:)" are Ferni\'s, not yours.');
    expect(on).not.toContain('focus on helping');
    vi.stubEnv('TEAM_PERSONA_AWARE', 'off');
    const off = await buildHandoffContext(config);
    expect(off).toContain('You just received this conversation from ferni.');
    expect(off).toContain('focus on helping');
  });
});
