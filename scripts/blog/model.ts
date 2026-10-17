/** The model that writes drafts. Tests pass their own. */

export interface DraftModel {
  generate: (prompt: string) => Promise<string>;
}

/** How the drafter reaches Gemini: an API key, or Vertex AI with ambient Google credentials. */
export type GeminiClientOptions =
  { apiKey: string } | { vertexai: true; project: string; location: string };

/**
 * GEMINI_API_KEY wins when set. Otherwise GOOGLE_CLOUD_PROJECT selects Vertex AI
 * (location from GOOGLE_CLOUD_LOCATION, default `global`, as the voice agent uses),
 * authenticated by GOOGLE_APPLICATION_CREDENTIALS. CI has a service account, not an API key.
 */
export function geminiClientOptions(env: NodeJS.ProcessEnv = process.env): GeminiClientOptions {
  const apiKey = env.GEMINI_API_KEY;
  if (apiKey) return { apiKey };
  const project = env.GOOGLE_CLOUD_PROJECT;
  if (project) return { vertexai: true, project, location: env.GOOGLE_CLOUD_LOCATION || 'global' };
  throw new Error(
    'Set GEMINI_API_KEY, or GOOGLE_CLOUD_PROJECT for Vertex AI (use --dry-run to see the prompt without a model)'
  );
}

/** Gemini through @google/genai; BLOG_MODEL picks the model. */
export async function geminiModel(): Promise<DraftModel> {
  const options = geminiClientOptions();
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI(options);
  const model = process.env.BLOG_MODEL || 'gemini-3.5-flash';
  return {
    async generate(prompt) {
      const res = await client.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.7, responseMimeType: 'application/json' },
      });
      const { text } = res;
      if (!text) throw new Error(`${model} returned no text`);
      return text;
    },
  };
}
