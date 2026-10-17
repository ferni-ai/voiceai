/**
 * Last-resort truncation of a persona's system prompt, used by ferni-agent.ts
 * when prompt-loader's own truncation still leaves it over the token limit.
 *
 * @module agents/personas/emergency-truncate
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FerniAgent' });

/** Estimate token count (~4 chars per token for English) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Emergency truncation for system prompt if it exceeds token limit.
 * This is a last-resort defense - should rarely trigger if prompt-loader works correctly.
 */
export function emergencyTruncate(prompt: string, maxTokens: number): string {
  const tokens = estimateTokens(prompt);
  if (tokens <= maxTokens) return prompt;

  log.warn(
    { currentTokens: tokens, maxTokens, promptLength: prompt.length },
    '🚨 EMERGENCY: System prompt still exceeds token limit after prompt-loader truncation!'
  );

  // Simple character-based truncation (prompt-loader should have done smart truncation)
  const maxChars = maxTokens * 4;
  return (
    prompt.slice(0, maxChars) + '\n\n[EMERGENCY TRUNCATION - prompt exceeded OpenAI Realtime limit]'
  );
}
