/**
 * Whether a would-be caller name is Ferni's own, or close enough to a team
 * name to ask about twice (rememberName, remember-name.ts; name-correction.ts).
 *
 * PR #2886 round 1 refused only exact strings, so "Furnee", "Furni",
 * "Fernay", "Ferni!" and "Fern." were all saved as the caller's name. The
 * name is normalised first (NFKD, combining marks and punctuation stripped,
 * lower case, trimmed). Then:
 * - `ferni`: the single word "ferni" or "fern". Never the caller's name.
 * - `like`: a single word within edit distance 2 of "ferni", or sounding like
 *   it (f/ph, e/u/i, r, n, a vowel ending: "furnee", "fernay", "phernie"), or a
 *   team member's name from the persona list ("maya", "jordan", "maya
 *   santos"). Distance 2 also reaches real names (Jenni, Terri, Kerri), so
 *   these are never refused: the caller is asked twice, and only a yes to
 *   the second, "Just checking, your name is Furnee? Like my name, Ferni?",
 *   saves it.
 * - `name`: anything else, "Fern Smith" included (the usual confirm).
 *
 * @module tools/domains/conversation/name-likeness
 */

import { editDistance } from '../../../utils/call-me-vocative.js';
import { extractCallerName } from '../../../utils/caller-name.js';

export type NameLikeness = { kind: 'ferni' } | { kind: 'like'; team: string } | { kind: 'name' };

/** NFKD, no combining marks or punctuation, lower case, single spaces, trimmed. */
export function normaliseName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\p{P}\p{S}]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The persona list rememberName refused before: first, last and full names, with whose they are. */
const TEAM: Readonly<Record<string, string>> = {
  maya: 'Maya',
  peter: 'Peter',
  alex: 'Alex',
  jordan: 'Jordan',
  nayan: 'Nayan',
  santos: 'Maya Santos',
  chen: 'Alex Chen',
  taylor: 'Jordan Taylor',
  john: 'Peter John',
  patel: 'Nayan Patel',
  'maya santos': 'Maya Santos',
  'alex chen': 'Alex Chen',
  'jordan taylor': 'Jordan Taylor',
  'peter john': 'Peter John',
  'nayan patel': 'Nayan Patel',
};

/** f/ph, then e/u/i, r, n, and a vowel ending: "furnee", "furni", "fernay", "phernie". */
const SOUNDS_LIKE_FERNI = /^(?:f|ph)[eiu]+r+n+[aeiouy]+$/;

export function nameLikeness(name: string): NameLikeness {
  const n = normaliseName(name);
  if (n === 'ferni' || n === 'fern') return { kind: 'ferni' };
  if (TEAM[n]) return { kind: 'like', team: TEAM[n] };
  if (n && !n.includes(' ') && (editDistance(n, 'ferni') <= 2 || SOUNDS_LIKE_FERNI.test(n)))
    return { kind: 'like', team: 'Ferni' };
  return { kind: 'name' };
}

/** The second question for a name like `team`; `speaking` is the speaking persona's first name. */
export function doubleCheckLine(
  name: string,
  team: string,
  speaking: string,
  plain = false
): string {
  const ref =
    team.split(/\s+/)[0].toLowerCase() === speaking.toLowerCase()
      ? `my name, ${team}`
      : `my teammate ${team}`;
  return (
    `${name} sounds like ${team}. Before you use it, check once more` +
    `${plain ? '' : ` ("Just checking, your name is ${name}? Like ${ref}?")`}, and use it only on a yes to that.`
  );
}

/** The name the caller stated last in `words` ("call me Sam. Actually, call me Riley" is Riley), or null. */
export function lastStatedName(words: string): string | null {
  const clauses = words.split(/[.!?;,]+/);
  for (let i = clauses.length - 1; i >= 0; i--) {
    const name = extractCallerName(clauses[i]);
    if (name) return name;
  }
  return null;
}
