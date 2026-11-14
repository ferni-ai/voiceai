/**
 * PERSON_MODEL_READ through the real setupPersonaAgent: off, the model instructions are the
 * ones main builds and nothing is read; on, a fixture member's sheet follows "Who You're
 * Talking To"; a member with no sheet (outside the PERSON_MODEL cohort) gets none, with no
 * error; a read that never answers costs setup no time. And on a crisis turn the sheet sits
 * before the crisis override, which stays last. The readers are counting fakes; the caller
 * is the fictional Riley Test.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePorts, fakeState, never, storedSheet } from '../call-sheet/__tests__/fixtures.js';

const captured = vi.hoisted(() => ({ instructions: [] as string[] }));
const warned = vi.hoisted(() => ({ calls: [] as unknown[][] }));
const fake = vi.hoisted(() => ({ state: null as unknown }));
const STOP = 'stop after the model instructions';

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const log = {
    debug: () => undefined,
    info: () => undefined,
    error: () => undefined,
    trace: () => undefined,
    fatal: () => undefined,
    warn: (...args: unknown[]) => void warned.calls.push(args),
    child: () => log,
  };
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return { ...actual, getLogger: () => log, createLogger: () => log };
});
vi.mock('../call-sheet/wiring.js', () => ({
  callSheetPorts: () => fakePorts(fake.state as ReturnType<typeof fakeState>),
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
const { addSafetyNote } = await import('../../processors/turn-processor/safety-note.js');

const WHO = "## Who You're Talking To";
const SHEET = '## Your Notes On This Caller';
const OVERRIDE = '[CRITICAL SAFETY OVERRIDE]\nDo NOT deviate from this response.';
let seq = 0;

async function setup(state: ReturnType<typeof fakeState>): Promise<{ out: string; ms: number }> {
  fake.state = state;
  captured.instructions.length = 0;
  const started = Date.now();
  await expect(
    setupPersonaAgent({
      persona: { id: 'ferni', name: 'ferni' } as never,
      ctx: {} as never,
      room: { name: 'call-sheet-room', on: vi.fn(), off: vi.fn() } as never,
      services: {
        userId: 'riley-test',
        userProfile: { name: 'Riley', totalConversations: 6, goals: [], primaryConcerns: [] },
      } as never,
      userData: { callerTimezone: 'America/New_York' } as never,
      sessionId: `call-sheet-${++seq}`,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  return { out: captured.instructions[0] ?? '', ms: Date.now() - started };
}

beforeEach(() => {
  warned.calls.length = 0;
  registerRecentTextsOwnerCheck(() => true); // a signed-in owner
});
afterEach(() => vi.unstubAllEnvs());

describe('agent setup: the call sheet (PERSON_MODEL_READ)', () => {
  it('off: the instructions main builds, and nothing is read', async () => {
    vi.stubEnv('PERSON_MODEL_READ', 'off');
    const state = fakeState(storedSheet(new Date()));
    const { out } = await setup(state);
    expect(out).toContain(WHO);
    expect(out).not.toContain(SHEET);
    expect(state.reads).toBe(0);
    // A member with no sheet, flag on, gets exactly the same instructions.
    vi.stubEnv('PERSON_MODEL_READ', 'on');
    const none = await setup(fakeState(null));
    expect(none.out).toBe(out);
  });

  it('on, a fixture member: the sheet follows "Who You\'re Talking To"', async () => {
    vi.stubEnv('PERSON_MODEL_READ', 'on');
    const { out } = await setup(fakeState(storedSheet(new Date())));
    expect(out).toContain(`${SHEET}\n\n`);
    expect(out).toContain('- Mia (daughter).');
    expect(out.indexOf(WHO)).toBeGreaterThan(-1);
    expect(out.indexOf(SHEET)).toBeGreaterThan(out.indexOf(WHO));
  });

  it('on, no PERSON_MODEL cohort doc: no block, no error, and the time off takes', async () => {
    vi.stubEnv('PERSON_MODEL_READ', 'off');
    const off = await setup(fakeState(null));
    vi.stubEnv('PERSON_MODEL_READ', 'on');
    const state = fakeState(null);
    const on = await setup(state);
    expect(on.out).not.toContain(SHEET);
    expect(state.reads).toBe(4); // it did read, and found nothing
    expect(warned.calls).toHaveLength(0);
    expect(on.ms).toBeLessThan(off.ms + 250);
  });

  it('on, a read that never answers: no block, and setup does not wait for it', async () => {
    vi.stubEnv('PERSON_MODEL_READ', 'off');
    const off = await setup(fakeState(null));
    vi.stubEnv('PERSON_MODEL_READ', 'on');
    const state = fakeState(storedSheet(new Date()));
    state.gate = never();
    const on = await setup(state);
    expect(on.out).not.toContain(SHEET);
    expect(on.out).toContain(WHO);
    expect(on.ms).toBeLessThan(off.ms + 250); // the load's own budget is 1,500 ms
  });

  it('a crisis turn: the sheet is in the instructions, before the crisis override, which is last', async () => {
    vi.stubEnv('PERSON_MODEL_READ', 'on');
    const { out } = await setup(fakeState(storedSheet(new Date())));
    // The request as the SDK holds it: the instructions first (voice/generation.js
    // updateInstructions unshifts them), then the turns, then this turn's safety note.
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'I can not do this anymore' });
    ctx.items.unshift(
      llm.ChatMessage.create({ id: 'lk.agent_task.instructions', role: 'system', content: [out] })
    );
    addSafetyNote(ctx, OVERRIDE);
    const texts = ctx.items.map((item) =>
      item.type === 'message' ? (item.textContent ?? '') : ''
    );
    const sheetAt = texts.findIndex((t) => t.includes(SHEET));
    const overrideAt = texts.findIndex((t) => t.includes('CRITICAL SAFETY OVERRIDE'));
    expect(sheetAt).toBeGreaterThanOrEqual(0);
    expect(overrideAt).toBe(texts.length - 1);
    expect(sheetAt).toBeLessThan(overrideAt);
    expect(texts.slice(overrideAt + 1).join('')).toBe('');
  });
});
