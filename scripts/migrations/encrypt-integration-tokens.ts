#!/usr/bin/env tsx
/**
 * One-time migration: re-write integration tokens still stored in plaintext as
 * the sealed `{ encrypted }` record the stores now write (utils/token-at-rest).
 * Dry run by default; counts only, never a token, uid or email.
 *
 *   LOG_HASH_SECRET="$(gcloud secrets versions access latest --secret=log-hash-secret --project <project>)" \
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/migrations/encrypt-integration-tokens.ts          # dry run
 *   ... same env ... pnpm tsx scripts/migrations/encrypt-integration-tokens.ts --apply                 # writes
 *
 * The key must be the one the servers read with (OAUTH_ENCRYPTION_KEY, else
 * LOG_HASH_SECRET). --apply refuses to run without one, since encryptData
 * falls back to plain JSON when no key is set.
 *
 * Idempotent: sealed records are skipped. Each write is an update() with a
 * lastUpdateTime precondition, so a token refreshed mid-run is not clobbered;
 * that doc (or any doc whose write fails) keeps its original and is counted
 * as failed. Re-run to pick it up.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Precondition,
  type QueryDocumentSnapshot,
} from '@google-cloud/firestore';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';
import { isEncrypted } from '../../src/utils/token-encryption.js';
import { isPlaintextTokenRecord, openTokens, sealTokens } from '../../src/utils/token-at-rest.js';

/** Root-level docs whose whole body (minus bookkeeping) is the token record. */
export const DOC_COLLECTIONS = [
  'spotify_tokens',
  'oura_tokens',
  'eight_sleep_tokens',
  'ecobee_tokens',
  'apple_calendar_tokens',
] as const;
/** Per-user subcollection docs (bogle_users/{uid}/plaid_tokens/data). */
export const DOC_GROUPS = ['plaid_tokens'] as const;
/** Token maps kept on the profile doc (bogle_users/{uid}.<field>). */
export const PROFILE_FIELDS = ['linkedInTokens', 'biometricTokens'] as const;

/** Written by the stores beside the tokens; not secret, stays readable. */
const BOOKKEEPING = new Set(['updatedAt', '_updatedAt', '_userId']);

export interface Counts {
  scanned: number;
  plaintext: number;
  sealed: number;
  written: number;
  failed: number;
}

type Snap = QueryDocumentSnapshot;

const newCounts = (): Counts => ({ scanned: 0, plaintext: 0, sealed: 0, written: 0, failed: 0 });

/** Seal and prove it opens back to the same record before anything is written. */
function sealVerified(tokens: Record<string, unknown>) {
  const sealed = sealTokens(tokens);
  if (JSON.stringify(openTokens(sealed)) !== JSON.stringify(tokens)) {
    throw new Error('sealed record did not round-trip');
  }
  return sealed;
}

async function migrateOne(
  counts: Counts,
  apply: boolean,
  snap: Snap,
  stored: unknown,
  write: (ref: DocumentReference, precondition: Precondition) => Promise<unknown>
): Promise<void> {
  counts.scanned++;
  if (!isPlaintextTokenRecord(stored)) {
    if (typeof (stored as { encrypted?: unknown } | undefined)?.encrypted === 'string')
      counts.sealed++;
    return;
  }
  counts.plaintext++;
  if (!apply) return;
  try {
    await write(snap.ref, snap.updateTime ? { lastUpdateTime: snap.updateTime } : {});
    counts.written++;
  } catch {
    counts.failed++; // the doc keeps its original; logged as a count only
  }
}

export async function runEncryptIntegrationTokens(
  db: Firestore,
  apply: boolean
): Promise<Record<string, Counts>> {
  if (apply && !isEncrypted(sealTokens({ probe: true }).encrypted)) {
    throw new Error(
      'No encryption key (OAUTH_ENCRYPTION_KEY / LOG_HASH_SECRET): refusing to write'
    );
  }
  const result: Record<string, Counts> = {};

  const migrateDocs = async (label: string, docs: Snap[]) => {
    const counts = (result[label] = newCounts());
    for (const snap of docs) {
      const data = snap.data();
      await migrateOne(counts, apply, snap, data, (ref, pre) => {
        const tokens = Object.fromEntries(
          Object.entries(data).filter(([k]) => !BOOKKEEPING.has(k))
        );
        const deletes = Object.fromEntries(
          Object.keys(tokens).map((k) => [k, FieldValue.delete()])
        );
        return ref.update({ ...deletes, ...sealVerified(tokens) }, pre);
      });
    }
  };

  for (const name of DOC_COLLECTIONS)
    await migrateDocs(name, (await db.collection(name).get()).docs);
  for (const name of DOC_GROUPS)
    await migrateDocs(name, (await db.collectionGroup(name).get()).docs);

  for (const field of PROFILE_FIELDS) {
    const counts = (result[`bogle_users.${field}`] = newCounts());
    const snaps = await db.collection('bogle_users').where(field, '!=', null).get();
    for (const snap of snaps.docs) {
      const value = snap.data()[field] as Record<string, unknown>;
      await migrateOne(counts, apply, snap, value, (ref, pre) =>
        ref.update({ [field]: sealVerified(value) }, pre)
      );
    }
  }
  return result;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '(unset)';
  const keySource = process.env.OAUTH_ENCRYPTION_KEY
    ? 'OAUTH_ENCRYPTION_KEY'
    : process.env.LOG_HASH_SECRET
      ? 'LOG_HASH_SECRET'
      : 'none';
  console.log(`Project: ${project}  mode: ${apply ? 'apply' : 'dry run'}  key: ${keySource}`);
  if (apply) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const typed = await rl.question(
      `This RE-WRITES plaintext token docs in "${project}". Type the project id to continue: `
    );
    rl.close();
    if (typed.trim() !== project) {
      console.log('Not confirmed: nothing written.');
      return;
    }
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  console.log(JSON.stringify(await runEncryptIntegrationTokens(db, apply), null, 2));
}

// Run only when invoked as a script.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
