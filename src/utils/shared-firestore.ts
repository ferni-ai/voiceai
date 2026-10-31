/**
 * One Firestore client per process for each distinct set of settings.
 *
 * A fresh process pays each client's channel, TLS and auth setup on its first read:
 * locally 300-450 ms for the first client and about 100 ms more for each extra one
 * (voiceai-evidence two-jobs-proof SUMMARY, 2026-10-29). A call's session start and
 * first turn built 20 `@google-cloud/firestore` clients, nearly all with the same
 * settings (agents/gce/__tests__/call-firestore-clients.test.ts). Modules on the call
 * path take their client from here, so a process opens each one once.
 *
 * Settings are matched as the SDK resolves them, so a caller gets a client that
 * behaves exactly like the one it used to build:
 * - databaseId; unset means '(default)', as in the SDK;
 * - projectId; unset means the project Application Default Credentials read from
 *   GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT (google-auth-library's order), so an
 *   explicit `GOOGLE_CLOUD_PROJECT || GCLOUD_PROJECT` and an unset one share a client
 *   whenever they name the same project;
 * - ignoreUndefinedProperties: without it a write with an undefined field throws,
 *   with it the field is dropped, so the two kinds never share by default.
 *
 * FIRESTORE_SHARED_CLIENT=on: callers without ignoreUndefinedProperties get the
 * client that has it (getFirestoreDb's), one client per database instead of two.
 * Their writes then drop undefined fields instead of throwing, hence the flag.
 *
 * A shared client must outlive any one user: stores that used to terminate their
 * own client on close leave it open (isSharedFirestore).
 *
 * @module utils/shared-firestore
 */
import { Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../config/env-flag.js';

export type { Firestore };

export interface SharedFirestoreSettings {
  /** Required so no caller forgets it (FIRESTORE_DATABASE); undefined is the SDK's '(default)'. */
  databaseId: string | undefined;
  projectId?: string;
  ignoreUndefinedProperties?: boolean;
}

interface ResolvedSettings {
  databaseId: string;
  projectId: string | undefined;
  ignoreUndefinedProperties: boolean;
}

const clients = new Map<string, Firestore>();

/** The settings a client is built with, as the SDK would resolve them. */
export function resolveSharedSettings(
  settings: SharedFirestoreSettings,
  env: Env = process.env
): ResolvedSettings {
  const projectId =
    settings.projectId ||
    env.GCLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT ||
    env.gcloud_project ||
    env.google_cloud_project;
  const ignoreUndefinedProperties =
    settings.ignoreUndefinedProperties === true || flagOn('FIRESTORE_SHARED_CLIENT', env);
  return { databaseId: settings.databaseId ?? '(default)', projectId, ignoreUndefinedProperties };
}

/** The process's client for these settings, built on first use. */
export function sharedFirestore(settings: SharedFirestoreSettings): Firestore {
  const resolved = resolveSharedSettings(settings);
  const { databaseId, projectId, ignoreUndefinedProperties } = resolved;
  const key = JSON.stringify([databaseId, projectId ?? null, ignoreUndefinedProperties]);
  let client = clients.get(key);
  if (!client) {
    client = new Firestore({
      databaseId,
      ...(projectId ? { projectId } : {}),
      ...(ignoreUndefinedProperties ? { ignoreUndefinedProperties } : {}),
    });
    clients.set(key, client);
  }
  return client;
}

/** True for a client sharedFirestore() handed out: no single user may terminate it. */
export function isSharedFirestore(db: unknown): boolean {
  for (const client of clients.values()) if (client === db) return true;
  return false;
}

/** Forget every client (tests). */
export function resetSharedFirestore(): void {
  clients.clear();
}
