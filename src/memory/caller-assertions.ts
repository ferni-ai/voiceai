/**
 * Memory keeps what the caller asserts, not what they ask.
 *
 * Seth's prod call (2026-10-12): Peter asked "How did those contracts end
 * up?" (a mishearing from an earlier call), Seth said "What contracts?", and
 * the entity "Contracts" was stored a minute later from that very question.
 * The same call stored "Freddy (person)" from "How are you doing, Freddy?"
 * (Ferni misheard), "User's home" from "Do you know where I live?" and "Check
 * the weather" from "Could you check the weather?". Both per-turn extractors
 * (entity capture and deep extraction) read only the caller's lines, so the
 * junk came from the caller's own questions.
 *
 * With CALLER_ASSERTED_MEMORY=on, the extractors read the caller's lines
 * without their questions, and the after-call summary is told to keep only
 * what the caller said or confirmed and to drop what they questioned or
 * denied. A question that also carries a fact ("is my sister's wedding on
 * Saturday?") is lost to these extractors; the after-call summary still reads
 * the whole call.
 *
 * @module memory/caller-assertions
 */
import { flagOn, type Env } from '../config/env-flag.js';

/** True when CALLER_ASSERTED_MEMORY is on. */
export function callerAssertedMemoryOn(env: Env = process.env): boolean {
  return flagOn('CALLER_ASSERTED_MEMORY', env);
}

/** A caller's line without the sentences that are questions. */
export function withoutQuestions(line: string): string {
  return line
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !sentence.trim().endsWith('?'))
    .join(' ')
    .trim();
}

/** Caller lines for an extractor: unchanged when the flag is off, questions removed when on. */
export function assertedLines(lines: readonly string[], env: Env = process.env): string[] {
  if (!callerAssertedMemoryOn(env)) return [...lines];
  return lines.map(withoutQuestions).filter((line) => line.length > 0);
}

/** Told to the after-call summarizer: what the caller only asked about or denied is not a fact. */
export const CALLER_ASSERTION_RULE =
  'Keep only what the USER said or confirmed. Something only the ASSISTANT said, or the USER only asked about, is not a fact about the USER. If the USER questions or denies something the ASSISTANT brought up ("What contracts?", "I never said that", "No, that\'s wrong"), leave that thing out of every field.';

/** The summarizer prompt's rule line: empty when the flag is off. */
export function summaryAssertionRule(env: Env = process.env): string {
  return callerAssertedMemoryOn(env) ? `\n${CALLER_ASSERTION_RULE}` : '';
}
