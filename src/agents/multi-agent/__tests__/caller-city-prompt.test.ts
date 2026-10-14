/**
 * The caller's city reaches the instructions the voice model is created with,
 * through the real persona setup (setupPersonaAgent), not just the helper.
 * Prod 2026-10-12: the call carried "Dade City" and the weather tool used it,
 * but Ferni answered "Do you know where I live?" with "whatever your weather
 * app tells me".
 */
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

async function modelInstructions(userData: Record<string, unknown>): Promise<string> {
  captured.instructions.length = 0;
  await expect(
    setupPersonaAgent({
      persona: { id: 'ferni', name: 'Ferni' } as never,
      ctx: {} as never,
      room: { name: 'caller-city-room', on: vi.fn(), off: vi.fn() } as never,
      services: {} as never,
      userData: userData as never,
      sessionId: `caller-city-${Math.random()}`,
      enableFullHandlers: false,
      deferHandlers: true,
    })
  ).rejects.toThrow(STOP);
  expect(captured.instructions).toHaveLength(1);
  return captured.instructions[0];
}

const DADE_CITY = {
  userLocation: { city: 'Dade City', regionCode: 'FL', countryCode: 'US' },
  callerTimezone: 'America/New_York',
};

afterEach(() => vi.unstubAllEnvs());

describe('the caller city in the model instructions (CALLER_CITY_CONTEXT)', () => {
  it('names the city the call carried when the flag is on', async () => {
    vi.stubEnv('CALLER_CITY_CONTEXT', 'on');
    const out = await modelInstructions({ ...DADE_CITY });
    expect(out).toContain("They're in Dade City, FL (from their device).");
    expect(out).toContain('Never invent memories.');
  });

  it('leaves the instructions without it when the flag is off', async () => {
    vi.stubEnv('CALLER_CITY_CONTEXT', 'off');
    const out = await modelInstructions({ ...DADE_CITY });
    expect(out).not.toContain('Dade City');
    expect(out).not.toContain('Where They Are');
  });

  it('leaves it out when the call carried no city', async () => {
    vi.stubEnv('CALLER_CITY_CONTEXT', 'on');
    const out = await modelInstructions({ callerTimezone: 'America/New_York' });
    expect(out).not.toContain('Where They Are');
  });
});
