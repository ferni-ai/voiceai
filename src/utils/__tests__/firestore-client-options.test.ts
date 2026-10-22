/**
 * The shared Firestore client drops undefined fields instead of failing the write.
 *
 * It was built with a bare `new Firestore()`, so any writer with one optional
 * field unset lost the whole document: in prod every crisis signal logged
 * without a session id was rejected, and the next-day crisis follow-up that
 * reads them never came. The persistence client already set this option.
 *
 * It also binds the database getFirestoreDatabase() resolves: '(default)' (prod)
 * unless FIRESTORE_DATABASE names another (dev's ferni-dev).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => [] as unknown[]);

vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    constructor(options?: unknown) {
      constructed.push(options);
    }
  },
  FieldValue: {},
}));

// src/tests/setup.ts mocks this module globally; the real one is under test here
const { getFirestoreDb, resetFirestoreInstance } =
  await vi.importActual<typeof import('../firestore-utils.js')>('../firestore-utils.js');

describe('getFirestoreDb', () => {
  const saved = process.env.FIRESTORE_DATABASE;
  afterEach(() => {
    if (saved === undefined) delete process.env.FIRESTORE_DATABASE;
    else process.env.FIRESTORE_DATABASE = saved;
    resetFirestoreInstance();
  });

  it("builds the client with ignoreUndefinedProperties, on '(default)' when FIRESTORE_DATABASE is unset", () => {
    delete process.env.FIRESTORE_DATABASE;
    resetFirestoreInstance();
    expect(getFirestoreDb()).not.toBeNull();
    expect(constructed.at(-1)).toEqual({
      ignoreUndefinedProperties: true,
      databaseId: '(default)',
    });
  });

  it('binds the database FIRESTORE_DATABASE names (dev runs on ferni-dev)', () => {
    process.env.FIRESTORE_DATABASE = 'ferni-dev';
    resetFirestoreInstance();
    expect(getFirestoreDb()).not.toBeNull();
    expect(constructed.at(-1)).toEqual({
      ignoreUndefinedProperties: true,
      databaseId: 'ferni-dev',
    });
  });
});
