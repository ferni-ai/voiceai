/**
 * Our-model configuration for Phase 3 of "Own the Stack."
 *
 * When we have a fine-tuned model (Qwen/Llama/Gemma fine-tuned for Ferni),
 * these helpers tell the Rust pipeline where to find it and what to call it.
 *
 * The Rust Higgs pipeline's Candle backend needs a directory with:
 *   - config.json        (Llama-format model config)
 *   - tokenizer.json     (tokenizer)
 *   - model.safetensors  (or model.safetensors.index.json + shards)
 *
 * Set CANDLE_LLM_MODEL_PATH to point at that directory.
 * When set, Candle is preferred over Ollama automatically.
 *
 * @module config/owned-model
 */

/**
 * Path to our fine-tuned (or chosen open) model for Candle.
 * When set, Higgs uses Candle instead of Ollama.
 */
export function getCandleModelPath(): string | undefined {
  return process.env.CANDLE_LLM_MODEL_PATH || undefined;
}

/**
 * Whether we're using our own Candle model (fine-tuned or open weights).
 */
export function isUsingCandleModel(): boolean {
  return !!getCandleModelPath();
}

/**
 * Ollama URL — used only when Candle model path is not set.
 */
export function getOllamaUrl(): string | undefined {
  return process.env.OLLAMA_URL || undefined;
}

/**
 * Ollama model name (default: llama3.2).
 */
export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || 'llama3.2';
}

/**
 * Whether any LLM backend is configured (Candle or Ollama).
 */
export function isLlmBackendConfigured(): boolean {
  return isUsingCandleModel() || !!getOllamaUrl();
}

/**
 * Summary of which LLM backend is active.
 */
export function getLlmBackendSummary(): string {
  if (isUsingCandleModel()) {
    return `Candle (${getCandleModelPath()})`;
  }
  if (getOllamaUrl()) {
    return `Ollama (${getOllamaUrl()}, model: ${getOllamaModel()})`;
  }
  return 'None (generate_reply disabled)';
}
