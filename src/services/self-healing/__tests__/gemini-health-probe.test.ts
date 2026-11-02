/**
 * The Vertex Gemini health probe asks the agent's own client and model to
 * count tokens. A model metadata GET (models.get) is not served where
 * generateContent is: on us-central1 it returned 200 for gemini-3.5-flash
 * while countTokens and generateContent both 404'd there (2026-11-01), so a
 * get-based probe can report healthy while every reply fails.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const countTokens = vi.fn();
const get = vi.fn();
const getGeminiClient = vi.fn();

vi.mock('../../../config/gemini-config.js', () => ({
  getGeminiClient: (...args: unknown[]) => getGeminiClient(...args),
  GEMINI_MODEL: 'gemini-test-model',
}));

vi.mock('../../observability/resilience-metrics.js', () => ({
  resilienceMetrics: { recordHealthCheck: vi.fn() },
}));

vi.mock('../anomaly-detection.js', () => ({
  recordLatency: vi.fn(),
  recordSuccessRate: vi.fn(),
}));

import { checkServiceHealth } from '../health-monitors.js';

describe('gemini health probe on Vertex', () => {
  const savedVertex = process.env.USE_VERTEX_AI;

  beforeEach(() => {
    process.env.USE_VERTEX_AI = 'true';
    countTokens.mockReset();
    get.mockReset();
    getGeminiClient.mockReset();
    getGeminiClient.mockResolvedValue({ models: { countTokens, get } });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedVertex === undefined) delete process.env.USE_VERTEX_AI;
    else process.env.USE_VERTEX_AI = savedVertex;
  });

  it('probes with countTokens on the agent model, never the metadata GET', async () => {
    countTokens.mockResolvedValue({ totalTokens: 1 });

    await checkServiceHealth('gemini');

    expect(getGeminiClient).toHaveBeenCalledTimes(1);
    expect(countTokens).toHaveBeenCalledTimes(1);
    expect(countTokens).toHaveBeenCalledWith({
      model: 'gemini-test-model',
      contents: 'ping',
      config: { abortSignal: expect.any(AbortSignal) },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('reports unhealthy with a timeout after 5 s when countTokens never settles, and aborts it', async () => {
    vi.useFakeTimers();
    countTokens.mockReturnValue(new Promise(() => {}));

    const pending = checkServiceHealth('gemini');
    await vi.advanceTimersByTimeAsync(4999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result?.healthy).toBe(false);
    expect(result?.error).toMatch(/timed out after 5000ms/);
    const signal = (countTokens.mock.calls[0][0] as { config: { abortSignal: AbortSignal } }).config
      .abortSignal;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when countTokens resolves, leaving no handle open', async () => {
    vi.useFakeTimers();
    countTokens.mockResolvedValue({ totalTokens: 1 });

    const result = await checkServiceHealth('gemini');

    expect(result?.healthy).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when countTokens rejects fast, leaving no handle open', async () => {
    vi.useFakeTimers();
    countTokens.mockRejectedValue(new Error('Publisher model was not found (404)'));

    const result = await checkServiceHealth('gemini');

    expect(result?.healthy).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports healthy when countTokens resolves', async () => {
    countTokens.mockResolvedValue({ totalTokens: 1 });

    const result = await checkServiceHealth('gemini');

    expect(result?.healthy).toBe(true);
    expect(result?.error).toBeUndefined();
  });

  it('reports unhealthy with the error when countTokens rejects', async () => {
    countTokens.mockRejectedValue(new Error('Publisher model was not found (404)'));

    const result = await checkServiceHealth('gemini');

    expect(result?.healthy).toBe(false);
    expect(result?.error).toBe('Publisher model was not found (404)');
  });

  it('reports unhealthy when there is no Vertex client', async () => {
    getGeminiClient.mockResolvedValue(null);

    const result = await checkServiceHealth('gemini');

    expect(result?.healthy).toBe(false);
    expect(result?.error).toBe('Vertex client unavailable');
    expect(countTokens).not.toHaveBeenCalled();
  });
});
