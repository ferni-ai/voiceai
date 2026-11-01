/**
 * The crisis classifier's reply parser, on its own so the classifier and CRISIS_CONTEXT_V2
 * (crisis-context-v2.ts) read a reply the same way without importing each other.
 *
 * @module CrisisVerdict
 */

import type { CrisisVerdict } from './crisis-classifier.js';

/** The model's JSON reply, or null when it is not a valid verdict. */
export function parseClassifierReply(reply: string): CrisisVerdict | null {
  const json = reply.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { risk?: unknown; subject?: unknown };
    const { risk } = parsed;
    if (risk !== 'imminent' && risk !== 'crisis' && risk !== 'none') return null;
    return { risk, subject: parsed.subject === 'third_party' ? 'third_party' : 'self' };
  } catch {
    return null;
  }
}
