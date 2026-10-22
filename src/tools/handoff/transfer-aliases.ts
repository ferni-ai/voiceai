/**
 * Teammate names as speech-to-text hears them in a transfer request
 * (TRANSFER_NAME_ALIASES=on, off by default).
 *
 * Prod 2026-10-18: the owner asked Alex "Can you pass me to Nayan?" and STT
 * wrote "Can you pass me to 9?". Nothing knew "9" meant Nayan.
 *
 * These spellings are ordinary words ("nine", "Fred") or numbers, so unlike
 * HEARD_AS (teammate-names.ts) they never stand for a teammate on their own:
 * only as the target of a transfer ("pass me to 9", "can I talk to Fred?"),
 * with nothing after them but "please" or "now". Even then the caller may mean
 * someone else, so readers say "may be". No alias counts on a turn that holds
 * 911 or 988 anywhere, spoken or split ("nine. eleven", "nine eighty-eight"),
 * or after an agent line that did. Callers skip this module on any call with
 * crisis handling (crisisGuidedTurn, agents/safety/crisis-gate-signal.ts).
 *
 * @module tools/handoff/transfer-aliases
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { TeamMemberId } from '../../services/team-unlocks.js';

/** Spelling (lower case) → persona id, read only as the target of a transfer. */
export const HEARD_IN_A_TRANSFER: Readonly<Record<string, TeamMemberId>> = {
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
 * not a transfer; talk/speak/chat needs someone asking ("can I", "let me"), so
 * "I need to talk to Fred." is not one either.
 */
const TRANSFER_VERB =
  '(?:(?:pass|transfer|switch|send|hand|put|patch|connect) (?:me|us)(?: back| over| through)* (?:to|with)|(?:(?:can|could|may) (?:i|we)|let me)(?: please| just)? (?:talk|speak|chat)(?: back)? (?:to|with))';

/** The alias ends its clause: punctuation or the end, give or take "please" or "now". */
const ALIAS_IN_TRANSFER = new RegExp(
  `\\b${TRANSFER_VERB} (${SPELLINGS})(?=(?:,? (?:please|now|again|real quick))?\\s*(?:[.!?,;:]|$))`,
  'gi'
);

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const TENS_WORD = new RegExp(
  `\\b(${TENS.join('|')})(?:[\\s-]+(${UNITS.slice(1).join('|')}))?\\b`,
  'g'
);
const TEEN_WORD = new RegExp(`\\b(${TEENS.join('|')})\\b`, 'g');
const UNIT_WORD = new RegExp(`\\b(${UNITS.join('|')})\\b`, 'g');

/** Spoken numbers as digits: "eighty-eight" → 88, "eleven" → 11, "nine one one" → "9 1 1". */
function spokenDigits(plain: string): string {
  return plain
    .replace(
      TENS_WORD,
      (_, tens: string, unit?: string) =>
        `${TENS.indexOf(tens) + 2}${unit ? UNITS.indexOf(unit) : 0}`
    )
    .replace(TEEN_WORD, (teen: string) => String(TEENS.indexOf(teen) + 10))
    .replace(UNIT_WORD, (unit: string) => String(UNITS.indexOf(unit)));
}

/**
 * Whether 911 or 988 is anywhere in `text`, written or spoken, whole or split
 * by spaces and punctuation ("9. 1 1", "nine. eleven.", "nine eighty-eight").
 */
export function emergencyNumberIn(text: string): boolean {
  const runs = spokenDigits(text.toLowerCase()).match(/\d(?:[\s.,;:!?-]*\d)*/g) ?? [];
  return runs.some((run) => /911|988/.test(run.replace(/\D/g, '')));
}

/**
 * Each transfer-only spelling the caller's words ask for, with the persona it
 * may be. `agentSaid`: the agent's line before them; 911 or 988 there (or in
 * the caller's words) turns every alias off.
 */
export function aliasesInTransfer(
  text: string,
  env: Env = process.env,
  agentSaid = ''
): Array<{ heard: string; id: TeamMemberId }> {
  if (typeof text !== 'string' || !flagOn('TRANSFER_NAME_ALIASES', env)) return [];
  const plain = text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  if (emergencyNumberIn(plain) || emergencyNumberIn(agentSaid)) return [];
  const seen = new Map<string, TeamMemberId>();
  for (const match of plain.matchAll(ALIAS_IN_TRANSFER)) {
    const heard = match[1];
    if (heard && Object.hasOwn(HEARD_IN_A_TRANSFER, heard)) {
      seen.set(heard, HEARD_IN_A_TRANSFER[heard]);
    }
  }
  return [...seen].map(([heard, id]) => ({ heard, id }));
}
