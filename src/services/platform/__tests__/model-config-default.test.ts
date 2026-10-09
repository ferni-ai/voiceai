/**
 * Pins the default model read from data/model-config.json.
 *
 * On 2026-10-08 every local call opened the 'semantic-llm' circuit breaker
 * because the file named gemini-2.0-flash-exp, which Vertex no longer serves
 * (404 NOT_FOUND). The production image excludes data/ (.dockerignore), so prod
 * falls back to GEMINI_MODEL; the file must not make local dev differ from that.
 */
import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS, getDefaultModel } from '../model-config.js';

describe('getDefaultModel with the checked-in data/model-config.json', () => {
  it('returns a model Vertex still serves', () => {
    const model = getDefaultModel();
    expect(model).not.toBe('gemini-2.0-flash-exp');
    expect(AVAILABLE_MODELS.map((m) => m.id)).toContain(model);
  });

  it('matches the production fallback so local dev behaves like prod', () => {
    expect(getDefaultModel()).toBe('gemini-3.5-flash');
  });
});
