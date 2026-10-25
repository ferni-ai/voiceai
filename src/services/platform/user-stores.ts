/**
 * Where a person's data is kept in Firestore: the one list that account deletion
 * (erase-user-record.ts) walks, and that the "take your story" export reads, so the
 * two can't drift. A store missing from here survives "delete my account".
 *
 * Measured on the emulator 2026-10-12: deletion erased only bogle_users/{uid}, so
 * users/{uid}/* (calendar, journal, routines, practices, shared memories), user_seeds
 * and contact_relationships all survived it. The stores outside the two records were
 * found by reading every top-level collection production code writes with a uid.
 *
 * Stores split into partitions (ab_tests/{test}/assignments, the router's
 * semantic_router_events/{day}/events) are listed in erase-other-keys.ts, which lists
 * the partitions first; the export reads the router's in user-records-export.ts.
 *
 * @module services/platform/user-stores
 */

/**
 * A document keyed by the uid (and everything under it), documents naming the uid, or
 * an entry keyed by the uid (`{mapKey}.{uid}`) inside a document that isn't the person's:
 * only that entry is theirs, so only it is erased.
 */
export type OwnedStore =
  | { collection: string; doc: 'uid' }
  | { collection: string; field: string }
  | { collection: string; mapKey: string };

/** Collections whose {uid} document, and everything under it, belongs to that person */
export const USER_RECORD_ROOTS = ['bogle_users', 'users'] as const;

const byId = (...collections: string[]): OwnedStore[] =>
  collections.map((collection) => ({ collection, doc: 'uid' as const }));
const byField = (field: string, ...collections: string[]): OwnedStore[] =>
  collections.map((collection) => ({ collection, field }));

/** Stores outside the two records that belong to the person: exported and erased */
export const OWNED_ELSEWHERE: readonly OwnedStore[] = [
  { collection: 'user_seeds', doc: 'uid' }, // seed balance and history (Seeds card)
  { collection: 'engagement_profiles', doc: 'uid' }, // the profile doc; its subcollections too
  { collection: 'households', doc: 'uid' },
  { collection: 'contact_relationships', field: 'userId' }, // People You've Told Me About
  { collection: 'contact_interactions', field: 'userId' },
  { collection: 'sponsored_identities', field: 'sponsorUserId' }, // Family Phone Access
  // Memory and intelligence kept by the voice agent, one document per person
  ...byId(
    'unified_user_models',
    'superhuman_intelligence',
    'user_builder_preferences',
    'user_listening_baselines',
    'user_tool_profiles',
    'user_preferences',
    'emotional_history',
    'memory_intelligence_profiles',
    'coaching_profiles',
    'ant_patterns',
    'ant_entries',
    'creative_dna',
    'topic_history',
    'crisis_signals',
    'cameo_preferences',
    'cameo_engagements',
    'voice_memories',
    'voice_profile_index',
    'knowledge_graph',
    'entity_store',
    'emotional_data',
    'emotional_patterns',
    'growth_moments',
    'user_gifts',
    'user_contacts',
    'profiles', // conversation and insight feedback, subcollections only
    'feature_flag_overrides', // flags turned on for this person alone (cohort-flags.ts)
    'minor_care_holds' // {heldUntil, v}: a call held them under 18 (minor-care-shared-hold.ts)
  ),
  // The app's per-person documents
  ...byId(
    'apple_health_status',
    'apple_health_data',
    'outreach_profiles',
    'outreach_context',
    'outreach_history',
    'analytics_users',
    'story_journeys',
    'user_gardens',
    'user_sleep_patterns',
    'user_streak_rewards',
    'twin_profiles',
    'maya_leaderboards/weekly/entries',
    'maya_leaderboards/monthly/entries',
    'maya_leaderboards/all_time/entries'
  ),
  // Documents with their own ids that name the person
  ...byField(
    'userId',
    'entities',
    'entity_mentions',
    'entity_correlations',
    'correlation_observations',
    'userPatterns',
    'memory_intelligence_records',
    'creative_insights',
    'watch_history',
    'learning_journey_progress',
    'crisis_events',
    'user_contacts',
    'contact_groups',
    'ferni_actions',
    'concierge_requests',
    'pending_actions',
    'tracked_appointments',
    'message_drafts',
    'delivery_orders',
    'delivery_order_history',
    'user_habits',
    'habit_completions',
    'coaching_sessions',
    'roleplay_sessions',
    'task_sessions',
    'deployed-sites',
    'shareable_cards',
    'user_milestones',
    'feature_votes',
    'roadmap_suggestions',
    'outreach_triggers',
    'outreach_history',
    'scheduled_deliveries',
    'pending_inapp_messages',
    'voice_conversations',
    'marketplace_installations',
    'trust_analytics',
    'routing_events',
    'game_analytics_events',
    'bth_production_events',
    'phone_mappings',
    'feature_checkins', // texts sent to the person, with their replies
    'intelligence_queue', // queued turn events holding the person's words (INTELLIGENCE_QUEUE)
    'relationship_memories' // {uid}_{persona}: shared moments and inside jokes, older agent
  ),
  ...byField('ownerId', 'share_links', 'share_invites', 'voice_households'),
  ...byField('toUserId', 'family_messages', 'family_shared_context'),
  ...byField('referrerId', 'voice_referrals'),
  ...byField('odId', 'analytics_sessions'),
  ...byField('firebaseUid', 'user_profiles'), // access grants; the email-keyed ones too (erase-other-keys)
  ...byField('injection.userId', 'context_injection_outcomes'),
  ...byField('text.userId', 'feature_held_texts'), // texts held for them (a Focus, quiet hours), with the text
  { collection: 'reply_reports', field: 'uid' }, // replies they reported, with their own words
  { collection: 'reply_report_quota', doc: 'uid' },
  // the sponsor's daily holder-verification text count; the same collection's phone_{hash}
  // docs are each number's own send record, uid-free, kept like a STOP (holder-send-ledger.ts)
  { collection: 'holder_verification_sends', doc: 'uid' },
];

/**
 * Sign-in credentials kept for the person: never exported (a live token in a file
 * people share), always erased. Credentials inside the two records go with them.
 */
export const CREDENTIAL_STORES: readonly OwnedStore[] = [
  ...byId(
    'apple_calendar_tokens',
    'apple_health_tokens',
    'ecobee_tokens',
    'ecobee_pending_auth',
    'eight_sleep_tokens',
    'oura_tokens',
    'verification_codes'
  ),
  ...byField('userId', 'developer_oauth_tokens'),
];

/**
 * The person's entries in other people's documents: erased, never exported or copied.
 * consent/{phoneHash} is a contact's own record, and their STOP stays after any erasure
 * so nobody texts them again; grants.{uid} is the consent they gave for this member
 * (messaging/consent-grants.ts), and asks.{uid} the member's open consent ask: both go
 * with the member, so a later YES can't grant a deleted account.
 */
export const ENTRIES_IN_OTHERS_DOCS: readonly OwnedStore[] = [
  { collection: 'consent', mapKey: 'grants' },
  { collection: 'consent', mapKey: 'asks' },
];

/** Every store account deletion must leave empty for the person */
export const ERASED_STORES: readonly OwnedStore[] = [
  ...USER_RECORD_ROOTS.flatMap((root) => byId(root)),
  ...OWNED_ELSEWHERE,
  ...CREDENTIAL_STORES,
  ...ENTRIES_IN_OTHERS_DOCS,
];

/** A store's label, with the uid written as {uid} ("users/{uid}", "entities[userId]", "consent[grants.{uid}]") */
export function storeLabel(store: OwnedStore): string {
  if ('doc' in store) return `${store.collection}/{uid}`;
  return `${store.collection}[${'field' in store ? store.field : `${store.mapKey}.{uid}`}]`;
}
