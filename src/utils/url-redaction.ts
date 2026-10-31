/**
 * Redacts secrets from a URL before it is logged.
 *
 * Several outbound clients put their API key in the query string (Alpha Vantage's
 * `apikey=`, Google's `key=`, Finnhub's `token=`), and the resilient HTTP client logs
 * the request URL on every failure. This keeps the URL useful in a log line (scheme,
 * host, path, which params were sent) while dropping the values that are credentials:
 *
 *   https://user:pw@api.example.com/q?symbol=X&apikey=abc
 *   → https://api.example.com/q?symbol=X&apikey=[redacted]
 *
 * Param names are compared without case and after percent-decoding, in the query and
 * in a fragment that carries params (an OAuth implicit-grant `#access_token=`). It
 * works on string shape, not `new URL`, so relative URLs (`/hook?token=…`, an inbound
 * `req.url`) are redacted too. It never throws: if anything goes wrong it falls back
 * to the URL with everything after the path cut off.
 *
 * @module utils/url-redaction
 */

const REDACTED_VALUE = '[redacted]';

/** Query and fragment params whose values are credentials (lower case). */
const SENSITIVE_PARAMS = new Set([
  'apikey',
  'api_key',
  'api-key',
  'key',
  'access_key',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'secret',
  'password',
  'sig',
  'signature',
  'x-amz-signature',
  'x-amz-security-token',
  'x-goog-signature',
  'auth',
  'code',
]);

/** scheme://user[:password]@ — the userinfo is dropped, the scheme kept. */
const USERINFO = /^([a-z][a-z\d+.-]*:\/\/)[^/?#]*@/i;

function decodeName(name: string): string {
  try {
    return decodeURIComponent(name.replace(/\+/g, ' ')).toLowerCase();
  } catch {
    return name.toLowerCase(); // a malformed escape: compare it as written
  }
}

/** Redacts the sensitive params in a `a=1&b=2` string, keeping every name. */
function redactParams(params: string): string {
  return params
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const name = pair.slice(0, eq);
      return SENSITIVE_PARAMS.has(decodeName(name)) ? `${name}=${REDACTED_VALUE}` : pair;
    })
    .join('&');
}

function redact(url: string): string {
  const noUserinfo = url.replace(USERINFO, '$1');
  const hash = noUserinfo.indexOf('#');
  const beforeHash = hash < 0 ? noUserinfo : noUserinfo.slice(0, hash);
  const fragment = hash < 0 ? undefined : noUserinfo.slice(hash + 1);
  const q = beforeHash.indexOf('?');
  const base = q < 0 ? beforeHash : beforeHash.slice(0, q);
  const query = q < 0 ? undefined : beforeHash.slice(q + 1);
  let out = base;
  if (query !== undefined) out += `?${redactParams(query)}`;
  if (fragment !== undefined)
    out += `#${fragment.includes('=') ? redactParams(fragment) : fragment}`;
  return out;
}

/** The URL with credential values and userinfo removed; never throws. */
export function redactUrl(url: string): string {
  try {
    return redact(url);
  } catch {
    // Origin and path only: nothing after the path can leak.
    return (String(url).split(/[?#]/)[0] ?? '').replace(USERINFO, '$1');
  }
}

/** Log field names that hold a URL: url, uri, href, endpoint, link, and any *Url / *Uri. */
const URL_FIELD = /(?:url|uri|href|endpoint|link)$/i;

/** A log field's value, with its URL redacted if the field is url-like (url, endpoint, *Url). */
export function redactUrlField(key: string, value: unknown): unknown {
  return typeof value === 'string' && URL_FIELD.test(key) ? redactUrl(value) : value;
}
