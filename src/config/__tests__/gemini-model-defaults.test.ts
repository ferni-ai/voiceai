/**
 * Gemini 1.x and 2.0 models are retired: Vertex returns 404 for
 * gemini-1.5-flash, gemini-2.0-flash and gemini-2.0-flash-lite (probed
 * 2026-09-27). 2.5 is deprecated, and 3.5 is served only on the global
 * location. A default that points at a dead model or location fails every call
 * that relies on it (evaluation, classification, light/humanization tasks).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const RETIRED = /^gemini-(1\.|2\.)/;
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
      default: config.GEMINI_MODEL,
      extraction: config.getExtractionModel(),
      evaluation: config.getEvaluationModel(),
      classification: config.getClassificationModel(),
      contentGeneration: config.getContentGenerationModel(),
      light: config.getLightModel(),
    };
    const retired = Object.entries(defaults).filter(([, model]) => RETIRED.test(model));
    expect(retired).toEqual([]);
  });

  it('defaults the Gemini location to global', async () => {
    vi.stubEnv('GEMINI_LOCATION', '');
    vi.resetModules();
    const config = await import('../gemini-config.js');
    expect(config.GEMINI_LOCATION).toBe('global');
  });

  it('vertexOptions uses the unprefixed host for global and a regional host otherwise', async () => {
    const { vertexOptions } = await import('../gemini-config.js');
    expect(vertexOptions('p', 'global')).toEqual({
      project: 'p',
      location: 'global',
      apiEndpoint: 'aiplatform.googleapis.com',
    });
    expect(vertexOptions('p', 'us-east5').apiEndpoint).toBe('us-east5-aiplatform.googleapis.com');
  });
});
