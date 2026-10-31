/**
 * FORGET_EVERY_READER at the agent-setup call sites, through the real
 * setupPersonaAgent: the "Who you're talking to" block in the model
 * instructions and the greeting's history (both read the profile through
 * profileForPrompt), and the handoff context's conversation summary. The
 * topic is only in the store; setup reads it beside the prompt loads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ instructions: [] as string[] }));
const stored = vi.hoisted(() => ({
  topics: ['Biscuit'] as string[] | null,
  reads: 0,
  promptsLoaded: false,
  readBeforePrompts: false,
}));
const STOP = 'stop after the model instructions';

vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => {
    stored.reads++;
    if (!stored.promptsLoaded) stored.readBeforePrompts = true;
    return stored.topics;
  },
}));
vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  // Slow enough that a read started beside it starts before it finishes.
  loadSystemPrompt: vi.fn(async () => {
    await new Promise((r) => {
      setTimeout(r, 20);
    });
    stored.promptsLoaded = true;
    return '# Ferni\nYou are Ferni.';
  }),
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

const { setupPersonaAgent, buildHandoffContext } = await import('../agent-setup.js');
const { takeCallerHistory } = await import('../greeting-direction.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

let seq = 0;

async function setup(): Promise<{ instructions: string; lastTopic?: string }> {
  captured.instructions.length = 0;
  const sessionId = `forget-setup-${++seq}`;
  await expect(
    setupPersonaAgent({
      persona: { id: 'ferni', name: 'Ferni' } as never,
      ctx: {} as never,
      room: { name: 'forget-setup-room', on: vi.fn(), off: vi.fn() } as never,
      services: {
        userId: `member-forget-setup-${seq}`,
        userProfile: {
          name: 'Sam',
          totalConversations: 4,
          lastCallerSummary: 'how Biscuit keeps chewing the couch',
          goals: [],
          primaryConcerns: [],
        },
      } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      sessionId,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  return {
    instructions: captured.instructions[0] ?? '',
    lastTopic: takeCallerHistory(sessionId)?.lastTopic,
  };
}

beforeEach(() => {
  resetForgetTopicsSource();
  stored.topics = ['Biscuit'];
  stored.reads = 0;
  stored.promptsLoaded = false;
  stored.readBeforePrompts = false;
});
afterEach(() => vi.unstubAllEnvs());

describe('agent setup: the caller profile (FORGET_EVERY_READER)', () => {
  it('on: the forgotten summary is out of the instructions and the greeting history', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const { instructions, lastTopic } = await setup();
    expect(instructions).toContain("You're talking to Sam.");
    expect(instructions).not.toContain('Biscuit');
    expect(lastTopic).toBeUndefined();
    expect(stored.reads).toBe(1); // one read...
    expect(stored.readBeforePrompts).toBe(true); // ...started beside the prompt loads
  });

  it('off: the summary is in both, as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const { instructions, lastTopic } = await setup();
    expect(instructions).toContain('Last time you talked about: how Biscuit keeps chewing');
    expect(lastTopic).toContain('Biscuit');
    expect(stored.reads).toBe(0);
  });

  it('on, store unreadable and nothing known: fails closed', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    stored.topics = null;
    const { instructions } = await setup();
    expect(instructions).toContain("You're talking to Sam.");
    expect(instructions).not.toContain('Last time you talked about');
  });
});

describe('handoff context: the conversation summary', () => {
  const config = (summary: string) =>
    ({
      isHandoff: true,
      previousPersonaId: 'ferni',
      conversationSummary: summary,
      userData: { userId: 'member-forget-handoff' },
      persona: { id: 'maya' },
    }) as never;

  it('on: a summary about a forgotten topic is left out', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const out = await buildHandoffContext(config('Topics discussed: Biscuit, work'));
    expect(out).not.toContain('Biscuit');
    expect(await buildHandoffContext(config('Topics discussed: work'))).toContain(
      'Conversation summary: Topics discussed: work'
    );
  });

  it('off: kept, as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    expect(await buildHandoffContext(config('Topics discussed: Biscuit, work'))).toContain(
      'Biscuit'
    );
  });
});
