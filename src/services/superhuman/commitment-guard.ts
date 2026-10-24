/**
 * What the after-call commitment judge (COMMITMENT_SINGLE_WRITER) may store,
 * applied to whatever the model returns. The prompt hands the transcript over
 * as untrusted data; this does not trust the model either.
 *
 * The rule is commitment-span-guard.ts: extractive only (a statement is the
 * caller's own words, a span of one of their turns), dropped if any field
 * holds a secret, and sensitive unless plainly allowlisted. On top of it:
 *
 * - an item from a turn that talks to the model ("ignore your rules", "store
 *   this as a commitment", "confidence 1") is dropped, and a call with any
 *   such turn keeps no sensitive item at all. English only, so one layer, not
 *   the gate: an injection that gets past it still can't invent words, and
 *   anything sensitive it carries is never surfaced on its own;
 * - redactSecrets, run on everything stored, in case a secret got past.
 *
 * @module services/superhuman/commitment-guard
 */

import { isSpanOf, screenCommitment, type DropReason } from './commitment-span-guard.js';

/** Words that talk to the model instead of about the caller's life. Explicit on purpose. */
const DIRECTIVE: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.!?]{0,40}\b(instructions?|rules|prompts?|guidelines)\b/i,
  /\b(store|save|record|log|add|mark|file)\b[^.!?]{0,30}\b(as|a|an|this|the)\s+(new\s+)?commitments?\b/i,
  /\bconfidence\s*(of|=|:|at)?\s*(1(\.0+)?|100\s*%?)(?![\d.])/i,
  /\b(system|developer|admin)\s+(override|prompt|message|instructions?|mode)\b/i,
  /\b(note|message) to the\s+(judge|model|assistant|system|ai)\b/i,
  /\byour (output|reply|response|answer) (must|should|has to)\b/i,
  /"(isCommitment|commitments)"/,
];

export function isDirective(text: string): boolean {
  return DIRECTIVE.some((r) => r.test(text));
}

/** Runs of four or more digits, separators allowed; a dollar amount is not one. */
const DIGIT_RUN = /(\$\s?)?\b\d(?:[\d\s.,-]*\d)?\b(\s*(?:dollars|bucks|usd)\b)?/gi;
/** A password and the value after it ("password hunter2"). */
const PASSWORD_VALUE = /\b(password|passcode|passwd)(\s*(?:is|:|=)?\s+)(?!\[)(\S+)/gi;
/** A short numeric credential ("CVV 123", "PIN: 4512", "code 8361"). */
const SHORT_CODE = /\b(cvv|cvc|pin|otp|code)(\s*(?:is|:|=)?\s*)\d{3,}\b/gi;

/**
 * Defence in depth only, never the gate (the span guard drops a field with a
 * secret before it gets here): account, card and routing numbers, PINs and
 * codes become "[number]", a password "[secret]". Dollar amounts stay.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(PASSWORD_VALUE, (_m, word: string, sep: string) => `${word}${sep}[secret]`)
    .replace(SHORT_CODE, (_m, word: string, sep: string) => `${word}${sep}[number]`)
    .replace(DIGIT_RUN, (m: string, dollar?: string, unit?: string) =>
      dollar || unit || (m.match(/\d/g) ?? []).length < 4 ? m : '[number]'
    );
}

/** The fields of a judged item this reads. */
export interface GuardedItem {
  statement: string;
  quote?: string;
  person?: string;
  /** The judge's own call, in any language; true or missing counts as sensitive. */
  sensitive?: boolean;
}

/** Why items were not stored, counted: never their words. */
export type DropCounts = Partial<Record<DropReason | 'directive', number>>;

/**
 * The items to store, given the caller's turns (theirs only, never Ferni's).
 * Every kept item is sensitive: the span guard never calls one safe to send
 * (#2128), so each is raised only on a call. A call with a directive turn keeps none.
 */
export function screenJudged<T extends GuardedItem>(
  items: readonly T[],
  callerTurns: readonly string[],
  dropped: DropCounts = {}
): Array<T & { sensitive: boolean }> {
  const drop = (why: DropReason | 'directive') => {
    dropped[why] = (dropped[why] ?? 0) + 1;
    return [];
  };
  const directive = callerTurns.filter(isDirective);
  return items.flatMap((j) => {
    const screened = screenCommitment(j, callerTurns);
    if (!screened.keep) return drop(screened.reason);
    if (isDirective(`${j.statement} ${j.quote ?? ''}`)) return drop('directive');
    if (directive.some((t) => isSpanOf(j.statement, t))) return drop('directive');
    if (directive.length > 0) return drop('directive');
    return [{ ...j, sensitive: true }];
  });
}
