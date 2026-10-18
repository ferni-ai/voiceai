#!/usr/bin/env tsx
/**
 * One-shot migration: Google Calendar tokens left in the retired ROOT
 * collection `google_calendar_tokens/{uid}` move into the encrypted per-user
 * store (bogle_users/{uid}/google_calendar_tokens/data), and the plaintext
 * root doc is deleted.
 *
 * Why: the old v1 connect flow wrote access + refresh tokens to the root
 * collection unencrypted. Every reader now uses the encrypted store
 * (services/identity/google-calendar-token-store.ts), so those users silently
 * lost their calendar connection while their plaintext refresh tokens stayed
 * in Firestore.
 *
 * Per root doc:
 * - the user already has a token in the encrypted store: the root copy is
 *   stale, so it is deleted (that store wins);
 * - otherwise, if it has a refresh token, it is written through the SAME
 *   saveTokens() the /auth/google/callback route uses, read back, and the
 *   root doc is deleted only once the encrypted copy is confirmed;
 * - no refresh token: nothing can be restored from it, it is left alone and
 *   counted.
 * A failure on one doc is counted and keeps that root doc; the run goes on.
 * Re-running is safe: migrated docs are gone from the root collection.
 *
 * Dry run by default (counts only). A real run passes the repo's destructive
 * gate (scripts/destructive-gate.ts) and needs the production encryption key:
 *
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/migrations/calendar-root-tokens.ts
 *   GOOGLE_CLOUD_PROJECT=<project> OAUTH_ENCRYPTION_KEY=<prod key> \
 *     pnpm tsx scripts/migrations/calendar-root-tokens.ts --apply --confirm-project=<project>
 *
 * Output is counts only: no user ids, no tokens. Library logs are silenced
 * unless LOG_LEVEL is set (they can carry user ids).
 *
 * @module scripts/migrations/calendar-root-tokens
 */
import { pathToFileURL } from 'node:url';
import type { Firestore } from '@google-cloud/firestore';
import {
  saveTokens,
  shutdownTokenStore,
} from '../../src/services/identity/google-calendar-token-store.js';
import { decryptData, isEncrypted } from '../../src/utils/token-encryption.js';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';

export const ROOT_COLLECTION = 'google_calendar_tokens';

export interface MigrationCounts {
  scanned: number;
  /** Root token written to the encrypted store (or would be, in a dry run). */
  migrated: number;
  /** User already had an encrypted token; the root copy is stale. */
  alreadyConnected: number;
  /** Root docs deleted (always 0 in a dry run). */
  rootDeleted: number;
  /** Root doc with no refresh token: nothing to restore, left in place. */
  keptNoRefreshToken: number;
  /** Errors or unconfirmed writes: root doc left in place. */
  failed: number;
}

interface RootTokenDoc {
  access_token?: unknown;
  refresh_token?: unknown;
  expiry_date?: unknown;
  scope?: unknown;
}

function storedDocRef(db: Firestore, uid: string) {
  return db.collection('bogle_users').doc(uid).collection(ROOT_COLLECTION).doc('data');
}

/**
 * The refresh token held in the encrypted store for a user, read straight
 * from Firestore (no cache). 'absent' when there is no doc; 'unreadable' when
 * a doc exists but does not decrypt to tokens with this run's key.
 */
async function readStored(
  db: Firestore,
  uid: string
): Promise<{ state: 'absent' | 'unreadable' } | { state: 'present'; refreshToken: string }> {
  const snap = await storedDocRef(db, uid).get();
  const encrypted = snap.exists ? (snap.data() as { encrypted?: unknown })?.encrypted : undefined;
  if (typeof encrypted !== 'string' || encrypted === '') return { state: 'absent' };
  if (!isEncrypted(encrypted)) return { state: 'unreadable' };
  const tokens = decryptData<{ refresh_token?: unknown }>(encrypted);
  return typeof tokens?.refresh_token === 'string' && tokens.refresh_token !== ''
    ? { state: 'present', refreshToken: tokens.refresh_token }
    : { state: 'unreadable' };
}

export async function migrateRootCalendarTokens(
  db: Firestore,
  opts: { apply: boolean }
): Promise<MigrationCounts> {
  const counts: MigrationCounts = {
    scanned: 0,
    migrated: 0,
    alreadyConnected: 0,
    rootDeleted: 0,
    keptNoRefreshToken: 0,
    failed: 0,
  };
  const snapshot = await db.collection(ROOT_COLLECTION).get();

  for (const doc of snapshot.docs) {
    counts.scanned++;
    const uid = doc.id;
    try {
      const stored = await readStored(db, uid);
      if (stored.state === 'unreadable') {
        counts.failed++;
        continue;
      }
      if (stored.state === 'present') {
        counts.alreadyConnected++;
        if (opts.apply) {
          await doc.ref.delete();
          counts.rootDeleted++;
        }
        continue;
      }

      const root = doc.data() as RootTokenDoc;
      if (typeof root.refresh_token !== 'string' || root.refresh_token === '') {
        counts.keptNoRefreshToken++;
        continue;
      }
      if (!opts.apply) {
        counts.migrated++;
        continue;
      }

      await saveTokens(uid, {
        access_token: typeof root.access_token === 'string' ? root.access_token : '',
        refresh_token: root.refresh_token,
        // The root access token is long expired; an expiry in the past makes
        // the first use refresh it.
        expires_at: typeof root.expiry_date === 'number' ? root.expiry_date : 0,
        ...(typeof root.scope === 'string' ? { scope: root.scope } : {}),
      });

      // saveTokens logs and swallows write errors, so confirm the encrypted
      // copy landed before deleting the only other copy.
      const written = await readStored(db, uid);
      if (written.state !== 'present' || written.refreshToken !== root.refresh_token) {
        counts.failed++;
        continue;
      }
      counts.migrated++;
      await doc.ref.delete();
      counts.rootDeleted++;
    } catch {
      // Error text can carry document paths (user ids): count only.
      counts.failed++;
    }
  }
  return counts;
}

export async function main(argv: readonly string[] = process.argv): Promise<MigrationCounts | null> {
  process.env.LOG_LEVEL ??= 'silent';
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  // --apply is this script's name for the gate's --execute.
  const mode = destructiveMode(
    argv.map((a) => (a === '--apply' ? '--execute' : a)),
    projectId
  );
  if (mode !== 'dry-run' && !projectId) {
    console.error('Refusing to write: set GOOGLE_CLOUD_PROJECT to the project this run targets.');
    process.exitCode = 1;
    return null;
  }
  if (mode === 'refused') {
    console.error(refusalMessage(projectId).replace('--execute', '--apply'));
    process.exitCode = 1;
    return null;
  }
  const apply = mode === 'execute';
  if (apply && !process.env.OAUTH_ENCRYPTION_KEY && !process.env.LOG_HASH_SECRET) {
    // Without a key encryptData stores plain JSON; never migrate that way.
    console.error('Refusing to write: OAUTH_ENCRYPTION_KEY (the production key) is not set.');
    process.exitCode = 1;
    return null;
  }

  const { Firestore } = await import('@google-cloud/firestore');
  // Same client settings as the persistence layer saveTokens writes through.
  const db = new Firestore({
    projectId: projectId || undefined,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  });
  console.log(`Project: ${projectId || '(default)'}  mode: ${apply ? 'apply' : 'dry run'}`);
  try {
    const counts = await migrateRootCalendarTokens(db, { apply });
    console.log(JSON.stringify(counts));
    if (counts.failed > 0) process.exitCode = 1;
    return counts;
  } finally {
    await shutdownTokenStore();
    await db.terminate();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .catch((err: unknown) => {
      console.error(`Migration failed: ${(err as Error)?.name ?? 'Error'}`);
      process.exitCode = 1;
    })
    // The persistence layer's Firestore client is private and stays open.
    .finally(() => process.exit());
}
