/**
 * The semantic router's LLM fallback, greetings, humanization and the
 * cross-encoder used to call the Gemini API with GOOGLE_API_KEY. That key was invalid in prod, so they failed quietly,
 * and the unpaid tier may not be sent user text. They now go through the
 * shared client (Vertex on the agent). These tests mock that client and check
 * each path calls it, sends nothing to generativelanguage.googleapis.com, and
 * turns a failure into a typed error that does not quote the prompt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SENTINEL = 'my sister Dolores has stage-three lupus';
const state = vi.hoisted(() => ({
  client: null as null | { models: Record<string, ReturnType<typeof vi.fn>> },
  configured: true,
  logged: [] as unknown[][],
}));

vi.mock('../gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../gemini-config.js')>()),
  getGeminiClient: async () => state.client,
  isGeminiConfigured: () => state.configured,
}));

vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const capture = (...args: unknown[]) => void state.logged.push(args);
  const logger = { debug: capture, info: capture, warn: capture, error: capture };
  return {
    ...(await importOriginal<typeof import('../../utils/safe-logger.js')>()),
    createLogger: () => logger,
    getLogger: () => logger,
  };
});

import { generateText } from '../generative-model.js';
import { createGeminiProvider as createFallbackProvider } from '../../tools/semantic-router/advanced/intelligent/llm-fallback.js';
import { createGeminiProvider as createUnifiedProvider } from '../../tools/semantic-router/advanced/intelligent/llm-providers.js';
import { generateHumanizationLLM } from '../../personas/shared/llm-advanced-humanization.js';
import {
  GeminiCrossEncoder,
  HeuristicCrossEncoder,
  Reranker,
} from '../../memory/retrieval/cross-encoder.js';

const generateContent = vi.fn();
const fetchSpy = vi.fn();

beforeEach(() => {
  generateContent.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  state.client = { models: { generateContent } };
  state.configured = true;
  state.logged.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  // No path may fall back to the raw Gemini API.
  expect(fetchSpy).not.toHaveBeenCalled();
});

describe('shared helpers', () => {
  it('generateText calls the client and passes a timeout signal', async () => {
    generateContent.mockResolvedValue({ text: 'ok' });
    expect(await generateText({ model: 'm', prompt: 'p', timeoutMs: 50 })).toBe('ok');
    const req = generateContent.mock.calls[0][0];
    expect(req).toMatchObject({ model: 'm', contents: 'p' });
    expect(req.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('generateText turns a failure into GeminiCallError without the prompt', async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error(`echo ${SENTINEL}`), { status: 403 })
    );
    const thrown = await generateText({ model: 'm', prompt: SENTINEL }).catch((e: Error) => e);
    expect(thrown).toMatchObject({ name: 'GeminiCallError', status: 403 });
    expect((thrown as Error).message).not.toContain(SENTINEL);
  });

  it('generateText throws GeminiUnavailableError when there is no client', async () => {
    state.client = null;
    await expect(generateText({ model: 'm', prompt: 'p' })).rejects.toMatchObject({
      name: 'GeminiUnavailableError',
    });
  });
});

describe('semantic-router LLM fallback', () => {
  it('llm-fallback provider generates through the client', async () => {
    generateContent.mockResolvedValue({ text: '{"selectedToolId":null}' });
    expect(await createFallbackProvider().generate('pick a tool')).toBe('{"selectedToolId":null}');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('llm-providers provider asks for JSON through the client and rethrows typed', async () => {
    generateContent.mockResolvedValueOnce({ text: '{}' });
    expect(await createUnifiedProvider().generate('plan')).toBe('{}');
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe('application/json');

    generateContent.mockRejectedValueOnce(Object.assign(new Error(SENTINEL), { status: 500 }));
    await expect(createUnifiedProvider().generate(SENTINEL)).rejects.toMatchObject({
      name: 'GeminiCallError',
      status: 500,
    });
    expect(JSON.stringify(state.logged)).not.toContain(SENTINEL);
  });
});

describe('humanization', () => {
  const context = {
    personaId: 'maya-santos',
    type: 'subtext' as const,
    subtype: 'deflection' as const,
    userTranscript: SENTINEL,
  };

  it('generates with the light model through the client', async () => {
    vi.useFakeTimers({ now: Date.now() + 60_000, toFake: ['Date'] });
    generateContent.mockResolvedValue({ text: 'Something feels off. What is going on?' });
    try {
      const result = await generateHumanizationLLM(context);
      expect(result?.source).toBe('llm');
      expect(generateContent.mock.calls[0][0].model).toBe(
        process.env.LLM_LIGHT_MODEL || 'gemini-3.5-flash-lite'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs the failure class, not the user, and returns null', async () => {
    vi.useFakeTimers({ now: Date.now() + 120_000, toFake: ['Date'] });
    generateContent.mockRejectedValue(Object.assign(new Error(SENTINEL), { status: 429 }));
    try {
      expect(await generateHumanizationLLM(context)).toBeNull();
      expect(state.logged).toContainEqual([
        { error: 'GeminiCallError', status: 429 },
        'LLM humanization failed, using cache or static',
      ]);
      expect(JSON.stringify(state.logged)).not.toContain(SENTINEL);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('cross-encoder', () => {
  it('the reranker picks Gemini from the client config, not an API key', () => {
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    try {
      expect(new Reranker().getProviderName()).toBe(new GeminiCrossEncoder().getName());
      state.configured = false;
      expect(new Reranker().getProviderName()).toBe('heuristic');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('scores through the client', async () => {
    generateContent.mockResolvedValue({ text: '80' });
    const encoder = new GeminiCrossEncoder();
    await encoder.initialize();
    expect(await encoder.score('q', 'd')).toBe(0.8);
  });

  it('a failed score falls back to the heuristic, not a flat 0.5', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error(SENTINEL), { status: 503 }));
    const encoder = new GeminiCrossEncoder();
    await encoder.initialize();
    const query = 'coffee order';
    const doc = 'their usual coffee order is an oat milk flat white';
    const expected = await new HeuristicCrossEncoder().score(query, doc);
    expect(expected).not.toBe(0.5);
    expect(await encoder.score(query, doc)).toBe(expected);
    expect(JSON.stringify(state.logged)).not.toContain(SENTINEL);
  });
});

describe('no raw Gemini API in the moved paths', () => {
  const SRC = join(__dirname, '..', '..');
  const MOVED = [
    'tools/semantic-router/advanced/intelligent/llm-fallback.ts',
    'tools/semantic-router/advanced/intelligent/llm-providers.ts',
    'tools/semantic-router/integration/intelligent-router-integration.ts',
    'tools/semantic-router/integration/init.ts',
    'personas/greetings.ts',
    'personas/shared/llm-advanced-humanization.ts',
    'memory/retrieval/cross-encoder.ts',
  ];

  it.each(MOVED)('%s has no API-key URL or key reader', (file) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source).not.toContain('generativelanguage.googleapis.com');
    expect(source).not.toMatch(/process\.env\.(GOOGLE_API_KEY|GEMINI_API_KEY)/);
  });
});
