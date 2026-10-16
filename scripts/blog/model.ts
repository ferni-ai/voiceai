/** The model that writes drafts. Tests pass their own. */

export interface DraftModel {
  generate: (prompt: string) => Promise<string>;
}

/** Gemini through @google/genai with GEMINI_API_KEY; BLOG_MODEL picks the model. */
export async function geminiModel(): Promise<DraftModel> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new Error('GEMINI_API_KEY is not set (use --dry-run to see the prompt without a model)');
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
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
