/**
 * When a caller asks Ferni about himself, the few things that answer it: what
 * he already told them about it (newest first) and, for the facts a caller
 * asks straight out (his age, where he grew up), his canon. One short note on
 * that turn, never otherwise, so it adds no unasked self-shares.
 *
 * Six simulated calls over three weeks with six callers on dev's flags
 * (scripts/humanness-eval/self-consistency.ts, two runs, 2026-10-11): 21% of
 * his replies about himself contradicted his canon or himself (57 of 267).
 * Asked his age, 12 of 12 were wrong (42 to 52; the character sheet gives
 * none unless FERNI_PERSONA_SLIP_GUARD is on). Asked about "last weekend",
 * 15 of 36 retold the weekend he had told a week before as if it were new.
 * The first recall note does list what he told, but by the time they ask it
 * is many turns back and reads as a list, not an answer. With this on: 12.8%
 * (35 of 273), age 0 of 12, last weekend 6 of 36.
 *
 * FERNI_SELF_RECALL=on turns it on (off by default). The ledger side, so an
 * old version stops coming back once he has told a newer one, is in
 * life-ledger.ts (supersededFacts).
 *
 * @module agents/personas/self-recall
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LedgerFact } from './life-ledger.js';

export function selfRecallEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FERNI_SELF_RECALL === 'on';
}

/** The note's budget: a short answer key, not a biography. */
export const SELF_RECALL_TOKENS = 60;
const tokens = (text: string): number => Math.ceil(text.length / 4);

/** Canon a caller asks about straight out, by the bundle's identity/canon.json keys. */
const CANON_ASKS: Record<string, RegExp> = {
  age: /\bhow old\b|\byour age\b|\byour birthday\b/i,
  origin:
    /\b(?:grow|grew) up\b|\bwhere (?:are|were) you from\b|\byour hometown\b|\b(?:brothers?|sisters?|siblings?)\b/i,
  abroad: /\bjapan\b|\bbefore you (?:came|moved) back\b|\b(?:lived|live) (?:abroad|overseas)\b/i,
  wife: /\byour (?:wife|spouse|partner)\b|\bare you married\b/i,
};

/** A question to him, about him: not "you know", "thank you", "see you". */
const ASKS_HIM =
  /\b(?:your|you said|you told|you mentioned|you were|did you|have you|were you|are you|what about you|and you|how(?:'s| is| was| were| are|'ve| have) (?:you|your)|what(?:'s| is| have| did| are)? (?:\w+ )?you)\b/i;

/** "What's new", "your weekend": the newest of what he told, which already happened. */
const RECENT =
  /\b(?:weekend|lately|since|new with you|what's new|up to|been doing|been up|how(?:'ve| have) you been|this week|last week|today)\b/i;

/** Words that point at the same thing in a question and in a fact, by thing. */
const TOPICS: Record<string, string> = {
  book: 'book books reading read novel essays stories',
  pet: 'dog dogs cat cats pet pets pup puppy terrier rescue',
  wife: 'wife married',
  weekend: 'weekend saturday sunday',
  garden: 'garden plant plants basil houseplant',
  trip: 'trip flight flights travel',
};
const SAME_THING: Record<string, string> = Object.fromEntries(
  Object.entries(TOPICS).flatMap(([topic, words]) => words.split(' ').map((w) => [w, topic]))
);
/** Long words that say nothing about which thing ("remind", "situation"). */
const GENERIC = new Set(
  'about after again anyway asking actually before could doing going little lately minute other place remind right should since situation something still there these thing things think today where would really'.split(
    ' '
  )
);
/** What a text is about: known things, and other words of five letters or more. */
function keys(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  return new Set(
    words.flatMap((w) =>
      SAME_THING[w] ? [SAME_THING[w]] : w.length >= 5 && !GENERIC.has(w) ? [w] : []
    )
  );
}

/** "Ferni and his wife decided..." → "You and your wife decided...", for a note spoken to him. */
export function inSecondPerson(fact: string, name: string): string {
  return fact
    .replace(new RegExp(`^${name}'s\\b`), 'Your')
    .replace(new RegExp(`^${name} and his\\b`), 'You and your')
    .replace(new RegExp(`^${name}\\b`), 'You')
    .replace(/\bhis\b/g, 'your')
    .replace(/\bhim\b/g, 'you')
    .replace(/\.$/, '');
}

const daysAgo = (f: LedgerFact, now: number): string => {
  const days = Math.floor((now - Date.parse(f.saidAt)) / 86_400_000);
  return Number.isNaN(days) ? '' : days < 1 ? ' (told today)' : ` (told ${days}d ago)`;
};

/** Canon lines for what this turn asks, from the bundle's identity/canon.json. */
export function canonFor(said: string, canon: Record<string, string>): string[] {
  return Object.entries(CANON_ASKS)
    .filter(([key, re]) => Boolean(canon[key]) && re.test(said))
    .map(([key]) => canon[key]);
}

/**
 * The note for a caller turn, or null: only when they ask him about himself
 * and there is something that answers it. Facts newest first; at most
 * SELF_RECALL_TOKENS.
 */
export function selfRecallNote(
  said: string,
  told: LedgerFact[],
  canon: Record<string, string>,
  opts: { name: string; now?: number }
): string | null {
  if (!ASKS_HIM.test(said)) return null;
  const now = opts.now ?? Date.now();
  const pins = canonFor(said, canon);
  const unnamed = (t: string): string => t.replace(new RegExp(`\\b${opts.name}\\b`, 'gi'), '');
  const asked = keys(unnamed(said));
  const newest = [...told].sort((a, b) => b.saidAt.localeCompare(a.saidAt));
  const recent = RECENT.test(said);
  const relevant = newest.filter((f) => [...keys(unnamed(f.fact))].some((k) => asked.has(k)));
  const facts = relevant.length > 0 ? relevant : recent ? newest.slice(0, 2) : [];
  if (pins.length === 0 && facts.length === 0) return null;
  // On the eval he retold the weekend he'd told a week before as "last
  // weekend" (7 of 18): say outright that it was an earlier one.
  const how = recent
    ? `Those happened before you told them${/\bweekend\b/i.test(said) ? ', not this past weekend' : ''}. What's happened since is something else, small, that fits them.`
    : 'Answer from these; the newest is how it stands now.';
  let note = `[ABOUT YOU: ${pins.join(' ')}`.trimEnd();
  const lines: string[] = [];
  for (const f of facts) {
    const line = `${inSecondPerson(f.fact, opts.name)}${daysAgo(f, now)}.`;
    const next = `${note} You told them: ${[...lines, line].join(' ')} ${how}]`;
    if (tokens(next) > SELF_RECALL_TOKENS) break;
    lines.push(line);
  }
  if (lines.length > 0) note += ` You told them: ${lines.join(' ')} ${how}`;
  return pins.length > 0 || lines.length > 0 ? `${note.trim()}]` : null;
}

const canons = new Map<string, Promise<Record<string, string>>>();
/** The persona's identity/canon.json, or {} when it has none. Looked up where the bundle loader looks. */
export function loadCanon(personaId: string): Promise<Record<string, string>> {
  let canon = canons.get(personaId);
  if (!canon) {
    canon = (async () => {
      const { getBundleSearchPaths } = await import('../../personas/bundles/loader.js');
      for (const root of getBundleSearchPaths()) {
        const text = await readFile(join(root, personaId, 'identity', 'canon.json'), 'utf8').catch(
          () => ''
        );
        if (text) return JSON.parse(text) as Record<string, string>;
      }
      return {};
    })().catch(() => ({}));
    canons.set(personaId, canon);
  }
  return canon;
}
