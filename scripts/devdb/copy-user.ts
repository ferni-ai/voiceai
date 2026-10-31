#!/usr/bin/env tsx
/**
 * Copy ONE person's own records from prod (the '(default)' database) into the dev
 * database ('ferni-dev'), so dev knows that person. Nobody else's records are read
 * for copying, and nothing is ever written to '(default)'.
 *
 *   npx tsx scripts/devdb/copy-user.ts --uid <uid>                       # dry run: counts only
 *   npx tsx scripts/devdb/copy-user.ts --uid <uid> --apply               # copy what dev lacks
 *   npx tsx scripts/devdb/copy-user.ts --uid <uid> --apply --overwrite   # replace what dev has
 *
 * What is the person's: the account-erasure catalog (ERASED_STORES in
 * src/services/platform/user-stores.ts), the reviewed list "delete my account" must
 * leave empty, so every store in it holds only this person's documents. Minus the
 * stores in EXCLUDED_STORES and EXCLUDED_SUBCOLLECTIONS below, each with its reason.
 * A store added to that catalog later is copied too; copy-user.test.ts pins the list,
 * so the addition shows up in review. Under the person's two records, bogle_users/{uid}
 * and users/{uid}, only the subcollections in COPIED_SUBCOLLECTIONS are copied: a
 * store nobody has reviewed (a new credential) stays behind. Every copied document goes
 * through the export's secret filter (export-redaction.ts) at every depth: token fields
 * (linkedInTokens, fcmTokens, pushToken, a workflow's secretKey, ...), sealed token
 * records and credential-looking values are dropped.
 *
 * Each document is copied with its id, its subcollections at any depth and its field
 * types (Timestamps stay Timestamps), in batches of at most 500 writes. Documents dev
 * already has are skipped unless --overwrite. Output is counts per store, never a uid,
 * a name or a document's contents.
 *
 * Not copied: the phone profiles that are the same person (bogle_users/phone:{e164}).
 * They are keyed by a phone number, not this uid.
 */
import { DocumentReference, Firestore } from '@google-cloud/firestore';

import {
  ERASED_STORES,
  storeLabel,
  type OwnedStore,
} from '../../src/services/platform/user-stores.js';
import {
  isSecretDataMapKey,
  isSecretField,
  toPlain,
} from '../../src/services/platform/export-redaction.js';
import { DATA_MAPS, KEPT_FIELDS } from '../../src/services/platform/user-records-export.js';
import { isSyntheticUserId, namesNoAccount } from '../../src/utils/synthetic-user.js';

export const SOURCE_DATABASE = '(default)';
export const DEST_DATABASE = 'ferni-dev';
const BATCH_LIMIT = 500;
const PAGE = 300;

const CREDENTIAL = 'a live credential: dev could act on the real account or device';
const QUEUE = 'an in-flight queue: the dev worker would send or place it for real';
const SCHEDULING =
  'a scheduling store: a dev job runner reading it would text the person a second time';
const OTHERS = "other people's identifiers or words, not the person's own";
const DEVICE = 'a linked device or account (ids, webhook URLs, sync state): dev could act on it';

/** Stores in ERASED_STORES that are not copied (labels as storeLabel writes them). */
export const EXCLUDED_STORES: Readonly<Record<string, string>> = {
  'phone_mappings[userId]': 'phone-number -> uid lookup index: routes real calls and texts',
  'user_profiles[firebaseUid]': 'access grants keyed by email: an email -> uid lookup',
  'voice_profile_index/{uid}': 'voiceprint index, an authenticator',
  'apple_calendar_tokens/{uid}': CREDENTIAL,
  'apple_health_tokens/{uid}': CREDENTIAL,
  'ecobee_tokens/{uid}': CREDENTIAL,
  'ecobee_pending_auth/{uid}': CREDENTIAL,
  'eight_sleep_tokens/{uid}': CREDENTIAL,
  'google_calendar_tokens/{uid}': `${CREDENTIAL} (the old plaintext root copy)`,
  'oura_tokens/{uid}': CREDENTIAL,
  'verification_codes/{uid}': CREDENTIAL,
  'developer_oauth_tokens[userId]': CREDENTIAL,
  'pending_actions[userId]': QUEUE,
  'scheduled_deliveries[userId]': QUEUE,
  'pending_inapp_messages[userId]': QUEUE,
  'outreach_triggers[userId]': QUEUE,
  'feature_held_texts[text.userId]': `${QUEUE}; held texts carry their words`,
  'message_drafts[userId]': `${QUEUE}; drafts name their recipients`,
  'delivery_orders[userId]': QUEUE,
  'tracked_appointments[userId]': `${QUEUE} (appointment follow-ups)`,
  'intelligence_queue[userId]': QUEUE,
  'holder_verification_sends/{uid}': 'a send-rate counter: throttles dev verification texts',
  'outreach_profiles/{uid}': SCHEDULING,
  'outreach_context/{uid}': SCHEDULING,
  'outreach_history/{uid}': SCHEDULING,
  'outreach_history[userId]': SCHEDULING,
  'sponsored_identities[sponsorUserId]': `${OTHERS}: family members' names and phones`,
  'user_contacts/{uid}': `${OTHERS}: contacts`,
  'user_contacts[userId]': `${OTHERS}: contacts`,
  'contact_relationships[userId]': `${OTHERS}: contacts' phones and emails`,
  'contact_interactions[userId]': `${OTHERS}: contacts`,
  'contact_groups[userId]': `${OTHERS}: contacts`,
  'ferni_actions[userId]': `${OTHERS}: who Ferni was asked to reach (phone, email), tool args`,
  'concierge_requests[userId]': `${OTHERS}: businesses called for the person, with transcripts`,
  'feature_checkins[userId]': `${OTHERS}: texts sent for the person, with the recipient's phone and the callee's words`,
  'local_calendar_events[userId]': `${OTHERS}: events with attendees' email addresses`,
  'households/{uid}': `${OTHERS}: household members`,
  'voice_households[ownerId]': `${OTHERS}: household members' phones`,
  'share_invites[ownerId]': `${OTHERS}: invitees' emails`,
  'voice_referrals[referrerId]': `${OTHERS}: people referred`,
  'family_messages[toUserId]': `${OTHERS}: written by family members`,
  'family_shared_context[toUserId]': `${OTHERS}: shared by family members`,
  'consent[grants.{uid}]': `${OTHERS}: a contact's own consent record`,
  'consent[asks.{uid}]': `${OTHERS}: a contact's own consent record`,
};

/**
 * Subcollections skipped by name, at ANY depth: under a {uid} record, under a
 * document found by an owner field, and under anything below those.
 */
export const EXCLUDED_SUBCOLLECTIONS: Readonly<Record<string, string>> = {
  google_calendar_tokens: CREDENTIAL,
  outlook_tokens: CREDENTIAL, // OUTLOOK_CONNECT's sealed Microsoft grant
  push_subscriptions: CREDENTIAL,
  voice_profile: 'the voiceprint that recognizes the caller, an authenticator',
  pending_messages: QUEUE,
  deferred_calls: QUEUE,
  scheduled_calls: QUEUE,
  contacts: `${OTHERS}: contacts`,
  on_behalf_calls: `${OTHERS}: third parties' numbers and what they said`,
  activity: `${OTHERS}: the errand ledger keeps what the called person said (theySaid)`,
  reminders: SCHEDULING,
  outreach_attempts: SCHEDULING,
  outreach_history: SCHEDULING,
  // Credentials and integrations whose names hold no credential word (isSecretField
  // catches the rest), then the queues, schedules and other people's data found when
  // COPIED_SUBCOLLECTIONS was classified (2026-10-30)
  smart_home: `${CREDENTIAL} (Hue, LIFX, Sonos keys)`,
  spotify_links: CREDENTIAL,
  calendar_providers: `${CREDENTIAL} (Outlook tokens)`,
  homekit: DEVICE,
  devices: DEVICE,
  spotify_room_config: DEVICE,
  webhooks: DEVICE,
  outlook_subscriptions: DEVICE,
  google_watch_channels: DEVICE,
  apple_polling_state: DEVICE,
  pending_events: QUEUE,
  pending_rides: QUEUE,
  scheduled_actions: QUEUE,
  action_executions: QUEUE,
  errands: `${QUEUE} (its effects outbox)`,
  scheduled_outreach: SCHEDULING,
  milestone_outreach: SCHEDULING,
  goals_outreach: SCHEDULING,
  proactive_outreach_log: SCHEDULING,
  family_checkin_schedules: SCHEDULING,
  meeting_followup_tasks: SCHEDULING,
  family_checkin_calls: `${OTHERS}: family members' phones`,
  contact_notes: `${OTHERS}: contacts`,
  contact_timing: `${OTHERS}: contacts`,
  guest_profiles: `${OTHERS}: event guests`,
  guest_intelligence: `${OTHERS}: event guests`,
  message_history: `${OTHERS}: messages sent on the person's behalf, with recipients`,
  group_sessions: `${OTHERS}: group calls, with every participant's words`,
  // Other people's emails, phones and words found when the allowlist was re-read for them
  // (2026-10-30, #3144 round 2). Some have no live writer today; the shape their readers
  // expect holds other people's data, so documents already in prod would too. Dev has no
  // Google tokens, so a fresh sync, not a copy, is its calendar source.
  meeting_interactions: `${OTHERS}: meeting attendees' emails and their commitments`,
  meeting_commitments: `${OTHERS}: attendees' emails and names`,
  email_intelligence: `${OTHERS}: correspondent profiles keyed by email address`,
  calendar_events: `${OTHERS}: synced events with attendees' emails`,
  event_planning: `${OTHERS}: guest lists with emails, phones and dietary needs`,
  calendar_conflicts: `${OTHERS}: provider events with attendees' emails`,
  meeting_outcomes: `${OTHERS}: attendees' emails and their commitments`,
  background_results: `${OTHERS}: on-behalf call results with the callee's number and transcript`,
  custom_agents: `${OTHERS}: legacy and mentor agents model a real person's voice and sayings`,
  conflict_records: `${OTHERS}: what the other person said in a conflict (otherSaid)`,
  special_dates: `${OTHERS}: a contact's phone beside the date`,
  unified_entities: `${OTHERS}: people with their phones (contact.phone)`,
  visual_memories: `${OTHERS}: OCR of uploaded images (screenshots, cards, letters)`,
  tool_executions: `${OTHERS}: tool arguments and results (recipients, messages)`,
  semantic_intelligence: `${OTHERS}: execution_records keeps the raw args of the last 100 tool calls`,
};

/**
 * Names written under a user record that are left out of COPIED_SUBCOLLECTIONS but not
 * excluded everywhere: elsewhere the same name holds ordinary data (cameo_engagements
 * keeps a history). Each is written only below an excluded store.
 */
export const NOT_COPIED_SUBCOLLECTIONS: Readonly<Record<string, string>> = {
  list: `${DEVICE}: homekit/devices/list`,
  pending: `${QUEUE}: homekit/commands/pending, run on the real home`,
  history: `${DEVICE}: homekit/commands/history`,
  transcript: `${OTHERS}: group_sessions/{id}/transcript`,
  action_items: `${OTHERS}: group_sessions/{id}/action_items, assigned and said by participants`,
};

/**
 * A collection name excluded wherever it appears as a subcollection: the names above, the
 * collection of every EXCLUDED_STORES entry (credentials, queues, other people's data), any
 * reminders / *_reminders / outreach_* (SCHEDULING), and any name holding a credential word
 * (isSecretField: plaid_tokens, oauth_tokens, wearable_whoop_tokens, passkeys, ...).
 * ferni_commitments is kept: Ferni reads it in calls for follow-through and
 * nothing on dev delivers from it.
 */
const SCHEDULING_NAME = /^outreach_|(^|_)reminders$/;
const EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  ...Object.keys(EXCLUDED_SUBCOLLECTIONS),
  ...Object.keys(EXCLUDED_STORES).map((label) => label.replace(/(\/\{uid\}|\[[^\]]+\])$/, '')),
]);
export const excludedSubcollection = (name: string): boolean =>
  SCHEDULING_NAME.test(name) || EXCLUDED_NAMES.has(name) || isSecretField(name);

/** The person's two records: below them, a subcollection is copied only if allowlisted */
const USER_RECORDS: ReadonlySet<string> = new Set(['bogle_users', 'users']);

/**
 * The subcollections copied from under bogle_users/{uid} and users/{uid}, at any depth: an
 * ALLOWLIST, so a store nobody has classified is never copied. copy-user.test.ts reads the
 * code's writers and fails on a name that is in neither this list nor the exclusions.
 * Credentials and authenticators are never listed here.
 */
export const COPIED_SUBCOLLECTIONS: ReadonlySet<string> = new Set(
  `
  action_trust active_context active_predictions ai_notices alarms ambient
  analytics anomalies anticipatory_planning apology_records associative_memory audit_log
  behavioral_finance behavioral_intelligence behavioral_patterns
  behavioral_triggers biometric_readings blind_spots blockers booking_prefs briefings bth_feedback
  bth_signals burnout_patterns calendar calendar_data
  capacity career_data causal_timeseries celebration_balance celebration_momentum celebrations
  ceo_blockers ceo_decisions ceo_energy ceo_focus_sessions ceo_gratitude ceo_ideas ceo_journal
  ceo_priorities ceo_reflections ceo_weekly_reviews ceo_wins coach_media_picks
  coaching_intelligence cognitive_learning commitment_checkins commitment_devices commitments
  common_ground communication_debts communication_events communication_profiles
  communication_style conflict_history
  consolidated_memories contemplative_practices contradiction_comfort conversation_patterns
  conversation_plans conversation_scores conversation_summaries conversation_threads
  conversations corrections correlations counterfactual_patterns counterfactuals crisis_signals
  cross_persona_insights cyclical_patterns decision_points decision_scores
  decisions deep_understanding detected_milestones detected_patterns dreams dynamic_entities
  dynamic_facts dynamic_relationships embedding_intelligence
  emotion_vocabulary emotional_arcs emotional_patterns emotional_threads energy energy_data
  energy_interactions energy_readings engagement_events enough_statements entities
  event_history event_meanings event_pattern_memory event_patterns event_stories
  experimentation experiments external_data extracted_facts extraction_history facts
  favorite_places feedback ferni_commitments financial_data financial_goals
  financial_profile fire_progress focus_sessions follow_through follow_up_actions follow_ups
  friction_points future_letters future_self_letters gift_history goal_progress goals gratitude
  growth_activities growth_markers growth_milestones habit_autopsies habit_completions
  habit_dna habits handoff_preferences health_metrics health_summaries human_memory
  human_signals humanization humor_history ideas identity_statements implementation_intentions
  implicit_preferences important_dates info_preferences inside_jokes insight_tasks insights
  insights_cache intentionDays intents investment_theses items journal key_moments
  keystone_observations knowledge_graph knowledge_state learned_expressions learnings
  legacy_statements life_automation life_chapters life_coaching life_coaching_analytics
  life_events life_simulations life_synthesis life_theses life_trajectories
  lifestyle_preferences linguistic_profiles lists marketplace_installs maya_gamification
  maya_notifications memories
  memory_capsules memory_graph_edges memory_highlights memory_links memory_protection
  memory_state memory_systems meta milestone_detector milestones mind_model moments
  monetization_fund_contributions monetization_journey monetization_tips
  monetization_value_capture mood_calendar moods motivational_interviewing move_outcomes
  music_learning narrative network notes notifications nudge_engine onboarding_arc open_loops
  paradoxes pattern_mirror pattern_occurrences pattern_predictions patterns persona_affinities
  persona_bonds persona_interactions persona_life_updates persona_told personal_dates
  personality_profiles personality_resonance pets planning_coordination portfolio
  post_event_learning practice_sessions practices pre_briefings predicted_handoffs predictions
  predictive predictive_insights predictive_intelligence predictive_ml predictive_signals
  preferences priorities proactive_insights profile promoted_entities protective_boundaries
  quality_metrics quant_insights question_history reading_between_lines reading_list
  recovery_events reinforcement_messages relational_graph relational_nodes relationship_arc
  relationship_connections relationship_milestones relationship_network relationship_nodes
  relationship_temperatures relationships research_synthesis response_quality
  revelation_profile rides risk_events routing_preferences sabotage_patterns sanctuary_stats
  saved_rituals seasonal_observations seasonal_planning self_awareness self_perception_gaps
  semantic_correlations semantic_threads session_quality session_state
  session_summaries sessions setback_patterns settings shared_memories shared_moments
  silence_patterns silence_records social_events social_graph spontaneous_sharing
  style_profile summaries superhuman superhuman_alerts superhuman_cache superhuman_predictive
  superhuman_profiles surfaced_content surfacing_events system tasks team team_engagement
  team_insights temporal_snapshots tendency_signals timers timing_intelligence
  topic_patterns transition_signals trust trust_moments trust_profiles trust_signals turns
  unified_memories unsaid_topics unspoken_needs utility_preferences
  value_conflicts values voice_biomarkers voice_contexts voice_memos
  voice_prosody voice_sessions vulnerability_deposits vulnerability_tracking wellbeing
  wellbeing_profile wellbeing_snapshots wins wisdom_incubation wisdom_patterns world_facts
`
    .trim()
    .split(/\s+/)
);

/** Whether a subcollection is copied: never if excluded, and under a user record only if listed */
export const copiedSubcollection = (name: string, underUserRecord: boolean): boolean =>
  !excludedSubcollection(name) && (!underUserRecord || COPIED_SUBCOLLECTIONS.has(name));

/**
 * What is copied: the erasure catalog minus EXCLUDED_STORES. The semantic index (vectors,
 * memory_vectors) is copied: the person's own words, and dev recall searches it; the owner
 * query is the exact metadata.userId match, so nobody else's documents come along. Its
 * entries of the EXCLUDED_INDEX_TYPES (meeting_memory) are not copied.
 */
/**
 * Search-index entries (vectors, memory_vectors) left behind by type (metadata.entityType):
 * the index copy of a store that is itself excluded, carrying other people's data.
 */
export const EXCLUDED_INDEX_TYPES: Readonly<Record<string, string>> = {
  meeting_memory: `${OTHERS}: metadata.attendees holds attendees' emails (calendar-hooks.ts)`,
};

/** Whether a document is a search-index entry of an excluded type */
export function excludedIndexEntry(data: Record<string, unknown> | undefined): boolean {
  const type = (data?.metadata as { entityType?: unknown } | undefined)?.entityType;
  return typeof type === 'string' && Object.hasOwn(EXCLUDED_INDEX_TYPES, type);
}

export const COPIED_STORES: readonly OwnedStore[] = ERASED_STORES.filter(
  (s) => !Object.hasOwn(EXCLUDED_STORES, storeLabel(s))
);

/** Why this uid must not be copied, or null. One real Firebase uid only. */
export function uidRefusal(uids: readonly string[]): string | null {
  if (uids.length !== 1) return `exactly one --uid is required (got ${uids.length})`;
  const uid = uids[0] ?? '';
  if (isSyntheticUserId(uid) || namesNoAccount(uid) || /test/i.test(uid)) {
    return 'refusing a synthetic or test user';
  }
  // Firebase uids are alphanumeric; anything else is a phone profile, an anon: id or a typo
  if (!/^[A-Za-z0-9]{20,128}$/.test(uid)) return 'not a Firebase uid';
  return null;
}

/** Refuse unless reading from '(default)' and writing to 'ferni-dev', exactly. */
export function assertDatabases(source: Firestore, dest: Firestore): void {
  if (source.databaseId !== SOURCE_DATABASE || dest.databaseId !== DEST_DATABASE) {
    throw new Error(
      `refusing: copy reads ${SOURCE_DATABASE} and writes ${DEST_DATABASE} only ` +
        `(got ${source.databaseId} -> ${dest.databaseId})`
    );
  }
}

export interface StoreCount {
  found: number;
  copied: number;
  skipped: number;
}

const DROP = Symbol('drop');

/** Names a map's fields are judged by: see forDev() */
interface FieldNames {
  readonly keep: ReadonlySet<string>;
  readonly maps: ReadonlySet<string>;
  readonly dataMap?: boolean;
}
const NO_NAMES: FieldNames = { keep: new Set(), maps: new Set() };

/** The export's per-store exceptions for a document, by its collection path ({uid} for the uid) */
export function fieldNamesFor(path: string, uid: string): FieldNames {
  const label = path
    .split('/')
    .slice(0, -1)
    .map((seg) => (seg === uid ? '{uid}' : seg))
    .join('/');
  return { keep: new Set(KEPT_FIELDS[label]), maps: new Set(DATA_MAPS[label]) };
}

/**
 * A stored value as it is written to dev, with the "Take your story" export's secret
 * filter (export-redaction.ts) applied at every depth: a field whose name is a credential's
 * (isSecretField; isSecretDataMapKey inside a data map) is dropped, a sealed token record
 * ({ encrypted }) is dropped, and a string goes through toPlain, which drops a
 * credential-looking value and filters JSON held in a string. The export's per-store
 * exceptions (KEPT_FIELDS, DATA_MAPS) apply as they do there. Unlike the export, field
 * types are kept (Timestamps, GeoPoints, Bytes, vectors), and a DocumentReference, which
 * points into the source database, is rebound to dev.
 */
function forDev(value: unknown, dest: Firestore, names: FieldNames = NO_NAMES): unknown {
  if (value instanceof DocumentReference) return dest.doc(value.path);
  if (typeof value === 'string') return toPlain(value) ?? DROP;
  if (Array.isArray(value)) {
    return value.map((v) => forDev(v, dest)).filter((v) => v !== DROP);
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    if (typeof (value as { encrypted?: unknown }).encrypted === 'string') return DROP;
    const isSecret = names.dataMap === true ? isSecretDataMapKey : isSecretField;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecret(k) && !names.keep.has(k)) continue;
      const kept = forDev(v, dest, names.maps.has(k) ? { ...NO_NAMES, dataMap: true } : NO_NAMES);
      if (kept !== DROP) out[k] = kept;
    }
    return out;
  }
  return value; // Timestamp, GeoPoint, Bytes, VectorValue and scalars as they are
}

export async function copyUser(opts: {
  source: Firestore;
  dest: Firestore;
  uids: readonly string[];
  apply: boolean;
  overwrite?: boolean;
}): Promise<Record<string, StoreCount>> {
  const { source, dest, apply, overwrite = false } = opts;
  assertDatabases(source, dest);
  const refusal = uidRefusal(opts.uids);
  if (refusal) throw new Error(refusal);
  const uid = opts.uids[0] as string;

  const counts: Record<string, StoreCount> = {};
  let batch = dest.batch();
  let pending = 0;
  const flush = async (): Promise<void> => {
    if (pending > 0) await batch.commit();
    batch = dest.batch();
    pending = 0;
  };

  /** Copy these documents (same paths in dev), then everything under each. */
  const copyDocs = async (
    refs: DocumentReference[],
    count: StoreCount,
    underUserRecord: boolean
  ): Promise<void> => {
    for (let i = 0; i < refs.length; i += PAGE) {
      const page = refs.slice(i, i + PAGE);
      const snaps = await source.getAll(...page);
      const there = overwrite ? [] : await dest.getAll(...page.map((r) => dest.doc(r.path)));
      for (const [j, snap] of snaps.entries()) {
        if (!snap.exists) continue; // a parent that only holds subcollections
        if (excludedIndexEntry(snap.data())) continue; // nor counted: it stays in prod
        count.found += 1;
        if (there[j]?.exists) {
          count.skipped += 1;
          continue;
        }
        count.copied += 1;
        if (!apply) continue;
        const data = forDev(snap.data() ?? {}, dest, fieldNamesFor(snap.ref.path, uid));
        batch.set(dest.doc(snap.ref.path), data as Record<string, unknown>);
        if (++pending >= BATCH_LIMIT) await flush();
      }
      for (const ref of page) {
        for (const sub of await ref.listCollections()) {
          if (!copiedSubcollection(sub.id, underUserRecord)) continue;
          await copyDocs(await sub.listDocuments(), count, underUserRecord);
        }
      }
    }
  };

  for (const store of COPIED_STORES) {
    const count: StoreCount = { found: 0, copied: 0, skipped: 0 };
    const collection = source.collection(store.collection);
    if ('doc' in store) {
      await copyDocs([collection.doc(uid)], count, USER_RECORDS.has(store.collection));
    } else if ('field' in store) {
      const snap = await collection.where(store.field, '==', uid).select().get();
      await copyDocs(
        snap.docs.map((d) => d.ref),
        count,
        false
      );
    }
    if (count.found > 0) counts[storeLabel(store)] = count;
  }
  await flush();
  return counts;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const uids = argv.flatMap((a, i) => (a === '--uid' ? [argv[i + 1] ?? ''] : []));
  const apply = argv.includes('--apply');
  const overwrite = argv.includes('--overwrite');
  const refusal = uidRefusal(uids);
  if (refusal) {
    console.error(`copy-user: ${refusal}`);
    process.exit(2);
  }
  const projectId = process.env.GCP_PROJECT ?? 'johnb-2025';
  const source = new Firestore({ projectId, databaseId: SOURCE_DATABASE });
  const dest = new Firestore({ projectId, databaseId: DEST_DATABASE });
  const counts = await copyUser({ source, dest, uids, apply, overwrite });
  console.log(
    `${apply ? 'COPIED' : 'DRY RUN'} ${projectId}: ${SOURCE_DATABASE} -> ${DEST_DATABASE}` +
      ` (${process.env.FIRESTORE_EMULATOR_HOST ? 'emulator' : 'LIVE'})`
  );
  for (const [label, c] of Object.entries(counts)) {
    console.log(
      `  ${label}: ${c.found} found, ${c.copied} ${apply ? 'copied' : 'to copy'}, ${c.skipped} already in dev`
    );
  }
  const total = Object.values(counts).reduce((n, c) => n + c.copied, 0);
  console.log(
    `${total} document(s) ${apply ? 'copied' : 'would be copied'}.${apply ? '' : ' Add --apply to copy.'}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e: unknown) => {
    // An error can quote a document path; the uid in it is written as {uid}
    const at = process.argv.indexOf('--uid');
    const uid = at >= 0 ? (process.argv[at + 1] ?? '') : '';
    const message = e instanceof Error ? e.message : String(e);
    console.error(`copy-user: ${uid ? message.replaceAll(uid, '{uid}') : message}`);
    process.exit(1);
  });
}
