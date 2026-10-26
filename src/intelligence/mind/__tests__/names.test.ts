import { describe, expect, it } from 'vitest';
import { subjectKeyOf } from '../../world-model/temporal/types.js';
import {
  canonicalSubjectKey,
  dropReason,
  isMindBuildOn,
  normalizeName,
  relationKey,
  relationWordKey,
} from '../names.js';

// Invented names only (the repo is public). The shapes are the memory audit's (2026-10-25):
// one mother stored as "Mom", "mother" and "my mum"; one friend stored under four casings
// and a possessive; the extractor's words for the caller and for Ferni stored as people.
const ON = { MIND_BUILD: 'on' } as const;
const OFF = { MIND_BUILD: 'off' } as const;

describe('canonicalSubjectKey with MIND_BUILD on', () => {
  const key = (s: string) => canonicalSubjectKey(s, 'person', ON);

  it('gives mom, mother, mum and their casings and possessives one key', () => {
    const variants = ['Mom', 'mother', 'my Mum', "MOM'S", 'Mama', 'her mom', 'Mother’s'];
    expect(variants.map(key)).toEqual(Array(variants.length).fill('person:mother'));
  });

  it('gives one person stored under several casings and a possessive one key', () => {
    const variants = ['Teodoro', 'TEODORO', "Teodoro's", '  teodoro ', 'Téodoro'];
    expect(new Set(variants.map(key))).toEqual(new Set(['person:teodoro']));
  });

  it('keeps a qualified relation apart: a stepmom or a mother-in-law is not mom', () => {
    expect(key('stepmom')).toBe('person:step-mother');
    expect(key('my mother-in-law')).toBe('person:mother-in-law');
    expect(key('ex wife')).toBe('person:ex-wife');
    expect(new Set([key('Mom'), key('stepmom'), key('my mother-in-law')]).size).toBe(3);
  });

  it("folds the caller's own tokens into self", () => {
    expect(['User', 'speaker', 'the caller', 'I', 'me', 'self'].map(key)).toEqual(
      Array(6).fill('self')
    );
  });

  it('rejects junk: meta words, Ferni and its heard forms, role labels, digits', () => {
    const junk = ['Who', 'someone', 'N/A', 'Ferni', 'Fernie', 'Assistant', "user's interlocutor"];
    expect(junk.map(key)).toEqual(Array(junk.length).fill(null));
    expect(key('42')).toBeNull();
    expect(key('')).toBeNull();
  });

  it("keeps a teammate's first name alone: it may be the caller's own friend", () => {
    expect(key('Maya')).toBe('person:maya');
    expect(key('Maya Santos')).toBeNull();
  });

  it('leaves other kinds and the self kind on the legacy key', () => {
    expect(canonicalSubjectKey('Mom', 'self', ON)).toBe('self');
    expect(canonicalSubjectKey("Mom's Garden", 'goal', ON)).toBe(
      subjectKeyOf({ subject: "Mom's Garden", subjectKind: 'goal' })
    );
  });
});

describe('canonicalSubjectKey with MIND_BUILD off (the default) is subjectKeyOf exactly', () => {
  const subjects = ['Mom', 'mother', "Teodoro's", 'TEODORO', 'Who', 'Ferni', 'User', 'stepmom'];

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
  it('normalizeName drops case, accents, a leading "my" and possessives', () => {
    expect(normalizeName("  My Mum's ")).toBe('mum');
    expect(normalizeName('José-Luis')).toBe('jose luis');
    expect(normalizeName('Teodoro’s')).toBe('teodoro');
  });

  it('relationKey maps the lexicon to one key and keeps qualifiers apart', () => {
    expect(['mom', 'mother', 'mum', 'mama'].map(relationKey)).toEqual(Array(4).fill('mother'));
    expect(['grandma', 'lola', 'abuela', 'my grandmother'].map(relationKey)).toEqual(
      Array(4).fill('grandmother')
    );
    expect(relationKey('sister of speaker')).toBe('sister');
    expect(relationKey('best friend')).toBe('friend');
    expect(relationKey('stepmom')).toBe('step-mother');
    expect(relationKey('neighbor')).toBeNull();
  });

  it('relationWordKey is a relation only when the name is nothing but a relation word', () => {
    expect(relationWordKey(normalizeName("user's mother"))).toBe('mother');
    expect(relationWordKey(normalizeName('my best friend'))).toBe('friend');
    expect(relationWordKey(normalizeName('Aunt Odile'))).toBeNull();
  });

  it('dropReason names why a name is not a person of the caller', () => {
    expect(dropReason('speaker', null)).toBe('self');
    expect(dropReason('listener', null)).toBe('role-label');
    expect(dropReason('who', null)).toBe('meta');
    expect(dropReason('fernie', 'friend')).toBe('persona');
    expect(dropReason('jordan', null)).toBe('persona');
    expect(dropReason('jordan', 'friend')).toBeNull();
    expect(dropReason('odile', null)).toBeNull();
  });
});
