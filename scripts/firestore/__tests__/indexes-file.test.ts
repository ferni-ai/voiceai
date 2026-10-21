/**
 * firestore.indexes.json stays deployable without breaking queries.
 *
 * A single-field override replaces Firestore's default indexes for that field. Ten of the
 * file's overrides listed only the collection-group index, so `firebase deploy --only
 * firestore:indexes` would have dropped the ordinary per-collection index on `status`,
 * `expiration`, `id` and so on, breaking every plain `where('status', '==', …)` on those
 * collections. One field (scheduled_actions.status) was also listed twice, with different
 * indexes. The file now matches production; these checks keep it that way.
 * It lived in src/tests, which neither CI config runs, and stayed red there unnoticed.
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

/**
 * Declared only because johnb-2025 holds their indexes (#2107 mirrored all 211 live ones, so a
 * forced index deploy can't delete them): other apps on the shared project, plus two of Ferni's
 * old names. Drop an entry with its index; the test fails while a listed name is used in src.
 */
const NOT_FERNI_COLLECTIONS = [
  'ai_decision_log',
  'ai_email_log',
  'ai_eval_log',
  'attribution_events',
  'automation_queue',
  'booking_requests',
  'callback_queue',
  'campaigns',
  'chain_expansion_alerts',
  'clients',
  'competitor_snapshots',
  'content_chunks',
  'content_log',
  'content_metrics',
  'content_suggestions',
  'daily_briefs',
  'data_snapshots',
  'decision_queue',
  'drafts',
  'email_analytics',
  'eval_runs',
  'forecast_archive',
  'function_executions',
  'impact_baselines',
  'impact_reports',
  'impact_snapshots',
  'leads',
  'local_market_pages',
  'meeting_preps',
  'metric_anomalies',
  'nurture_sequences',
  'prompt_experiments',
  'proposals',
  'prospects',
  'recommendation_outcomes',
  'recommendation_tracking',
  'report_chunks',
  'reports',
  'reputation_requests',
  'review_responses',
  'roi_reports',
  'sequences',
  'sms_queue',
  'subscribers',
  'support_requests',
  'tool_results',
  'voice_calls',
  // Ferni's old names; the code moved to family_checkin_calls and developer_mcp_servers.
  'proactive_checkin_calls',
  'mcp_servers',
];

const repoRoot = join(__dirname, '..', '..', '..');
const srcDir = join(repoRoot, 'src');
const file = JSON.parse(readFileSync(join(repoRoot, 'firestore.indexes.json'), 'utf8')) as {
  indexes: CompositeIndex[];
  fieldOverrides: FieldOverride[];
};

/** Every non-test source file under src/, concatenated (about 5k files; read once). */
function productionSource(): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!['node_modules', '__tests__', 'tests'].includes(entry.name))
          walk(join(dir, entry.name));
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
    const prefixes = vectorIndexes.map((i) =>
      i.fields
        .map((f) => f.fieldPath)
        .slice(0, -1)
        .join(',')
    );
    expect(prefixes.sort()).toEqual(['__name__', 'metadata.userId,__name__']);
    for (const index of vectorIndexes) {
      expect(index.queryScope).toBe('COLLECTION');
      expect(index.fields.at(-1)).toMatchObject({
        fieldPath: 'embedding',
        vectorConfig: { dimension: 768 },
      });
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
    const mentioned = (n: string): boolean => new RegExp(`['"\`]${n}['"\`]`).test(source);
    const unreferenced = [...names].filter(
      (n) => !mentioned(n) && !NOT_FERNI_COLLECTIONS.includes(n)
    );
    expect(unreferenced).toEqual([]);
  });

  it('lists only declared, unused names as not Ferni', () => {
    const source = productionSource();
    const names = new Set([
      ...file.indexes.map((i) => i.collectionGroup),
      ...file.fieldOverrides.map((o) => o.collectionGroup),
    ]);
    const stale = NOT_FERNI_COLLECTIONS.filter(
      (n) => !names.has(n) || new RegExp(`['"\`]${n}['"\`]`).test(source)
    );
    expect(stale).toEqual([]);
  });

  it('does not list a composite index twice', () => {
    const keys = file.indexes.map((i) =>
      JSON.stringify([i.collectionGroup, i.queryScope, i.fields])
    );
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
