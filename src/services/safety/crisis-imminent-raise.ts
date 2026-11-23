/**
 * Raises a read to the caller's own crisis from a set of extra patterns, each behind its own flag:
 * the Spanish twins of the English imminent rows (crisis-spanish-imminent.ts, #4310). A set gives
 * only its patterns and what softens them; this module reads them and merges the raise. The sets
 * live in crisis-own-raises.ts, which detectCrisis reads.
 *
 * - Words: `\b` and `\w` in a set's patterns count every letter, accented ones too (wordPattern).
 *   JS's own `\b` never matches after "aquí" or "estaré".
 * - Ownership: a match counts when the set's own guard leaves it standing (an English set reads
 *   the shared modifiers, crisis-modifiers.ts explicitModifier, as the English rows do). Every
 *   match is read, not just the first, so a softened one never hides a later real one.
 * - Never lower: the raise adds the caller's own explicit (and, for an imminent pattern, imminent)
 *   read and keeps every indicator, level and language the read had. The caller's own words make
 *   the caller the one at risk, as an English row's do in scoreText (hardSelf). When someone else is
 *   down in the same turn (third_party_emergency), the reply keeps the 911 for them first and then
 *   the caller's own reply ('own', as withCloseDown in crisis-caller-check.ts sets it).
 *
 * @module services/safety/crisis-imminent-raise
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { FlagName } from '../../config/flag-manifest.js';
import type { Beside } from './crisis-caller-check.js';
import type { CrisisSubject } from './crisis-guard.js';
import { SEVERITY } from './crisis-severity.js';

const LETTER = String.raw`[\p{L}\p{N}_]`;
const BOUNDARY = String.raw`(?:(?<!${LETTER})(?=${LETTER})|(?<=${LETTER})(?!${LETTER}))`;

/**
 * A pattern whose `\b` and `\w` count accented letters as letters. Write `\b` and `\w` outside
 * character classes. Compiled once: global for a set's patterns, so every match can be read;
 * `test: true` for a guard read with `.test`.
 */
export const wordPattern = (source: string, { test = false } = {}): RegExp =>
  new RegExp(
    source.replaceAll(String.raw`\b`, BOUNDARY).replaceAll(String.raw`\w`, LETTER),
    test ? 'u' : 'gu'
  );

/** A set of extra patterns, read only when its flag is on. */
export interface CrisisRaise {
  /** The off-by-default flag the set is read behind. */
  flag: FlagName;
  /** Words that read as the caller's own imminent crisis. */
  imminent: readonly RegExp[];
  /** Words that read as the caller's own explicit crisis, not imminent. */
  explicit: readonly RegExp[];
  /** Whether the words around one match set it aside: negated, past, a joke, someone else's. */
  softened: (text: string, start: number, end: number) => boolean;
  /** The language the set's words are in, when the read names none. */
  language?: 'es';
}

/** What a raise reads and may raise: a text score from crisis-guard.ts. */
export interface RaisableScore {
  severity: number;
  indicators: string[];
  subject?: CrisisSubject;
  language?: 'en' | 'es';
  hardSelf: boolean;
  beside?: Beside;
}

/** Whether any pattern reads standing in the text, the caller's own and not set aside. */
function standing(text: string, patterns: readonly RegExp[], raise: CrisisRaise): boolean {
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const end = m.index + m[0].length;
      if (!raise.softened(text, m.index, end)) return true;
    }
  }
  return false;
}

/**
 * The score with the caller's own crisis added when a set that is on reads standing in the text,
 * imminent before explicit. Otherwise the score as it was.
 */
export function raiseOwnCrisis<T extends RaisableScore>(
  text: string,
  score: T,
  raises: readonly CrisisRaise[],
  env: Env = process.env
): T {
  let raised: { raise: CrisisRaise; imminent: boolean } | undefined;
  for (const raise of raises) {
    if (!flagOn(raise.flag, env)) continue;
    if (standing(text, raise.imminent, raise)) raised = { raise, imminent: true };
    else if (!raised && standing(text, raise.explicit, raise)) raised = { raise, imminent: false };
    if (raised?.imminent) break;
  }
  if (!raised) return score;
  const indicators = [...score.indicators];
  const tags = raised.imminent
    ? ['explicit_crisis_language', 'imminent_danger']
    : ['explicit_crisis_language'];
  for (const tag of tags) if (!indicators.includes(tag)) indicators.push(tag);
  return {
    ...score,
    severity: Math.max(score.severity, SEVERITY.explicit),
    indicators,
    subject: 'self',
    hardSelf: true,
    language: score.language ?? raised.raise.language,
    beside: indicators.includes('third_party_emergency') ? 'own' : score.beside,
  };
}
