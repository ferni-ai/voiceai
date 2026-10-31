/**
 * Names for the between-calls mind (design 2026-10-25, section 1, resolution rules
 * 1-4): one normalized form and one key per real person, whatever store or casing
 * the name came from.
 *
 * Prod (memory audit 2026-10-25): 977 dynamic_entities docs for 300 names; 360 were
 * the extractor's words for the caller or for Ferni; "mom" and "mother" were separate
 * people; "Who" was stored as a person; follow-up asks were keyed on the raw string.
 *
 * Over-merging a key merges two people's memories, so a key collapses only when the
 * text is clearly the OWNER's relation, and a name always keeps its letters:
 * 1. Word lists match the accented lookupForm; normalizeName (the key) folds Latin accents
 *    and possessive "'s" and keeps every other script's letters and marks.
 * 2. ownerRelationKey: a bare role word or "my <role>" ("mom", "my mum", "user's mother")
 *    is the owner's: true synonyms share a key (mom = mum = mother). Never a third
 *    party's ("her mom"), a word that is also a first name (Nana, Lola, Ma, Pop, Buddy)
 *    or a broad category (friend, buddy, partner, boyfriend). Grandma and nana stay two:
 *    families often have both. A qualifier is someone else (stepmom, mother-in-law).
 *    Relation keys live under "rel:", apart from every name key.
 * 3. The caller's tokens (user, speaker, caller, I, me) are `self`.
 * 4. Ferni (the whole name), a teammate named alone, Ferni's role labels and meta words
 *    ("Who") drop.
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

/** Latin letters NFKD leaves whole: Łukasz is "lukasz", not "ukasz". */
const LETTER = new Map([
  ['ł', 'l'],
  ['ø', 'o'],
  ['ß', 'ss'],
  ['đ', 'd'],
  ['ð', 'd'],
  ['þ', 'th'],
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['ħ', 'h'],
  ['ı', 'i'],
]);
const LATIN_MARKS = /(\p{Script=Latin})\p{M}+/gu;
const UNFOLDED = /[łøßđðþæœħı]/gu;
const POSSESSIVE = /['’`]s(?![\p{L}\p{M}\p{N}])/gu;
/** Letters, combining marks and digits: an Indic vowel sign is part of the name. */
const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;
const PICTO = /\p{Extended_Pictographic}/gu;

/** Emoji presentation marks: combining by category, never part of a name ("Mom ❤️"). */
const EMOJI_MARKS = /[\uFE00-\uFE0F\u20E3\u{E0100}-\u{E01EF}]/gu;

const tokens = (s: string): string =>
  (s.replace(EMOJI_MARKS, '').replace(POSSESSIVE, '').match(TOKEN) ?? []).join(' ');
const pictos = (raw: string): string => (raw.match(PICTO) ?? []).join('');

/**
 * The form word lists are matched on: lowercase, NFKC, possessive off, accents KEPT.
 * "Sơn" is not "son" and "Mẹ" is not "me": an accented word matches a role, self or
 * meta word only if that accented word is listed.
 */
export function lookupForm(raw: string): string {
  return tokens(raw.toLowerCase().normalize('NFKC')) || pictos(raw);
}

/**
 * The form a name is keyed on: lowercase, accents off LATIN letters only (José = Jose,
 * Łukasz = lukasz), possessive off. Every other script keeps its letters and marks:
 * 张伟, 김민준, Ελένη, रेखा and राखी stay themselves; "李 Wei" is not "Wei". A name of
 * only emoji keys on the emoji.
 */
export function normalizeName(raw: string): string {
  const latinFolded = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(LATIN_MARKS, '$1')
    .normalize('NFC')
    .replace(UNFOLDED, (c) => LETTER.get(c) ?? c);
  return tokens(latinFolded) || pictos(raw);
}

const words = (list: string): string[] => list.split(' ');
/** Role words that name the owner's own family member; synonyms share a key. */
const ROLE = new Map<string, string>([
  ...words('mom mum mommy mummy momma mother').map((w) => [w, 'mother'] as [string, string]),
  ...words('dad daddy father').map((w) => [w, 'father'] as [string, string]),
  ['hubby', 'husband'],
  ...words(
    'husband wife sister brother son daughter grandma grandmother granny gran grandpa ' +
      'grandfather granddad grandad abuela abuelo aunt auntie aunty uncle niece nephew cousin'
  ).map((w) => [w, w] as [string, string]),
]);
/** Relations that tell people apart in a stated relation, but never collapse a subject. */
const OTHER = new Set(
  words(
    'friend bestie buddy pal partner spouse boyfriend girlfriend fiance fiancee boss manager ' +
      'supervisor coworker colleague neighbor roommate ma mama mamma pa papa pop pops nana lola lolo'
  )
);
const QUALIFIER = new Set(words('step ex great half'));
/** Only step and ex split off a word: Godson and Grandma are one word, and Godson is a name. */
const GLUED = /^(step|ex)(?=\p{L})/u;
const OWNER = new Set(words('my user speaker caller'));

/** A role word with its qualifier: "mom", "stepmom", "step mom", "mother in law". */
function roleOf(ws: readonly string[]): string | null {
  let rest = ws;
  const inLaw = rest.length >= 3 && rest.at(-2) === 'in' && rest.at(-1) === 'law';
  if (inLaw) rest = rest.slice(0, -2);
  let q = rest.length === 2 && QUALIFIER.has(rest[0]) ? `${rest[0]}-` : '';
  if (q) rest = rest.slice(1);
  if (rest.length !== 1) return null;
  let w = rest[0];
  const glued = !q && !ROLE.has(w) ? GLUED.exec(w) : null;
  if (glued) [q, w] = [`${glued[1]}-`, w.slice(glued[1].length)];
  const key = ROLE.get(w);
  return key ? `${q}${key}${inLaw ? '-in-law' : ''}` : null;
}

/**
 * The owner's own relation: a bare role word ("mom") or one the owner claims ("my mum",
 * "user's mother", "the caller's stepdad"). Null for a name, a third party's ("her mom"),
 * a name-like word ("nana") or a category ("my friend").
 */
export function ownerRelationKey(text: string): string | null {
  let ws = lookupForm(text).split(' ');
  if (ws[0] === 'the' && OWNER.has(ws[1] ?? '') && ws[1] !== 'my') ws = ws.slice(1);
  if (ws.length > 1 && OWNER.has(ws[0])) ws = ws.slice(1);
  return roleOf(ws);
}

/**
 * The first relation word in a stated phrase ("sister of speaker", "best friend",
 * "stepmom"), or null. It does not tell whose relation it is ("his mom" is "mother"),
 * so it is for a store's relation field, never for collapsing a subject.
 */
export function relationKey(text: string): string | null {
  const ws = lookupForm(text).split(' ');
  const inLaw = /\bin law\b/u.test(ws.join(' '));
  for (let i = 0; i < ws.length; i++) {
    if (ws[i] === 'best' && ws[i + 1] === 'friend') return 'best-friend';
    const prev = ws[i - 1] ?? '';
    const role = roleOf(QUALIFIER.has(prev) ? [prev, ws[i]] : [ws[i]]);
    if (role) return `${role}${inLaw && !role.endsWith('-in-law') ? '-in-law' : ''}`;
    if (OTHER.has(ws[i])) return ws[i];
  }
  return null;
}

const SELF = new Set(words('user speaker caller i me myself'));
/** Ferni's role in the extractor's words: these are Ferni, never the caller (entity-hygiene.ts). */
const ROLE_LABEL = new Set(words('assistant interlocutor listener bot'));
const ROLE_LABEL_PHRASE = /\binterlocutor\b|\bconversation(?:al)? partner\b/u;
const META = new Set(
  words(
    'who whom whose what someone somebody something anyone anybody everyone everybody nobody ' +
      'whoever they them he him she her it we us you person people unknown unnamed unspecified null none n a'
  )
);
const FERNI = new Set<string>(['ferni', ...FERNI_HEARD_AS]);
const TEAM = new Set<string>(TEAM_FIRST_NAMES);
const ONLY_DIGITS = /^[\p{N} ]+$/u;

/**
 * Why a name is not a person of the caller's: their own token ("self"), Ferni or its
 * team, Ferni's role label, a meta word, or nothing. Null: a person. Matched on the
 * lookupForm, and on the WHOLE name for Ferni: "Fernie Gonzalez" is a person.
 * A relation (relKey) keeps a teammate's first name: "my friend Jordan" is real.
 */
export function dropReason(text: string, relKey: string | null): DropReason | 'self' | null {
  const low = lookupForm(text);
  if (!low || ONLY_DIGITS.test(low)) return 'empty';
  const bare = low.startsWith('the ') ? low.slice(4) : low;
  if (SELF.has(bare)) return 'self';
  if (ROLE_LABEL.has(bare) || ROLE_LABEL_PHRASE.test(bare)) return 'role-label';
  if (bare.split(' ').every((w) => META.has(w))) return 'meta';
  if (FERNI.has(bare)) return 'persona';
  // A teammate's first name alone is Ferni's team, unless the caller relates to them ("my friend Jordan").
  if (TEAM.has(bare) && !relKey) return 'persona';
  return null;
}

/**
 * One key per real subject, for state kept by subject (follow-up asks in dates/recall.ts).
 * With MIND_BUILD on, for a person: "Mom", "my mum" and "MOTHER" share "person:rel:mother";
 * "Teo's" and "TEO" share "person:teo". A relation key sits under "rel:", where no name
 * can land, so "Sơn" (person:son) is never "my son" (person:rel:son). "her mom", "Nana"
 * and "my friend" keep their own keys; the caller's own tokens are "self"; Ferni, role
 * labels and meta words ("Who") are null: nothing to follow up on. A teammate's first name
 * alone is kept, since it may be the caller's own friend. Other kinds, and any subject
 * with the flag off, keep subjectKeyOf's key exactly, so callers need no gate. It does not
 * fold "mom" into her name: that takes the caller's entities (the entity builder).
 */
export function canonicalSubjectKey(
  subject: string,
  kind: SubjectKind = 'person',
  env: Env = process.env
): string | null {
  const legacy = subjectKeyOf({ subject, subjectKind: kind });
  if (!isMindBuildOn(env) || legacy === 'self' || kind !== 'person') return legacy;
  // Any relation key skips the teammate rule: only Ferni itself is dropped by name.
  const why = dropReason(subject, 'unknown');
  if (why === 'self') return 'self';
  if (why !== null) return null;
  const rel = ownerRelationKey(subject);
  return rel !== null ? `person:rel:${rel}` : `person:${normalizeName(subject)}`;
}
