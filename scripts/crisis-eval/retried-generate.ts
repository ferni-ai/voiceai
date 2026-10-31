/**
 * The production classifier's model call (createGeminiCrisisGenerate) with
 * transport retries, so a 429 never counts as the model's answer, and a tally
 * of what was sent, for the cost line of a report. Shared by replay-turns.ts
 * and full-path-sim.ts.
 */

import {
  createGeminiCrisisGenerate,
  type CrisisGenerateFn,
} from '../../src/services/safety/crisis-classifier.js';

export interface GenerateTally {
  /** Model calls that returned. */
  calls: number;
  /** Calls that still failed after every retry. */
  failures: number;
  /** Calls that returned no text: Gemini not configured answers '' (createGeminiCrisisGenerate). */
  empty: number;
  /** Characters sent (system prompt plus input) and received. */
  charsIn: number;
  charsOut: number;
}

export function retriedGenerate(
  base: CrisisGenerateFn = createGeminiCrisisGenerate(),
  attempts = 4
): { generate: CrisisGenerateFn; tally: GenerateTally } {
  const tally: GenerateTally = { calls: 0, failures: 0, empty: 0, charsIn: 0, charsOut: 0 };
  const generate: CrisisGenerateFn = async (prompt, content, signal) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const reply = await base(prompt, content, signal);
        tally.calls++;
        tally.charsIn += prompt.length + content.length;
        tally.charsOut += reply.length;
        if (!reply.trim()) tally.empty++;
        return reply;
      } catch (error) {
        if (attempt >= attempts || signal.aborted) {
          tally.failures++;
          throw error;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  };
  return { generate, tally };
}
