/**
 * The turn reading's LLM teacher (understanding/) on the understander's own
 * flash-lite client (turn-understanding.ts), each call with its output schema.
 *
 * Three focused calls at once by default: five runs of a 7-turn synthetic
 * fixture gave p50 1.04-1.13 s (p95 1.06-2.8 s), one combined call p50
 * 1.15-1.37 s (p95 1.6-1.9 s, past the understander's 1.5 s timeout, and one
 * 5 s stall). Neither fits 600 ms. TURN_UNDERSTANDING_CALLS=single for one call.
 *
 * @module agents/personas/turn-reading-teacher
 */
import { llmTeacher, type GenerateFn, type TurnReader } from '../../understanding/index.js';
import { geminiUnderstand } from './turn-understanding.js';

export function turnReadingTeacher(
  env: Record<string, string | undefined> = process.env,
  understand: typeof geminiUnderstand = geminiUnderstand
): TurnReader {
  const generate: GenerateFn = (system, user, schema, signal) =>
    understand(undefined, { schema, maxOutputTokens: 600 })(system, user, signal);
  return llmTeacher(generate, env.TURN_UNDERSTANDING_CALLS === 'single' ? 'single' : 'parallel');
}
