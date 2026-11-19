/**
 * The crisis classifier's Gemini-backed generate function and its default model,
 * moved out of crisis-classifier.ts unchanged (that file re-exports both).
 *
 * @module CrisisClassifierGemini
 */

import { blockedReply, type BlockedResponse } from './crisis-classifier-blocked.js';
import type { CrisisGenerateFn } from './crisis-classifier.js';

/**
 * Served from the global endpoint only (us-central1 returns 404). On the blind
 * set: 100% recall, 0/60 false positives, 40/40 imminent, p50 535ms, p95 ~0.7s.
 */
export const DEFAULT_CRISIS_CLASSIFIER_MODEL = 'gemini-3.5-flash-lite';

/** Gemini-backed generate function. Resolves to '' when Gemini is not configured. */
export function createGeminiCrisisGenerate(
  model: string = process.env.CRISIS_CLASSIFIER_MODEL || DEFAULT_CRISIS_CLASSIFIER_MODEL
): CrisisGenerateFn {
  return async (systemPrompt, userContent, signal) => {
    const { getGeminiClient } = await import('../../config/gemini-config.js');
    const client = (await getGeminiClient()) as {
      models: {
        generateContent: (req: unknown) => Promise<{ text?: string } & BlockedResponse>;
      };
    } | null;
    if (!client) return '';
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0,
        maxOutputTokens: 60,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });
    return blockedReply(response) ?? response.text ?? ''; // CRISIS_CLASSIFIER_BLOCKED_SIGNAL
  };
}
