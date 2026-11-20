/**
 * Thinking defaults for calls through the shared Gemini client.
 *
 * gemini-2.5-flash and the 3.x models think by default, and thinking tokens
 * count against maxOutputTokens. Our background calls (expression generation,
 * extraction, detectors) set small caps, so the model spent the cap thinking
 * and returned nothing usable: expression generation hit MAX_TOKENS with ~480
 * of 500 tokens spent on thoughts and parsed 0/3; with thinkingBudget 0 it
 * parsed 3/3 (measured 2026-09-27).
 *
 * A call that does not ask for thinking gets the least the model allows. A
 * call that wants thinking passes its own thinkingConfig, which is kept.
 *
 * @module config/thinking-defaults
 */

export type GenerateConfig = Record<string, unknown> | undefined;

/**
 * Models whose lowest thinking level is LOW: they reject MINIMAL with a 400.
 * gemini-3.8 (measured 2026-09-27); gemini-4 Neon and Hydrogen (2026-11-19),
 * "Thinking level is unsupported: THINKING_LEVEL_MINIMAL". The SDK reports the
 * 400 as an 'error' event and ends the stream empty, so a MINIMAL request to
 * one of these models is a reply with no words.
 */
export function rejectsMinimalThinking(model: string): boolean {
  return /^gemini-(?:3\.8|4[.-])/.test(model.toLowerCase().replace(/^.*\//, ''));
}

/** The least thinking `model` accepts, or undefined to leave the model's default. */
export function minimalThinkingFor(model: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase().replace(/^.*\//, '');
  // 2.5 Flash and Flash-Lite accept a zero budget; 2.5 Pro cannot turn thinking off.
  if (/^gemini-2\.5-flash/.test(m)) return { thinkingBudget: 0 };
  if (rejectsMinimalThinking(m)) return { thinkingLevel: 'LOW' };
  if (/^gemini-3(\.\d+)?-/.test(m)) return { thinkingLevel: 'MINIMAL' };
  return undefined;
}

/** `config` with the least thinking for `model`, unless it already sets thinkingConfig. */
export function withDefaultThinking(model: string, config: GenerateConfig): GenerateConfig {
  if (config && 'thinkingConfig' in config) return config;
  const thinking = minimalThinkingFor(model);
  if (!thinking) return config;
  return { ...config, thinkingConfig: thinking };
}

interface ModelsApi {
  generateContent: (req: { model: string; config?: GenerateConfig }) => Promise<unknown>;
  generateContentStream?: (req: { model: string; config?: GenerateConfig }) => Promise<unknown>;
}

/** Route a client's generateContent / generateContentStream through withDefaultThinking. */
export function applyThinkingDefaults(client: { models: ModelsApi }): void {
  const models = client.models;
  for (const name of ['generateContent', 'generateContentStream'] as const) {
    const original = models[name];
    if (typeof original !== 'function') continue;
    const bound = original.bind(models);
    models[name] = (req) => bound({ ...req, config: withDefaultThinking(req.model, req.config) });
  }
}
