/**
 * "Take your story": the records the app and the voice agent keep for a person, read as
 * they are stored, so the export carries every one (menu rubric §6, "Leaves with them").
 *
 * The curated export categories (Conversations, Contacts, Productivity, ...) read their
 * own stores, and several panels read stores none of them touched: the calendar, the
 * voice agent's calls and summaries, shared memories, outreach, routines, seeds. Rather
 * than add a category per store, the allowlisted stores under a person's two records,
 * bogle_users/{uid} (the voice agent) and users/{uid} (the app), are exported as stored,
 * plus the few stores kept elsewhere and keyed by the person. Credentials never leave:
 * stores are allowlisted by name and secret fields are dropped at any depth.
 * KNOWN_USER_STORES below is the list a test holds the export to.
 *
 * @module services/platform/user-records-export
 */

import { BoundedReader, ExportBudget, openExportDb, type ReadDoc } from './bounded-reader.js';
import { toPlain, type Plain } from './export-redaction.js';
import { OWNED_ELSEWHERE } from './user-records-owned-elsewhere.js';

export { ExportBudget, ExportLimitError, EXPORT_BUDGET_LIMITS } from './bounded-reader.js';

/** Collections whose {uid} document, and the stores under it, belong to that person */
export const USER_RECORD_ROOTS = ['bogle_users', 'users'] as const;

/**
 * The stores exported, by name: an ALLOWLIST, so a store nobody has reviewed (a new
 * credential, a session table) never leaves in a file people share. Names come from a
 * read-only listing of prod on 2026-10-12 (bogle_users: 83 names over 2,783 records;
 * users: 18 over 659). A names-only listing on 2026-10-18 of real owners' records
 * (no test, eval or anon: ids) found 10 more: 8 exported, 2 withheld. A new store
 * is exported only once it's added here.
 */
export const EXPORTED_STORES: Readonly<Record<string, readonly string[]>> = {
  bogle_users: [
    'alarms',
    'analytics',
    'behavioral_intelligence',
    // legacy: no writer since memory v2 C5a; old docs are still exported
    'bth_signals',
    'coaching_intelligence',
    'commitments',
    'communication_style',
    'concierge_requests',
    'contacts',
    'conversation_threads',
    'conversations',
    'corrections',
    'custom_agents',
    'decision_points',
    'deep_understanding',
    'dynamic_entities',
    'dynamic_facts',
    'dynamic_relationships',
    'emotional_arcs',
    'energy_readings',
    // facts the person told, written by the memory tools (memory-executor.ts,
    // legacy-fallback-executor.ts) and erased by forget.ts; not in the 2026-10 listings (#2366)
    'extracted_facts',
    // bi-temporal facts about people: ids, subjects, values, validity (facts-store.ts)
    'facts',
    'ferni_commitments',
    'follow_through',
    // legacy: no writer since memory v2 C5a; old docs are still exported
    'follow_up_actions',
    'future_self_letters',
    'human_memory',
    'human_signals',
    'humanization',
    'humor_history',
    'implicit_preferences',
    'journal',
    'learnings',
    'memories',
    'memory_capsules',
    'memory_highlights',
    'memory_protection',
    'memory_state',
    'mind_model',
    'monetization_tips',
    'monetization_value_capture',
    'motivational_interviewing',
    'move_outcomes',
    'music_learning',
    'on_behalf_calls',
    'onboarding_arc',
    'open_loops',
    'outreach_attempts',
    'outreach_history',
    'persona_affinities',
    // legacy: no writer since memory v2 C5a; old docs are still exported
    'persona_interactions',
    'persona_life_updates',
    'persona_told',
    'personality_profiles',
    'personality_resonance',
    'planning_coordination',
    'predictive_ml',
    'preferences',
    'proactive_insights',
    'promoted_entities',
    'reading_between_lines',
    'relational_nodes',
    'relationship_arc',
    'relationship_network',
    'relationship_nodes',
    'relationships',
    'reminders',
    'sabotage_patterns',
    'saved_rituals',
    'scheduled_calls',
    'self_awareness',
    'semantic_correlations',
    'semantic_intelligence',
    'semantic_threads',
    'shared_moments',
    'summaries',
    'surfacing_events',
    'team',
    'team_engagement',
    'team_insights',
    'temporal_snapshots',
    'topic_patterns',
    'trust',
    // legacy: no writer since memory v2 C5a; old docs are still exported
    'trust_moments',
    'trust_profiles',
    'utility_preferences',
    'voice_sessions',
    'wellbeing_profile',
    'wellbeing_snapshots',
    'world_facts',
  ],
  users: [
    'blockers',
    'burnout_patterns',
    'calendar_events',
    'decisions',
    'energy',
    'focus_sessions',
    'goals',
    'gratitude',
    'ideas',
    'journal',
    'life_automation',
    'maya_gamification',
    'notifications',
    'practices',
    'priorities',
    'relationships',
    'shared_memories',
    'wins',
  ],
  user_seeds: ['entries'],
  engagement_profiles: [
    'conversation_sessions',
    'predictions',
    'ritual_streaks',
    'weather_history',
  ],
  households: [],
  semantic_routing_corrections: ['corrections'],
};

/** Stores that exist under a person's record and are withheld on purpose, with why */
export const WITHHELD_STORES: Readonly<Record<string, string>> = {
  push_subscriptions: 'web-push endpoint and keys: whoever holds them can push to the device',
  google_calendar_tokens: 'OAuth refresh token',
  voice_profile: 'the voiceprint that recognizes the caller, an authenticator',
  pending_messages: 'in-flight send-on-behalf queue, holds approval links',
  outreach_context: 'scheduler state rebuilt from outreach_attempts',
  active_context: 'per-call scratch state, rebuilt every call',
  background_results: 'job results already delivered into conversations',
  extraction_history: 'pipeline bookkeeping (which turns were processed)',
  insights_cache: 'cache rebuilt from the stores above',
  deferred_calls: 'in-flight call queue: a held-back call waits here until its hour',
  system: 'pipeline bookkeeping (when memory maintenance last ran)',
};

/**
 * Stores kept in one partition per day, read in every partition by the owner field.
 * semantic_router_events/{YYYY-MM-DD}/events: which tool the router picked for each of the
 * person's turns, how sure it was and how long it took, never the words (routing-analytics.ts).
 */
export const PARTITIONED_STORES = [
  { collection: 'semantic_router_events', sub: 'events', field: 'userId' },
] as const;

/**
 * Stores a menu panel reads or the voice agent writes (menu audit 2026-10-12). The
 * export must carry each one; menu-export.emulator.test.ts fails when it doesn't.
 */
export const KNOWN_USER_STORES: readonly string[] = [
  'bogle_users/{uid}/conversations', // every call (When We've Talked shows only web calls)
  'bogle_users/{uid}/summaries', // call summaries (This Year Together)
  'bogle_users/{uid}/outreach_attempts', // When I'll Reach Out
  'bogle_users/{uid}/relationship_arc', // Our Story So Far
  'bogle_users/{uid}/emotional_arcs',
  'bogle_users/{uid}/trust_profiles', // Trust & Growth (the category exports only counts)
  'bogle_users/{uid}/memory_highlights', // Memory Lane
  'bogle_users/{uid}/saved_rituals', // Build a Ritual
  'bogle_users/{uid}/journal',
  'bogle_users/{uid}/team_insights', // Team Insights
  'bogle_users/{uid}/wellbeing_snapshots', // How You're Feeling
  'bogle_users/{uid}/mind_model', // what Ferni understands about them (THEORY_OF_MIND)
  'bogle_users/{uid}/facts', // bi-temporal facts (MEMORY_FACTS)
  'users/{uid}/calendar_events', // What's Ahead
  'users/{uid}/life_automation', // What I Do For You
  'users/{uid}/shared_memories',
  'users/{uid}/journal',
  'users/{uid}/practices',
  'user_seeds/{uid}',
  'engagement_profiles/{uid}',
  'contact_relationships',
];

/**
 * Top-level fields a store keeps although the secret filter drops their name, because
 * there they are the person's data, not a credential (#2336). Only at a document's top
 * level, only where listed, and only under the exact name (Key or KEY is still dropped):
 * the same name nested in a value, or a `key` in any other store, is still dropped, and a
 * kept field holding a credential-looking value is too.
 *
 * - key, in dynamic_facts: the fact's attribute ("Biscuit | breed = golden retriever").
 *
 * Session references (sessionId, sessionIds, firstSessionId, ...) need no entry: the
 * secret filter no longer drops them anywhere (#2366).
 */
export const KEPT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'bogle_users/{uid}/dynamic_facts': ['key'],
};

/**
 * Top-level fields that are maps keyed by the person's or the model's own words, so a short
 * key like "pin", "code" or "access" there is data (#2366). A credential's name (bankToken,
 * apiKey) is still dropped there, and the values still go through the value filter.
 *
 * The profile docs (bogle_users/{uid}, users/{uid}) are exported whole, filtered by name and
 * value, not projected to a field allowlist: UserProfile has ~600 fields and hundreds of
 * writers, too many to list here (#2366).
 *
 * - attributes, in dynamic_entities: whatever the model heard about the person or thing
 *   ({role: 'manager', pin: 'the blue one'}), written by deep-extraction-worker.ts.
 */
export const DATA_MAPS: Readonly<Record<string, readonly string[]>> = {
  'bogle_users/{uid}/dynamic_entities': ['attributes'],
};

function pick(data: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
}

/** A store to read: one document, or a collection (optionally owner-filtered and projected) */
type Store =
  | { label: string; kind: 'doc'; path: string }
  | {
      label: string;
      kind: 'collection';
      path: string;
      where?: { field: string; equals: string };
      fields?: readonly string[];
    };

/**
 * Every store exported for the person, as paths. Each is theirs by construction: their own
 * {uid} document and its allowlisted subcollections, or an owner-field query on their uid.
 */
function storesFor(userId: string, linkedIds: readonly string[]): Store[] {
  const stores: Store[] = [];
  const tree = (root: string): void => {
    stores.push({ label: `${root}/{uid}`, kind: 'doc', path: `${root}/${userId}` });
    for (const sub of EXPORTED_STORES[root] ?? []) {
      stores.push({
        label: `${root}/{uid}/${sub}`,
        kind: 'collection',
        path: `${root}/${userId}/${sub}`,
      });
    }
  };
  for (const root of USER_RECORD_ROOTS) tree(root);
  for (const store of OWNED_ELSEWHERE) {
    if ('doc' in store) tree(store.collection);
    else {
      // Rows of one store share its label, whichever of the person's ids they name
      for (const owner of store.linked ? [userId, ...linkedIds] : [userId]) {
        stores.push({
          label: store.collection,
          kind: 'collection',
          path: store.collection,
          where: { field: store.field, equals: owner },
          fields: store.fields,
        });
      }
    }
  }
  return stores;
}

/** The phone profiles proven to be the person, as erasure finds them (read-only; throws as it does) */
async function linkedIdsFor(db: FirebaseFirestore.Firestore, userId: string): Promise<string[]> {
  const { gatherErasureKeys } = await import('./erasure-keys.js');
  return (await gatherErasureKeys(db, userId)).linkedUserIds;
}

/**
 * The partitions holding the person's documents, one store each under one label. The days
 * are listed, then all counted at once: reading every day in turn could outlast the deadline.
 */
async function partitionStores(reader: BoundedReader, userId: string): Promise<Store[]> {
  const perStore = await Promise.all(
    PARTITIONED_STORES.map(async (p) => {
      const where = { field: p.field, equals: userId };
      const paths = (await reader.listDocIds(p.collection)).map(
        (d) => `${p.collection}/${d}/${p.sub}`
      );
      const counts = await Promise.all(
        paths.map(async (path) => reader.countCollection(path, { where }))
      );
      const label = `${p.collection}/*/${p.sub}`;
      return paths
        .filter((_, i) => (counts[i] ?? 0) > 0)
        .map((path): Store => ({ label, kind: 'collection', path, where }));
    })
  );
  return perStore.flat();
}

/**
 * Every record kept for this person, as stored. Keys are store paths
 * ("users/{uid}/calendar_events"), values the documents with their ids. All reads go
 * through one BoundedReader on the request's budget and stop at its first limit.
 */
export async function exportUserRecords(
  userId: string,
  budget: ExportBudget = new ExportBudget(),
  firestore?: FirebaseFirestore.Firestore,
  onPage?: (label: string, docs: number) => void
): Promise<Record<string, Plain>> {
  const db = await openExportDb(userId, firestore);
  const reader = new BoundedReader(budget, db);
  const linked = await linkedIdsFor(db, userId);
  const plain = (store: Store, doc: ReadDoc): Plain => {
    const fields = store.kind === 'collection' ? store.fields : undefined;
    const data = fields ? pick(doc.data, fields) : doc.data;
    return toPlain(data, budget, KEPT_FIELDS[store.label], DATA_MAPS[store.label]);
  };
  const out: Record<string, Plain> = {};
  for (const store of [...storesFor(userId, linked), ...(await partitionStores(reader, userId))]) {
    if (store.kind === 'doc') {
      const doc = await reader.readDoc(store.path);
      if (doc) out[store.label] = plain(store, doc);
      continue;
    }
    const docs = await reader.readCollection(store.path, {
      where: store.where,
      onPage: (n) => onPage?.(store.label, n),
    });
    const rows = docs.map((d) => ({
      id: d.id,
      ...(plain(store, d) as Record<string, Plain>),
    }));
    // A partitioned store's days share one label
    const earlier = out[store.label];
    if (rows.length > 0) out[store.label] = [...(Array.isArray(earlier) ? earlier : []), ...rows];
  }
  return out;
}

/** How many documents the export would hold, for the category list (counts, no doc reads) */
export async function countUserRecords(
  userId: string,
  budget: ExportBudget = new ExportBudget(),
  firestore?: FirebaseFirestore.Firestore
): Promise<number> {
  const db = await openExportDb(userId, firestore);
  const reader = new BoundedReader(budget, db);
  const linked = await linkedIdsFor(db, userId);
  let count = 0;
  for (const store of [...storesFor(userId, linked), ...(await partitionStores(reader, userId))]) {
    if (store.kind === 'doc') count += (await reader.docExists(store.path)) ? 1 : 0;
    else count += await reader.countCollection(store.path, { where: store.where });
  }
  return count;
}
