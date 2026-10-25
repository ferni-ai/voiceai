/**
 * PERSONA_CANON_FACTS=on (off by default): one line at the end of every
 * persona's system prompt with the facts about them that never change.
 *
 * Prod calls, 2026-10-24 (prod-call audit, item 11): Ferni's pets changed four
 * ways in thirty seconds, and Jordan said she has no gender, then that she is
 * in a relationship with Sam. Ferni's canon.json reaches the prompt only when a
 * caller asks (FERNI_SELF_RECALL), and the five teammates' facts live only in
 * prose (#1437), so nothing on the turn pins them.
 *
 * Each bundle's identity/canon-facts.json holds pronouns, age, partner, pets,
 * home and work, every value taken from the bundle's own biography and
 * character files ("none mentioned" where no source says, which the line
 * leaves out). The canon test (__tests__/persona-canon-facts.test.ts) fails
 * when a value stops agreeing with those sources.
 *
 * @module personas/persona-canon-facts
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flagOn, type Env } from '../config/env-flag.js';

export interface CanonFacts {
  pronouns: string;
  age: string;
  partner: string;
  pets: string;
  home: string;
  work: string;
}

/** A value no source gives: left out of the line, never filled in. */
export const NONE_MENTIONED = 'none mentioned';

/** The line's budget, by the chars/4 estimate self-recall.ts uses: it rides every turn. */
export const CANON_FACTS_TOKENS = 60;

export const CANON_FACTS_FILE = 'identity/canon-facts.json';

/** The bundles with a canon-facts file. */
export const CANON_BUNDLES = [
  'ferni',
  'maya-santos',
  'peter-john',
  'alex-chen',
  'jordan-taylor',
  'nayan-patel',
] as const;

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), 'bundles');

/** The bundle for "jordan-taylor" or "jordan", or null for a persona without canon facts. */
export function canonBundle(personaId: string): string | null {
  const key = personaId.toLowerCase().trim();
  return CANON_BUNDLES.find((b) => b === key || b.split('-')[0] === key) ?? null;
}

/** A loss (Nayan's late wife): canon.json says raise it only if asked, in the past tense. */
const GRIEF = /\b(?:died|late|passed)\b/i;
export const ONLY_IF_ASKED = '(only if asked, past tense)';

/** The one line, from the facts any source gives. */
export function canonFactsLine(facts: CanonFacts): string {
  const known = (value: string): boolean => value !== NONE_MENTIONED;
  const partner = GRIEF.test(facts.partner) ? `${facts.partner} ${ONLY_IF_ASKED}` : facts.partner;
  const parts = [
    facts.pronouns,
    known(facts.age) ? `age ${facts.age}` : '',
    known(facts.partner) ? `partner: ${partner}` : '',
    known(facts.pets) ? `pets: ${facts.pets}` : '',
    known(facts.home) ? `home: ${facts.home}` : '',
    `work: ${facts.work}`,
  ].filter(Boolean);
  return `Facts about you that never change: ${parts.join('; ')}. Don't invent other pets, partners or homes.`;
}

const cache = new Map<string, Promise<CanonFacts | null>>();
/** The bundle's canon facts, or null when it has none. */
export async function loadCanonFacts(bundle: string): Promise<CanonFacts | null> {
  let facts = cache.get(bundle);
  if (!facts) {
    facts = readFile(join(BUNDLES, bundle, CANON_FACTS_FILE), 'utf8')
      .then((text) => JSON.parse(text) as CanonFacts)
      .catch(() => null);
    cache.set(bundle, facts);
  }
  return facts;
}

/**
 * The prompt with the persona's facts line after it, when the flag is on and
 * the persona has canon facts; otherwise exactly the prompt it was given.
 * Called by loadSystemPrompt (agents/personas/prompt-loader.ts).
 */
export async function withCanonFacts(
  personaId: string,
  prompt: string,
  env: Env = process.env
): Promise<string> {
  if (!flagOn('PERSONA_CANON_FACTS', env)) return prompt;
  const bundle = canonBundle(personaId);
  const facts = bundle ? await loadCanonFacts(bundle) : null;
  return facts ? `${prompt.trimEnd()}\n\n${canonFactsLine(facts)}\n` : prompt;
}
