/**
 * HANDOFF_FAST_ARRIVAL on the real orchestrator: the teammate is set up while the
 * goodbye plays (not after it), and the coordinator's arrival window is open for the
 * handoff and closed after it. Flag off: the teammate is set up after the goodbye, as
 * before. Only the persona factory and the SDK swap are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../persona-swap.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persona-swap.js')>()),
  swapPersona: vi.fn(async () => undefined),
}));

import { AgentOrchestrator, createAgentOrchestrator } from '../orchestrator.js';
import { ARRIVAL_GAP_MS } from '../handoff-fast-arrival.js';
import { arrivalCooldownMs } from '../../../speech/coordination/arrival-cooldown.js';

const GOODBYE_MS = 300;

/** When each persona's agent was created, from the handoff's start. */
let created: Record<string, number>;
let handoffAt = 0;
let windowDuringGoodbye: number | undefined;

function config() {
  return {
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    sessionId: 'fast-arrival-test',
    createPersonaAgent: vi.fn(async (personaId: string) => {
      created[personaId] = Date.now() - handoffAt;
      return {
        id: `${personaId}-${Object.keys(created).length}`,
        personaId,
        isActive: false,
        session: {},
        cleanup: vi.fn(async () => undefined),
        say: vi.fn(),
        setMuted: vi.fn(),
        interrupt: vi.fn(),
        // A persona on the call's one session (persona-swap.ts isSwappable)
        agent: {},
        release: vi.fn(),
        ownsSession: personaId === 'ferni',
      } as never;
    }),
  };
}

beforeEach(() => {
  created = {};
  windowDuringGoodbye = undefined;
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(GOODBYE_MS);
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as {
      waitForSpeechComplete: (ms: number) => Promise<void>;
    },
    'waitForSpeechComplete'
  ).mockImplementation(async (ms: number) => {
    windowDuringGoodbye ??= arrivalCooldownMs();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function handOffToMaya(): Promise<boolean> {
  const orchestrator = createAgentOrchestrator(config());
  await orchestrator.start('ferni');
  handoffAt = Date.now();
  const result = await orchestrator.handoff({ targetPersonaId: 'maya-santos', reason: 'test' });
  return result.success;
}

describe('a single-session handoff', () => {
  it('pre: flag off, the teammate is set up only after the goodbye', async () => {
    expect(await handOffToMaya()).toBe(true);
    expect(created['maya-santos']).toBeGreaterThanOrEqual(GOODBYE_MS - 5);
    expect(windowDuringGoodbye).toBeUndefined();
  });

  it('post: flag on, the teammate is set up while the goodbye plays', async () => {
    vi.stubEnv('HANDOFF_FAST_ARRIVAL', 'on');
    expect(await handOffToMaya()).toBe(true);
    expect(created['maya-santos']).toBeLessThan(GOODBYE_MS / 2);
  });

  it('opens the arrival window for the goodbye and closes it after the handoff', async () => {
    vi.stubEnv('HANDOFF_FAST_ARRIVAL', 'on');
    expect(await handOffToMaya()).toBe(true);
    expect(windowDuringGoodbye).toBe(ARRIVAL_GAP_MS);
    expect(arrivalCooldownMs()).toBeUndefined();
  });

  it('leaves two-session handoffs as they were (the old session must close first)', async () => {
    vi.stubEnv('HANDOFF_FAST_ARRIVAL', 'on');
    vi.stubEnv('MULTI_AGENT_SINGLE_SESSION', 'off');
    expect(await handOffToMaya()).toBe(true);
    expect(created['maya-santos']).toBeGreaterThanOrEqual(GOODBYE_MS - 5);
    expect(windowDuringGoodbye).toBeUndefined();
  });
});
