/**
 * Cartesia cascade provider: Cartesia STT -> Gemini text LLM (Vertex) -> Cartesia TTS.
 *
 * The LLM defaults were chosen by measurement (2026-09-27, Vertex global,
 * streaming, voice-length reply): gemini-3.5-flash at MINIMAL thinking gave
 * 0.7-0.9s to first text; LOW gave 1.4-1.9s. The plugin ignores thinkingBudget
 * for Gemini 3, so the level must be set explicitly. These tests pin the
 * defaults so a later edit cannot silently re-enable hidden thinking.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { getProviderIdSync as configProviderId } from '../../../config/model-provider-config.js';
import {
  CartesiaCascadeProvider,
  buildCascadeLLMOptions,
  buildCascadeSTTOptions,
  buildCascadeKeyterms,
  createProviderSTT,
} from '../cartesia-cascade.js';

const ENV_KEYS = [
  'CASCADE_LLM_MODEL',
  'CASCADE_LLM_LOCATION',
  'CASCADE_STT_MODEL',
  'CASCADE_STT_KEYTERMS',
  'CASCADE_TURN_DETECTION',
  'VOICE_PIPELINE',
  'USE_OPENAI_REALTIME',
];
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('buildCascadeLLMOptions', () => {
  it('defaults to gemini-3.5-flash on Vertex global at MINIMAL thinking', () => {
    const opts = buildCascadeLLMOptions({ GOOGLE_CLOUD_PROJECT: 'proj' });
    expect(opts.model).toBe('gemini-3.5-flash');
    expect(opts.vertexai).toBe(true);
    expect(opts.project).toBe('proj');
    expect(opts.location).toBe('global');
    expect(opts.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
  });

  it('honours CASCADE_LLM_MODEL and CASCADE_LLM_LOCATION overrides', () => {
    const opts = buildCascadeLLMOptions({
      CASCADE_LLM_MODEL: 'gemini-3.1-flash-lite',
      CASCADE_LLM_LOCATION: 'us-central1',
    });
    expect(opts.model).toBe('gemini-3.1-flash-lite');
    expect(opts.location).toBe('us-central1');
  });
});

describe('cascade thinking level', () => {
  it('uses LOW for gemini-3.8 models, which reject MINIMAL', () => {
    const opts = buildCascadeLLMOptions({ CASCADE_LLM_MODEL: 'gemini-3.8-flash' });
    expect(opts.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });

  it('honours CASCADE_LLM_THINKING', () => {
    const opts = buildCascadeLLMOptions({ CASCADE_LLM_THINKING: 'medium' });
    expect(opts.thinkingConfig).toEqual({ thinkingLevel: 'MEDIUM' });
  });
});

describe('buildCascadeSTTOptions', () => {
  it('defaults to Cartesia ink-2 in English', () => {
    expect(buildCascadeSTTOptions({})).toEqual({ model: 'ink-2', language: 'en' });
  });

  it('honours CASCADE_STT_MODEL', () => {
    expect(buildCascadeSTTOptions({ CASCADE_STT_MODEL: 'ink-whisper' }).model).toBe('ink-whisper');
  });
});

describe('buildCascadeKeyterms', () => {
  it('biases ink-2 toward the team and the caller by name', () => {
    const terms = buildCascadeKeyterms({ userName: 'Seth Ford' }, {});
    for (const t of ['Ferni', 'Maya', 'Peter', 'Nayan', 'Seth Ford', 'Seth'])
      expect(terms).toContain(t);
  });

  it('adds CASCADE_STT_KEYTERMS, drops duplicates and blanks', () => {
    const terms = buildCascadeKeyterms(
      { userName: ' ' },
      { CASCADE_STT_KEYTERMS: 'St. Petersburg, Ferni,,Tampa Bay' }
    );
    expect(terms).toContain('St. Petersburg');
    expect(terms).toContain('Tampa Bay');
    expect(terms.filter((t) => t === 'Ferni')).toHaveLength(1);
    expect(terms).not.toContain('');
  });

  it("stays inside Cartesia's limits (100 terms, 1200 characters)", () => {
    const many = Array.from({ length: 300 }, (_, i) => `term${i}`).join(',');
    const terms = buildCascadeKeyterms({}, { CASCADE_STT_KEYTERMS: many });
    expect(terms.length).toBeLessThanOrEqual(100);
    expect(terms.join('').length).toBeLessThanOrEqual(1200);
  });
});

describe('CartesiaCascadeProvider', () => {
  const provider = new CartesiaCascadeProvider();

  it('identifies as cartesia-cascade with native function calling', () => {
    expect(provider.id).toBe('cartesia-cascade');
    expect(provider.hasNativeFunctionCalling()).toBe(true);
    expect(provider.needsJsonWorkaround()).toBe(false);
  });

  it("ends turns on ink-2's own turn detection, with VAD as the opt-out", () => {
    // A fixed silence timer can end the turn at a thinking pause.
    expect(provider.hasBuiltInTurnDetection()).toBe(false);
    expect(provider.getSessionTurnDetection()).toBe('stt');
    process.env.CASCADE_TURN_DETECTION = 'vad';
    expect(provider.getSessionTurnDetection()).toBe('vad');
  });

  it('creates a Gemini text LLM with the built options', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';
    const llm = (await provider.createLLMModel({
      model: 'ignored-realtime-model',
      instructions: 'x',
    })) as { model: string };
    expect(llm.model).toBe('gemini-3.5-flash');
  });

  it('creates a Cartesia STT with the built options', () => {
    process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
    const stt = provider.createSTT() as { model: string; provider: string };
    expect(stt.model).toBe('ink-2');
  });
});

describe('config-layer provider id agrees with the factory', () => {
  it('defaults to cartesia-cascade', () => {
    expect(configProviderId()).toBe('cartesia-cascade');
  });

  it('returns gemini-live only when explicitly selected', () => {
    process.env.VOICE_PIPELINE = 'gemini-live';
    expect(configProviderId()).toBe('gemini-live');
  });

  it('keeps USE_OPENAI_REALTIME working', () => {
    process.env.USE_OPENAI_REALTIME = 'true';
    expect(configProviderId()).toBe('openai-realtime');
  });
});

describe('createProviderSTT', () => {
  it('returns a Cartesia STT for the cascade provider', () => {
    process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
    const stt = createProviderSTT(new CartesiaCascadeProvider()) as { model: string } | undefined;
    expect(stt?.model).toBe('ink-2');
  });

  it('returns undefined for realtime providers, which transcribe internally', () => {
    expect(createProviderSTT({ id: 'openai-realtime' })).toBeUndefined();
  });
});
