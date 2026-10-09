/**
 * Client IP Tests
 *
 * The client IP keys anonymous rate limits, so a caller must not be able to choose it
 * by sending X-Forwarded-For.
 *
 * @module utils/__tests__/client-ip.test
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from 'http';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import { getClientIp, trustedProxyHops } from '../client-ip.js';

function req(xff?: string | string[], remoteAddress = '169.254.8.1'): IncomingMessage {
  return {
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

const VICTIM = '198.51.100.7';
const CALLER = '203.0.113.50';
const HOSTING_EGRESS = '74.125.210.66'; // seen as Firebase Hosting's peer in Cloud Run logs

describe('getClientIp', () => {
  it('ignores a spoofed leading entry on the direct path', () => {
    expect(getClientIp(req(`${VICTIM}, ${CALLER}`))).toBe(CALLER);
  });

  it('takes the last entry with hops=1', () => {
    expect(getClientIp(req(`10.1.1.1, 10.2.2.2, ${CALLER}`), 1)).toBe(CALLER);
  });

  it('takes the second-to-last entry with hops=2', () => {
    expect(getClientIp(req(`${VICTIM}, ${CALLER}, 34.120.0.9`), 2)).toBe(CALLER);
  });

  it('uses the socket address when the header is shorter than the trusted chain', () => {
    expect(getClientIp(req(CALLER), 2)).toBe('169.254.8.1');
  });

  it('uses the first entry when the trusted entry is a Firebase Hosting egress', () => {
    // Hosting rewrites the header with the real client first; the GFE appends Hosting's address.
    expect(getClientIp(req(`${CALLER}, ${HOSTING_EGRESS}`))).toBe(CALLER);
  });

  it('does not trust Google addresses outside the observed Hosting egress /24s', () => {
    // 74.125.0.0/16 is Google-owned, but only specific /24s carry Hosting traffic.
    expect(getClientIp(req(`${VICTIM}, 74.125.100.5`))).toBe('74.125.100.5');
    expect(getClientIp(req(`${VICTIM}, 66.249.72.10`))).toBe('66.249.72.10'); // Googlebot
  });

  it('does not treat an ordinary last entry as Hosting', () => {
    expect(getClientIp(req(`${VICTIM}, 35.198.86.187`))).toBe('35.198.86.187');
  });

  it.each([
    ['garbage', `${VICTIM}, not-an-ip`],
    ['empty trailing entry', `${VICTIM}, `],
    ['header injection attempt', `${VICTIM}, 1.2.3.4\r\nX-Evil: 1`],
  ])('falls back to the socket address on %s, never scanning left', (_label, xff) => {
    expect(getClientIp(req(xff))).toBe('169.254.8.1');
  });

  it('falls back when Hosting forwarded a garbage client entry', () => {
    expect(getClientIp(req(`junk, ${HOSTING_EGRESS}`))).toBe('169.254.8.1');
  });

  it('falls back to remoteAddress when the header is missing', () => {
    expect(getClientIp(req(undefined, '192.0.2.4'))).toBe('192.0.2.4');
  });

  it('returns unknown with neither header nor socket address', () => {
    expect(getClientIp({ headers: {}, socket: {} } as unknown as IncomingMessage)).toBe('unknown');
  });

  it('joins repeated headers before picking from the right', () => {
    expect(getClientIp(req([VICTIM, CALLER]))).toBe(CALLER);
  });

  it('accepts IPv6 entries', () => {
    expect(getClientIp(req(`${VICTIM}, 2001:db8::1`))).toBe('2001:db8::1');
  });

  it('ignores the header entirely with hops=0', () => {
    expect(getClientIp(req(CALLER, '192.0.2.4'), 0)).toBe('192.0.2.4');
  });
});

describe('trustedProxyHops', () => {
  const original = process.env.TRUSTED_PROXY_HOPS;
  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = original;
  });

  it('defaults to 1', () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(trustedProxyHops()).toBe(1);
  });

  it('reads TRUSTED_PROXY_HOPS, which getClientIp uses by default', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(trustedProxyHops()).toBe(2);
    expect(getClientIp(req(`${VICTIM}, ${CALLER}, 34.120.0.9`))).toBe(CALLER);
  });

  it.each(['-1', '1.5', 'two'])('ignores an invalid value (%s)', (value) => {
    process.env.TRUSTED_PROXY_HOPS = value;
    expect(trustedProxyHops()).toBe(1);
  });
});

describe('FIREBASE_HOSTING_PROXY_CIDRS', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('skips malformed entries instead of throwing at load, and honours valid ones', async () => {
    vi.stubEnv('FIREBASE_HOSTING_PROXY_CIDRS', 'garbage, 1.2.3.4, 74.125.0.0/99, 10.9.0.0/16');
    vi.resetModules();
    const fresh = await import('../client-ip.js');

    expect(fresh.getClientIp(req(`${CALLER}, 10.9.4.4`))).toBe(CALLER);
    // The default Hosting blocks are replaced, not extended.
    expect(fresh.getClientIp(req(`${CALLER}, ${HOSTING_EGRESS}`))).toBe(HOSTING_EGRESS);
  });
});

describe('long Hosting-path chains', () => {
  // Fresh module per test: the warning throttle is module state.
  let getClientIp: typeof import('../client-ip.js').getClientIp;
  beforeEach(async () => {
    vi.resetModules();
    ({ getClientIp } = await import('../client-ip.js'));
  });
  afterEach(() => {
    vi.useRealTimers();
    warn.mockClear();
  });

  it('keeps using the first entry but warns, at most once per hour', () => {
    vi.useFakeTimers({ now: new Date('2026-10-09T00:00:00Z') });
    const xff = `${VICTIM}, ${CALLER}, ${HOSTING_EGRESS}`;

    expect(getClientIp(req(xff))).toBe(VICTIM);
    expect(getClientIp(req(xff))).toBe(VICTIM);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual({ entryCount: 3, sinceLastWarning: 1 });

    vi.advanceTimersByTime(60 * 60 * 1000);
    getClientIp(req(xff));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toEqual({ entryCount: 3, sinceLastWarning: 2 });
  });

  it('does not warn for the normal two-entry Hosting chain or the direct path', () => {
    getClientIp(req(`${CALLER}, ${HOSTING_EGRESS}`));
    getClientIp(req(`${VICTIM}, ${VICTIM}, ${CALLER}`));
    expect(warn).not.toHaveBeenCalled();
  });
});
