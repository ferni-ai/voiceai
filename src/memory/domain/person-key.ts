/**
 * One person key: how a name or a relation word is normalised, in any script, and the one
 * map from relation words to a canonical relation (memory v2 plan, lane C2).
 *
 * Before this, six modules normalised names and relations their own way. Three used an
 * ASCII-only regex, so "Ольга", "محمد" and "李明" all became '' (and, where two '' keys
 * were compared, became the same person). Three relation lists disagreed about whether
 * "dad" is "father" and whether "grandma" is "grandmother".
 *
 * The map merges contact-pick ROLES, recall RELATIONS and contacts RELATIONSHIP_ALIASES.
 * Where they disagreed:
 * - mom/dad and grandma/grandpa were separate relations in RELATIONS; ROLES and the entity
 *   resolver fold them, so here mom = mother, grandma = grandmother.
 * - "ma", "pa" and "nana" are family words in RELATIONSHIP_ALIASES but not ROLES: they are
 *   also names ("Ma" is a common surname), so they keep their group and map to no relation.
 * - "bestie" and "bff" are the friend group in RELATIONSHIP_ALIASES and "best friend" is
 *   its own relation in RELATIONS: they are "best friend", group friend.
 * - "manager" (colleague group) is "boss"; "coworker" and "colleague" stay two relations.
 *
 * Pure: no I/O, no imports.
 *
 * @module memory/domain/person-key
 */

export type RelationGroup = 'family' | 'friend' | 'colleague' | 'professional' | 'other';

/** Canonical relation → its group and the other words people use for it. */
const RELATIONS: Record<string, { group: RelationGroup; aliases?: readonly string[] }> = {
  mother: { group: 'family', aliases: ['mom', 'mum', 'mama', 'mommy', 'mummy'] },
  father: { group: 'family', aliases: ['dad', 'papa', 'daddy'] },
  sister: { group: 'family', aliases: ['sis'] },
  brother: { group: 'family', aliases: ['bro'] },
  sibling: { group: 'family' },
  parent: { group: 'family' },
  child: { group: 'family', aliases: ['kid'] },
  son: { group: 'family' },
  daughter: { group: 'family' },
  grandmother: { group: 'family', aliases: ['grandma', 'granny'] },
  grandfather: { group: 'family', aliases: ['grandpa', 'grandad', 'gramps'] },
  grandparent: { group: 'family' },
  grandchild: { group: 'family' },
  grandson: { group: 'family' },
  granddaughter: { group: 'family' },
  aunt: { group: 'family', aliases: ['auntie'] },
  uncle: { group: 'family' },
  cousin: { group: 'family' },
  niece: { group: 'family' },
  nephew: { group: 'family' },
  'mother-in-law': { group: 'family' },
  'father-in-law': { group: 'family' },
  'sister-in-law': { group: 'family' },
  'brother-in-law': { group: 'family' },
  stepmother: { group: 'family' },
  stepfather: { group: 'family' },
  stepson: { group: 'family' },
  stepdaughter: { group: 'family' },
  wife: { group: 'family' },
  husband: { group: 'family' },
  spouse: { group: 'family' },
  partner: { group: 'family' },
  girlfriend: { group: 'family' },
  boyfriend: { group: 'family' },
  fiance: { group: 'family' },
  fiancee: { group: 'family', aliases: ['fiancée'] },
  friend: { group: 'friend', aliases: ['buddy', 'pal'] },
  'best friend': { group: 'friend', aliases: ['bestie', 'bff', 'bestfriend'] },
  colleague: { group: 'colleague' },
  coworker: { group: 'colleague' },
  boss: { group: 'colleague', aliases: ['manager'] },
  teammate: { group: 'colleague' },
  doctor: { group: 'professional' },
  dentist: { group: 'professional' },
  lawyer: { group: 'professional' },
  therapist: { group: 'professional' },
  accountant: { group: 'professional' },
  'physical therapist': { group: 'professional' },
  'healthcare provider': { group: 'professional' },
  vet: { group: 'professional' },
  coach: { group: 'professional' },
  roommate: { group: 'other' },
  neighbor: { group: 'other' },
};

const RELATION_OF_WORD = new Map<string, string>(
  Object.entries(RELATIONS).flatMap(([relation, { aliases = [] }]) =>
    [relation, ...aliases].map((word) => [word, relation] as [string, string])
  )
);

/** Every word for a canonical relation, the relation first ("mother", "mom", "mum", ...). */
export function relationWords(relation: string): readonly string[] {
  const entry = RELATIONS[relation];
  return entry ? [relation, ...(entry.aliases ?? [])] : [];
}

/** The group a canonical relation belongs to ("mother" → family), if it is one. */
export function groupOf(relation: string): RelationGroup | undefined {
  return RELATIONS[relation]?.group;
}

/** NFKC, then full case folding (upper then lower: "Straße" = "STRASSE"). ASCII unchanged. */
function foldCase(s: string): string {
  return s.normalize('NFKC').toUpperCase().toLowerCase();
}

/** Letters, combining marks and digits in any script: a Devanagari vowel sign is part of "रेखा". */
const TOKEN = /[\p{L}\p{M}\p{N}]+/gu;

/** The words of a name, folded, punctuation dropped: "O'Brien" → ["o", "brien"], "李明" → ["李明"]. */
export function nameTokens(s: string): string[] {
  return foldCase(s).match(TOKEN) ?? [];
}

/**
 * The comparable form of a name in any script. Never '' for a name with anything but
 * spaces in it: a name of only emoji or symbols keys on those, folded and trimmed.
 */
export function normalizeName(s: string): string {
  return nameTokens(s).join(' ') || foldCase(s).replace(/\s+/g, ' ').trim();
}

/**
 * Folded and trimmed, with every character dropped except letters, marks and whitespace (and
 * the `also` class): the shape older keys were stored in, minus their ASCII-only bug.
 * For ASCII input it equals `.toLowerCase().trim().replace(/[^a-z\s<also>]/g, '')`.
 */
export function keepLetters(s: string, also = ''): string {
  return foldCase(s)
    .trim()
    .replace(new RegExp(`[^\\p{L}\\p{M}\\s${also}]`, 'gu'), '');
}

/** "my", "the" or "our" leading a phrase: "my Mom", "the dentist". */
export const OWNER_LEAD = /^\s*(?:my|the|our)\s+/i;

/** A stored field read as words: "best_friend " → "best friend". Case is kept. */
export function relationText(s: string): string {
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first word of `vocabulary` found as a whole word in `text` (list longest first). */
export function relationWordIn(text: string, vocabulary: readonly string[]): string | undefined {
  return vocabulary.find((r) =>
    new RegExp(`(?<![\\p{L}-])${escape(r)}(?![\\p{L}-])`, 'iu').test(text)
  );
}

const IRREGULAR: Record<string, string> = { children: 'child', wives: 'wife' };

/** The phrase, then its singular readings: "aunties" → "auntie", "sisters-in-law" → "sister-in-law". */
function singulars(phrase: string): string[] {
  const out = [phrase, IRREGULAR[phrase] ?? ''];
  if (phrase.endsWith('s-in-law')) out.push(phrase.replace(/s-in-law$/, '-in-law'));
  if (phrase.endsWith('ies')) out.push(`${phrase.slice(0, -3)}y`);
  if (phrase.endsWith('es')) out.push(phrase.slice(0, -2));
  if (phrase.endsWith('s')) out.push(phrase.slice(0, -1));
  return out.filter(Boolean);
}

/**
 * The canonical relation a phrase names, or undefined: "my dad", "Dad", "dad's", "Father"
 * and "the kids" give "father", "father", "father", "father" and "child". The whole phrase
 * must be the relation: "my dad's friend" is not one.
 */
export function relationOf(text: string): string | undefined {
  const phrase = foldCase(text)
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{M}\p{N}'\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(OWNER_LEAD, '')
    .replace(/'s?$/, '')
    .replace(/ in law$/, '-in-law');
  for (const candidate of singulars(phrase)) {
    const relation = RELATION_OF_WORD.get(candidate);
    if (relation) return relation;
  }
  return undefined;
}

/**
 * One key per person mention: "rel:<relation>" for a relation ("my dad" → "rel:father"),
 * else the normalised name. A name never contains ':', so the two can't collide.
 */
export function personKey(nameOrRelation: string): string {
  const relation = relationOf(nameOrRelation);
  return relation ? `rel:${relation}` : normalizeName(nameOrRelation);
}
