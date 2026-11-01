/**
 * What a guided prod reply says, for the full-path simulator (full-path-turn.ts):
 * built from production strings only, one variant picked per turn.
 *
 * - the guard's guided-level text as it is (getCrisisResponse, crisis-guard.ts);
 * - its empathy and 988 paragraphs ending in a direct safety check-in instead,
 *   one per question getSafetyCheckQuestion gives for suicidal ideation
 *   ("Are you somewhere safe right now?" and the rest, crisis-response.ts);
 * - the same ending in the grounded screen's direct question (SCREEN_QUESTION).
 *
 * Prod guided replies vary and often ask a direct safety question, whose answer
 * ("yes", "no") the classifier then reads; one fixed text under-counted that.
 */

import { SCREEN_QUESTION } from '../../src/services/safety/crisis-grounded-screen.js';
import { getSafetyCheckQuestion } from '../../src/services/safety/crisis-response.js';

let questions: string[] | null = null;

/** getSafetyCheckQuestion's list for suicidal ideation; it returns one at random, so collect them. */
function safetyQuestions(): string[] {
  if (questions) return questions;
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(getSafetyCheckQuestion('suicidal_ideation'));
  questions = [...seen].sort();
  return questions;
}

/** Every variant for one guided text, the text itself first. */
export function guidedVariants(guided: string): string[] {
  const paragraphs = guided.split('\n\n');
  const body = paragraphs.length > 1 ? paragraphs.slice(0, -1).join('\n\n') : guided;
  return [guided, ...[...safetyQuestions(), SCREEN_QUESTION].map((q) => `${body}\n\n${q}`)];
}

/** The variant for one turn: a stable pick from the call and turn, never random. */
export function guidedReplyFor(guided: string, key: string): string {
  const variants = guidedVariants(guided);
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return variants[h % variants.length];
}
