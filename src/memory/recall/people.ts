/**
 * Who is who in the caller's life, for the first recall note of a call.
 *
 * Asked "What's my daughter's name?", Ferni answered "Joan" (memory
 * benchmark, 2026-10-11). Joan is the caller's sister. The note held no facts
 * about Joan, only an open thread about "Joan's Thanksgiving visit", and the
 * model filled in the rest. A friend who forgets a detail is human; one who
 * calls your sister your daughter is not. So the first note says how each
 * named person relates to the caller, and that anyone else's relation is
 * unknown.
 *
 * Built from dynamic_facts, whose wording varies by extraction ("Walt |
 * spouse of = User", "Joan | sister of speaker = ...", "Theo | grandparent =
 * User"). Only clear readings count: a wrong relation is worse than none.
 *
 * Off by default; RECALL_PEOPLE=on turns it on.
 *
 * @module memory/recall/people
 */
import type { RecallFact } from './session-recall.js';

export interface Person {
  name: string;
  relation: string;
}

export function recallPeopleEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RECALL_PEOPLE === 'on';
}

/** People named in the note at most; the rest are left out, never guessed. */
const MAX_PEOPLE = 10;

const CARE = ['physical therapist', 'therapist', 'doctor', 'healthcare provider', 'vet', 'coach'];

/** Longest first, so "grandmother" is never read as "mother". */
const RELATIONS = [
  'mother-in-law',
  'father-in-law',
  'sister-in-law',
  'brother-in-law',
  'granddaughter',
  'grandmother',
  'grandfather',
  'grandparent',
  'stepdaughter',
  'grandchild',
  'stepmother',
  'stepfather',
  'girlfriend',
  'boyfriend',
  'best friend',
  'grandson',
  'stepson',
  'grandma',
  'grandpa',
  'husband',
  'partner',
  'fiancee',
  'mother',
  'father',
  'sister',
  'brother',
  'sibling',
  'daughter',
  'nephew',
  'cousin',
  'friend',
  'roommate',
  'coworker',
  'colleague',
  'neighbor',
  'spouse',
  'fiance',
  'parent',
  'child',
  'wife',
  'aunt',
  'uncle',
  'niece',
  'boss',
  'mom',
  'dad',
  'son',
  ...CARE,
].sort((a, b) => b.length - a.length);

/** "Theo | grandparent = User": the caller is Theo's grandparent, so Theo is a grandchild. */
const INVERSE: Record<string, string> = {
  grandparent: 'grandchild',
  grandmother: 'grandchild',
  grandfather: 'grandchild',
  grandma: 'grandchild',
  grandpa: 'grandchild',
  grandchild: 'grandparent',
  grandson: 'grandparent',
  granddaughter: 'grandparent',
  parent: 'child',
  mother: 'child',
  father: 'child',
  mom: 'child',
  dad: 'child',
  child: 'parent',
  son: 'parent',
  daughter: 'parent',
  sister: 'sibling',
  brother: 'sibling',
  sibling: 'sibling',
  husband: 'spouse',
  wife: 'spouse',
  spouse: 'spouse',
  partner: 'partner',
  cousin: 'cousin',
  friend: 'friend',
  'best friend': 'best friend',
  roommate: 'roommate',
  neighbor: 'neighbor',
  coworker: 'coworker',
  colleague: 'colleague',
};

const SELF = '(?:the )?(?:speaker|user|caller|me)';
const SELF_ONLY = /^(?:the )?(?:speaker|user|caller|me)\.?$/i;
/** Keys that state what someone is to the caller. */
const RELATION_KEY =
  /^(?:relation|relationship|relation to (?:the )?(?:user|speaker)|relationship to (?:the )?(?:user|speaker)|role)$/;
const PROFESSION_KEY = /^(?:profession|occupation|job|role)$/;
/** A bare name: "Ana", "Dr. Okonkwo", "Mary Beth". */
const NAME = /^(?:(?:Dr|Mr|Mrs|Ms)\.? )?[A-Z][\p{L}'’-]+(?: [A-Z][\p{L}'’-]+)?$/u;
/** Someone else's relation: "Ana's brother". */
const OTHERS = /\b[A-Z][\p{L}-]+['’]s\b/u;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s: string) => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

/** The first relation word in `text`, matched as whole words. */
function relationIn(text: string): string | undefined {
  return RELATIONS.find((r) =>
    new RegExp(`(?<![\\p{L}-])${escape(r)}(?![\\p{L}-])`, 'iu').test(text)
  );
}

/** What this fact says the person `entity` is to the caller, if it says so clearly. */
function readRelation(f: RecallFact): string | undefined {
  const key = words(f.key).toLowerCase();
  const value = words(f.value);
  const both = `${key} ${value}`;
  // "sister of speaker", "Partner of the speaker", "the speaker's sister"
  for (const r of RELATIONS) {
    const re = escape(r);
    if (
      new RegExp(`(?<![\\p{L}-])${re} of ${SELF}\\b`, 'iu').test(both) ||
      new RegExp(`\\b${SELF}['’]s ${re}(?![\\p{L}-])`, 'iu').test(both)
    ) {
      return r;
    }
  }
  // "spouse of = User" (Walt is the caller's spouse); "grandparent = User" (the caller is Theo's)
  if (SELF_ONLY.test(value)) {
    const r = relationIn(key);
    if (!r) return undefined;
    return / of$/.test(key) ? r : INVERSE[r];
  }
  if (OTHERS.test(value)) return undefined;
  // "relation = a friend from work"
  if (RELATION_KEY.test(key)) return relationIn(value);
  // "profession = physical therapist"
  if (PROFESSION_KEY.test(key)) {
    const r = relationIn(value);
    return r && CARE.includes(r) ? r : undefined;
  }
  return undefined;
}

const SELF_ENTITY = /^(?:speaker|user|me)$/i;

/**
 * Named people and how each relates to the caller, in the order first seen
 * (facts arrive newest first). A name with two different relations is left
 * out, except several care roles, where the most specific is kept.
 */
export function peopleOf(facts: readonly RecallFact[]): Person[] {
  const found = new Map<string, { name: string; relations: Set<string> }>();
  const note = (name: string, relation: string) => {
    const k = name.toLowerCase();
    const entry = found.get(k) ?? { name, relations: new Set<string>() };
    entry.relations.add(relation);
    found.set(k, entry);
  };
  for (const f of facts) {
    const entity = f.entity.trim();
    if (SELF_ENTITY.test(entity)) {
      // "User | girlfriend = Ana"
      const value = words(f.value);
      const r = relationIn(words(f.key));
      if (r && NAME.test(value) && !relationIn(value)) note(value, r);
      continue;
    }
    // "Neighbor", "mom": a role with no name to tie it to.
    if (!NAME.test(entity) || relationIn(entity)) continue;
    const r = readRelation(f);
    if (r) note(entity, r);
  }
  const people: Person[] = [];
  for (const { name, relations } of found.values()) {
    const all = [...relations];
    const relation =
      all.length === 1
        ? all[0]
        : all.every((r) => CARE.includes(r))
          ? all.sort((a, b) => CARE.indexOf(a) - CARE.indexOf(b))[0]
          : undefined;
    if (relation) people.push({ name, relation });
    if (people.length >= MAX_PEOPLE) break;
  }
  return people;
}

/** The note: who is who, and never a guessed relation. */
export function formatPeople(people: readonly Person[]): string {
  const rule =
    "Never guess how someone is related to them. If they ask about a person or relation not listed here, say you don't know or ask.";
  if (people.length === 0) return rule;
  const list = people.map((p) => `${p.name} (${p.relation})`).join(', ');
  return `People in their life: ${list}.\n${rule}`;
}
