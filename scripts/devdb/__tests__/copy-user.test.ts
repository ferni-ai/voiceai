/**
 * copy-user.ts guards, without Firestore I/O: which uids and which databases it
 * refuses, and the reviewed list of what it copies. The copy itself is proven
 * against the emulator in copy-user.emulator.test.ts.
 */
import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';

import { ERASED_STORES, storeLabel } from '../../../src/services/platform/user-stores.js';
import {
  assertDatabases,
  COPIED_STORES,
  copyUser,
  EXCLUDED_STORES,
  excludedSubcollection,
  uidRefusal,
} from '../copy-user.js';

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
      'call_memories', // what people Ferni called said (CALLEE_MEMORY)
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
        "ferni_actions[userId]",
        "concierge_requests[userId]",
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
