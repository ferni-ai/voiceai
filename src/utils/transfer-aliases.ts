/**
 * Teammate names as speech-to-text hears them in a transfer request
 * (TRANSFER_NAME_ALIASES=on, off by default).
 *
 * Prod 2026-10-18: the owner asked Alex "Can you pass me to Nayan?" and STT
 * wrote "Can you pass me to 9?". Nothing knew "9" meant Nayan.
 *
 * These spellings are ordinary words ("nine", "Fred") or numbers, so unlike
 * HEARD_AS (teammate-talk.ts) they never stand for a teammate on their own:
 * only as the target of a transfer ("pass me to 9", "can I talk to Fred?"),
 * with nothing after them but "please" or "now". Even then the caller may mean
 * someone else, so readers say "may be". "nine" or "9" is never Nayan when
 * "one one" or "eight eight" (911, 988) follows anywhere in the same words.
 * On a turn with crisis guidance, nothing here is used (crisisGuidedTurn).
 *
 * @module utils/transfer-aliases
 */

import { flagOn, type Env } from '../config/env-flag.js';

/** Spelling (lower case) → persona id, read only as the target of a transfer. */
export const HEARD_IN_A_TRANSFER: Readonly<Record<string, string>> = {
  nine: 'nayan-patel',
  '9': 'nayan-patel',
  fred: 'ferni',
  freddy: 'ferni',
  fern: 'ferni',
  fernie: 'ferni',
  ferny: 'ferni',
  furny: 'ferni',
};

const SPELLINGS = Object.keys(HEARD_IN_A_TRANSFER).join('|');

/**
 * "pass me to", "put me through to", "switch me back over to", "can I talk to":
 * a moving verb needs "me" or "us", so "switch to 9" (a channel, a volume) is
 * not a transfer.
 */
const TRANSFER_VERB =
  '(?:(?:pass|transfer|switch|send|hand|put|patch|connect) (?:me|us)(?: back| over| through)* (?:to|with)|(?:talk|speak|chat)(?: back)? (?:to|with))';

/** The alias ends its clause: punctuation or the end, give or take "please" or "now". */
const ALIAS_IN_TRANSFER = new RegExp(
  `\\b${TRANSFER_VERB} (${SPELLINGS})(?=(?:,? (?:please|now|again|real quick))?\\s*(?:[.!?,;:]|$))`,
  'gi'
);

/** "nine … one one", "9. 1 1", "nine eight eight", "9. 911": an emergency or crisis number. */
const LINE_NUMBER_AFTER =
  /\b(?:nine|9)\b.*(?:\b(?:(?:one|1)[\s.,-]*(?:one|1)|11|(?:eight|8)[\s.,-]*(?:eight|8)|88)\b|911|988)/i;

/** Each transfer-only spelling the caller's words ask for, with the persona it may be. */
export function aliasesInTransfer(
  text: string,
  env: Env = process.env
): Array<{ heard: string; id: string }> {
  if (typeof text !== 'string' || !flagOn('TRANSFER_NAME_ALIASES', env)) return [];
  const plain = text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  const numberLine = LINE_NUMBER_AFTER.test(plain);
  const seen = new Map<string, string>();
  for (const match of plain.matchAll(ALIAS_IN_TRANSFER)) {
    const heard = match[1];
    if (numberLine && (heard === 'nine' || heard === '9')) continue;
    if (heard && Object.hasOwn(HEARD_IN_A_TRANSFER, heard)) {
      seen.set(heard, HEARD_IN_A_TRANSFER[heard]);
    }
  }
  return [...seen].map(([heard, id]) => ({ heard, id }));
}

/** Where the reply gate marks this turn's crisis handling on the session's userData. */
const CRISIS_GUIDED_TURN = 'crisisGuidedTurn';

/**
 * Mark (or clear) this turn as one with crisis handling (guide or replace), on
 * the session's userData, which the handoff tools see too. Not an object: nothing.
 */
export function markCrisisGuidedTurn(userData: unknown, guided: boolean): void {
  if (typeof userData === 'object' && userData !== null) {
    (userData as Record<string, unknown>)[CRISIS_GUIDED_TURN] = guided;
  }
}

/**
 * Whether this turn may have crisis handling: true unless the gate cleared it.
 * Unknown (no userData, never marked) counts as guided, so no alias is trusted.
 */
export function crisisGuidedTurn(userData: unknown): boolean {
  if (typeof userData !== 'object' || userData === null) return true;
  return (userData as Record<string, unknown>)[CRISIS_GUIDED_TURN] !== false;
}
