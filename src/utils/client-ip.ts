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
 * Env: TRUSTED_PROXY_HOPS (default 1) is how many entries our own proxies append on the
 * direct path; raise it if a load balancer that appends is put in front.
 * FIREBASE_HOSTING_PROXY_CIDRS (comma-separated) replaces the egress blocks; empty disables.
 */

import type { IncomingMessage } from 'http';
import { BlockList, isIP } from 'net';

const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/** Google-owned blocks (goog.json, absent from cloud.json) seen as Hosting egress. */
const DEFAULT_HOSTING_PROXY_CIDRS =
  '64.233.160.0/19,66.102.0.0/20,66.249.64.0/19,74.125.0.0/16,192.178.0.0/15';

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

  const client = entries[0];
  return client && isIP(client) ? client : socketIp;
}
