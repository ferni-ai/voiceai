/**
 * Export and account deletion name the same stores. Every store deletion knows about is
 * exported or withheld with a reason, no credential store is ever exported, and every store
 * export carries is one deletion erases. A store added on one side fails here until it's
 * decided on the other. Also: the export module reads Firestore only through BoundedReader.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_STORES,
  ERASED_STORES,
  OWNED_ELSEWHERE,
  storeLabel,
  USER_RECORD_ROOTS,
} from '../user-stores.js';
import {
  EXPORTED_ELSEWHERE,
  EXPORTED_STORES,
  WITHHELD_ELSEWHERE,
  WITHHELD_STORES,
} from '../user-records-export.js';

const exported = EXPORTED_ELSEWHERE.map(storeLabel);
const withheld = Object.keys(WITHHELD_ELSEWHERE);
const erased = new Set(ERASED_STORES.map(storeLabel));

describe('export and deletion agree on every store', () => {
  it('every store deletion erases outside the two records is exported or withheld', () => {
    const decided = new Set([...exported, ...withheld]);
    const undecided = OWNED_ELSEWHERE.map(storeLabel).filter((label) => !decided.has(label));
    expect(undecided).toEqual([]);
  });

  it('no store is both exported and withheld, and each withheld one has a reason', () => {
    expect(exported.filter((label) => withheld.includes(label))).toEqual([]);
    for (const [label, reason] of Object.entries(WITHHELD_ELSEWHERE)) {
      expect(reason.length, label).toBeGreaterThan(10);
    }
  });

  it('a withheld entry names a store deletion knows (no stale reasons)', () => {
    const known = new Set(OWNED_ELSEWHERE.map(storeLabel));
    expect(withheld.filter((label) => !known.has(label))).toEqual([]);
  });

  it('every store export carries is erased by account deletion', () => {
    expect(exported.filter((label) => !erased.has(label))).toEqual([]);
    for (const root of Object.keys(EXPORTED_STORES)) {
      // A root's subcollections are erased with its {uid} document
      expect(erased.has(`${root}/{uid}`), root).toBe(true);
    }
  });

  it('the two records are the ones deletion walks', () => {
    for (const root of USER_RECORD_ROOTS) expect(EXPORTED_STORES).toHaveProperty(root);
  });

  it('no credential store is exported, by name or under a record', () => {
    const credentials = CREDENTIAL_STORES.map((s) => s.collection);
    expect(EXPORTED_ELSEWHERE.filter((s) => credentials.includes(s.collection))).toEqual([]);
    expect(credentials.filter((c) => c in EXPORTED_STORES)).toEqual([]);
    const subcollections = Object.values(EXPORTED_STORES).flat();
    expect(subcollections.filter((sub) => sub in WITHHELD_STORES)).toEqual([]);
  });
});

describe('one reader, by construction', () => {
  it('user-records-export.ts makes no Firestore call of its own', () => {
    const file = fileURLToPath(new URL('../user-records-export.ts', import.meta.url));
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const calls = code.match(
      /\.get\(|\.where\(|collection\(|\.doc\(|\.count\(|listCollections|runTransaction|getFirestore|firebase-admin/g
    );
    expect(calls).toBeNull();
  });
});
