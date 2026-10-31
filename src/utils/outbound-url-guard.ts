/**
 * Outbound URL guard: the one check every server-side fetch of a user-supplied URL goes through.
 *
 * Webhooks, developer tools, MCP endpoints and OAuth token URLs are typed in by users or
 * publishers, and the server fetches them from inside our network. Without a guard those
 * fetches can reach loopback, the VPC, or the cloud metadata service. The rules:
 *
 * - https only (wss for websocket MCP), no embedded credentials, default port only. A product
 *   path that needed plain http would have been an unreachable LAN address anyway: the server
 *   runs in the cloud, so a home-network URL never worked from here.
 * - Every address the hostname resolves to must be public. Checked once before the request and
 *   again in the socket's own DNS lookup, so the connection uses the address that was checked
 *   (a name that re-resolves to a private address between the two is refused at connect).
 * - Redirects are followed by hand, at most MAX_REDIRECTS, and each target is checked again.
 * - Every request has a timeout; readCappedText bounds how much of a body is read.
 */

import dns, { type LookupAddress } from 'node:dns';
import net, { type LookupFunction } from 'node:net';
// The guarded Agent is handed to the runtime's global fetch, which is the undici bundled with
// Node, not this package. Node 22's fetch uses the legacy handler API and Node 26's (undici 8)
// the newer one; an undici 6 Agent understood only the legacy one, so on Node 26 every guarded
// request failed in dispatch (#3194). undici 7 Agents accept both, so the package is pinned to
// 7 until the bundled fetch of every supported Node is undici 8.
import { Agent } from 'undici';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export class OutboundUrlBlockedError extends Error {
  readonly code = 'OUTBOUND_URL_BLOCKED';
  constructor(reason: string) {
    super(`Destination not allowed: ${reason}`);
    this.name = 'OutboundUrlBlockedError';
  }
}

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8], // "this network"; 0.0.0.0 reaches loopback on Linux
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes the metadata service
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes broadcast
] as const) {
  blocked.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::', 96], // IPv4-compatible (deprecated): ::127.0.0.1
  ['::ffff:0:0:0', 96], // IPv4-translated (SIIT): ::ffff:0:7f00:1
  ['64:ff9b::', 96], // NAT64, embeds an IPv4 address
  ['64:ff9b:1::', 48], // local-use NAT64
  ['2001:db8::', 32],
  ['2002::', 16], // 6to4, embeds an IPv4 address
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net6, prefix, 'ipv6');
}

/** IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:7f00:1) as dotted IPv4, else null. */
function mappedIpv4(ip: string): string | null {
  const m = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/i.exec(ip);
  if (!m?.[1]) return null;
  const tail = m[1];
  if (net.isIPv4(tail)) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hex?.[1] || !hex[2]) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True when an IP literal is loopback, private, link-local, reserved or otherwise not public. */
export function isBlockedIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
  if (net.isIPv4(addr)) return blocked.check(addr, 'ipv4');
  if (!net.isIPv6(addr)) return true; // not an IP at all: refuse rather than guess
  const v4 = mappedIpv4(addr);
  if (v4) return blocked.check(v4, 'ipv4');
  return blocked.check(addr, 'ipv6');
}

/** True for hostnames that name internal hosts, before any DNS lookup. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (!host) return true;
  if (net.isIP(host)) return isBlockedIp(host);
  if (!host.includes('.')) return true; // single label: localhost, metadata, cluster names
  return /\.(localhost|local|internal|lan|home\.arpa|intranet|corp)$/.test(host);
}

export interface OutboundUrlOptions {
  /** Defaults to ['https:']. MCP websocket endpoints pass ['https:', 'wss:']. */
  protocols?: readonly string[];
}

export type OutboundUrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Synchronous check (no DNS). Use it in request validation so a bad URL is never stored. */
export function checkOutboundUrl(raw: unknown, options: OutboundUrlOptions = {}): OutboundUrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'URL is required' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  const protocols = options.protocols ?? ['https:'];
  if (!protocols.includes(url.protocol)) {
    return { ok: false, reason: `${protocols.join(' or ').replace(/:/g, '')} required` };
  }
  if (url.username || url.password) return { ok: false, reason: 'credentials in URL' };
  if (url.port) return { ok: false, reason: 'non-default port' };
  if (isBlockedHostname(url.hostname)) return { ok: false, reason: 'private or reserved address' };
  return { ok: true, url };
}

/** Full check: the static rules plus every DNS answer for the hostname must be public. */
export async function assertSafeOutboundUrl(
  raw: string,
  options: OutboundUrlOptions = {}
): Promise<URL> {
  const check = checkOutboundUrl(raw, options);
  if (!check.ok) throw new OutboundUrlBlockedError(check.reason);
  const host = check.url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return check.url;
  let answers: LookupAddress[];
  try {
    answers = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new OutboundUrlBlockedError('hostname does not resolve');
  }
  if (answers.length === 0 || answers.some((a) => isBlockedIp(a.address))) {
    throw new OutboundUrlBlockedError('private or reserved address');
  }
  return check.url;
}

/**
 * DNS lookup for the socket itself: refuses if any answer is not public, so the address the
 * connection uses is one that was checked (closes the DNS-rebinding gap of a pre-flight check).
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const first = addresses[0];
    if (!first || addresses.some((a) => isBlockedIp(a.address))) {
      return callback(new OutboundUrlBlockedError('private or reserved address'), '');
    }
    if (options.all) return callback(null, addresses);
    return callback(null, first.address, first.family);
  });
};

/**
 * fetch() rejects with TypeError('fetch failed') and the real reason in `cause`. Surface a
 * connect-time refusal as the OutboundUrlBlockedError it is, so callers that branch on it (the
 * marketplace HTTP executor) treat a rebound name the same as one refused before the request.
 */
async function fetchSurfacingBlock(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const cause = (err as { cause?: unknown } | null)?.cause;
    if (cause instanceof OutboundUrlBlockedError) throw cause;
    throw err;
  }
}

let guardedAgent: Agent | undefined;
/** Undici dispatcher whose sockets resolve through guardedLookup. */
export function getGuardedAgent(): Agent {
  guardedAgent ??= new Agent({ connect: { lookup: guardedLookup, timeout: DEFAULT_TIMEOUT_MS } });
  return guardedAgent;
}

export interface OutboundFetchOptions extends OutboundUrlOptions {
  timeoutMs?: number;
}

/**
 * fetch() for user-supplied URLs. Throws OutboundUrlBlockedError when the URL, any DNS answer,
 * or any redirect target is not a public https destination.
 */
export async function safeOutboundFetch(
  rawUrl: string,
  init: RequestInit = {},
  options: OutboundFetchOptions = {}
): Promise<Response> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let url = await assertSafeOutboundUrl(rawUrl, options);
  let method = (init.method ?? 'GET').toUpperCase();
  let body = init.body;
  const headers = new globalThis.Headers(init.headers);

  for (let hop = 0; ; hop++) {
    const response = await fetchSurfacingBlock(url, {
      ...init,
      method,
      body,
      headers,
      signal,
      redirect: 'manual',
      dispatcher: getGuardedAgent(),
    } as RequestInit);
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;

    await response.body?.cancel().catch(() => undefined);
    if (hop >= MAX_REDIRECTS) throw new OutboundUrlBlockedError('too many redirects');
    let target: URL;
    try {
      target = await assertSafeOutboundUrl(new URL(location, url).toString(), options);
    } catch {
      throw new OutboundUrlBlockedError('redirect target not allowed');
    }
    if (target.origin !== url.origin) {
      headers.delete('authorization');
      headers.delete('cookie');
    }
    if (response.status !== 307 && response.status !== 308) {
      method = method === 'HEAD' ? 'HEAD' : 'GET';
      body = undefined;
      headers.delete('content-type');
    }
    url = target;
  }
}

/**
 * fetch() for long-lived streams to user-supplied URLs (MCP over SSE): the same URL, DNS and
 * connect-time checks as safeOutboundFetch, but no overall timeout (it would cut the stream)
 * and redirects refused instead of followed.
 */
export async function guardedStreamFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: OutboundUrlOptions = {}
): Promise<Response> {
  const url = await assertSafeOutboundUrl(String(rawUrl), options);
  return fetchSurfacingBlock(url, {
    ...init,
    redirect: 'error',
    dispatcher: getGuardedAgent(),
  } as RequestInit);
}

/** Read at most maxBytes of a response body as text, then stop reading. */
export async function readCappedText(
  response: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const room = maxBytes - total;
    chunks.push(value.byteLength > room ? value.subarray(0, room) : value);
    total += Math.min(value.byteLength, room);
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Parse at most maxBytes of a response body as JSON. */
export async function readCappedJson<T = unknown>(
  response: Response,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<T> {
  return JSON.parse(await readCappedText(response, maxBytes)) as T;
}
