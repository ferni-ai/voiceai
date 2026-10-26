import { describe, expect, it } from 'vitest';
import { subjectKeyOf } from '../../world-model/temporal/types.js';
import {
  canonicalSubjectKey,
  dropReason,
  isMindBuildOn,
  normalizeName,
  ownerRelationKey,
  relationKey,
} from '../names.js';

// Invented names only (the repo is public). Over-merging a key merges two people's
// memories, so most of these pin what must stay APART.
const ON = { MIND_BUILD: 'on' } as const;
const OFF = { MIND_BUILD: 'off' } as const;
const key = (s: string) => canonicalSubjectKey(s, 'person', ON);
const distinct = (subjects: string[]) => new Set(subjects.map(key)).size;

describe('owner relations collapse (MIND_BUILD on)', () => {
  it("gives the owner's mom one key however it is written", () => {
    const mom = ['Mom', 'mother', 'my Mum', "MOM'S", 'Mommy', 'my mom', "user's mother", 'Mom ❤️'];
    expect(mom.map(key)).toEqual(Array(mom.length).fill('person:mother'));
    expect(['dad', 'Daddy', 'my father'].map(key)).toEqual(Array(3).fill('person:father'));
  });

  it('gives one name under several casings and a possessive one key', () => {
    const variants = ['Teodoro', 'TEODORO', "Teodoro's", '  teodoro ', 'Téodoro'];
    expect(new Set(variants.map(key))).toEqual(new Set(['person:teodoro']));
  });

  it('keeps a qualified relation apart: a stepmom or a mother-in-law is not mom', () => {
    expect(key('stepmom')).toBe('person:step-mother');
    expect(key('my step mom')).toBe('person:step-mother');
    expect(key('my mother-in-law')).toBe('person:mother-in-law');
    expect(key('ex wife')).toBe('person:ex-wife');
  });
});

describe('what must never collapse (MIND_BUILD on)', () => {
  it('1. a first name that is also a relation word stays a name', () => {
    expect(['Lola', 'Nana', 'Buddy', 'Ma', 'Pop', 'Papa'].map(key)).toEqual([
      'person:lola',
      'person:nana',
      'person:buddy',
      'person:ma',
      'person:pop',
      'person:papa',
    ]);
  });

  it('1. grandma and nana are two people; "my grandma" is grandma', () => {
    expect(key('grandma')).toBe('person:grandma');
    expect(key('my grandma')).toBe('person:grandma');
    expect(distinct(['grandma', 'nana', 'grandmother', 'my nana', 'Lola'])).toBe(5);
  });

  it("2. a third party's relation is not the owner's", () => {
    const theirs = ['his mom', 'her mom', 'their mom', 'her mother', "Odile's mom"];
    expect(theirs.map(key)).not.toContain('person:mother');
    expect(distinct(theirs)).toBe(theirs.length);
  });

  it('3. broad categories never merge', () => {
    expect(distinct(['friend', 'best friend', 'buddy', 'pal', 'my friend', 'my buddy'])).toBe(6);
    const partners = ['boyfriend', 'girlfriend', 'fiance', 'spouse', 'partner', 'my partner'];
    expect(distinct(partners)).toBe(6);
    expect(partners.slice(0, 4).map(key)).not.toContain('person:partner');
  });

  it('3. a name with a non-Latin part is not the Latin part alone', () => {
    expect(key('李 Wei')).toBe('person:李 wei');
    expect(key('李 Wei')).not.toBe(key('Wei'));
  });

  it('4. prototype names are plain names, not object members', () => {
    for (const s of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(key(s)).toBe(`person:${normalizeName(s)}`);
      expect(key(s)).not.toMatch(/function|native|object/i);
      expect(ownerRelationKey(normalizeName(s))).toBeNull();
      expect(relationKey(s)).toBeNull();
    }
  });
});

describe('names keep their letters (MIND_BUILD on)', () => {
  it('5. non-Latin names and emoji are people, never null', () => {
    expect(['张伟', 'Мама', 'محمد', '김민준', 'Ελένη', '🦊'].map(key)).toEqual([
      'person:张伟',
      'person:мама',
      'person:محمد',
      'person:김민준',
      'person:ελένη',
      'person:🦊',
    ]);
    expect(key('ΕΛΈΝΗ')).toBe(key('Ελένη'));
  });

  it("5. Guy, Ai and a full name like a teammate's are people", () => {
    expect(['Guy', 'Ai', 'Alex Chen', 'Maya'].map(key)).toEqual([
      'person:guy',
      'person:ai',
      'person:alex chen',
      'person:maya',
    ]);
  });

  it('6. letters NFKD leaves whole are folded, never dropped', () => {
    expect(['Łukasz', 'Søren', 'Strauß', 'ŁUKASZ'].map(normalizeName)).toEqual([
      'lukasz',
      'soren',
      'strauss',
      'lukasz',
    ]);
    expect(normalizeName('José-Luis')).toBe('jose luis');
    expect(normalizeName('Nguyễn')).toBe('nguyen');
    // only Latin accents come off: a kana voicing mark is part of the letter
    expect(normalizeName('ゆうが')).toBe('ゆうが');
  });
});

describe('junk and self (MIND_BUILD on)', () => {
  it("folds the caller's own tokens into self", () => {
    expect(['User', 'speaker', 'the caller', 'I', 'me', 'self'].map(key)).toEqual(
      Array(6).fill('self')
    );
  });

  it('rejects meta words, Ferni and its heard forms, role labels, digits and nothing', () => {
    const junk = ['Who', 'someone', 'N/A', 'Ferni', 'Fernie', 'Assistant', "user's interlocutor"];
    expect([...junk, '42', '', '  '].map(key)).toEqual(Array(junk.length + 3).fill(null));
  });

  it('leaves other kinds and the self kind on the legacy key', () => {
    expect(canonicalSubjectKey('Mom', 'self', ON)).toBe('self');
    expect(canonicalSubjectKey("Mom's Garden", 'goal', ON)).toBe(
      subjectKeyOf({ subject: "Mom's Garden", subjectKind: 'goal' })
    );
  });
});

describe('canonicalSubjectKey with MIND_BUILD off (the default) is subjectKeyOf exactly', () => {
  const subjects = [
    'Mom',
    'mother',
    "Teodoro's",
    'Who',
    'Ferni',
    'User',
    'stepmom',
    'her mom',
    'Nana',
    'Łukasz',
    '张伟',
    'constructor',
    '🦊',
  ];

  it('returns the legacy key for every subject and kind, unset or off', () => {
    for (const env of [{}, OFF]) {
      for (const subjectKind of ['person', 'self', 'goal', 'situation'] as const) {
        for (const subject of subjects) {
          expect(canonicalSubjectKey(subject, subjectKind, env)).toBe(
            subjectKeyOf({ subject, subjectKind })
          );
        }
      }
    }
    expect(isMindBuildOn({})).toBe(false);
  });

  it('so mom and mother stay two keys and junk keeps a key, as today', () => {
    expect(canonicalSubjectKey('Mom', 'person', OFF)).toBe('person:mom');
    expect(canonicalSubjectKey('mother', 'person', OFF)).toBe('person:mother');
    expect(canonicalSubjectKey('Who', 'person', OFF)).toBe('person:who');
  });
});

describe('the pieces', () => {
  it('ownerRelationKey: a bare role word or one the owner claims, nothing else', () => {
    const n = (s: string) => ownerRelationKey(normalizeName(s));
    expect(['my sister', 'sister', "the caller's stepdad", "user's mother"].map(n)).toEqual([
      'sister',
      'sister',
      'step-father',
      'mother',
    ]);
    expect(['her sister', 'my buddy', 'nana', 'Aunt Odile', 'my friend'].map(n)).toEqual(
      Array(5).fill(null)
    );
  });

  it('relationKey reads a stated relation, keeping categories and qualifiers apart', () => {
    expect(relationKey('mother of user')).toBe('mother');
    expect(relationKey('sister of speaker')).toBe('sister');
    expect(relationKey('my older sister')).toBe('sister');
    expect(relationKey('best friend')).toBe('best-friend');
    expect(relationKey('friend')).toBe('friend');
    expect(relationKey('boyfriend')).toBe('boyfriend');
    expect(relationKey('stepmom')).toBe('step-mother');
    expect(relationKey('mother-in-law')).toBe('mother-in-law');
    expect(relationKey('ex wife')).toBe('ex-wife');
    expect(relationKey('the dentist')).toBeNull();
  });

  it('dropReason names why a name is not a person of the caller', () => {
    expect(dropReason('the speaker', null)).toBe('self');
    expect(dropReason('listener', null)).toBe('role-label');
    expect(dropReason('who', null)).toBe('meta');
    expect(dropReason('fernie', 'friend')).toBe('persona');
    expect(dropReason('jordan', null)).toBe('persona');
    expect(dropReason('jordan', 'friend')).toBeNull();
    expect(dropReason('odile', null)).toBeNull();
  });
});
