/**
 * Gemini 1.x and 2.0 models are retired: Vertex returns 404 for
 * gemini-1.5-flash, gemini-2.0-flash and gemini-2.0-flash-lite (probed
 * 2026-09-27). A default that points at one fails every call that relies on it
 * (evaluation, classification, light/humanization tasks) with no env override.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const RETIRED = /^gemini-(1\.|2\.0)/;
const OVERRIDES = [
  'LLM_EXTRACTION_MODEL',
  'LLM_EVALUATION_MODEL',
  'LLM_CLASSIFICATION_MODEL',
  'LLM_CONTENT_GENERATION_MODEL',
  'LLM_LIGHT_MODEL',
  'GEMINI_MODEL',
];

describe('Gemini model defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('no generateContent default points at a retired model', async () => {
    for (const name of OVERRIDES) vi.stubEnv(name, '');
    vi.resetModules();
    const config = await import('../gemini-config.js');
    const defaults = {
      extraction: config.getExtractionModel(),
      evaluation: config.getEvaluationModel(),
      classification: config.getClassificationModel(),
      contentGeneration: config.getContentGenerationModel(),
      light: config.getLightModel(),
    };
    const retired = Object.entries(defaults).filter(([, model]) => RETIRED.test(model));
    expect(retired).toEqual([]);
  });
});
