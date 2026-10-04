/**
 * Regression test for the "Failed to save relationship to Firestore" error:
 * `Cannot use "undefined" as a Firestore value (found in field "nickname")`.
 *
 * `saveRelationship` writes the full `Relationship` object straight to
 * Firestore. Any optional field the caller didn't supply (nickname,
 * birthday, notes, ...) is `undefined` on that object, and Firestore
 * rejects a document containing a literal `undefined` anywhere in it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setMock = vi.fn().mockResolvedValue(undefined);
const getMock = vi.fn().mockResolvedValue({ exists: false, data: () => undefined });

// `saveRelationship` chains `.collection('users').doc(userId).collection('relationships').doc(id)`,
// so the fake Firestore needs both a doc-ref (set/get/collection) and a
// collection-ref (doc) shape, nested two levels deep.
function makeDocRef() {
  return { set: setMock, get: getMock, collection: makeCollectionRef };
}
function makeCollectionRef() {
  return { doc: vi.fn(() => makeDocRef()) };
}

vi.mock('firebase-admin', () => ({
  default: {
    apps: [{}], // non-empty -> storage.ts treats Firebase Admin as already initialized
    firestore: () => ({ collection: makeCollectionRef }),
  },
}));

vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/** Does this value contain a literal `undefined` at any depth? */
function hasUndefinedDeep(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasUndefinedDeep);
  return Object.values(value as Record<string, unknown>).some(hasUndefinedDeep);
}

describe('saveRelationship Firestore write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({ exists: false, data: () => undefined });
  });

  it('writes a document with no undefined values when optional fields are omitted', async () => {
    vi.resetModules();
    const { saveRelationship } = await import('../storage.js');

    // Mirrors exactly how the `addRelationship` tool (index.ts) builds this
    // object: it always assigns `nickname`/`birthday`/`notes` as shorthand
    // properties, so when the caller didn't supply them the KEY is present
    // with value `undefined` - not simply absent.
    await saveRelationship('voice-eval-sam', {
      name: 'Alice',
      relationshipType: 'friend',
      nickname: undefined,
      birthday: undefined,
      notes: undefined,
      interests: [],
      favoriteTeams: [],
    });

    expect(setMock).toHaveBeenCalledTimes(1);
    const written = setMock.mock.calls[0]?.[0];

    expect(hasUndefinedDeep(written)).toBe(false);
    expect(written && 'nickname' in written).toBe(false);
  });

  it('still writes a provided nickname', async () => {
    vi.resetModules();
    const { saveRelationship } = await import('../storage.js');

    await saveRelationship('voice-eval-sam', {
      name: 'Bob',
      nickname: 'Bobby',
      relationshipType: 'friend',
      interests: [],
      favoriteTeams: [],
    });

    const written = setMock.mock.calls[0]?.[0];
    expect(written?.nickname).toBe('Bobby');
    expect(hasUndefinedDeep(written)).toBe(false);
  });
});
