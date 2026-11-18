/**
 * The Firebase web config at /__/firebase/init.json, for a UI server reached directly.
 *
 * The web app reads its Firebase config from /__/firebase/init.json
 * (apps/web/src/config/firebase.ts), a path only Firebase Hosting serves. Prod sits behind
 * Hosting (app.ferni.ai), so the request never reaches this server there. The dev UI is
 * opened at its bare Cloud Run address, where the path fell through to the static files and
 * 404ed: Firebase stayed off and nobody could sign in to dev.
 *
 * So the server answers it with the project's own Hosting copy, fetched once and kept. The
 * config is public (Hosting serves it to anyone), and only the web-config keys are passed on.
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FirebaseWebConfig' });

export const FIREBASE_INIT_PATH = '/__/firebase/init.json';

const WEB_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
  'databaseURL',
] as const;

type WebConfig = Partial<Record<(typeof WEB_CONFIG_KEYS)[number], string>>;
type Env = Record<string, string | undefined>;

/** The Firebase project the server runs in, or undefined when it isn't a plain project id. */
function firebaseProjectId(env: Env): string | undefined {
  const project = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT;
  return project && /^[a-z0-9-]{4,40}$/.test(project) ? project : undefined;
}

/** The web-config keys of Hosting's reply, or null when it isn't a usable Firebase config. */
function pickWebConfig(raw: unknown): WebConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const config: WebConfig = {};
  for (const key of WEB_CONFIG_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value) config[key] = value;
  }
  return config.apiKey && config.authDomain && config.projectId ? config : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown, cache: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': cache });
  res.end(JSON.stringify(body));
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

async function fetchWebConfig(fetchImpl: FetchImpl, project: string): Promise<WebConfig> {
  const url = `https://${project}.firebaseapp.com${FIREBASE_INIT_PATH}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config = pickWebConfig(await response.json());
  if (!config) throw new Error('Hosting did not return a Firebase web config');
  return config;
}

/**
 * A handler for FIREBASE_INIT_PATH. It keeps the fetch of the first good config, so
 * requests that arrive together share one fetch; a failed fetch is dropped and retried.
 */
export function createFirebaseWebConfigRoute({
  fetchImpl = async (input, init) => fetch(input, init),
  env = process.env as Env,
}: {
  fetchImpl?: FetchImpl;
  env?: Env;
} = {}): (res: ServerResponse) => Promise<void> {
  let kept: Promise<WebConfig> | null = null;

  return async function serveFirebaseWebConfig(res: ServerResponse): Promise<void> {
    const project = firebaseProjectId(env);
    if (!project) {
      sendJson(res, 404, { error: 'not_found' }, 'no-store');
      return;
    }
    const fetching = (kept ??= fetchWebConfig(fetchImpl, project));
    try {
      sendJson(res, 200, await fetching, 'public, max-age=3600');
    } catch (error) {
      if (kept === fetching) kept = null;
      log.warn({ error, project }, 'Could not fetch the Firebase web config from Hosting');
      sendJson(res, 502, { error: 'firebase_config_unavailable' }, 'no-store');
    }
  };
}
