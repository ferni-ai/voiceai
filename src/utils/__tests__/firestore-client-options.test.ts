/**
 * The shared Firestore client drops undefined fields instead of failing the write.
 *
 * It was built with a bare `new Firestore()`, so any writer with one optional
 * field unset lost the whole document: in prod every crisis signal logged
 * without a session id was rejected, and the next-day crisis follow-up that
 * reads them never came. The persistence client already set this option.
 */
import { describe, expect, it, vi } from 'vitest';

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
  it('builds the client with ignoreUndefinedProperties', () => {
    resetFirestoreInstance();
    expect(getFirestoreDb()).not.toBeNull();
    expect(constructed.at(-1)).toEqual(
      expect.objectContaining({ ignoreUndefinedProperties: true })
    );
  });
});
