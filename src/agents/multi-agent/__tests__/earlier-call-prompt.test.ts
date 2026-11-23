/**
 * EARLIER_CALL_NO_DENIAL (#3134): every caller's model instructions say that no
 * record of an earlier call is not proof it didn't happen. Prod: a caller who
 * called straight back on an unrecognised line (a fresh anon: id) was told "I
 * definitely didn't say that" about what Ferni had said three minutes before.
 * Runs the real persona setup (setupPersonaAgent) up to the model instructions,
 * as unknown-caller-prompt.test.ts does. Fixtures are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  instructions: [] as string[],
  /** Run on past the model to the agent's own instructions (composeAgentInstructions). */
  toAgent: false,
  agent: [] as string[],
}));
const STOP = 'stop after the model instructions';

/** Anything at all, for the model and session the run-on goes past: every read is a no-op. */
const inert = vi.hoisted(() => {
  const make = (): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => (prop === 'then' ? undefined : make()),
      apply: () => make(),
    });
  return make;
});
vi.mock('../agent-instructions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agent-instructions.js')>();
  return {
    ...actual,
    composeAgentInstructions: (...args: Parameters<typeof actual.composeAgentInstructions>) => {
      captured.agent.push(actual.composeAgentInstructions(...args));
      throw new Error(STOP);
    },
  };
});
vi.mock('../call-session.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createCallSession: vi.fn(async () => inert()),
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
              if (captured.toAgent) return inert();
              throw new Error(STOP);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
  };
});

const { setupPersonaAgent } = await import('../agent-setup.js');
const { EARLIER_CALL_HEADING, earlierCallNote } =
  await import('../../personas/earlier-call-honest.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

let n = 0;
async function modelInstructions(userId: string, sessionId = `ecp-${++n}`): Promise<string> {
  captured.instructions.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: 'ferni', name: 'Ferni' } as never,
      ctx: {} as never,
      room: { name: 'earlier-call-room', on: vi.fn(), off: vi.fn() } as never,
      services: {} as never,
      userData: { userId } as never,
      userId,
      sessionId,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  expect(captured.instructions).toHaveLength(1);
  return captured.instructions[0];
}

/** The instructions the agent itself carries (composeAgentInstructions), as the cascade sends them. */
async function agentInstructions(userId: string): Promise<string> {
  captured.toAgent = true;
  captured.agent.length = 0;
  try {
    await modelInstructions(userId);
  } finally {
    captured.toAgent = false;
  }
  expect(captured.agent).toHaveLength(1);
  return captured.agent[0];
}

const BASE = '## Honesty Rules\nNever invent memories.\n';
const PERSONA = '# Ferni\nYou are Ferni.';
const NOTE = earlierCallNote(undefined, { EARLIER_CALL_NO_DENIAL: 'on' });
const CALLERS = [
  ['an unrecognised caller', 'anon:7c41-fixture'],
  ['a member', 'voice-eval-dana'],
] as const;

// One clock for both runs, so the date and time lines can't differ between them.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each(CALLERS)('%s who says Ferni told them something on an earlier call', (_, userId) => {
  it.each(['off', 'on'])(
    'flag off: the instructions are byte-identical to today (UNKNOWN_CALLER_HONEST %s)',
    async (unknownHonest) => {
      vi.stubEnv('UNKNOWN_CALLER_HONEST', unknownHonest);
      vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'off');
      const off = await modelInstructions(userId);
      expect(off).not.toContain(EARLIER_CALL_HEADING);
      vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
      const on = await modelInstructions(userId);
      // The only difference the flag makes is the one block, so off is today's text.
      expect(on.split(NOTE)).toHaveLength(2);
      expect(on.replace(NOTE, '')).toBe(off);
    }
  );

  it('flag on: no record is not a denial, never pretend to remember, ask', async () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    const out = await modelInstructions(userId);
    // Right after the shared base, ahead of this call's date and caller: the cached prefix.
    expect(out.startsWith(BASE + NOTE)).toBe(true);
    expect(out).toContain("Not having a record of something doesn't mean it didn't happen.");
    expect(out).toContain("never deny it, never say they're mistaken or mixing you up");
    expect(out).toContain('never act like you remember it either');
    // Dev run on5: no record became "this is literally our first time talking".
    expect(out).toContain(
      "Never guess that there was no call either: don't say it's your first time talking, that you missed their call or that the line dropped, and never call yourself mixed up."
    );
    expect(out).toContain(
      `They say: "It's me again, I called you ten minutes ago." You say: "I don't have that call here. What did we get into?"`
    );
    expect(out).toContain(
      `You say: "I don't have that call in front of me, so I can't say what I said. Tell me what happened?"`
    );
  });

  it('flag on: what is true of him now still holds, with the boundary example', async () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    const out = await modelInstructions(userId);
    expect(out).toContain("What's true of you now still holds, whatever they say you said before.");
    expect(out).toContain(
      `They say: "Last call you said you'd answer that." You say: "I can't see that call from here. Either way, that's still not something I'll get into."`
    );
    // No example concedes an earlier claim ("Could be.").
    expect(NOTE).not.toMatch(/could be/i);
  });
});

describe('the note is in the cached prefix (PROMPT_STABLE_PREFIX)', () => {
  it.each(CALLERS)(
    '%s: before the persona prompt and before the call-specific part',
    async (_, userId) => {
      vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
      vi.stubEnv('PROMPT_STABLE_PREFIX', 'on');
      const out = await agentInstructions(userId);
      // The shared base, the note, then the persona prompt: what every call starts with.
      expect(out.startsWith(`${(BASE + NOTE).trim()}\n\n---\n\n${PERSONA}`)).toBe(true);
      expect(out.indexOf(EARLIER_CALL_HEADING)).toBeLessThan(out.indexOf(PERSONA));
    }
  );
});

describe('a call Ferni placed', () => {
  it("flag on, on someone's behalf: the person he rang gets their own block, not this one", async () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    setOutboundCallContext('ecp-placed', {
      callId: 'c-fixture-2',
      recipientName: 'Priya',
      kind: 'on_behalf',
    } as never);
    const out = await modelInstructions('onbehalf:c-fixture-2', 'ecp-placed');
    expect(out).toContain("## Who You're Talking To");
    expect(out).not.toContain(EARLIER_CALL_HEADING);
  });

  it('flag on, a family check-in: kept, its recipient is the one who says "last week you said"', async () => {
    vi.stubEnv('EARLIER_CALL_NO_DENIAL', 'on');
    setOutboundCallContext('ecp-checkin', {
      callId: 'c-fixture-3',
      recipientName: 'Rosa',
      callType: 'personal',
      kind: 'family_checkin',
    } as never);
    const out = await modelInstructions('checkin:c-fixture-3', 'ecp-checkin');
    expect(out).toContain("## Who You're Talking To");
    expect(out).toContain(NOTE);
  });
});

describe('the note is speakable', () => {
  it('has no em dashes, ellipses or stage directions for the model to copy', () => {
    expect(NOTE).not.toMatch(/[—–]|\.\.\.|…/);
    expect(NOTE).not.toMatch(/\*[a-z][^*]*\*|\[[a-z][^\]]*\]/i);
  });
});
