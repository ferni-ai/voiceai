import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyBillingLabels,
  geminiBillingLabels,
  jobFromEntry,
  labelLlmChat,
  sanitizeLabelValue,
  withBillingLabels,
} from '../gemini-billing-labels.js';

describe('sanitizeLabelValue', () => {
  it('keeps only lowercase letters, digits, _ and -, at most 63 chars', () => {
    expect(sanitizeLabelValue('Voice Eval/Judge!!')).toBe('voice_eval_judge');
    expect(sanitizeLabelValue('nightly-sweep_2')).toBe('nightly-sweep_2');
    expect(sanitizeLabelValue('x'.repeat(80))).toHaveLength(63);
    expect(sanitizeLabelValue('***')).toBe('');
  });
});

describe('geminiBillingLabels', () => {
  it('names a local script after its entry file', () => {
    expect(jobFromEntry('/repo/scripts/voice-eval/judge.mjs')).toBe('voice-eval-judge');
    expect(jobFromEntry('/repo/scripts/test-llm-latency.ts')).toBe('test-llm-latency');
    expect(geminiBillingLabels({}, '/repo/scripts/voice-eval/judge.mjs')).toEqual({
      ferni_job: 'voice-eval-judge',
      ferni_env: 'local',
    });
  });

  it('lets GEMINI_BILLING_JOB win, sanitized', () => {
    const env = { GEMINI_BILLING_JOB: 'Nightly Sweep!' };
    expect(geminiBillingLabels(env, '/repo/scripts/voice-eval/judge.mjs').ferni_job).toBe(
      'nightly_sweep'
    );
  });

  it('labels deployed processes live_agent or by Cloud Run service, prod or dev', () => {
    expect(geminiBillingLabels({ NODE_ENV: 'production' }, '/app/x/job_main.js')).toEqual({
      ferni_job: 'live_agent',
      ferni_env: 'prod',
    });
    const dev = { NODE_ENV: 'production', FIRESTORE_DATABASE: 'ferni-dev' };
    expect(geminiBillingLabels(dev, '').ferni_env).toBe('dev');
    expect(geminiBillingLabels({ K_SERVICE: 'Ferni-Worker' }, '')).toEqual({
      ferni_job: 'ferni-worker',
      ferni_env: 'prod',
    });
  });

  it('falls back to unlabelled when nothing names the job', () => {
    const job = (env: Record<string, string>) => geminiBillingLabels(env, '').ferni_job;
    expect(job({ GEMINI_BILLING_JOB: '!!!' })).toBe('unlabelled');
    expect(job({})).toBe('unlabelled');
  });
});

const LABELS = { ferni_job: 'job_a', ferni_env: 'local' };

describe('withBillingLabels / applyBillingLabels / labelLlmChat', () => {
  it('adds labels to a config and keeps labels the call set', () => {
    expect(withBillingLabels({ temperature: 1 }, LABELS)).toEqual({
      temperature: 1,
      labels: LABELS,
    });
    expect(withBillingLabels({ labels: { ferni_job: 'mine' } }, LABELS)).toEqual({
      labels: { ferni_job: 'mine', ferni_env: 'local' },
    });
    expect(withBillingLabels(undefined, LABELS)).toEqual({ labels: LABELS });
  });

  it('labels generateContent and generateContentStream on a client', async () => {
    const seen: unknown[] = [];
    const client = {
      models: {
        generateContent: async (req: unknown) => (seen.push(req), 'ok'),
        generateContentStream: async (req: unknown) => (seen.push(req), 'stream'),
      },
    };
    applyBillingLabels(client, LABELS);
    await client.models.generateContent({ model: 'm', config: { temperature: 1 } });
    await client.models.generateContentStream({ model: 'm' });
    expect(seen).toEqual([
      { model: 'm', config: { temperature: 1, labels: LABELS } },
      { model: 'm', config: { labels: LABELS } },
    ]);
  });

  it('labels a livekit LLM chat() through extraKwargs', () => {
    const seen: unknown[] = [];
    const llm = { chat: (opts: { extraKwargs?: Record<string, unknown> }) => seen.push(opts) };
    labelLlmChat(llm, LABELS).chat({ extraKwargs: { seed: 1 } });
    expect(seen).toEqual([{ extraKwargs: { seed: 1, labels: LABELS } }]);
  });
});

describe('getGeminiClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@google/genai');
    vi.resetModules();
  });

  async function requestThroughSharedClient(env: Record<string, string>): Promise<unknown> {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const seen: unknown[] = [];
    vi.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        models = { generateContent: async (req: unknown) => (seen.push(req), {}) };
      },
    }));
    const { getGeminiClient } = await import('../gemini-config.js');
    const client = (await getGeminiClient()) as {
      models: { generateContent: (r: unknown) => Promise<unknown> };
    };
    await client.models.generateContent({ model: 'gemini-2.0-flash', contents: 'hi' });
    return seen[0];
  }

  it('labels requests on the Vertex client', async () => {
    const req = await requestThroughSharedClient({
      USE_VERTEX_AI: 'true',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      GEMINI_BILLING_JOB: 'unit_job',
    });
    expect(req).toMatchObject({
      config: { labels: { ferni_job: 'unit_job', ferni_env: 'local' } },
    });
  });

  it('sends no labels on the Gemini API (API key) client, which rejects them', async () => {
    const req = (await requestThroughSharedClient({
      USE_VERTEX_AI: 'false',
      GEMINI_API_KEY: 'test-key-not-real',
      GEMINI_BILLING_JOB: 'unit_job',
    })) as { config?: { labels?: unknown } };
    expect(req.config?.labels).toBeUndefined();
  });
});
