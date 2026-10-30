/**
 * CALL_ME_VOCATIVE=on: whether a name rememberName is given is Ferni's own,
 * or close enough to a team name that the caller is asked twice
 * (remember-name.ts). The flag-off tool keeps its own checks.
 *
 * The name is normalised (NFKD, marks and punctuation stripped, lower case):
 * - `ferni`: exactly "ferni". Refused.
 * - `twice`: one word one edit from "ferni" ("fern", "fernie", "fernii"), or
 *   sounding like it (f/ph, e/u/i, r, n, a vowel ending: "furnee", "fernay",
 *   "pherni"), or a name from the persona list ("maya", "jordan taylor").
 *   Never refused, and never saved on the first yes: a second question,
 *   "Just checking, your name is Furnee? Like my name, Ferni?", must get one too.
 * - `name`: anything else ("Bernie", "Jenni", "Fern Smith").
 *
 * @module tools/domains/conversation/name-likeness
 */

import { editDistance } from '../../../utils/call-me-vocative.js';

export type NameLikeness = { kind: 'ferni' } | { kind: 'twice'; team: string } | { kind: 'name' };

const normalise = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\p{P}\p{S}]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** The persona list rememberName refuses with the flag off, and whose name each is. */
const TEAM: Readonly<Record<string, string>> = {
  maya: 'Maya',
  peter: 'Peter',
  alex: 'Alex',
  jordan: 'Jordan',
  nayan: 'Nayan',
  santos: 'Maya',
  chen: 'Alex',
  taylor: 'Jordan',
  john: 'Peter',
  patel: 'Nayan',
  'maya santos': 'Maya',
  'alex chen': 'Alex',
  'jordan taylor': 'Jordan',
  'peter john': 'Peter',
  'nayan patel': 'Nayan',
};

const SOUNDS_LIKE_FERNI = /^(?:f|ph)[eiu]+r+n+[aeiouy]+$/;

export function nameLikeness(name: string): NameLikeness {
  const n = normalise(name);
  if (n === 'ferni') return { kind: 'ferni' };
  if (TEAM[n]) return { kind: 'twice', team: TEAM[n] };
  if (/^[a-z]+$/.test(n) && (editDistance(n, 'ferni') <= 1 || SOUNDS_LIKE_FERNI.test(n)))
    return { kind: 'twice', team: 'Ferni' };
  return { kind: 'name' };
}

/** The second question; `speaking` is the speaking persona's first name, lower case. */
export const secondQuestion = (name: string, team: string, speaking: string): string =>
  `Just checking, your name is ${name}? Like ${
    team.toLowerCase() === speaking ? `my name, ${team}` : `my teammate ${team}`
  }?`;
