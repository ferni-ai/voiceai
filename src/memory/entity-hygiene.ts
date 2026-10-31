/**
 * ENTITY_HYGIENE (off by default): an extracted entity whose name is not a real person,
 * place or topic in the caller's life is never stored.
 *
 * Prod calls (October 2026): after-call entity extraction stored "9" and "Unknown Person"
 * as people, "unspecified item" as a concept, and "giving the item to Ferni", "Talk to
 * Maya", "Play music" and "call my dad and check in" as topics. Each one then reads as
 * something Ferni knows about the caller. With the flag on, a name is rejected when it is:
 * - a number ("9", "10:30");
 * - a placeholder (unknown, unspecified, someone, everyone, "the item"), or a bare
 *   pronoun or greeting the capitalised-word fallback takes for a name ("She", "Hi");
 * - Ferni anywhere in it; a teammate's name alone ("Maya", "Peter John"), unless it is a
 *   person the caller relates to ("my friend Jordan": relationship "friend"). "Michael
 *   Jordan" or "Maya Angelou" are kept;
 * - a request to Ferni ("play music", "talk to Maya", "call my dad", "set a timer").
 * - a person the caller only greets ("Hey Fred."): that name is said to whoever is on
 *   the call. Prod 2026-10-20: STT heard "Hey Ferni" as "Hey Fred." and "Fred" was
 *   stored as a friend; "Everyone" was stored as a person from the same turn.
 * Whole words only, so "Mayan ruins" or "Unknownmortal Orchestra" are kept.
 *
 * ENTITY_ROLE_LABELS (off by default, needs ENTITY_HYGIENE): also a role label for
 * Ferni in the extractor's own words. Prod 2026-10-19 stored "User's interlocutor",
 * "Assistant" and "The user's conversational partner" as people in one call: none
 * names Ferni, so the persona check let them through.
 *
 * @module memory/entity-hygiene
 */

import { flagOn, type Env } from '../config/env-flag.js';
import { FERNI_HEARD_AS, HEARD_AS, TEAM_FIRST_NAMES } from '../utils/teammate-talk.js';

export function entityHygieneOn(env: Env = process.env): boolean {
  return flagOn('ENTITY_HYGIENE', env);
}

export function entityRoleLabelsOn(env: Env = process.env): boolean {
  return flagOn('ENTITY_ROLE_LABELS', env);
}

export interface NamedEntity {
  name: string;
  type?: string;
  relationship?: string;
}

/** Why a name is not stored, or null for a real one. */
export type JunkReason = 'number' | 'placeholder' | 'persona' | 'request' | 'greeted';

const FERNI = new Set<string>(['ferni', ...FERNI_HEARD_AS]);
const TEAMMATE = `(?:${[...TEAM_FIRST_NAMES, ...Object.keys(HEARD_AS)].join('|')})`;
/** A teammate's name and nothing else ("Maya", "Peter John"), or greeted ("Hey Maya"). */
const TEAMMATE_ALONE = new RegExp(
  `^(?:(?:hi|hey|hello|yo|thanks|bye)\\s+)?(?:${TEAMMATE}|maya santos|peter john|jordan taylor|alex chen|nayan patel)$`,
  'i'
);

const PLACEHOLDER = new Set(
  'unknown unspecified unnamed unidentified someone somebody something anyone anybody anything everyone everybody nobody whoever whatever none null undefined n/a tbd'.split(
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

/** The extractor's words for Ferni: a role, never a name ("the user's conversational partner"). */
const ROLE_LABEL =
  /\b(?:interlocutor|conversation(?:al)? partner|chat partner|chatbot|(?:ai|virtual|voice) assistant)\b/i;
/** A bare role noun as the whole name ("Assistant", "the AI"). */
const BARE_ROLE = /^(?:the\s+)?(?:assistant|ai|bot)$/i;

/** An opening greeting at the start of a sentence, right before the name. */
const GREETING_BEFORE =
  /(?:^|[.!?]\s*|\n\s*)(?:hey|hi|hiya|hello|yo|morning|good morning)\s*,?\s*$/i;
/** The name ends its clause ("Hey Fred." / "Hey Fred, ..."), so it is not "Hey Fred came over". */
const ENDS_CLAUSE = /^\s*(?:[.!?,;:\n]|$)/;

/** Every time the caller says this name, it is a greeting to whoever is on the call. */
function onlyGreeted(name: string, said: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let seen = 0;
  for (const m of said.matchAll(new RegExp(`\\b${escaped}\\b`, 'gi'))) {
    const at = m.index ?? 0;
    const greeted = GREETING_BEFORE.test(said.slice(0, at));
    if (!greeted || !ENDS_CLAUSE.test(said.slice(at + m[0].length))) return false;
    seen++;
  }
  return seen > 0;
}

const isRoleLabel = (name: string): boolean => ROLE_LABEL.test(name) || BARE_ROLE.test(name);

const wordsOf = (name: string): string[] =>
  name
    .toLowerCase()
    .split(/[^a-z0-9/']+/)
    .map((w) => w.replace(/'s$/, ''))
    .filter(Boolean);

/**
 * The reason this entity is junk, or null when it is a real person, place or topic.
 * `said` is what the caller said this turn, when known.
 */
export function junkReason(
  entity: NamedEntity,
  env: Env = process.env,
  said = ''
): JunkReason | null {
  const name = entity.name.trim();
  if (/^[\d\s.,:/#%$-]+$/.test(name)) return 'number';
  const words = wordsOf(name);
  const placeholder = words.some((w) => PLACEHOLDER.has(w)) || GENERIC.test(name);
  if (placeholder || (words.length === 1 && NOT_A_NAME.has(words[0]))) return 'placeholder';
  if (REQUEST.some((re) => re.test(name))) return 'request';
  if (isPersona(entity, name, words, env)) return 'persona';
  return entity.type === 'person' && onlyGreeted(name, said) ? 'greeted' : null;
}

/**
 * A name that is Ferni or one of his teammates, not a person in the caller's life: their
 * canon lives in the life ledger, never in the caller's memory. "Maya" alone is a persona;
 * "Maya", relationship "sister", is the caller's sister. Pure; ENTITY_ROLE_LABELS is not read.
 */
export function isPersonaSubject(name: string, relationship?: string | null): boolean {
  const entity = { name, type: 'person', relationship: relationship ?? undefined };
  return name.trim() !== '' && junkReason(entity, {}) === 'persona';
}

/** Ferni, a role label for him (ENTITY_ROLE_LABELS), or a teammate who isn't theirs. */
function isPersona(entity: NamedEntity, name: string, words: string[], env: Env): boolean {
  if (words.some((w) => FERNI.has(w))) return true;
  if (entityRoleLabelsOn(env) && isRoleLabel(name)) return true;
  if (!TEAMMATE_ALONE.test(words.join(' '))) return false;
  const relation = entity.relationship?.trim() ?? '';
  return !(entity.type === 'person' && relation !== '' && !NOT_A_RELATION.test(relation));
}

/** The entities worth storing; with the flag off, all of them. */
export function keepRealEntities<T extends NamedEntity>(
  entities: readonly T[],
  env: Env = process.env,
  said = ''
): { kept: T[]; dropped: Array<{ name: string; reason: JunkReason }> } {
  if (!entityHygieneOn(env)) return { kept: [...entities], dropped: [] };
  const kept: T[] = [];
  const dropped: Array<{ name: string; reason: JunkReason }> = [];
  for (const entity of entities) {
    const reason = junkReason(entity, env, said);
    if (reason) dropped.push({ name: entity.name, reason });
    else kept.push(entity);
  }
  return { kept, dropped };
}
