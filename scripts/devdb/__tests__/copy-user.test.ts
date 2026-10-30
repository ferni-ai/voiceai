/**
 * copy-user.ts guards, without Firestore I/O: which uids and which databases it
 * refuses, and the reviewed list of what it copies. The copy itself is proven
 * against the emulator in copy-user.emulator.test.ts.
 */
import type { Firestore } from '@google-cloud/firestore';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  EXPORTED_STORES,
  WITHHELD_STORES,
} from '../../../src/services/platform/user-records-export.js';
import { ERASED_STORES, storeLabel } from '../../../src/services/platform/user-stores.js';
import { PROFILE_TOKEN_FIELDS } from '../../../src/utils/token-at-rest.js';
import {
  assertDatabases,
  COPIED_STORES,
  COPIED_SUBCOLLECTIONS,
  copiedSubcollection,
  copyUser,
  EXCLUDED_STORES,
  excludedSubcollection,
  NOT_COPIED_SUBCOLLECTIONS,
  uidRefusal,
} from '../copy-user.js';
import { userRecordSubcollections } from './user-record-writers.js';

// The secret filter (export-redaction.ts) checks values against the real Firestore classes;
// the shared unit setup fakes that module
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));

const REAL = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1w'; // the shape of a Firebase uid, nobody's
// Only databaseId is read before refusing; the unit setup mocks the real client
const db = (databaseId: string) => ({ databaseId }) as unknown as Firestore;

describe('uidRefusal', () => {
  it('takes exactly one real-looking uid', () => {
    expect(uidRefusal([REAL])).toBeNull();
    expect(uidRefusal([])).toMatch(/exactly one/);
    expect(uidRefusal([REAL, REAL])).toMatch(/exactly one/);
  });

  it.each([
    'voice-eval-story-20261021-ab12',
    'e2e-user-1',
    'test-user-dev',
    'AbcTestUserAbcdefghijklmnop',
    'device:cli-1729',
    'anon:abc',
    'phone:+15551234567',
    'anonymous',
    '',
  ])('refuses %j', (uid) => {
    expect(uidRefusal([uid])).not.toBeNull();
  });
});

describe('assertDatabases', () => {
  it('passes only (default) -> ferni-dev', () => {
    expect(() => assertDatabases(db('(default)'), db('ferni-dev'))).not.toThrow();
  });

  it.each([
    ['(default)', '(default)'],
    ['ferni-dev', 'ferni-dev'],
    ['ferni-dev', '(default)'],
    ['(default)', 'ferni-db'],
  ])('refuses %s -> %s', (from, to) => {
    expect(() => assertDatabases(db(from), db(to))).toThrow(/refusing/);
  });

  it('copyUser refuses a wrong destination before reading anything', async () => {
    await expect(
      copyUser({ source: db('(default)'), dest: db('(default)'), uids: [REAL], apply: true })
    ).rejects.toThrow(/refusing/);
  });
});

describe('what is copied', () => {
  const labels = ERASED_STORES.map(storeLabel);

  it('every exclusion names a store in the erasure catalog (no typos)', () => {
    for (const label of Object.keys(EXCLUDED_STORES)) expect(labels).toContain(label);
  });

  it('copies none of the excluded stores, phone_mappings first among them', () => {
    const copied = COPIED_STORES.map(storeLabel);
    expect(copied).not.toContain('phone_mappings[userId]');
    expect(copied).not.toContain('consent[grants.{uid}]'); // a contact's record, not the person's
    for (const label of Object.keys(EXCLUDED_STORES)) expect(copied).not.toContain(label);
    expect(copied.length + Object.keys(EXCLUDED_STORES).length).toBe(labels.length);
  });

  it('excludes scheduling, credential, queue and other-people names, but not ferni_commitments', () => {
    for (const name of [
      'reminders',
      'recurring_reminders',
      'outreach_attempts',
      'outreach_x',
      'contacts',
      'push_subscriptions',
      'google_calendar_tokens',
      'on_behalf_calls',
      'deferred_calls',
      'voice_profile',
      // collections of EXCLUDED_STORES entries, wherever they appear
      'phone_mappings',
      'oura_tokens',
      'pending_actions',
      'sponsored_identities',
      'family_messages',
    ]) {
      expect(excludedSubcollection(name)).toBe(true);
    }
    for (const name of ['ferni_commitments', 'memories', 'entities', 'conversations']) {
      expect(excludedSubcollection(name)).toBe(false);
    }
    const copied = COPIED_STORES.map(storeLabel);
    expect(copied.filter((l) => l.startsWith('outreach_'))).toEqual([]);
    expect(copied).toContain('feature_flag_overrides/{uid}');
  });

  it('pins the copied list, so a store added to the catalog is reviewed here', () => {
    expect(COPIED_STORES.map(storeLabel)).toMatchInlineSnapshot(`
      [
        "bogle_users/{uid}",
        "users/{uid}",
        "user_seeds/{uid}",
        "engagement_profiles/{uid}",
        "unified_user_models/{uid}",
        "superhuman_intelligence/{uid}",
        "user_builder_preferences/{uid}",
        "user_listening_baselines/{uid}",
        "user_tool_profiles/{uid}",
        "user_preferences/{uid}",
        "emotional_history/{uid}",
        "memory_intelligence_profiles/{uid}",
        "coaching_profiles/{uid}",
        "ant_patterns/{uid}",
        "ant_entries/{uid}",
        "creative_dna/{uid}",
        "topic_history/{uid}",
        "crisis_signals/{uid}",
        "cameo_preferences/{uid}",
        "cameo_engagements/{uid}",
        "voice_memories/{uid}",
        "knowledge_graph/{uid}",
        "entity_store/{uid}",
        "emotional_data/{uid}",
        "emotional_patterns/{uid}",
        "growth_moments/{uid}",
        "user_gifts/{uid}",
        "profiles/{uid}",
        "feature_flag_overrides/{uid}",
        "minor_care_holds/{uid}",
        "semantic_routing_vocabulary/{uid}",
        "semantic_routing_corrections/{uid}",
        "apple_health_status/{uid}",
        "apple_health_data/{uid}",
        "analytics_users/{uid}",
        "story_journeys/{uid}",
        "user_gardens/{uid}",
        "user_sleep_patterns/{uid}",
        "user_streak_rewards/{uid}",
        "twin_profiles/{uid}",
        "maya_leaderboards/weekly/entries/{uid}",
        "maya_leaderboards/monthly/entries/{uid}",
        "maya_leaderboards/all_time/entries/{uid}",
        "entities[userId]",
        "entity_mentions[userId]",
        "entity_correlations[userId]",
        "correlation_observations[userId]",
        "userPatterns[userId]",
        "memory_intelligence_records[userId]",
        "creative_insights[userId]",
        "watch_history[userId]",
        "learning_journey_progress[userId]",
        "crisis_events[userId]",
        "delivery_order_history[userId]",
        "user_habits[userId]",
        "habit_completions[userId]",
        "coaching_sessions[userId]",
        "roleplay_sessions[userId]",
        "task_sessions[userId]",
        "deployed-sites[userId]",
        "shareable_cards[userId]",
        "user_milestones[userId]",
        "feature_votes[userId]",
        "roadmap_suggestions[userId]",
        "voice_conversations[userId]",
        "marketplace_installations[userId]",
        "trust_analytics[userId]",
        "routing_events[userId]",
        "semantic_router_corrections[userId]",
        "semantic_routing_feedback[userId]",
        "game_analytics_events[userId]",
        "bth_production_events[userId]",
        "feature_checkins[userId]",
        "relationship_memories[userId]",
        "answer_cards[userId]",
        "share_links[ownerId]",
        "analytics_sessions[odId]",
        "context_injection_outcomes[injection.userId]",
        "vectors[metadata.userId]",
        "memory_vectors[metadata.userId]",
        "reply_reports[uid]",
        "reply_report_quota/{uid}",
        "call_felt_off[uid]",
        "call_felt_off_quota/{uid}",
      ]
    `);
  });
});

/** The credential stores of the 2026-10-30 audit: each held 0 docs then, none may be copied */
const CREDENTIAL_STORES = [
  'smart_home',
  'plaid_tokens',
  'spotify_links',
  'gmail_send_tokens',
  'wearable_whoop_tokens',
  'wearable_oura_tokens',
  'social_tokens',
  'oauth_tokens',
  'calendar_providers',
  'webhooks',
  'siri_tokens',
  'passkeys',
  'google_calendar_tokens',
  'push_subscriptions',
];

describe('subcollections under a user record: an allowlist', () => {
  const repo = fileURLToPath(new URL('../../..', import.meta.url));

  it('every name the code writes under bogle_users/{uid} or users/{uid} is classified', () => {
    const written = userRecordSubcollections(repo);
    // the reader is not vacuous: it finds memories, a token store and a smart-home store
    for (const name of [
      'memories',
      'plaid_tokens',
      'gmail_send_tokens',
      'smart_home',
      'passkeys',
    ]) {
      expect(written.has(name), name).toBe(true);
    }
    expect(written.size).toBeGreaterThan(300);
    // plus every name prod held when the export allowlist was reviewed
    const names = new Set([
      ...written.keys(),
      ...(EXPORTED_STORES.bogle_users ?? []),
      ...(EXPORTED_STORES.users ?? []),
      ...Object.keys(WITHHELD_STORES),
    ]);
    const unclassified = [...names].filter(
      (n) =>
        !COPIED_SUBCOLLECTIONS.has(n) &&
        !excludedSubcollection(n) &&
        !Object.hasOwn(NOT_COPIED_SUBCOLLECTIONS, n)
    );
    // a new name: add it to COPIED_SUBCOLLECTIONS, or exclude it with a reason
    expect(unclassified.map((n) => `${n} (${written.get(n) ?? 'prod listing'})`)).toEqual([]);
  }, 60_000);

  it('never allowlists a credential, an exclusion or a held-back name', () => {
    for (const name of COPIED_SUBCOLLECTIONS) {
      expect(excludedSubcollection(name), name).toBe(false);
      expect(Object.hasOwn(NOT_COPIED_SUBCOLLECTIONS, name), name).toBe(false);
    }
    for (const name of CREDENTIAL_STORES) {
      expect(COPIED_SUBCOLLECTIONS.has(name), name).toBe(false);
      expect(copiedSubcollection(name, true), name).toBe(false);
      expect(copiedSubcollection(name, false), name).toBe(false);
    }
  });

  it('copies an allowlisted name, and nothing unlisted, under a user record', () => {
    expect(copiedSubcollection('memories', true)).toBe(true);
    expect(copiedSubcollection('a_store_nobody_reviewed', true)).toBe(false);
    // elsewhere (entity_store/{uid}/entities) only the exclusions apply
    expect(copiedSubcollection('a_store_nobody_reviewed', false)).toBe(true);
    expect(copiedSubcollection('history', false)).toBe(true); // cameo_engagements keeps one
  });
});

/** Just enough of Firestore for copyUser, kept in a Map of document paths */
class FakeDb {
  readonly docs = new Map<string, Record<string, unknown>>();
  constructor(readonly databaseId: string) {}
  private children(path: string): string[] {
    const ids = [...this.docs.keys()]
      .filter((p) => p.startsWith(`${path}/`))
      .map((p) => p.slice(path.length + 1).split('/')[0] ?? '');
    return [...new Set(ids)];
  }
  doc(path: string) {
    return {
      path,
      listCollections: async () =>
        this.children(path).map((id) => this.collection(`${path}/${id}`)),
    };
  }
  collection(path: string) {
    return {
      id: path.split('/').pop(),
      doc: (id: string) => this.doc(`${path}/${id}`),
      listDocuments: async () => this.children(path).map((id) => this.doc(`${path}/${id}`)),
      // where(field, '==', value): the direct documents whose (dotted) field holds value
      where: (field: string, _op: string, value: unknown) => ({
        select: () => ({
          get: async () => ({
            docs: this.children(path)
              .map((id) => `${path}/${id}`)
              .filter((p) => {
                let v: unknown = this.docs.get(p);
                for (const key of field.split('.')) v = (v as Record<string, unknown>)?.[key];
                return v === value;
              })
              .map((p) => ({ ref: this.doc(p) })),
          }),
        }),
      }),
    };
  }
  async getAll(...refs: Array<{ path: string }>) {
    return refs.map((ref) => {
      const data = this.docs.get(ref.path);
      return { exists: data !== undefined, data: () => data, ref };
    });
  }
  batch() {
    const sets: Array<[string, Record<string, unknown>]> = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        void sets.push([ref.path, data]),
      commit: async () => sets.forEach(([path, data]) => this.docs.set(path, data)),
    };
  }
}

describe('copyUser leaves credentials behind (fake Firestore)', () => {
  it('copies allowlisted data, not credential stores, unlisted stores or token fields', async () => {
    const source = new FakeDb('(default)');
    const dest = new FakeDb('ferni-dev');
    const seed: Record<string, Record<string, unknown>> = {
      [`bogle_users/${REAL}`]: {
        name: 'me',
        linkedInTokens: { access_token: 'x' },
        biometricTokens: { t: 'y' },
      },
      [`bogle_users/${REAL}/memories/m1`]: { text: 'mine' },
      [`bogle_users/${REAL}/memories/m1/webhooks/w`]: { url: 'https://hook.invalid/s3cret' },
      [`bogle_users/${REAL}/memories/m1/a_store_nobody_reviewed/x`]: { v: 1 },
      [`bogle_users/${REAL}/smart_home/hue`]: { bridgeKey: 'k' },
      [`bogle_users/${REAL}/plaid_tokens/data`]: { encrypted: 'e' },
      [`bogle_users/${REAL}/wearable_whoop_tokens/data`]: { encrypted: 'e' },
      [`bogle_users/${REAL}/a_store_nobody_reviewed/x`]: { v: 1 },
      [`users/${REAL}/journal/j1`]: { entry: 'mine' },
      [`users/${REAL}/oauth_tokens/microsoft`]: { encrypted: 'e' },
      [`users/${REAL}/calendar_providers/outlook`]: { refreshToken: 'r' },
      [`users/${REAL}/passkeys/p1`]: { publicKey: 'pk' },
      [`entity_store/${REAL}/entities/e1`]: { name: 'mine' },
    };
    for (const [path, data] of Object.entries(seed)) source.docs.set(path, data);
    const db = (fake: FakeDb) => fake as unknown as Firestore;

    const counts = await copyUser({
      source: db(source),
      dest: db(dest),
      uids: [REAL],
      apply: true,
    });

    expect([...dest.docs.keys()].sort()).toEqual(
      [
        `bogle_users/${REAL}`,
        `bogle_users/${REAL}/memories/m1`,
        `entity_store/${REAL}/entities/e1`,
        `users/${REAL}/journal/j1`,
      ].sort()
    );
    expect(dest.docs.get(`bogle_users/${REAL}`)).toEqual({ name: 'me' });
    for (const field of PROFILE_TOKEN_FIELDS) {
      expect(source.docs.get(`bogle_users/${REAL}`)).toHaveProperty(field); // the source keeps it
    }
    expect(counts['bogle_users/{uid}']).toEqual({ found: 2, copied: 2, skipped: 0 });
  });
});

/** Seed a fake prod, copy REAL into a fake dev, return dev's documents */
async function copyInto(
  seed: Record<string, Record<string, unknown>>
): Promise<Map<string, Record<string, unknown>>> {
  const source = new FakeDb('(default)');
  const dest = new FakeDb('ferni-dev');
  for (const [path, data] of Object.entries(seed)) source.docs.set(path, data);
  const db = (fake: FakeDb) => fake as unknown as Firestore;
  await copyUser({ source: db(source), dest: db(dest), uids: [REAL], apply: true });
  return dest.docs;
}

/** Subcollections holding other people's emails, phones or words (round-2 review) */
const THIRD_PARTY = [
  'meeting_interactions',
  'meeting_commitments',
  'email_intelligence',
  'calendar_events',
  'event_planning',
  'calendar_conflicts',
  'meeting_outcomes',
  'background_results',
  'custom_agents',
  'conflict_records',
  'ferni_actions',
  'concierge_requests',
  'special_dates',
  'unified_entities',
  'visual_memories',
  'tool_executions',
];

describe('other people stay in prod', () => {
  it.each(THIRD_PARTY)('%s is not copied, under either record or any document', async (name) => {
    expect(COPIED_SUBCOLLECTIONS.has(name)).toBe(false);
    expect(excludedSubcollection(name)).toBe(true);
    const docs = await copyInto({
      [`bogle_users/${REAL}`]: { name: 'me' },
      [`bogle_users/${REAL}/${name}/x`]: { personEmail: 'someone@example.invalid' },
      [`users/${REAL}/${name}/x`]: { attendees: ['someone@example.invalid'] },
      [`bogle_users/${REAL}/memories/m1/${name}/x`]: { phone: '+15550000009' },
      ['entities/mine1']: { userId: REAL },
      [`entities/mine1/${name}/x`]: { personName: 'Someone' },
    });
    expect([...docs.keys()].sort()).toEqual([`bogle_users/${REAL}`, 'entities/mine1']);
  });

  it.each(['local_calendar_events[userId]', 'ferni_actions[userId]', 'concierge_requests[userId]'])(
    'copies no %s store (attendees, people reached, businesses called)',
    (label) => {
      expect(COPIED_STORES.map(storeLabel)).not.toContain(label);
      expect(Object.keys(EXCLUDED_STORES)).toContain(label);
    }
  );

  it('copies no action_items: they sit under group_sessions, with participants', async () => {
    expect(COPIED_SUBCOLLECTIONS.has('action_items')).toBe(false);
    const docs = await copyInto({
      [`bogle_users/${REAL}/action_items/a1`]: { assignedTo: 'Someone', text: 'their words' },
    });
    expect([...docs.keys()]).toEqual([]);
  });
});

describe('a store found by an owner field', () => {
  it('copies its documents and subcollections, but no credential-named subcollection', async () => {
    const docs = await copyInto({
      ['entities/mine1']: { userId: REAL, name: 'mine' },
      ['entities/mine1/notes/n1']: { text: 'mine' },
      ['entities/mine1/plaid_tokens/data']: { encrypted: 'e' },
      ['entities/mine1/oauth_tokens/google']: { refresh: 'r' },
      ['entities/mine1/passkeys/p1']: { publicKey: 'pk' },
      ['entities/mine1/notes/n1/api_keys/k']: { value: 'k' },
      ['entities/theirs1']: { userId: 'Zy9xWv8uTs7rQp6oNm5lKj4iHg3f' },
    });
    expect([...docs.keys()].sort()).toEqual(['entities/mine1', 'entities/mine1/notes/n1']);
  });
});

describe('copied documents lose their secrets at every depth', () => {
  it('drops token fields, a workflow secretKey, sealed records and secret values', async () => {
    const docs = await copyInto({
      [`bogle_users/${REAL}`]: {
        name: 'me',
        fcmTokens: ['f1'],
        fcmToken: 'f',
        settings: { pushToken: 'p', theme: 'dark' },
      },
      [`bogle_users/${REAL}/life_automation/w1`]: {
        title: 'morning',
        steps: [
          { action: 'webhook', config: { url: 'https://hook.invalid', secretKey: 's' } },
          { action: 'note', config: '{"secretKey":"s","text":"hi"}' },
        ],
        linked: { encrypted: 'ciphertext' },
        header: 'Bearer abc.def',
        count: 3,
      },
    });
    expect(docs.get(`bogle_users/${REAL}`)).toEqual({ name: 'me', settings: { theme: 'dark' } });
    expect(docs.get(`bogle_users/${REAL}/life_automation/w1`)).toEqual({
      title: 'morning',
      steps: [
        { action: 'webhook', config: { url: 'https://hook.invalid' } },
        { action: 'note', config: '{"text":"hi"}' },
      ],
      count: 3,
    });
  });

  it("keeps the export's per-store exceptions: a fact's key, an entity's attributes", async () => {
    const docs = await copyInto({
      [`bogle_users/${REAL}/dynamic_facts/f1`]: { key: 'favorite_color', value: 'blue' },
      [`bogle_users/${REAL}/dynamic_entities/e1`]: {
        attributes: { pin: 'the blue one', apiKey: 'k' },
        key: 'dropped here',
      },
    });
    expect(docs.get(`bogle_users/${REAL}/dynamic_facts/f1`)).toEqual({
      key: 'favorite_color',
      value: 'blue',
    });
    expect(docs.get(`bogle_users/${REAL}/dynamic_entities/e1`)).toEqual({
      attributes: { pin: 'the blue one' },
    });
  });
});
