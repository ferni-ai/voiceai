/**
 * Refresh a Firebase session against Google's securetoken endpoint.
 *
 * The CLI used to POST its refresh token to /api/auth/refresh on the Ferni
 * API, a route no server has ever had (#2097), so every CLI session died an
 * hour after `ferni auth login`. Firebase's own token endpoint takes the
 * refresh token the CLI already stores. The web API key it needs is public
 * and Firebase Hosting serves it at /__/firebase/init.json, the same place
 * the web app reads it (apps/web/src/config/firebase.ts), so no key lives in
 * this repo.
 */

const SECURETOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

export type RefreshResult =
  | { ok: true; idToken: string; refreshToken: string; expiresInSec: number }
  /** Firebase refused the refresh token (revoked, expired, user disabled): sign in again. */
  | { ok: false; reason: 'rejected'; detail: string }
  /** Network, hosting or Firebase trouble: the stored session may still be good. */
  | { ok: false; reason: 'unavailable'; detail: string };

let cachedApiKey: { appUrl: string; key: string } | null = null;

/** Read the project's public web API key from Firebase Hosting's init.json. */
export async function loadFirebaseWebApiKey(
  appUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (cachedApiKey?.appUrl === appUrl) return cachedApiKey.key;
  const response = await fetchImpl(`${appUrl}/__/firebase/init.json`);
  if (!response.ok) throw new Error(`init.json returned HTTP ${response.status}`);
  const config = (await response.json()) as { apiKey?: unknown };
  if (typeof config.apiKey !== 'string' || !config.apiKey) {
    throw new Error('init.json has no apiKey');
  }
  cachedApiKey = { appUrl, key: config.apiKey };
  return config.apiKey;
}

/** Exchange a Firebase refresh token for a new ID token. Never throws. */
export async function refreshFirebaseSession(
  refreshToken: string,
  appUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<RefreshResult> {
  let response: Response;
  try {
    const apiKey = await loadFirebaseWebApiKey(appUrl, fetchImpl);
    response = await fetchImpl(`${SECURETOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (!response.ok) {
    const detail = await errorMessage(response);
    // securetoken answers 400 for a refresh token it will never accept again.
    return response.status === 400
      ? { ok: false, reason: 'rejected', detail }
      : { ok: false, reason: 'unavailable', detail };
  }

  const data = (await response.json()) as {
    id_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  const expiresInSec = Number(data.expires_in);
  if (
    typeof data.id_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    !(expiresInSec > 0)
  ) {
    return { ok: false, reason: 'unavailable', detail: 'securetoken response was missing fields' };
  }
  return { ok: true, idToken: data.id_token, refreshToken: data.refresh_token, expiresInSec };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === 'string')
      return `HTTP ${response.status} ${body.error.message}`;
  } catch {
    // Not JSON: the status alone says enough.
  }
  return `HTTP ${response.status}`;
}

/** Test hook: forget the cached API key. */
export function resetFirebaseApiKeyCache(): void {
  cachedApiKey = null;
}
