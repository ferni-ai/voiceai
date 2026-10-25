/**
 * CUSTOM_AGENT_LIVE: the persona a call to a custom agent speaks as, once the
 * caller is known (callerSessionPersona, agents/shared/custom-agent-live.ts).
 *
 * Only Firestore (the agent store, keyed by owner as users/{uid}/customAgents is),
 * the bundled-persona loader and the prompt files are faked; the owner check, the
 * runtime conversion and the live prompt are the production code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonaConfig } from '../../../personas/types.js';
import type { CustomAgent } from '../../../types/custom-agent-api.js';
import {
  AGENT_DESCRIPTION,
  AGENT_ID,
  AGENT_MEMORY,
  AGENT_NAME,
  liveAgent,
  OWNER_UID,
  STOCK_VOICE_ID,
} from '../../../services/custom-agent/__tests__/fixtures/live-agent.js';

const h = vi.hoisted(() => ({
  store: {} as Record<string, Record<string, unknown>>,
  logged: [] as unknown[],
}));

vi.mock('../../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  getCustomAgent: vi.fn(async (uid: string, id: string) => h.store[uid]?.[id] ?? null),
  getActiveCustomAgents: vi.fn(async () => []),
}));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const capture = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = {};
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (...args: unknown[]) => h.logged.push(args);
    }
    logger.child = () => logger;
    return logger;
  };
  return { ...real, createLogger: capture, getLogger: capture };
});

const FERNI = {
  id: 'ferni',
  name: 'Ferni',
  description: 'Ferni',
  voice: { voiceId: 'ferni-voice', provider: 'cartesia' },
  systemPrompt: '',
} as PersonaConfig;

vi.mock('../../voice-agent/phases/index.js', () => ({
  getPrewarmedResources: vi.fn(async (id: string) => ({
    usePrewarmed: true,
    persona: id === 'ferni' ? FERNI : null,
    systemPrompt: undefined,
  })),
  loadPersonaLocally: vi.fn(async () => null),
}));

vi.mock('../../personas/prompt-loader.js', () => ({
  loadModelBaseInstructions: vi.fn(async () => 'BASE'),
  loadSystemPrompt: vi.fn(async (id: string) => `PROMPT:${id}`),
}));

const { getCustomAgent } =
  await import('../../../services/custom-agent/custom-agent-persistence-service.js');
const { callerSessionPersona, loadCallerPrompt } = await import('../persona-builder.js');
const { isLiveCustomAgent, resolveLiveCustomAgent } =
  await import('../../shared/custom-agent-live.js');
const { personaForCaller } = await import('../../../services/custom-agent/custom-agent-owner.js');
const { customAgentToPersonaConfig } =
  await import('../../../services/custom-agent/custom-agent-runtime-service.js');
const { liveCallPersona } =
  await import('../../../services/custom-agent/custom-agent-live-prompt.js');

const e2e = { resourceLoading: () => undefined, resourceLoaded: () => undefined } as never;

/** What buildSessionPersona hands over at STEP 2 for an agent id: the generic stand-in. */
const standIn = (): PersonaConfig =>
  ({
    id: AGENT_ID,
    name: 'Agent 1700000000 Abc',
    description: 'a warm and supportive life coach.',
    voice: { voiceId: 'ferni-voice', provider: 'cartesia' },
    systemPrompt: `You are ${AGENT_ID}, a warm and supportive life coach.`,
  }) as PersonaConfig;

const leaks = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return [AGENT_NAME, AGENT_DESCRIPTION, AGENT_MEMORY, STOCK_VOICE_ID].some((s) =>
    text.includes(s)
  );
};

beforeEach(() => {
  h.store = { [OWNER_UID]: { [AGENT_ID]: liveAgent() } };
  h.logged = [];
  vi.mocked(getCustomAgent).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('callerSessionPersona with CUSTOM_AGENT_LIVE on', () => {
  beforeEach(() => vi.stubEnv('CUSTOM_AGENT_LIVE', 'on'));

  it("loads the owner's agent with its name, personality, memories and voice", async () => {
    const persona = await callerSessionPersona(standIn(), OWNER_UID, e2e);
    expect(persona.id).toBe(AGENT_ID);
    expect(persona.name).toBe(AGENT_NAME);
    expect(persona.personality.warmth).toBe(0.9);
    expect(persona.personality.traits).toEqual(['patient', 'wry']);
    expect(persona.stories?.map((s) => s.content)).toContain(AGENT_MEMORY);
    expect(persona.voice.voiceId).toBe(STOCK_VOICE_ID); // SESSION_OWN_VOICE reads this
    expect(isLiveCustomAgent(persona)).toBe(true);

    const prompt = await loadCallerPrompt(persona);
    expect(prompt).toBe(persona.systemPrompt);
    expect(prompt).toContain('<character_profile>');
    expect(prompt).toContain(AGENT_DESCRIPTION);
    expect(prompt).not.toContain('PROMPT:');
  });

  it('gives anyone else the default persona, and nothing about the agent leaks', async () => {
    const persona = await callerSessionPersona(standIn(), 'uid-stranger', e2e);
    expect(persona.id).toBe('ferni');
    expect(isLiveCustomAgent(persona)).toBe(false);
    expect(await loadCallerPrompt(persona)).toBe('PROMPT:ferni');
    expect(leaks(persona)).toBe(false);
    expect(h.logged.length).toBeGreaterThan(0); // the refusal was logged, with ids only
    expect(leaks(h.logged)).toBe(false);
    // Only the caller's own agents were ever read
    for (const [uid] of vi.mocked(getCustomAgent).mock.calls) expect(uid).toBe('uid-stranger');
  });

  it('gives a caller nobody identified the default persona', async () => {
    const persona = await callerSessionPersona(standIn(), null, e2e);
    expect(persona.id).toBe('ferni');
    expect(getCustomAgent).not.toHaveBeenCalled();
  });

  it('refuses a non-owner even if the loader would hand the agent to anyone', async () => {
    const anyoneLoader = vi.fn(async () => customAgentToPersonaConfig(liveAgent() as CustomAgent));
    const result = await resolveLiveCustomAgent(standIn(), 'uid-stranger', process.env, {
      personaForCaller,
      loadCustomAgentAsPersona: anyoneLoader,
      liveCallPersona: async (loaded) => liveCallPersona(loaded),
    });
    expect(result.kind).toBe('refused');
    expect(anyoneLoader).not.toHaveBeenCalled();
  });

  it('leaves a built-in persona alone', async () => {
    const ferni = { ...FERNI };
    expect(await callerSessionPersona(ferni, OWNER_UID, e2e)).toBe(ferni);
  });
});

describe('callerSessionPersona with CUSTOM_AGENT_LIVE off', () => {
  it('is the persona it was given, with the prompt it had before', async () => {
    const input = standIn();
    const persona = await callerSessionPersona(input, OWNER_UID, e2e);
    expect(persona).toBe(input);
    expect(isLiveCustomAgent(persona)).toBe(false);
    expect(await loadCallerPrompt(persona)).toBe(`PROMPT:${AGENT_ID}`);
    expect(getCustomAgent).not.toHaveBeenCalled();
  });
});
