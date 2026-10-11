/**
 * The one place this process initializes the default firebase-admin app.
 *
 * About ninety call sites used to run their own `if (!apps.length) initializeApp(...)`,
 * some with no options, some with `{ projectId }` read from one of three env vars, some
 * with `cert(...)`. The default app is shared by the whole process, so its config
 * depended on whichever module happened to run first. Every caller now goes through
 * getAdminApp(), which always initializes the same way.
 *
 * Uses only the modular entry points (`firebase-admin/app`, `firebase-admin/firestore`),
 * which firebase-admin 13 and 14 both provide; 14 removed the namespaced `admin.*` API.
 *
 * @module utils/firebase-admin-app
 */

import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const DEFAULT_APP_NAME = '[DEFAULT]';

/**
 * The GCP project to initialize with, or undefined to let Application Default
 * Credentials infer it (which is what Cloud Run and the emulators expect).
 */
export function resolveFirebaseProjectId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.GCP_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.FIREBASE_PROJECT_ID || undefined;
}

/**
 * The default firebase-admin app, initialized on first use.
 *
 * Named apps (tests create some) don't count: the old `apps.length` check treated a
 * named app as "initialized", and the next `admin.firestore()` then threw for want of
 * a default app.
 */
export function getAdminApp(): App {
  if (getApps().some((app) => app.name === DEFAULT_APP_NAME)) return getApp();
  const projectId = resolveFirebaseProjectId();
  return projectId ? initializeApp({ projectId }) : initializeApp();
}

/** Firestore on the default firebase-admin app. */
export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
