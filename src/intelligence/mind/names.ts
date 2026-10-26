/**
 * Names for the between-calls mind (design 2026-10-25, section 1, resolution rules
 * 1-4): one normalized form and one key per real person, whatever store or casing
 * the name came from.
 *
 * Prod (memory audit 2026-10-25): 977 dynamic_entities docs for 300 names; 360 were
 * the extractor's words for the caller or for Ferni; "mom" and "mother" were separate
 * people; "Who" was stored as a person; follow-up asks were keyed on the raw string.
 *
 * 1. normalizeName: case, accents, "my", possessive "'s".
 * 2. relationKey: relation words map to one key, mom = mother = mum = "mother";
 *    a qualifier is someone else (stepmom, ex-wife, mother-in-law).
 * 3. The caller's tokens (user, speaker, caller, I, me) are `self`.
 * 4. Ferni, a teammate named alone, Ferni's role labels and meta words ("Who") drop.
 *
 * Pure. canonicalSubjectKey is the one-string form for readers that key state on a
 * subject (dates/recall.ts); with MIND_BUILD off it is exactly subjectKeyOf. Nothing
 * calls it yet.
 *
 * @module intelligence/mind/names
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { FERNI_HEARD_AS, TEAM_FIRST_NAMES } from '../../utils/teammate-talk.js';
import { subjectKeyOf, type SubjectKind } from '../world-model/temporal/types.js';

export function isMindBuildOn(env: Env = process.env): boolean {
  return flagOn('MIND_BUILD', env);
}

export type DropReason = 'meta' | 'persona' | 'role-label' | 'empty';

export function normalizeName(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/'s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(?:my|our|the|his|her|their)\s+/, '');
}

const LEXICON: Record<string, string> = {};
for (const [key, words] of Object.entries({
  mother: 'mom mother mum mama mommy momma mamma ma mam',
  father: 'dad father papa daddy pa pop pops',
  sister: 'sister sis',
  brother: 'brother bro',
  wife: 'wife',
  husband: 'husband hubby',
  partner: 'partner spouse boyfriend girlfriend fiance fiancee',
  son: 'son',
  daughter: 'daughter',
  grandmother: 'grandmother grandma granny nana gran lola abuela',
  grandfather: 'grandfather grandpa granddad grandad lolo abuelo',
  aunt: 'aunt auntie aunty',
  uncle: 'uncle',
  cousin: 'cousin cuz',
  friend: 'friend bestie buddy pal',
  boss: 'boss manager supervisor',
})) {
  for (const word of words.split(' ')) LEXICON[word] = key;
}
/** A qualifier makes a different person: a stepmom is not mom, an ex-wife is not the wife. */
const QUALIFIER = /^(step|ex|god|great)(?=[a-z])/;

/** The relation key in a phrase ("my older sister", "mother-in-law", "stepmom"), or null. */
export function relationKey(text: string): string | null {
  const words = normalizeName(text).split(' ');
  const inLaw = /\bin law\b/.test(words.join(' '));
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    let prefix = ['step', 'ex', 'god', 'great'].includes(words[i - 1] ?? '')
      ? `${words[i - 1]}-`
      : '';
    const glued = QUALIFIER.exec(word);
    if (!LEXICON[word] && glued) {
      prefix = `${glued[1]}-`;
      word = word.slice(glued[1].length);
    }
    const key =
      LEXICON[word] ?? (word === 'best' && words[i + 1] === 'friend' ? 'friend' : undefined);
    if (key) return `${prefix}${key}${inLaw ? '-in-law' : ''}`;
  }
  return null;
}

/** Words around a relation word that don't make it a name: "user's mother", "best friend". */
const NOT_THE_NAME = new Set('best in law step ex god great user speaker caller'.split(' '));

/** The name itself is only a relation word ("mom", "my mum", "stepdad"), not a name. */
export function relationWordKey(norm: string): string | null {
  const key = relationKey(norm);
  if (!key) return null;
  const words = norm.split(' ').filter((w) => !NOT_THE_NAME.has(w));
  return words.length === 1 ? key : null;
}

const SELF = new Set('user speaker caller i me myself'.split(' '));
/** Ferni's role in the extractor's words: these are Ferni, never the caller (entity-hygiene.ts). */
const ROLE = new Set('assistant interlocutor listener ai bot'.split(' '));
const META = new Set(
  'who whom whose what someone somebody something anyone anybody everyone everybody nobody whoever they them he him she her it we us you person people guy unknown unnamed unspecified null none n a'.split(
    ' '
  )
);
const PERSONA_FULL = new Set([
  'maya santos',
  'peter john',
  'jordan taylor',
  'alex chen',
  'nayan patel',
]);
const FERNI = new Set<string>(['ferni', ...FERNI_HEARD_AS]);
const TEAM = new Set<string>(TEAM_FIRST_NAMES);

/**
 * Why a normalized name is not a person of the caller's: their own token ("self"),
 * Ferni or its team, Ferni's role label, a meta word, or nothing. Null: a person.
 * A relation (relKey) keeps a teammate's first name: "my friend Jordan" is real.
 */
export function dropReason(norm: string, relKey: string | null): DropReason | 'self' | null {
  if (!norm || /^[\d ]+$/.test(norm)) return 'empty';
  if (SELF.has(norm)) return 'self';
  if (ROLE.has(norm) || /\binterlocutor\b|\bconversation(?:al)? partner\b/.test(norm))
    return 'role-label';
  if (META.has(norm) || norm.split(' ').every((w) => META.has(w))) return 'meta';
  if (norm.split(' ').some((w) => FERNI.has(w))) return 'persona';
  if (PERSONA_FULL.has(norm)) return 'persona';
  // A teammate's first name alone is Ferni's team, unless the caller relates to them ("my friend Jordan").
  if (TEAM.has(norm) && !relKey) return 'persona';
  return null;
}

/**
 * One key per real subject, for state kept by subject (follow-up asks in dates/recall.ts).
 * With MIND_BUILD on, for a person: "Mom", "my mum" and "MOTHER" share "person:mother";
 * "Teo's" and "TEO" share "person:teo"; the caller's own tokens are "self"; Ferni, role
 * labels and meta words ("Who") are null: nothing to follow up on. A teammate's first
 * name alone is kept, since it may be the caller's own friend. Other kinds, and any
 * subject with the flag off, keep subjectKeyOf's key exactly, so callers need no gate.
 * It does not fold "mom" into her name: that takes the caller's entities (the entity builder).
 */
export function canonicalSubjectKey(
  subject: string,
  kind: SubjectKind = 'person',
  env: Env = process.env
): string | null {
  const legacy = subjectKeyOf({ subject, subjectKind: kind });
  if (!isMindBuildOn(env) || legacy === 'self' || kind !== 'person') return legacy;
  const norm = normalizeName(subject);
  // Any relation key skips the teammate rule: only Ferni itself is dropped by name.
  const why = dropReason(norm, 'unknown');
  if (why === 'self') return 'self';
  if (why !== null) return null;
  return `person:${relationWordKey(norm) ?? norm}`;
}
