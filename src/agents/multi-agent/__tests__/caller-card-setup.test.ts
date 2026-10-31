/**
 * CALLER_CARD through the real setupPersonaAgent: the card reaches the model instructions
 * inside "Who You're Talking To" for a member, never on an outbound onbehalf: session, and a
 * handoff persona reuses the call's card but re-reads what was forgotten (spec §5.4.1,
 * ruling 4). The readers are counting fakes; the caller is the fictional Riley Test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ instructions: [] as string[] }));
const store = vi.hoisted(() => ({ forgotten: [] as string[], homeReads: 0, forgottenReads: 0 }));
const STOP = 'stop after the model instructions';

vi.mock('../caller-card/wiring.js', () => ({
  callerCardPorts: () => ({
    home: async () => {
      store.homeReads++;
      return { place: 'Maplewood', source: 'preferences' };
    },
    forgotten: async () => {
      store.forgottenReads++;
      return [...store.forgotten];
    },
    minorCare: async () => false,
  }),
}));
vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => '## Honesty Rules\nNever invent memories.\n'),
  loadSystemPrompt: vi.fn(async () => '# Ferni\nYou are Ferni.'),
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

const { setupPersonaAgent } = await import('../agent-setup.js');
const { registerRecentTextsOwnerCheck } = await import('../recent-texts-awareness.js');

const CARD_HEADER = 'What you know about them (private; never read it out):';
/** agent-setup's block at main for this profile (who-block.test.ts holds the template). */
const MAIN_BLOCK = `
---

## Who You're Talking To

You're talking to Riley.
You've had 6 conversations - a growing friendship.

Use this awareness naturally.`;

let seq = 0;

async function setup(sessionId: string, userId: string, persona = 'ferni'): Promise<string> {
  captured.instructions.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: persona, name: persona } as never,
      ctx: {} as never,
      room: { name: 'caller-card-room', on: vi.fn(), off: vi.fn() } as never,
      services: {
        userId,
        userProfile: { name: 'Riley', totalConversations: 6, goals: [], primaryConcerns: [] },
      } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      sessionId,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  return captured.instructions[0] ?? '';
}

beforeEach(() => {
  registerRecentTextsOwnerCheck(() => true); // a signed-in owner (owner-gate.test.ts: not proven)
  store.forgotten = [];
  store.homeReads = 0;
  store.forgottenReads = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe('agent setup: the caller card (CALLER_CARD)', () => {
  it('off: the block is the one main built, and nothing is read', async () => {
    vi.stubEnv('CALLER_CARD', 'off');
    const out = await setup(`card-off-${++seq}`, 'riley-test');
    expect(out).toContain(MAIN_BLOCK);
    expect(out).not.toContain(CARD_HEADER);
    expect(store).toMatchObject({ homeReads: 0, forgottenReads: 0 });
  });

  it('on, a member: Home is in the block', async () => {
    vi.stubEnv('CALLER_CARD', 'on');
    const out = await setup(`card-on-${++seq}`, 'riley-test');
    expect(out).toContain(`${CARD_HEADER}\n- Home: Maplewood.\n`);
    expect(out).toContain("## Who You're Talking To");
  });

  it('on, an outbound onbehalf: session: no card text, nothing read', async () => {
    vi.stubEnv('CALLER_CARD', 'on');
    const out = await setup(`card-onbehalf-${++seq}`, 'onbehalf:call-1');
    expect(out).not.toContain(CARD_HEADER);
    expect(out).not.toContain('Maplewood');
    expect(store.homeReads).toBe(0);
  });

  it('a handoff reuses the card but re-reads forgotten topics: a forget between setups drops the line', async () => {
    vi.stubEnv('CALLER_CARD', 'on');
    const sessionId = `card-handoff-${++seq}`;
    expect(await setup(sessionId, 'riley-test', 'ferni')).toContain('- Home: Maplewood.');
    store.forgotten = ['Maplewood'];
    const alex = await setup(sessionId, 'riley-test', 'alex');
    expect(alex).not.toContain('Maplewood');
    expect(store.homeReads).toBe(1); // the cached card: no new home read
    expect(store.forgottenReads).toBe(2); // one per persona setup
  });
});
