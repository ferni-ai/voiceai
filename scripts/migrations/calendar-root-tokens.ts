#!/usr/bin/env tsx
/**
 * One-shot cleanup: revoke at Google, then delete, every Google Calendar token
 * left in the retired ROOT collection `google_calendar_tokens/{uid}`.
 *
 * Why revoke-and-delete, not restore:
 * - These access + refresh tokens sat in Firestore unencrypted, so they are
 *   treated as exposed.
 * - Before #219 the old v1 callback took the user id from an unsigned state,
 *   so a root doc may bind someone else's Google account to a uid. Restoring
 *   it could hand that user another person's calendar.
 * Nothing reads the root collection any more, so these users are already
 * disconnected; they see "Connect" and can connect again.
 *
 * Per root doc (--apply): POST the refresh token (else the access token) to
 * Google's revoke endpoint, best effort, then delete the doc whether or not
 * the revoke worked. Nothing is written anywhere else; no encryption key is
 * needed. A doc whose delete fails is counted and stays for the next run.
 *
 * Dry run by default. A real run passes the repo's destructive gate
 * (scripts/destructive-gate.ts):
 *
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/migrations/calendar-root-tokens.ts
 *   GOOGLE_CLOUD_PROJECT=<project> \
 *     pnpm tsx scripts/migrations/calendar-root-tokens.ts --apply --confirm-project=<project>
 *
 * Output is counts only. Logs name a doc by its position in the run, never
 * by user id, and never carry a token or an error message (Firestore error
 * text can contain document paths).
 *
 * @module scripts/migrations/calendar-root-tokens
 */
import { pathToFileURL } from 'node:url';
import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../src/utils/safe-logger.js';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { getFirestoreDatabase } from '../../src/config/environment.js';

const log = createLogger({ module: 'calendar-root-tokens' });

export const ROOT_COLLECTION = 'google_calendar_tokens';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const REVOKE_TIMEOUT_MS = 5_000;

export interface DryRunCounts {
  scanned: number;
  withRefreshToken: number;
  /** The user also has a token in the encrypted per-user store. */
  alreadyHasEncrypted: number;
}

export interface ApplyCounts {
  scanned: number;
  revoked: number;
  /** Revoke refused or unreachable; the doc is still deleted. */
  revokeFailed: number;
  deleted: number;
  /** Delete failed; the doc stays for the next run. */
  deleteFailed: number;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** The token that ends the most: the refresh token ends the whole grant. */
function tokenToRevoke(data: Record<string, unknown> | undefined): string | null {
  if (nonEmpty(data?.refresh_token)) return data.refresh_token;
  if (nonEmpty(data?.access_token)) return data.access_token;
  return null;
}

async function revokeAtGoogle(token: string, doc: number): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (!response.ok) log.warn({ doc, status: response.status }, 'Revoke refused');
    return response.ok;
  } catch (err) {
    log.warn({ doc, error: (err as Error)?.name }, 'Revoke failed');
    return false;
  }
}

export async function dryRunRootCalendarTokens(db: Firestore): Promise<DryRunCounts> {
  const counts: DryRunCounts = { scanned: 0, withRefreshToken: 0, alreadyHasEncrypted: 0 };
  const snapshot = await db.collection(ROOT_COLLECTION).get();
  for (const doc of snapshot.docs) {
    counts.scanned++;
    if (nonEmpty((doc.data() as Record<string, unknown>)?.refresh_token)) {
      counts.withRefreshToken++;
    }
    const stored = await db
      .collection('bogle_users')
      .doc(doc.id)
      .collection(ROOT_COLLECTION)
      .doc('data')
      .get();
    if (stored.exists) counts.alreadyHasEncrypted++;
  }
  return counts;
}

export async function revokeAndDeleteRootCalendarTokens(db: Firestore): Promise<ApplyCounts> {
  const counts: ApplyCounts = {
    scanned: 0,
    revoked: 0,
    revokeFailed: 0,
    deleted: 0,
    deleteFailed: 0,
  };
  const snapshot = await db.collection(ROOT_COLLECTION).get();
  for (const doc of snapshot.docs) {
    const position = ++counts.scanned;
    const token = tokenToRevoke(doc.data() as Record<string, unknown> | undefined);
    if (token) {
      if (await revokeAtGoogle(token, position)) counts.revoked++;
      else counts.revokeFailed++;
    }
    try {
      await doc.ref.delete();
      counts.deleted++;
    } catch (err) {
      counts.deleteFailed++;
      log.warn({ doc: position, error: (err as Error)?.name }, 'Delete failed');
    }
  }
  return counts;
}

export async function main(
  argv: readonly string[] = process.argv
): Promise<DryRunCounts | ApplyCounts | null> {
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

  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore({
    projectId: projectId || undefined,
    databaseId: getFirestoreDatabase(),
  });
  const apply = mode === 'execute';
  console.log(`Project: ${projectId || '(default)'}  mode: ${apply ? 'apply' : 'dry run'}`);
  try {
    if (!apply) {
      const counts = await dryRunRootCalendarTokens(db);
      console.log(JSON.stringify(counts));
      return counts;
    }
    const counts = await revokeAndDeleteRootCalendarTokens(db);
    console.log(JSON.stringify(counts));
    if (counts.deleteFailed > 0) process.exitCode = 1;
    return counts;
  } finally {
    await db.terminate();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    console.error(`Cleanup failed: ${(err as Error)?.name ?? 'Error'}`);
    process.exitCode = 1;
  });
}
