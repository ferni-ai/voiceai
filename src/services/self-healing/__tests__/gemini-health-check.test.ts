/**
 * The Gemini health check listed models on the AI Studio API with
 * GOOGLE_API_KEY, a key the live pipeline does not use (it calls Vertex via the
 * shared client). It alarmed every minute about a dead key and never checked the
 * backend or model production actually calls. It must use the shared client and
 * the configured model.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getGeminiClient = vi.fn();
vi.mock('../../../config/gemini-config.js', () => ({
  getGeminiClient: () => getGeminiClient(),
  getDefaultModel: () => 'gemini-test-model',
}));
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { checkGemini } = await import('../health-monitors.js');

describe('checkGemini', () => {
  beforeEach(() => getGeminiClient.mockReset());

  it('is unhealthy when no Gemini client is configured', async () => {
    getGeminiClient.mockResolvedValue(null);
    const r = await checkGemini();
    expect(r.healthy).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it('is healthy when the configured model resolves on the shared client', async () => {
    const get = vi.fn().mockResolvedValue({ name: 'models/gemini-test-model' });
    getGeminiClient.mockResolvedValue({ models: { get } });
    const r = await checkGemini();
    expect(get).toHaveBeenCalledWith({ model: 'gemini-test-model' });
    expect(r.healthy).toBe(true);
  });

  it('is unhealthy, naming the model, when the configured model is unavailable', async () => {
    const get = vi.fn().mockRejectedValue(new Error('404 model not found'));
    getGeminiClient.mockResolvedValue({ models: { get } });
    const r = await checkGemini();
    expect(r.healthy).toBe(false);
    expect(r.error).toContain('gemini-test-model');
  });
});
