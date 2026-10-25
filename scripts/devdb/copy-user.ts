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
 * so the addition shows up in review.
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
  push_subscriptions: CREDENTIAL,
  voice_profile: 'the voiceprint that recognizes the caller, an authenticator',
  pending_messages: QUEUE,
  deferred_calls: QUEUE,
  scheduled_calls: QUEUE,
  contacts: `${OTHERS}: contacts`,
  on_behalf_calls: `${OTHERS}: third parties' numbers and what they said`,
  reminders: SCHEDULING,
  outreach_attempts: SCHEDULING,
  outreach_history: SCHEDULING,
};

/**
 * A collection name excluded wherever it appears as a subcollection: the names
 * above, the collection of every EXCLUDED_STORES entry (credentials, queues,
 * other people's data), and any reminders / *_reminders / outreach_* (SCHEDULING).
 * ferni_commitments is kept: Ferni reads it in calls for follow-through and
 * nothing on dev delivers from it.
 */
const SCHEDULING_NAME = /^outreach_|(^|_)reminders$/;
const EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  ...Object.keys(EXCLUDED_SUBCOLLECTIONS),
  ...Object.keys(EXCLUDED_STORES).map((label) => label.replace(/(\/\{uid\}|\[[^\]]+\])$/, '')),
]);
export const excludedSubcollection = (name: string): boolean =>
  SCHEDULING_NAME.test(name) || EXCLUDED_NAMES.has(name);

/** What is copied: the erasure catalog minus EXCLUDED_STORES. */
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

/** A DocumentReference field points into the source database; rebind it to dev. */
function rebind(value: unknown, dest: Firestore): unknown {
  if (value instanceof DocumentReference) return dest.doc(value.path);
  if (Array.isArray(value)) return value.map((v) => rebind(v, dest));
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, rebind(v, dest)])
    );
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
  const copyDocs = async (refs: DocumentReference[], count: StoreCount): Promise<void> => {
    for (let i = 0; i < refs.length; i += PAGE) {
      const page = refs.slice(i, i + PAGE);
      const snaps = await source.getAll(...page);
      const there = overwrite ? [] : await dest.getAll(...page.map((r) => dest.doc(r.path)));
      for (const [j, snap] of snaps.entries()) {
        if (!snap.exists) continue; // a parent that only holds subcollections
        count.found += 1;
        if (there[j]?.exists) {
          count.skipped += 1;
          continue;
        }
        count.copied += 1;
        if (!apply) continue;
        batch.set(dest.doc(snap.ref.path), rebind(snap.data(), dest) as Record<string, unknown>);
        if (++pending >= BATCH_LIMIT) await flush();
      }
      for (const ref of page) {
        for (const sub of await ref.listCollections()) {
          if (excludedSubcollection(sub.id)) continue;
          await copyDocs(await sub.listDocuments(), count);
        }
      }
    }
  };

  for (const store of COPIED_STORES) {
    const count: StoreCount = { found: 0, copied: 0, skipped: 0 };
    const collection = source.collection(store.collection);
    if ('doc' in store) {
      await copyDocs([collection.doc(uid)], count);
    } else if ('field' in store) {
      const snap = await collection.where(store.field, '==', uid).select().get();
      await copyDocs(
        snap.docs.map((d) => d.ref),
        count
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
