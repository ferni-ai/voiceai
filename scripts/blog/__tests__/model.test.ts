import { describe, expect, it } from 'vitest';
import { geminiClientOptions } from '../model.js';

describe('geminiClientOptions', () => {
  it('uses the API key when one is set', () => {
    expect(geminiClientOptions({ GEMINI_API_KEY: 'k', GOOGLE_CLOUD_PROJECT: 'p' })).toEqual({
      apiKey: 'k',
    });
  });

  it('falls back to Vertex AI in the global location when only a project is set', () => {
    expect(geminiClientOptions({ GOOGLE_CLOUD_PROJECT: 'p' })).toEqual({
      vertexai: true,
      project: 'p',
      location: 'global',
    });
  });

  it('honours GOOGLE_CLOUD_LOCATION for Vertex AI', () => {
    expect(
      geminiClientOptions({ GOOGLE_CLOUD_PROJECT: 'p', GOOGLE_CLOUD_LOCATION: 'us-central1' })
    ).toMatchObject({
      location: 'us-central1',
    });
  });

  it('fails with a message naming both options when neither is set', () => {
    expect(() => geminiClientOptions({})).toThrow(/GEMINI_API_KEY.*GOOGLE_CLOUD_PROJECT/);
  });
});
