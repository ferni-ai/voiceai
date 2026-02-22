/**
 * Own-the-stack configuration.
 *
 * When enabled (USE_OWNED_STACK=true), the voice agent uses only Higgs for STT + TTS + LLM
 * (generate_reply with Candle or Ollama). No Gemini or OpenAI API calls for conversation.
 *
 * LLM backend priority (in Rust Higgs pipeline):
 *   1. CANDLE_LLM_MODEL_PATH → Candle (our own model, local inference)
 *   2. OLLAMA_URL → Ollama (open model via HTTP)
 *   3. Neither → NoLlm (generate_reply will error)
 *
 * Phase 4 goal: Candle-only, no Ollama dependency.
 *   - Set CANDLE_LLM_MODEL_PATH to a Llama-format safetensors dir.
 *   - Ollama is optional; leave OLLAMA_URL unset for candle-only mode.
 *
 * @module config/owned-stack
 */

/**
 * Whether the "owned stack" mode is enabled: no Gemini, no OpenAI; Higgs STT + Higgs TTS + our LLM only.
 */
export function isOwnedStackEnabled(): boolean {
  return process.env.USE_OWNED_STACK === 'true';
}

/** Seed transcript for greeting when using owned stack (no user speech yet). */
export const OWNED_STACK_GREETING_TRANSCRIPT = '[User just joined]';

/**
 * Validate owned-stack prerequisites at startup.
 * Call this early in voice-agent-entry if USE_OWNED_STACK is true.
 * Warns (does not throw) if the configuration looks incomplete.
 */
export function validateOwnedStackConfig(): string[] {
  const warnings: string[] = [];

  if (!isOwnedStackEnabled()) return warnings;

  const ttsProvider = process.env.TTS_PROVIDER?.toLowerCase();
  if (ttsProvider !== 'higgs-pipeline') {
    warnings.push(
      `USE_OWNED_STACK=true requires TTS_PROVIDER=higgs-pipeline (current: ${ttsProvider ?? 'unset'})`
    );
  }

  const candlePath = process.env.CANDLE_LLM_MODEL_PATH;
  const ollamaUrl = process.env.OLLAMA_URL;

  if (!candlePath && !ollamaUrl) {
    warnings.push(
      'USE_OWNED_STACK=true but no LLM backend configured. Set CANDLE_LLM_MODEL_PATH or OLLAMA_URL.'
    );
  } else if (candlePath) {
    // Candle-only mode (Phase 4 target)
    if (ollamaUrl) {
      // Both set — Candle wins, Ollama ignored. Not a problem but worth noting.
    }
  }

  return warnings;
}
