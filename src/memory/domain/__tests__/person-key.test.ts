/**
 * person-key (memory v2 lane C2): one relation map, Unicode names, and proof that every old
 * normaliser that now delegates here returns what it returned on main for ASCII input.
 * Names are fictional.
 */
import { describe, expect, it } from 'vitest';
import { RELATIONSHIP_ALIASES } from '../../../services/contacts/relationship-aliases.js';
import {
  norm,
  normalizeContactQuery,
  roleOf,
  words,
} from '../../../tools/domains/telephony/contact-pick-v2.js';
import {
  groupOf,
  keepLetters,
  normalizeName,
  personKey,
  relationOf,
  relationText,
  relationWordIn,
} from '../person-key.js';

type Row = readonly [string, string, string, string | null, string, string, string, string];
/** [input, normalizeContactQuery, norm, roleOf, entity-resolver term, migration name, curiosity name, people words] */
const MAIN_NAMES: readonly Row[] = [
  ['Sarah', 'sarah', 'sarah', null, 'sarah', 'sarah', 'sarah', 'Sarah'],
  [
    '  Mary  Jane ',
    'mary jane',
    'mary jane',
    null,
    'mary  jane',
    'mary  jane',
    'mary  jane',
    'Mary Jane',
  ],
  ['Mary-Jane', 'mary jane', 'mary jane', null, 'mary-jane', 'maryjane', 'maryjane', 'Mary-Jane'],
  ["O'Brien", 'o brien', 'o brien', null, 'obrien', 'obrien', 'obrien', "O'Brien"],
  [
    'Dr. Okonkwo',
    'dr okonkwo',
    'dr okonkwo',
    null,
    'dr okonkwo',
    'dr okonkwo',
    'dr okonkwo',
    'Dr. Okonkwo',
  ],
  [
    'JOHN SMITH',
    'john smith',
    'john smith',
    null,
    'john smith',
    'john smith',
    'john smith',
    'JOHN SMITH',
  ],
  [
    'anne_marie',
    'anne marie',
    'anne marie',
    null,
    'annemarie',
    'annemarie',
    'anne_marie',
    'anne marie',
  ],
  ['R2D2', 'r2d2', 'r2d2', null, 'rd', 'rd', 'r2d2', 'R2D2'],
  ['!!!', '', '', null, '', '', '', '!!!'],
  ["Dad's", 'dad s', 'dad s', null, 'dads', 'dads', 'dads', "Dad's"],
  ['my Mom', 'mom', 'my mom', 'Mom', 'my mom', 'my mom', 'my mom', 'my Mom'],
  [
    'The Dentist',
    'dentist',
    'the dentist',
    null,
    'the dentist',
    'the dentist',
    'the dentist',
    'The Dentist',
  ],
  [
    'our sister',
    'sister',
    'our sister',
    'Sister',
    'our sister',
    'our sister',
    'our sister',
    'our sister',
  ],
  ['Mum', 'mum', 'mum', 'Mom', 'mum', 'mum', 'mum', 'Mum'],
  ['MAMA', 'mama', 'mama', 'Mom', 'mama', 'mama', 'mama', 'MAMA'],
  ['ma', 'ma', 'ma', null, 'ma', 'ma', 'ma', 'ma'],
  ['pa', 'pa', 'pa', null, 'pa', 'pa', 'pa', 'pa'],
  ['papa', 'papa', 'papa', 'Dad', 'papa', 'papa', 'papa', 'papa'],
  ['Grandma', 'grandma', 'grandma', null, 'grandma', 'grandma', 'grandma', 'Grandma'],
  [
    'best friend',
    'best friend',
    'best friend',
    null,
    'best friend',
    'best friend',
    'best friend',
    'best friend',
  ],
  [
    'best-friend',
    'best friend',
    'best friend',
    null,
    'best-friend',
    'bestfriend',
    'bestfriend',
    'best-friend',
  ],
  ['ex-wife', 'ex wife', 'ex wife', null, 'ex-wife', 'exwife', 'exwife', 'ex-wife'],
  ['my  dad', 'dad', 'my dad', 'Dad', 'my  dad', 'my  dad', 'my  dad', 'my dad'],
  ['Father', 'father', 'father', 'Dad', 'father', 'father', 'father', 'Father'],
  ['sis', 'sis', 'sis', 'Sister', 'sis', 'sis', 'sis', 'sis'],
  ['bro', 'bro', 'bro', 'Brother', 'bro', 'bro', 'bro', 'bro'],
  ['nana', 'nana', 'nana', null, 'nana', 'nana', 'nana', 'nana'],
  ['kid', 'kid', 'kid', null, 'kid', 'kid', 'kid', 'kid'],
  ['kids', 'kids', 'kids', null, 'kids', 'kids', 'kids', 'kids'],
  ['buddy', 'buddy', 'buddy', null, 'buddy', 'buddy', 'buddy', 'buddy'],
  ["Teo's", 'teo s', 'teo s', null, 'teos', 'teos', 'teos', "Teo's"],
  [
    'Jean-Luc Picard',
    'jean luc picard',
    'jean luc picard',
    null,
    'jean-luc picard',
    'jeanluc picard',
    'jeanluc picard',
    'Jean-Luc Picard',
  ],
  ['x', 'x', 'x', null, 'x', 'x', 'x', 'x'],
  ['', '', '', null, '', '', '', ''],
  ['my', 'my', 'my', null, 'my', 'my', 'my', 'my'],
  ['Mom.', 'mom', 'mom', 'Mom', 'mom', 'mom', 'mom', 'Mom.'],
  ['DAD!', 'dad', 'dad', 'Dad', 'dad', 'dad', 'dad', 'DAD!'],
  [
    'the dentist at Main St',
    'dentist at main st',
    'the dentist at main st',
    null,
    'the dentist at main st',
    'the dentist at main st',
    'the dentist at main st',
    'the dentist at Main St',
  ],
];
/** people.ts RELATIONS at main, longest first. */
const MAIN_RELATIONS = [
  'healthcare provider',
  'physical therapist',
  'brother-in-law',
  'mother-in-law',
  'father-in-law',
  'sister-in-law',
  'granddaughter',
  'stepdaughter',
  'grandmother',
  'grandfather',
  'grandparent',
  'best friend',
  'grandchild',
  'stepmother',
  'stepfather',
  'girlfriend',
  'boyfriend',
  'colleague',
  'therapist',
  'grandson',
  'daughter',
  'roommate',
  'coworker',
  'neighbor',
  'stepson',
  'grandma',
  'grandpa',
  'husband',
  'partner',
  'fiancee',
  'brother',
  'sibling',
  'mother',
  'father',
  'sister',
  'nephew',
  'cousin',
  'friend',
  'spouse',
  'fiance',
  'parent',
  'doctor',
  'child',
  'uncle',
  'niece',
  'coach',
  'wife',
  'aunt',
  'boss',
  'mom',
  'dad',
  'son',
  'vet',
];
const MAIN_RELATION_IN: ReadonlyArray<readonly [string, string | null]> = [
  ['sister of speaker', 'sister'],
  ['Partner of the speaker', 'partner'],
  ['relation', null],
  ['a friend from work', 'friend'],
  ['physical therapist', 'physical therapist'],
  ['grandmother', 'grandmother'],
  ['step-mother', null],
  ['Mom', 'mom'],
  ['my dad', 'dad'],
  ['grandparent', 'grandparent'],
  ['stepmom', null],
  ['brother-in-law', 'brother-in-law'],
  ['best friend', 'best friend'],
  ['mommy', null],
  ['bro', null],
  ['sis', null],
  ['kid', null],
  ['nana', null],
  ['Dr. Okonkwo', null],
  ['Ana', null],
  ['girlfriend', 'girlfriend'],
  ['unfriendly', null],
  ['MOTHER', 'mother'],
  ['fiancee', 'fiancee'],
  ['the vet', 'vet'],
  ['coworker and friend', 'coworker'],
  ['Ma', null],
];

describe('relationOf: one map, so "my dad" = "Dad" = "dad\'s" = "Father"', () => {
  it.each(['my dad', 'Dad', "dad's", 'Father', 'my Dad’s', 'DADDY', 'papa', 'the father'])(
    '%s is father, keyed rel:father',
    (said) => {
      expect(relationOf(said)).toBe('father');
      expect(personKey(said)).toBe('rel:father');
    }
  );

  it.each([
    ['Mum', 'mother'],
    ['my grandma', 'grandmother'],
    ['our sis', 'sister'],
    ['bro', 'brother'],
    ['the kids', 'child'],
    ['children', 'child'],
    ['aunties', 'aunt'],
    ["parents'", 'parent'],
    ['sisters-in-law', 'sister-in-law'],
    ['mother in law', 'mother-in-law'],
    ['my bestie', 'best friend'],
    ['best_friend', 'best friend'],
    ['manager', 'boss'],
    ['fiancée', 'fiancee'],
  ])('%s is %s', (said, relation) => expect(relationOf(said)).toBe(relation));

  it.each(["my dad's friend", 'Ma', 'pa', 'nana', 'Sarah', 'unfriendly', '', 'my'])(
    '%s is no relation (a name keys on its letters)',
    (said) => expect(relationOf(said)).toBeUndefined()
  );

  it('a name-like family word keys as a name, never as a relation', () => {
    expect(personKey('Ma')).toBe('ma');
    expect(personKey('Nana')).toBe('nana');
  });
});

describe('normalizeName: any script keeps a non-empty, stable key', () => {
  const names = [
    'Ольга',
    'محمد',
    '李明',
    '김민준',
    'रेखा',
    'Ελένη',
    'José',
    'Zoë',
    'Łukasz',
    'Ngozi Okafor',
  ];

  it.each(names)('%s is non-empty, idempotent and case-insensitive', (name) => {
    const key = normalizeName(name);
    expect(key).not.toBe('');
    expect(normalizeName(key)).toBe(key);
    expect(normalizeName(name.toUpperCase())).toBe(key);
    expect(personKey(name)).toBe(key);
    // The shape the entity store, migration and curiosity memory compare on
    expect(keepLetters(name)).not.toBe('');
  });

  it('decomposed and composed accents are one key; marks are part of the name', () => {
    expect(normalizeName('José')).toBe(normalizeName('José'));
    expect(normalizeName('रेखा')).not.toBe(normalizeName('राखी'));
    expect(normalizeName('Ольга')).not.toBe(normalizeName('李明'));
  });

  it('a name of only emoji or symbols is never empty', () => {
    expect(normalizeName('🌻')).toBe('🌻');
    expect(normalizeName(' ★ ★ ')).toBe('★ ★');
    expect(normalizeName('   ')).toBe('');
  });
});

describe('every old normaliser returns what it did on main for ASCII', () => {
  it.each(MAIN_NAMES)('%j', (said, query, normed, role, term, migration, curiosity, people) => {
    expect(normalizeContactQuery(said)).toBe(query);
    expect(norm(said)).toBe(normed);
    expect(words(said).join(' ')).toBe(normed);
    expect(roleOf(said) ?? null).toBe(role);
    // entity-resolver normalizeRelationship, migration and curiosity-memory normalizeName
    expect(keepLetters(said, '-')).toBe(term);
    expect(keepLetters(said)).toBe(migration);
    expect(keepLetters(said, '\\p{N}_')).toBe(curiosity);
    expect(relationText(said)).toBe(people);
  });

  it.each(MAIN_RELATION_IN)('people relationIn(%j) is %j', (text, found) => {
    expect(relationWordIn(text, MAIN_RELATIONS) ?? null).toBe(found);
  });
});

describe('the one map holds every word of the three lists it merged', () => {
  it.each(MAIN_RELATIONS)('recall relation %s', (word) => expect(relationOf(word)).toBeDefined());

  it.each(['mom', 'mother', 'mum', 'mama', 'mommy', 'mummy', 'dad', 'father', 'papa', 'daddy'])(
    'contact role %s',
    (word) => expect(roleOf(word)).toBe(relationOf(word) === 'mother' ? 'Mom' : 'Dad')
  );

  const NAME_LIKE = new Set(['ma', 'pa', 'nana']);
  it.each(
    Object.entries(RELATIONSHIP_ALIASES).flatMap(([group, list]) =>
      list.filter((w) => !NAME_LIKE.has(w)).map((w) => [w, group])
    )
  )('contacts alias %s is in group %s', (word, group) => {
    expect(groupOf(relationOf(word) ?? '')).toBe(group);
  });
});
