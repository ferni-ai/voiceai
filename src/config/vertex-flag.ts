/**
 * USE_VERTEX_AI: Gemini calls and embeddings go through Vertex AI unless it is
 * "false". Prod and dev agents both log `useVertexAI: true` at startup
 * ("Gemini configuration loaded", 2026-10-11), and CI sets "false" where it has
 * no Google credentials.
 *
 * This is the only reader. There used to be eight: four defaulted on, four
 * (Gemini Live, Gemma 3n, the Gemini health monitor, synthetic e2e) only
 * turned on for "true", and GEMINI_LIVE_USE_VERTEX_AI / GEMMA3N_USE_VERTEX_AI
 * were extra names nothing set.
 *
 * @module config/vertex-flag
 */
export function useVertexAI(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env.USE_VERTEX_AI !== 'false';
}
