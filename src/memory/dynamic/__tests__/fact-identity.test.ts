import { describe, expect, it } from 'vitest';
import {
  entityIdFor,
  factIdFor,
  factIdForExtracted,
  factText,
  normalizeFactKey,
  predicateForFact,
  relationshipIdFor,
} from '../fact-identity.js';

describe('normalizeFactKey', () => {
  it('lowercases, trims, collapses whitespace and strips punctuation', () => {
    expect(normalizeFactKey({ subject: '  Biscuit ', predicate: 'Breed!' })).toBe('biscuit|breed');
    expect(normalizeFactKey({ subject: 'Biscuit', predicate: 'favorite_toy' })).toBe(
      'biscuit|favorite toy'
    );
    expect(normalizeFactKey({ subject: 'Biscuit', predicate: 'favorite-toy' })).toBe(
      'biscuit|favorite toy'
    );
  });

  it('maps every name for the caller to one subject', () => {
    const user = normalizeFactKey({ subject: 'user', predicate: 'lives in' });
    for (const s of ['Speaker', 'me', 'I', 'the user', 'USER', '']) {
      expect(normalizeFactKey({ subject: s, predicate: 'lives_in' })).toBe(user);
    }
  });

  it('treats free text as a predicate of the caller', () => {
    expect(normalizeFactKey('Has two kids')).toBe('user|has two kids');
  });

  it('normalises Unicode forms', () => {
    expect(normalizeFactKey({ subject: 'Zoë', predicate: 'age' })).toBe(
      normalizeFactKey({ subject: 'Zoë', predicate: 'age' })
    );
  });
});

describe('factIdFor', () => {
  it('is deterministic and Firestore-safe', () => {
    const id = factIdFor({ subject: 'Biscuit', predicate: 'breed' });
    expect(id).toBe(factIdFor({ subject: 'biscuit', predicate: ' BREED ' }));
    expect(id).toMatch(/^f_[0-9a-f]{32}$/);
  });

  it('differs for different subjects or predicates', () => {
    const a = factIdFor({ subject: 'Biscuit', predicate: 'breed' });
    expect(factIdFor({ subject: 'Biscuit', predicate: 'age' })).not.toBe(a);
    expect(factIdFor({ subject: 'Max', predicate: 'breed' })).not.toBe(a);
  });

  it('accepts free text', () => {
    expect(factIdFor('has two kids')).toBe(
      factIdFor({ subject: 'user', predicate: 'has two kids' })
    );
  });
});

describe('extracted fact identity', () => {
  it('single-valued facts share an id across values (a new value replaces the old)', () => {
    const austin = { entityName: 'user', key: 'lives_in', value: 'Austin', factType: 'attribute' };
    const denver = { ...austin, value: 'Denver' };
    expect(factIdForExtracted(austin)).toBe(factIdForExtracted(denver));
  });

  it('multi-valued facts keep one id per value', () => {
    const jazz = { entityName: 'user', key: 'likes', value: 'jazz', factType: 'preference' };
    const hiking = { ...jazz, value: 'hiking' };
    expect(predicateForFact(jazz)).toBe('likes jazz');
    expect(factIdForExtracted(jazz)).not.toBe(factIdForExtracted(hiking));
  });

  it('writes readable text, naming the caller as User', () => {
    expect(factText({ entityName: 'Speaker', key: 'job_title', value: 'nurse' })).toBe(
      'User: job title is nurse'
    );
    expect(factText({ entityName: 'Biscuit', key: 'breed', value: 'golden retriever' })).toBe(
      'Biscuit: breed is golden retriever'
    );
  });
});

describe('entity and relationship ids', () => {
  it('entity ids depend on normalised name and type', () => {
    expect(entityIdFor('Mom', 'person')).toBe(entityIdFor(' mom ', 'Person'));
    expect(entityIdFor('Mom', 'person')).not.toBe(entityIdFor('Mom', 'place'));
  });

  it('bidirectional relationships ignore direction', () => {
    expect(relationshipIdFor('Sam', 'Alex', 'friend', true)).toBe(
      relationshipIdFor('Alex', 'Sam', 'friend', true)
    );
    expect(relationshipIdFor('Sam', 'Alex', 'parent', false)).not.toBe(
      relationshipIdFor('Alex', 'Sam', 'parent', false)
    );
  });
});
