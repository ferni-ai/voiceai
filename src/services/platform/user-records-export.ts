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

import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { toPlain, type Plain } from './export-redaction.js';

/** Collections whose {uid} document, and the stores under it, belong to that person */
export const USER_RECORD_ROOTS = ['bogle_users', 'users'] as const;

/**
 * The stores exported, by name: an ALLOWLIST, so a store nobody has reviewed (a new
 * credential, a session table) never leaves in a file people share. Names come from a
 * read-only listing of prod on 2026-10-12 (bogle_users: 83 names over 2,783 records;
 * users: 18 over 659). A new store is exported only once it's added here.
 */
export const EXPORTED_STORES: Readonly<Record<string, readonly string[]>> = {
  bogle_users: [
    'alarms',
    'analytics',
    'behavioral_intelligence',
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
    'ferni_commitments',
    'follow_up_actions',
    'future_self_letters',
    'human_memory',
    'human_signals',
    'humanization',
    'humor_history',
    'journal',
    'memories',
    'memory_capsules',
    'memory_highlights',
    'memory_protection',
    'monetization_tips',
    'monetization_value_capture',
    'motivational_interviewing',
    'music_learning',
    'on_behalf_calls',
    'onboarding_arc',
    'open_loops',
    'outreach_attempts',
    'outreach_history',
    'persona_affinities',
    'persona_interactions',
    'persona_told',
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
};

/** Stores outside those records: a document keyed by the uid, or documents naming it */
export const OWNED_ELSEWHERE: ReadonlyArray<
  | { collection: string; doc: 'uid' }
  | { collection: string; field: string; fields?: readonly string[] }
> = [
  { collection: 'user_seeds', doc: 'uid' }, // seed balance and history (Seeds card)
  { collection: 'engagement_profiles', doc: 'uid' },
  { collection: 'households', doc: 'uid' },
  // People You've Told Me About: the person's own account of their people, from their calls
  // Its schema is known (ContactRelationship), so its fields are allowlisted too.
  {
    collection: 'contact_relationships',
    field: 'userId',
    fields: [
      'contactId',
      'name',
      'email',
      'phone',
      'relationship',
      'notes',
      'firstInteraction',
      'lastInteraction',
      'interactionCount',
      'strengthScore',
      'avgResponseTimeHours',
      'preferredChannel',
      'bestTimeToReach',
      'topics',
      'recentContext',
      'importantDates',
      'pendingFollowUp',
      'lastFollowUpDate',
      'createdAt',
      'updatedAt',
    ],
  },
  { collection: 'contact_interactions', field: 'userId' },
  // Family Phone Access: only what the sponsor entered (CreateSponsoredIdentityData). Not the
  // family member's own activity (calls, minutes, last call), voice enrollment, self-
  // registration, or familyUserId, the key to that person's own record.
  {
    collection: 'sponsored_identities',
    field: 'sponsorUserId',
    fields: [
      'displayName',
      'preferredName',
      'relationship',
      'phoneNumber',
      'accessLevel',
      'allowedPersonas',
      'notes',
      'status',
      'createdAt',
      'updatedAt',
    ],
  },
];

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
  'users/{uid}/calendar_events', // What's Ahead
  'users/{uid}/life_automation', // What I Do For You
  'users/{uid}/shared_memories',
  'users/{uid}/journal',
  'users/{uid}/practices',
  'user_seeds/{uid}',
  'engagement_profiles/{uid}',
  'contact_relationships',
];

type Db = FirebaseFirestore.Firestore;
function pick(data: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]]));
}

interface StoreReader {
  doc(label: string, ref: FirebaseFirestore.DocumentReference): Promise<void>;
  query(label: string, query: FirebaseFirestore.Query, fields?: readonly string[]): Promise<void>;
}

/**
 * Visit each exported store kept for the person. Every read is scoped to them: their
 * own {uid} document and its allowlisted subcollections, or a query on an owner field.
 */
async function eachStore(db: Db, userId: string, read: StoreReader): Promise<void> {
  const tree = async (root: string): Promise<void> => {
    const ref = db.collection(root).doc(userId);
    await read.doc(`${root}/{uid}`, ref);
    for (const sub of EXPORTED_STORES[root] ?? []) {
      await read.query(`${root}/{uid}/${sub}`, ref.collection(sub));
    }
  };
  for (const root of USER_RECORD_ROOTS) await tree(root);
  for (const store of OWNED_ELSEWHERE) {
    if ('doc' in store) await tree(store.collection);
    else {
      const owned = db.collection(store.collection).where(store.field, '==', userId);
      await read.query(store.collection, owned, store.fields);
    }
  }
}

/** Bounds on one export, so a big account (or a crafted one) can't exhaust the server */
export interface ExportLimits {
  /** Documents read per page; a store is read page by page, never at once */
  pageSize: number;
  /** Documents across the whole export */
  maxDocs: number;
  /** Bytes of JSON across the whole export */
  maxBytes: number;
  /** Wall time for the reads, inside the UI server's 30 s request limit */
  deadlineMs: number;
  /** Called after each page is read (tests count pages) */
  onPage?: (label: string, docs: number) => void;
}

export const EXPORT_LIMITS: ExportLimits = {
  pageSize: 500,
  maxDocs: 20_000,
  maxBytes: 20 * 1024 * 1024,
  deadlineMs: 20_000,
};

/** Exports running at once in this process; each holds up to maxBytes */
const MAX_CONCURRENT_EXPORTS = 3;
let exportsRunning = 0;

/**
 * An export stopped at a limit: too many documents or bytes (413: the person can pick
 * fewer categories or ask us for a copy), out of time, or too many running (503: later).
 */
export class ExportLimitError extends Error {
  constructor(readonly reason: 'docs' | 'bytes' | 'time' | 'busy') {
    super(`Export stopped at its ${reason} limit`);
    this.name = 'ExportLimitError';
  }

  get status(): 413 | 503 {
    return this.reason === 'docs' || this.reason === 'bytes' ? 413 : 503;
  }
}

/**
 * Every record kept for this person, as stored. Keys are store paths
 * ("users/{uid}/calendar_events"), values the documents with their ids. Reads go page by
 * page in document-id order and stop with ExportLimitError at the first limit crossed.
 */
export async function exportUserRecords(
  userId: string,
  firestore?: Db,
  limits: ExportLimits = EXPORT_LIMITS
): Promise<Record<string, Plain>> {
  const db = await openFor(userId, firestore);
  if (exportsRunning >= MAX_CONCURRENT_EXPORTS) throw new ExportLimitError('busy');
  exportsRunning += 1;
  try {
    return await readAll(db, userId, limits);
  } finally {
    exportsRunning -= 1;
  }
}

/** A read that gives up at the export's deadline instead of holding the request open */
async function beforeDeadline<T>(read: Promise<T>, deadline: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ExportLimitError('time')),
      Math.max(0, deadline - Date.now())
    );
  });
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function readAll(
  db: Db,
  userId: string,
  limits: ExportLimits
): Promise<Record<string, Plain>> {
  const out: Record<string, Plain> = {};
  const deadline = Date.now() + limits.deadlineMs;
  let docs = 0;
  let bytes = 0;
  const take = (value: Plain): Plain => {
    docs += 1;
    bytes += JSON.stringify(value).length;
    if (docs > limits.maxDocs) throw new ExportLimitError('docs');
    if (bytes > limits.maxBytes) throw new ExportLimitError('bytes');
    if (Date.now() > deadline) throw new ExportLimitError('time');
    return value;
  };
  await eachStore(db, userId, {
    doc: async (label, ref) => {
      const snap = await beforeDeadline(ref.get(), deadline);
      if (snap.exists) out[label] = take(toPlain(snap.data()));
    },
    query: async (label, query, fields) => {
      const rows: Plain[] = [];
      let page = query.orderBy(FieldPath.documentId()).limit(limits.pageSize);
      for (;;) {
        const snap = await beforeDeadline(page.get(), deadline);
        limits.onPage?.(label, snap.size);
        for (const d of snap.docs) {
          const data = toPlain(fields ? pick(d.data(), fields) : d.data()) as Record<string, Plain>;
          rows.push(take({ id: d.id, ...data }));
        }
        const last = snap.docs[snap.docs.length - 1];
        if (snap.size < limits.pageSize || !last) break;
        page = query.orderBy(FieldPath.documentId()).startAfter(last).limit(limits.pageSize);
      }
      if (rows.length > 0) out[label] = rows;
    },
  });
  return out;
}

/** How many documents the export would hold, for the category list (counts, no reads) */
export async function countUserRecords(userId: string, firestore?: Db): Promise<number> {
  let count = 0;
  await eachStore(await openFor(userId, firestore), userId, {
    doc: async (_label, ref) => {
      if ((await ref.get()).exists) count += 1;
    },
    query: async (_label, query) => {
      count += (await query.count().get()).data().count;
    },
  });
  return count;
}

/** The person's id checked (one document, no '/'), and the database to read */
async function openFor(userId: string, firestore?: Db): Promise<Db> {
  const { assertErasableUserId } = await import('./erase-user-record.js');
  assertErasableUserId(userId);
  if (firestore) return firestore;
  const { ensureFirebaseAdmin } = await import('../identity/firebase-auth.js');
  if (!ensureFirebaseAdmin()) throw new Error('Firebase Admin is not initialized');
  return getFirestore();
}
