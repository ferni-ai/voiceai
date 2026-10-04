/**
 * Attach the signed-in user's Firebase ID token to every call to our own API.
 *
 * The server only trusts identity it can verify (src/servers/api/request-identity.ts):
 * in production a ?userId= query without a token is dropped. Most call sites go
 * through getApiHeadersAsync, but some build `/api/...?userId=` URLs and call
 * fetch directly. This hook covers those in one place, so a forgotten header
 * can't turn into a 401 for a real user.
 *
 * Only same-origin `/api/` requests get the token, never third-party hosts,
 * and a call site that already set Authorization keeps its own header.
 *
 * @module services/api-auth-fetch
 */

type FetchFn = typeof fetch;

interface FetchHost {
  fetch: FetchFn;
  location: { origin: string };
}

const installed = new WeakSet<object>();

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** True for a request to this app's own API. */
export function isOwnApiRequest(input: RequestInfo | URL, origin: string): boolean {
  try {
    const url = new URL(requestUrl(input), origin);
    return url.origin === origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Wrap host.fetch so same-origin /api/ calls carry `Authorization: Bearer <token>`.
 * Safe to call more than once.
 */
export function installApiAuthFetch(
  host: FetchHost,
  getToken: () => Promise<string | null>
): void {
  if (installed.has(host)) return;
  installed.add(host);
  const original = host.fetch.bind(host);

  host.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isOwnApiRequest(input, host.location.origin)) return original(input, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    if (headers.has('Authorization')) return original(input, init);

    const token = await getToken().catch(() => null);
    if (!token) return original(input, init);

    headers.set('Authorization', `Bearer ${token}`);
    return original(input, { ...init, headers });
  };
}
