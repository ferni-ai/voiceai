/**
 * The part of a client IP that a rate limit should key on.
 *
 * Keying by the full address lets any IPv6 caller reset a per-IP limit at
 * will: a single subscriber is normally handed a whole /64 (2^64 addresses),
 * so rotating the low 64 bits gives a fresh bucket per request. So IPv6 is
 * keyed by its /64 prefix, and an IPv4-mapped IPv6 address (::ffff:a.b.c.d)
 * by the IPv4 address it carries, so the two spellings share a bucket.
 *
 * @module utils/rate-limit-ip-key
 */

import { isIPv4, isIPv6 } from 'node:net';

/** Eight 16-bit groups, lower-case and without leading zeros. */
function expandIPv6(ip: string): string[] {
  let text = ip;
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes its two hextets.
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4Tail?.[1]) {
    const [a, b, c, d] = v4Tail[1].split('.').map(Number) as [number, number, number, number];
    const hex = (hi: number, lo: number): string => ((hi << 8) | lo).toString(16);
    text = `${text.slice(0, -v4Tail[1].length)}${hex(a, b)}:${hex(c, d)}`;
  }
  const [head = '', tail] = text.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail === undefined ? [] : tail ? tail.split(':') : [];
  const zeros =
    tail === undefined ? [] : Array<string>(8 - headParts.length - tailParts.length).fill('0');
  return [...headParts, ...zeros, ...tailParts].map((h) => parseInt(h, 16).toString(16));
}

/**
 * IPv4 as is; IPv6 as its /64 ("2001:db8:0:1::/64"); IPv4-mapped IPv6 as the
 * IPv4. Anything that isn't an IP (such as "unknown") comes back unchanged.
 */
export function rateLimitIpKey(ip: string): string {
  const address = ip.trim().toLowerCase().split('%')[0] ?? '';
  if (isIPv4(address)) return address;
  if (!isIPv6(address)) return ip;

  const h = expandIPv6(address);
  const isMapped = h.slice(0, 5).every((x) => x === '0') && h[5] === 'ffff';
  if (isMapped) {
    const hi = parseInt(h[6] ?? '0', 16);
    const lo = parseInt(h[7] ?? '0', 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return `${h.slice(0, 4).join(':')}::/64`;
}
