/**
 * Client IP resolution behind trusted proxies.
 *
 * X-Forwarded-For is a list each proxy APPENDS to, so only entries added by our own
 * infrastructure are trustworthy; anything left of them came from the caller. Reading
 * the first entry let anyone dodge per-IP limits with a random header, or burn someone
 * else's bucket by sending their IP.
 *
 * Production (john-bogle-ui on Cloud Run) has two kinds of front door, measured
 * 2026-10-09 via X-RateLimit-Remaining and Cloud Run request logs:
 *
 * 1. Direct: client → Google Front End → container, for *.run.app and the api.ferni.ai
 *    domain mapping. The GFE keeps whatever the caller sent and appends the address it
 *    accepted the connection from, so the client is the LAST entry (hops = 1).
 * 2. Firebase Hosting rewrite: client → Hosting CDN → Google egress → GFE → container.
 *    Hosting replaces the caller's header (a forged one is dropped) and puts the real
 *    client FIRST; the GFE then appends the Hosting egress address. Those egress
 *    addresses sit in Google-owned blocks that GCP customers can't rent, so when the
 *    trusted entry is one of them, the first entry is Hosting's word for the client.
 *
 * Residual risk: other Google services (e.g. Apps Script UrlFetch) can egress from the
 * same blocks, so a caller using one to hit *.run.app directly can choose the first
 * entry, which means dodging per-IP limits or spending a chosen victim's bucket. The
 * egress list is the 13 /24s seen carrying Hosting browser traffic over 30 days, not
 * the whole blocks, to keep that surface small; an unlisted egress fails safe (that
 * visitor is keyed by the egress address). Hosting's header rewrite is observed, not
 * documented, so a Hosting-path header with more than two entries is logged: it would
 * mean Hosting now appends, making the first entry forgeable again.
 *
 * Env: TRUSTED_PROXY_HOPS (default 1) is how many entries our own proxies append on the
 * direct path; raise it if a load balancer that appends is put in front.
 * FIREBASE_HOSTING_PROXY_CIDRS (comma-separated) replaces the egress blocks; empty disables.
 */

import type { IncomingMessage } from 'http';
import { BlockList, isIP } from 'net';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'ClientIp' });

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * /24s seen as Hosting egress for browser traffic in Cloud Run logs, 2026-09-09..10-09;
 * all inside Google-owned blocks (goog.json, absent from cloud.json). 66.249.72/24 and
 * 142.250.32/24 also appeared but carried only Googlebot hitting run.app directly.
 */
const DEFAULT_HOSTING_PROXY_CIDRS = [
  '64.233.172.0/24',
  '66.102.6.0/24',
  '66.102.8.0/24',
  '66.249.82.0/24',
  '66.249.84.0/24',
  '66.249.93.0/24',
  '74.125.209.0/24',
  '74.125.210.0/24',
  '74.125.212.0/24',
  '74.125.215.0/24',
  '192.178.11.0/24',
  '192.178.14.0/24',
  '192.178.15.0/24',
].join(',');

/** At most one warning per window, so a caller can't flood logs by sending long headers. */
const LONG_HOSTING_CHAIN_WARN_MS = 60 * 60 * 1000;
let longHostingChains = 0;
let lastLongChainWarnAt = -Infinity;

function noteLongHostingChain(entryCount: number): void {
  longHostingChains++;
  const now = Date.now();
  if (now - lastLongChainWarnAt < LONG_HOSTING_CHAIN_WARN_MS) return;
  lastLongChainWarnAt = now;
  log.warn(
    { entryCount, sinceLastWarning: longHostingChains },
    'Hosting-path X-Forwarded-For has more than two entries; Hosting may now append, so its first entry could be forged'
  );
  longHostingChains = 0;
}

const hostingProxies = new BlockList();
const hostingCidrs = process.env.FIREBASE_HOSTING_PROXY_CIDRS ?? DEFAULT_HOSTING_PROXY_CIDRS;
for (const cidr of hostingCidrs.split(',')) {
  // A malformed entry is skipped rather than thrown, so a bad env value can't stop boot.
  const [net = '', bits = ''] = cidr.trim().split('/');
  const family = isIP(net);
  const prefix = Number(bits);
  if (
    family !== 0 &&
    bits !== '' &&
    Number.isInteger(prefix) &&
    prefix >= 0 &&
    prefix <= (family === 6 ? 128 : 32)
  ) {
    hostingProxies.addSubnet(net, prefix, family === 6 ? 'ipv6' : 'ipv4');
  }
}

/** Entries our own proxies append to X-Forwarded-For (env TRUSTED_PROXY_HOPS, default 1). */
export function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? DEFAULT_TRUSTED_PROXY_HOPS);
  return Number.isInteger(hops) && hops >= 0 ? hops : DEFAULT_TRUSTED_PROXY_HOPS;
}

function isHostingProxy(ip: string): boolean {
  return hostingProxies.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

/**
 * The client IP: `entries[entries.length - hops]`, the entry our outermost trusted proxy
 * added, or the first entry when that proxy is Firebase Hosting (see above). Falls back
 * to the socket address when the header is missing, shorter than the trusted chain, or
 * the chosen entry isn't an IP. Never scans further left for something that parses,
 * since those entries are caller-controlled.
 */
export function getClientIp(req: IncomingMessage, hops = trustedProxyHops()): string {
  const socketIp = req.socket?.remoteAddress || 'unknown';
  const header = req.headers['x-forwarded-for'];
  if (header === undefined || header.length === 0 || hops === 0) return socketIp;

  const entries = (Array.isArray(header) ? header.join(',') : header)
    .split(',')
    .map((e) => e.trim());
  const trusted = entries[entries.length - hops];
  if (!trusted || !isIP(trusted)) return socketIp;
  if (!isHostingProxy(trusted)) return trusted;

  if (entries.length > 2) noteLongHostingChain(entries.length);
  const client = entries[0];
  return client && isIP(client) ? client : socketIp;
}
