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
  ttl?: boolean;
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
  'report_summaries',
  'sms_queue',
  'subscribers',
  'support_requests',
  'tool_results',
  'voice_calls',
  // Ferni's old names; the code moved to family_checkin_calls and developer_mcp_servers.
  'proactive_checkin_calls',
  'mcp_servers',
];

/**
 * Ferni collections whose name appears in source only inside a path template, never as a bare
 * quoted string, so the mention check can't see them. Each entry names the file that builds the
 * path; the test fails if that file stops containing `/<name>`.
 */
const NAMED_ONLY_IN_PATH_TEMPLATES: Record<string, string> = {
  // musical_leaderboards/<key>/musical_board_entries; prod TTL policy on ttlAt.
  musical_board_entries: 'services/musical-you/leaderboard-store.ts',
};

/**
 * Prod field overrides that the rules below would reject, declared because prod has them: a
 * deploy of the file deletes any override the file lacks (#2477). Every entry must be in the
 * checked-in prod listing (scripts/ci/fixtures/firestore-indexes/default, from `gcloud
 * firestore indexes fields list` / `fields ttls list`), so this can't excuse a made-up one.
 */
/** Collection-group-only overrides on another app's collection; Ferni never queries it. */
const PROD_GROUP_ONLY_OVERRIDES = ['support_requests.created_at', 'support_requests.status'];
/** Legacy TTL fields prod keeps exempt from indexing (`indexes: []`); not large text. */
const PROD_EXEMPT_TTL_FIELDS = [
  'forecast_archive.expires_at',
  'function_executions.expires_at',
  'insights.ttl_date',
  'system_cache.expires_at',
];

const repoRoot = join(__dirname, '..', '..', '..');
const prodListingDir = join(repoRoot, 'scripts', 'ci', 'fixtures', 'firestore-indexes', 'default');
interface ListedField {
  name: string;
  ttlConfig?: unknown;
  indexConfig?: { indexes?: Array<{ queryScope: string; fields: FieldIndex[] }> };
}
const listed = (n: 'fields' | 'ttls'): ListedField[] =>
  JSON.parse(readFileSync(join(prodListingDir, `${n}.json`), 'utf8')) as ListedField[];
const keyOf = (name: string): string =>
  name.split('/collectionGroups/')[1].replace('/fields/', '.');
/** Prod's overrides and TTL fields, `<collection>.<field>` → its listing entry. */
const prodFields = new Map([...listed('fields'), ...listed('ttls')].map((f) => [keyOf(f.name), f]));
const prodTtls = new Set(listed('ttls').map((f) => keyOf(f.name)));
const srcDir = join(repoRoot, 'src');
const file = JSON.parse(readFileSync(join(repoRoot, 'firestore.indexes.json'), 'utf8')) as {
  indexes: CompositeIndex[];
  fieldOverrides: FieldOverride[];
};

/**
 * Every quoted token in non-test source under src/ ('name', "name" or `name`), read once.
 * Same answer as testing `['"\`]name['"\`]` against the joined source, but one pass: that
 * regex per declared name took 10-18 s over 55 MB, near the 30 s timeout under disk load.
 */
let tokenCache: Set<string> | undefined;
function quotedTokens(): Set<string> {
  if (!tokenCache) {
    tokenCache = new Set<string>();
    for (const m of productionSource().matchAll(/['"`]([^'"`\s]+)(?=['"`])/g)) tokenCache.add(m[1]);
  }
  return tokenCache;
}

/** Every non-test source file under src/, concatenated (about 5k files). */
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
      .map((o) => `${o.collectionGroup}.${o.fieldPath}`)
      .filter((k) => !PROD_GROUP_ONLY_OVERRIDES.includes(k));
    expect(dropsDefaults).toEqual([]);
  });

  it('allows a group-only override only where prod has exactly that override', () => {
    for (const key of PROD_GROUP_ONLY_OVERRIDES) {
      const live = prodFields.get(key)?.indexConfig?.indexes ?? [];
      expect(live.length, `${key} is not a prod override`).toBeGreaterThan(0);
      expect(live.every((i) => i.queryScope === 'COLLECTION_GROUP')).toBe(true);
      const declared = file.fieldOverrides.find(
        (o) => `${o.collectionGroup}.${o.fieldPath}` === key
      );
      expect(declared?.indexes).toHaveLength(live.length);
    }
  });

  it('declares only TTL policies prod already has', () => {
    // A ttl:true entry prod lacks would switch on a new TTL policy (document deletion) in prod
    // at the next index deploy. Add the policy in prod first (with Seth's OK), then here.
    const ttls = file.fieldOverrides
      .filter((o) => o.ttl)
      .map((o) => `${o.collectionGroup}.${o.fieldPath}`);
    expect(ttls.filter((k) => !prodTtls.has(k))).toEqual([]);
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
    const tokens = quotedTokens();
    const names = new Set([
      ...file.indexes.map((i) => i.collectionGroup),
      ...file.fieldOverrides.map((o) => o.collectionGroup),
    ]);
    const mentioned = (n: string): boolean => tokens.has(n);
    const unreferenced = [...names].filter(
      (n) => !mentioned(n) && !NOT_FERNI_COLLECTIONS.includes(n) && !NAMED_ONLY_IN_PATH_TEMPLATES[n]
    );
    expect(unreferenced).toEqual([]);
  });

  it('finds each path-template collection in the file that builds its path', () => {
    for (const [name, rel] of Object.entries(NAMED_ONLY_IN_PATH_TEMPLATES))
      expect(readFileSync(join(srcDir, rel), 'utf8')).toContain(`/${name}`);
  });

  it('lists only declared, unused names as not Ferni', () => {
    const tokens = quotedTokens();
    const names = new Set([
      ...file.indexes.map((i) => i.collectionGroup),
      ...file.fieldOverrides.map((o) => o.collectionGroup),
    ]);
    const stale = NOT_FERNI_COLLECTIONS.filter((n) => !names.has(n) || tokens.has(n));
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
      .filter((k) => !PROD_EXEMPT_TTL_FIELDS.includes(k))
      .sort();
    expect(exempt).toEqual(['memory_vectors.text', 'unified_memories.content', 'vectors.text']);
  });

  it('allows an exempt TTL field only where prod has it exempt, as a TTL policy', () => {
    for (const key of PROD_EXEMPT_TTL_FIELDS) {
      const live = prodFields.get(key);
      expect(live?.ttlConfig, `${key} is not a prod TTL policy`).toBeTruthy();
      expect(live?.indexConfig?.indexes ?? []).toEqual([]);
      const declared = file.fieldOverrides.find(
        (o) => `${o.collectionGroup}.${o.fieldPath}` === key
      );
      expect(declared).toMatchObject({ ttl: true, indexes: [] });
    }
  });
});
