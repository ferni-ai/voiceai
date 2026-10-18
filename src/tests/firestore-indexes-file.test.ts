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
import { readdirSync, readFileSync } from 'node:fs';
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

interface CompositeIndex {
  collectionGroup: string;
  queryScope?: string;
  fields: Array<{ fieldPath: string; vectorConfig?: { dimension: number } }>;
}

const srcDir = join(__dirname, '..');
const file = JSON.parse(readFileSync(join(srcDir, '..', 'firestore.indexes.json'), 'utf8')) as {
  indexes: CompositeIndex[];
  fieldOverrides: FieldOverride[];
};

/** Every non-test source file under src/, concatenated (about 5k files; read once). */
function productionSource(): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!['node_modules', '__tests__', 'tests'].includes(entry.name)) walk(join(dir, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
        parts.push(readFileSync(join(dir, entry.name), 'utf8'));
      }
    }
  };
  walk(srcDir);
  return parts.join('\n');
}

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

describe('firestore.indexes.json composite indexes', () => {
  it('declares the memory_vectors vector indexes findNearest needs', () => {
    // A deploy that prunes undeclared indexes would otherwise delete the live ones (user recall).
    const vectorIndexes = file.indexes.filter(
      (i) => i.collectionGroup === 'memory_vectors' && i.fields.some((f) => f.vectorConfig)
    );
    const prefixes = vectorIndexes.map((i) => i.fields.map((f) => f.fieldPath).slice(0, -1).join(','));
    expect(prefixes.sort()).toEqual(['__name__', 'metadata.userId,__name__']);
    for (const index of vectorIndexes) {
      expect(index.queryScope).toBe('COLLECTION');
      expect(index.fields.at(-1)).toMatchObject({ fieldPath: 'embedding', vectorConfig: { dimension: 768 } });
    }
  });

  it('declares no collection that no source file mentions', () => {
    // Catches name drift: proactive_checkin_calls / mcp_servers were declared while the code
    // queried family_checkin_calls / developer_mcp_servers, so the real queries had no index.
    const source = productionSource();
    const names = new Set([
      ...file.indexes.map((i) => i.collectionGroup),
      ...file.fieldOverrides.map((o) => o.collectionGroup),
    ]);
    const unreferenced = [...names].filter((n) => !new RegExp(`['"\`]${n}['"\`]`).test(source));
    expect(unreferenced).toEqual([]);
  });

  it('does not list a composite index twice', () => {
    const keys = file.indexes.map((i) => JSON.stringify([i.collectionGroup, i.queryScope, i.fields]));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});

describe('firestore.indexes.json write-cost exemptions', () => {
  it('exempts large text fields that no query filters or orders by', () => {
    const exempt = file.fieldOverrides
      .filter((o) => o.indexes.length === 0)
      .map((o) => `${o.collectionGroup}.${o.fieldPath}`)
      .sort();
    expect(exempt).toEqual(['memory_vectors.text', 'unified_memories.content', 'vectors.text']);
  });
});
