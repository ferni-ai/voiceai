/**
 * Entity resolver unit tests (no Firestore emulator required).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../storage.js', () => ({
  createEntity: vi.fn(),
  getEntity: vi.fn(async () => null),
  updateEntity: vi.fn(),
  findEntityByAlias: vi.fn(async () => null),
  searchEntities: vi.fn(async () => []),
  getAllEntities: vi.fn(async () => []),
  getMentionsForEntity: vi.fn(async () => []),
  getRelationshipsForEntity: vi.fn(async () => []),
  upsertRelationship: vi.fn(),
}));

import { getEntityResolver } from '../entity-resolver.js';

describe('Entity Resolver (unit)', () => {
  it('returns a singleton with required methods', () => {
    const a = getEntityResolver();
    const b = getEntityResolver();
    expect(a).toBe(b);
    expect(a.resolvePerson).toBeTypeOf('function');
    expect(a.whatDoWeKnowAbout).toBeTypeOf('function');
    expect(a.resolveMention).toBeTypeOf('function');
    expect(a.isReady()).toBe(true);
  });

  it('getPeople returns an array without throwing', async () => {
    const resolver = getEntityResolver();
    const people = await resolver.getPeople('test-user');
    expect(Array.isArray(people)).toBe(true);
  });
});
