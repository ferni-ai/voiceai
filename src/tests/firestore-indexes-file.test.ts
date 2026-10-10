/**
 * firestore.indexes.json stays deployable without breaking queries.
 *
 * A single-field override replaces Firestore's default indexes for that field. Ten of the
 * file's overrides listed only the collection-group index, so `firebase deploy --only
 * firestore:indexes` would have dropped the ordinary per-collection index on `status`,
 * `expiration`, `id` and so on, breaking every plain `where('status', '==', …)` on those
 * collections. One field (scheduled_actions.status) was also listed twice, with different
 * indexes. The file now matches production; these checks keep it that way.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface FieldIndex {
  order?: 'ASCENDING' | 'DESCENDING';
  arrayConfig?: 'CONTAINS';
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP';
}
interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  indexes: FieldIndex[];
}

const file = JSON.parse(readFileSync(join(__dirname, '..', '..', 'firestore.indexes.json'), 'utf8')) as {
  fieldOverrides: FieldOverride[];
};

describe('firestore.indexes.json field overrides', () => {
  it('lists each field once', () => {
    const keys = file.fieldOverrides.map((o) => `${o.collectionGroup}.${o.fieldPath}`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('keeps the per-collection indexes when it adds a collection-group one', () => {
    const dropsDefaults = file.fieldOverrides
      .filter((o) => o.indexes.some((i) => i.queryScope === 'COLLECTION_GROUP'))
      .filter(
        (o) =>
          !o.indexes.some((i) => i.queryScope === 'COLLECTION' && i.order === 'ASCENDING') ||
          !o.indexes.some((i) => i.queryScope === 'COLLECTION' && i.order === 'DESCENDING')
      )
      .map((o) => `${o.collectionGroup}.${o.fieldPath}`);
    expect(dropsDefaults).toEqual([]);
  });
});
