/**
 * ENTITY_HYGIENE (off by default): an extracted entity whose name is not a real person,
 * place or topic in the caller's life is never stored.
 *
 * Prod calls (October 2026): after-call entity extraction stored "9" and "Unknown Person"
 * as people, "unspecified item" as a concept, and "giving the item to Ferni", "Talk to
 * Maya", "Play music" and "call my dad and check in" as topics. Each one then reads as
 * something Ferni knows about the caller. With the flag on, a name is rejected when it is:
 * - a number ("9", "10:30");
 * - a placeholder (unknown, unspecified, someone, something, "the item"), or a bare
 *   pronoun or greeting the capitalised-word fallback takes for a name ("She", "Hi");
 * - Ferni anywhere in it; a teammate's name alone ("Maya", "Peter John"), unless it is a
 *   person the caller relates to ("my friend Jordan": relationship "friend"). "Michael
 *   Jordan" or "Maya Angelou" are kept;
 * - a request to Ferni ("play music", "talk to Maya", "call my dad", "set a timer").
 * Whole words only, so "Mayan ruins" or "Unknownmortal Orchestra" are kept.
 *
 * @module memory/entity-hygiene
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { HEARD_AS, TEAM_FIRST_NAMES } from '../utils/teammate-talk.js';

export function entityHygieneOn(env: Env = process.env): boolean {
  return flagOn('ENTITY_HYGIENE', env);
}

export interface NamedEntity {
  name: string;
  type?: string;
  relationship?: string;
}

/** Why a name is not stored, or null for a real one. */
export type JunkReason = 'number' | 'placeholder' | 'persona' | 'request';

const FERNI = new Set(['ferni', 'fernie', 'ferny', 'furny']);
const TEAMMATE = `(?:${[...TEAM_FIRST_NAMES, ...Object.keys(HEARD_AS)].join('|')})`;
/** A teammate's name and nothing else ("Maya", "Peter John"), or greeted ("Hey Maya"). */
const TEAMMATE_ALONE = new RegExp(
  `^(?:(?:hi|hey|hello|yo|thanks|bye)\\s+)?(?:${TEAMMATE}|maya santos|peter john|jordan taylor|alex chen|nayan patel)$`,
  'i'
);

const PLACEHOLDER = new Set(
  'unknown unspecified unnamed unidentified someone somebody something anyone anybody anything whoever whatever none null undefined n/a tbd'.split(
    ' '
  )
);
/** A name that is only a pronoun, possessive or greeting. */
const NOT_A_NAME = new Set(
  'i me my mine you your he him his she her hers we us our they them their it its hi hey hello'.split(
    ' '
  )
);
/** "the item", "a person", "some thing": a bare generic noun, not a name. */
const GENERIC =
  /^(?:the|a|an|some|this|that|any)\s+(?:item|items|thing|things|person|people|place|topic|concept|stuff|one|guy|someone)$/i;

/** What the caller asks Ferni to do, at the start of the name. */
const REQUEST = [
  /^play\b/i,
  /^(?:talk|speak|chat)\s+(?:to|with)\s+/i,
  /^(?:call|phone|ring|text|message|facetime)\s+(?:my|me|him|her|them|mom|dad|mum)\b/i,
  /^(?:remind|wake)\s+me\b/i,
  /^set\s+(?:a|an|my|the)?\s*(?:timer|alarm|reminder)\b/i,
  /^(?:pause|stop|skip|resume|shuffle)\s+(?:the\s+)?(?:music|song|track|playlist)\b/i,
  /^turn\s+(?:it\s+)?(?:up|down|on|off)\b/i,
  /^(?:look\s+up|search\s+for)\b/i,
];

/** Relationships that are a real person in the caller's life, not Ferni's team. */
const NOT_A_RELATION = /^(?:assistant|ai|bot|coach|advisor|helper|persona|teammate|companion)$/i;

const wordsOf = (name: string): string[] =>
  name
    .toLowerCase()
    .split(/[^a-z0-9/']+/)
    .map((w) => w.replace(/'s$/, ''))
    .filter(Boolean);

/** The reason this entity is junk, or null when it is a real person, place or topic. */
export function junkReason(entity: NamedEntity): JunkReason | null {
  const name = entity.name.trim();
  if (/^[\d\s.,:/#%$-]+$/.test(name)) return 'number';
  const words = wordsOf(name);
  const placeholder = words.some((w) => PLACEHOLDER.has(w)) || GENERIC.test(name);
  if (placeholder || (words.length === 1 && NOT_A_NAME.has(words[0]))) return 'placeholder';
  if (REQUEST.some((re) => re.test(name))) return 'request';
  if (words.some((w) => FERNI.has(w))) return 'persona';
  if (TEAMMATE_ALONE.test(words.join(' '))) {
    const relation = entity.relationship?.trim() ?? '';
    const theirs = entity.type === 'person' && relation !== '' && !NOT_A_RELATION.test(relation);
    if (!theirs) return 'persona';
  }
  return null;
}

/** The entities worth storing; with the flag off, all of them. */
export function keepRealEntities<T extends NamedEntity>(
  entities: readonly T[],
  env: Env = process.env
): { kept: T[]; dropped: Array<{ name: string; reason: JunkReason }> } {
  if (!entityHygieneOn(env)) return { kept: [...entities], dropped: [] };
  const kept: T[] = [];
  const dropped: Array<{ name: string; reason: JunkReason }> = [];
  for (const entity of entities) {
    const reason = junkReason(entity);
    if (reason) dropped.push({ name: entity.name, reason });
    else kept.push(entity);
  }
  return { kept, dropped };
}
