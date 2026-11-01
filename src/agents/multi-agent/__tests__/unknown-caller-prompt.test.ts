/**
 * UNKNOWN_CALLER_HONEST: a caller nothing is kept for is never promised that
 * Ferni will remember them (#3002). Prod 10-29: an unsigned phone caller asked
 * whether Ferni would remember them if they called back and was told six times
 * "yes"; their next four calls each had a new anon: id and no memory of them.
 * Runs the real persona setup (setupPersonaAgent) up to the model instructions,
 * as caller-city-prompt.test.ts does. Fixtures are fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ instructions: [] as string[] }));
const STOP = 'stop after the model instructions';

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
const { beginReturningCaller } = await import('../../../services/identity/returning-caller.js');
const { withTurnReminder } = await import('../../personas/turn-request.js');
const { MINOR_CARE_NOTE, memoryHeld } = await import('../../../utils/minor-care.js');
const { UNKNOWN_CALLER_NOTE } = await import('../../../services/identity/returning-caller-talk.js');
const { setOutboundCallContext } =
  await import('../../../intelligence/context-builders/external/outbound-call-context.js');

let n = 0;
async function modelInstructions(
  userId: string,
  sessionId = `ucp-${++n}`,
  services: object = {}
): Promise<string> {
  captured.instructions.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: 'ferni', name: 'Ferni' } as never,
      ctx: {} as never,
      room: { name: 'unknown-caller-room', on: vi.fn(), off: vi.fn() } as never,
      services: services as never,
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

const ANON = 'anon:2b9d-fixture';
const HEADING = '## What You Keep From This Call';
/** Anything that points a caller at signing up: never for a caller who may be a minor. */
const ACCOUNT_PITCH = /sign(?:ing)? (?:in|up)|signed in|an account|the app|website|phone number/i;
const FIRST_CONVERSATION = 'This is your first conversation with them';

afterEach(() => vi.unstubAllEnvs());

describe('an unsigned caller in the model instructions', () => {
  it('flag off (today): nothing tells the model the call is not kept', async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'off');
    const out = await modelInstructions(ANON);
    expect(out).toContain('Never invent memories.');
    expect(out).not.toContain(HEADING);
    expect(out).not.toMatch(/isn't kept|is kept after it ends/);
  });

  it('flag on: nothing kept and never promise to remember, with no pitch for an account', async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    const out = await modelInstructions(ANON);
    expect(out).toContain(HEADING);
    expect(out).toContain(
      "Nothing from this call is kept after it ends: if they call again, you won't remember them"
    );
    expect(out).toContain('Never promise to remember them');
    // Built before anyone says their age: it must never steer a minor toward an account (18+).
    expect(out).not.toMatch(ACCOUNT_PITCH);
  });

  it('a RETURNING_CALLER lookup keeps a name and a line: the note says so, not "nothing"', async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    const env = { RETURNING_CALLER: 'on', LOG_HASH_SECRET: 'fixture-secret' };
    const store = { get: async () => null, erasurePending: async () => false } as never;
    await beginReturningCaller('ucp-returning', '+15555550123', store, env);
    const out = await modelInstructions(ANON, 'ucp-returning');
    expect(out).toContain('Almost nothing from this call is kept');
    expect(out).toContain('at most their first name and one short line, for a month');
    expect(out).not.toContain('Nothing from this call is kept after it ends');
  });

  it('a call Ferni placed keeps its own block for the person it called, not this one', async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    setOutboundCallContext('ucp-on-behalf', {
      callId: 'c-fixture',
      recipientName: 'Doug',
      kind: 'on_behalf',
    } as never);
    const out = await modelInstructions('onbehalf:c-fixture', 'ucp-on-behalf');
    expect(out).toContain("## Who You're Talking To");
    expect(out).not.toContain(HEADING);
  });

  it.each(['voice-eval-dana', 'phone:+15555550199', 'device:fixture-device'])(
    'a member (%s) keeps their memory, so gets no such note',
    async (userId) => {
      vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
      expect(await modelInstructions(userId)).not.toContain(HEADING);
    }
  );

  it('call-start awareness: "first conversation" for an account, "don\'t know who this is" for an anon caller', async () => {
    const fresh = (userId: string) => ({ userId, userProfile: { totalConversations: 0 } });
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'off');
    expect(await modelInstructions(ANON, 'ucp-ft-off', fresh(ANON))).toContain(FIRST_CONVERSATION);
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    const anon = await modelInstructions(ANON, 'ucp-ft-on', fresh(ANON));
    expect(anon).not.toContain(FIRST_CONVERSATION);
    expect(anon).toContain(UNKNOWN_CALLER_NOTE);
    const account = await modelInstructions(
      'voice-eval-robin',
      'ucp-ft-acct',
      fresh('voice-eval-robin')
    );
    expect(account).toContain(FIRST_CONVERSATION);
  });
});

describe('an unsigned caller who sounds under 18 (MINOR_CARE)', () => {
  it('setup and turn: held, told nothing is kept, and never pointed at an account', async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    vi.stubEnv('MINOR_CARE', 'on');
    const sessionId = 'ucp-minor';
    const setup = await modelInstructions(ANON, sessionId);
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: "I'm 14. Will you remember me if I call back?" });
    const userData = { userId: ANON, services: { sessionId } };
    const out = withTurnReminder(chat, { userData }, {});
    const turn = (out.items.at(-1) as llm.ChatMessage).textContent ?? '';
    // Pre-condition: the turn path really held this caller as a likely minor.
    expect(turn).toContain(MINOR_CARE_NOTE);
    expect(memoryHeld(sessionId)).toBe(true);
    expect(setup).toContain('Never promise to remember them');
    expect(setup).not.toMatch(ACCOUNT_PITCH);
    expect(turn).not.toMatch(ACCOUNT_PITCH);
  });
});
