/**
 * Input guards for the smart-home routes.
 *
 * - enc_ values: the agent stores secrets as enc_ ciphertexts. A user must not
 *   be able to submit one as their own credential and have the server decrypt
 *   it (a decryption oracle), so no saved credential may start with enc_.
 * - bridgeIp: the server fetches http://<bridgeIp>/ from Cloud Run. Only an
 *   RFC 1918 private address or a public unicast IPv4 literal is accepted.
 *   Hostnames (metadata.google.internal, metadata), IPv6, ports, loopback,
 *   link-local (169.254.0.0/16, which includes the metadata server) and the
 *   other reserved ranges are refused.
 */
import { isIPv4 } from 'node:net';

export function isEncryptedValue(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('enc_');
}

/** Throws if any credential field is an enc_ value (backstop for every save). */
export function assertNoEncryptedValues(fields: object): void {
  for (const [name, value] of Object.entries(fields)) {
    if (isEncryptedValue(value)) throw new Error(`${name} must not be an encrypted value`);
  }
}

const toInt = (ip: string) => ip.split('.').reduce((n, octet) => n * 256 + Number(octet), 0);
const cidr = (base: string, bits: number) => {
  const size = 2 ** (32 - bits);
  const start = toInt(base);
  return (n: number) => n >= start && n < start + size;
};

const PRIVATE = [cidr('10.0.0.0', 8), cidr('172.16.0.0', 12), cidr('192.168.0.0', 16)];
const RESERVED = [
  cidr('0.0.0.0', 8), // "this network"
  cidr('100.64.0.0', 10), // carrier-grade NAT
  cidr('127.0.0.0', 8), // loopback
  cidr('169.254.0.0', 16), // link-local, includes the metadata server
  cidr('192.0.0.0', 24), // IETF protocol assignments
  cidr('192.0.2.0', 24), // TEST-NET-1
  cidr('198.18.0.0', 15), // benchmarking
  cidr('198.51.100.0', 24), // TEST-NET-2
  cidr('203.0.113.0', 24), // TEST-NET-3
  cidr('224.0.0.0', 4), // multicast
  cidr('240.0.0.0', 4), // reserved, includes broadcast
];

/** True for an RFC 1918 address or a public unicast IPv4 literal; false for anything else. */
export function isSafeBridgeIp(ip: unknown): ip is string {
  if (typeof ip !== 'string' || !isIPv4(ip)) return false;
  const n = toInt(ip);
  if (PRIVATE.some((inRange) => inRange(n))) return true;
  return !RESERVED.some((inRange) => inRange(n));
}

type Result<T> = T | { status: 400 | 401; error: string };

/** The verified caller's Hue save, or why it is refused. Body userId is ignored. */
export function hueSaveInput(
  userId: string | null,
  body: unknown
): Result<{ userId: string; bridgeIp: string; username: string }> {
  const { bridgeIp, username } = (body ?? {}) as { bridgeIp?: unknown; username?: unknown };
  if (!userId) return { status: 401, error: 'sign in required' };
  if (typeof bridgeIp !== 'string' || typeof username !== 'string' || !bridgeIp || !username) {
    return { status: 400, error: 'bridgeIp and username required' };
  }
  if (isEncryptedValue(username))
    return { status: 400, error: 'username must not be an encrypted value' };
  if (!isSafeBridgeIp(bridgeIp)) {
    return { status: 400, error: 'bridgeIp must be a private (RFC 1918) or public IPv4 address' };
  }
  return { userId, bridgeIp, username };
}

/** The verified caller's LIFX save, or why it is refused. Body userId is ignored. */
export function lifxSaveInput(
  userId: string | null,
  body: unknown
): Result<{ userId: string; token: string }> {
  const { token } = (body ?? {}) as { token?: unknown };
  if (!userId) return { status: 401, error: 'sign in required' };
  if (typeof token !== 'string' || !token) return { status: 400, error: 'token required' };
  if (isEncryptedValue(token))
    return { status: 400, error: 'token must not be an encrypted value' };
  return { userId, token };
}
