/**
 * Whose animal is whose, for the who-is-who line of the first recall note.
 *
 * Asked "what's my dog's name?", Ferni answered "Pepper" (memory benchmark,
 * 2026-10-11). Pepper is a cat, and the caller's girlfriend's. Like a
 * relative's relation (people.ts), an animal's owner is easy to get wrong
 * and jarring when wrong, so the note says it outright.
 *
 * Read from dynamic_facts as the extractor words them ("Ana | pet owned =
 * Pepper (cat)", "User | acquired pet = got a golden retriever puppy named
 * Biscuit", "Biscuit | breed = golden retriever"). Only clear readings
 * count; an animal with two different owners is left out.
 *
 * @module memory/recall/pets
 */
import type { RecallFact } from './session-recall.js';

export interface Pet {
  name: string;
  /** What kind of animal: "cat", "golden retriever". */
  kind: string;
  /** Whose it is: undefined for the caller's own, else a person's name. */
  owner?: string;
  fostering?: boolean;
}

/** Longest first, so "golden retriever" wins over "retriever". */
const ANIMALS = [
  'golden retriever',
  'labrador',
  'retriever',
  'german shepherd',
  'shepherd',
  'beagle',
  'poodle',
  'terrier',
  'bulldog',
  'corgi',
  'husky',
  'puppy',
  'kitten',
  'dog',
  'cat',
  'rabbit',
  'bunny',
  'hamster',
  'guinea pig',
  'parrot',
  'bird',
  'horse',
  'tortoise',
  'turtle',
  'lizard',
  'snake',
  'fish',
].sort((a, b) => b.length - a.length);

const SELF = /^(?:speaker|user|me)$/i;
const NAME = /^[A-Z][\p{L}'’-]+$/u;
const PET_KEY = /\b(?:pets?|dogs?|cats?|animals?)\b/i;
const KIND_KEY = /^(?:species|breed|animal|kind)$/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s: string) => s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

function animalIn(text: string): string | undefined {
  return ANIMALS.find((a) => new RegExp(`(?<![\\p{L}])${escape(a)}(?![\\p{L}])`, 'iu').test(text));
}

/** Who owns what this fact describes: undefined = the caller, null = no one we can name. */
function ownerOf(entity: string): string | undefined | null {
  if (SELF.test(entity)) return undefined;
  return NAME.test(entity) ? entity : null;
}

interface Seen {
  name: string;
  kinds: Set<string>;
  owners: Set<string>;
  fostering: boolean;
}

export function petsOf(facts: readonly RecallFact[]): Pet[] {
  const seen = new Map<string, Seen>();
  const note = (
    name: string,
    kind: string,
    owner: string | undefined | null,
    fostering = false
  ) => {
    const k = name.toLowerCase();
    const s = seen.get(k) ?? { name, kinds: new Set(), owners: new Set(), fostering: false };
    s.kinds.add(kind.toLowerCase());
    if (owner !== null) s.owners.add(owner ?? '');
    s.fostering ||= fostering;
    seen.set(k, s);
  };
  for (const f of facts) {
    const entity = f.entity.trim();
    const key = words(f.key);
    const value = words(f.value);
    const owner = ownerOf(entity);
    const fostering = /\bfoster/i.test(`${key} ${value}`);
    // "a golden retriever puppy named Biscuit"
    const named = value.match(/\bnamed ([A-Z][\p{L}'’-]+)/u);
    const animal = animalIn(value);
    if (named && animal) {
      note(named[1]!, animal, owner, fostering);
      continue;
    }
    // "Fostering Turnip the beagle"
    const the = value.match(/\b([A-Z][\p{L}'’-]+) the ([a-z][a-z ]+)/u);
    if (the && animalIn(the[2]!)) {
      note(the[1]!, animalIn(the[2]!)!, owner, fostering);
      continue;
    }
    // "Ana | pet owned = Pepper (cat)"
    const listed = value.match(/^([A-Z][\p{L}'’-]+)(?: \(([^)]+)\))?$/u);
    if (PET_KEY.test(key) && listed) {
      const kind = animalIn(listed[2] ?? '') ?? animalIn(key) ?? 'pet';
      note(listed[1]!, kind, owner, fostering);
      continue;
    }
    // "Biscuit | breed = golden retriever": a kind, owner said elsewhere
    if (NAME.test(entity) && KIND_KEY.test(key) && animal) note(entity, animal, null);
  }
  const pets: Pet[] = [];
  for (const s of seen.values()) {
    if (s.owners.size > 1) continue; // two owners: neither
    const kind =
      [...s.kinds].filter((k) => k !== 'pet').sort((a, b) => b.length - a.length)[0] ?? 'pet';
    const [owner] = [...s.owners];
    if (owner === undefined) continue; // never tied to anyone: we can't say whose
    pets.push({
      name: s.name,
      kind,
      ...(owner && { owner }),
      ...(s.fostering && { fostering: true }),
    });
  }
  return pets;
}

export function formatPets(pets: readonly Pet[]): string | null {
  if (pets.length === 0) return null;
  const list = pets.map((p) => {
    const whose = p.owner ? `${p.owner}'s` : 'their';
    return `${p.name} (${whose} ${p.kind}${p.fostering ? ', fostering' : ''})`;
  });
  return `Animals: ${list.join(', ')}.`;
}
