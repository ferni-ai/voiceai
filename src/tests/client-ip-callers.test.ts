/**
 * Every client IP goes through utils/client-ip.
 *
 * Code that reads X-Forwarded-For or X-Real-IP itself tends to take the first entry,
 * which the caller writes, so it can dodge per-IP limits or spend someone else's.
 *
 * @module tests/client-ip-callers.test
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { getClientIp as tokenServerClientIp } from '../servers/token/validation.js';
import { createRateLimitMiddleware } from '../services/voice/voice-rate-limit.js';

const SRC = join(__dirname, '..');
const HELPER = 'utils/client-ip.ts';
const HEADER_READ = /['"]x-(forwarded-for|real-ip)['"]\s*\]/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'tests' || name === 'node_modules'
        ? []
        : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('client IP callers', () => {
  it('no source file outside the helper reads the forwarding headers', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path))
      .filter((path) => path !== HELPER)
      .filter((path) => HEADER_READ.test(readFileSync(join(SRC, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('token server ignores a forged first entry and X-Real-IP', () => {
    const ip = tokenServerClientIp({
      headers: { 'x-forwarded-for': '198.51.100.7, 203.0.113.50', 'x-real-ip': '198.51.100.7' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    expect(ip).toBe('203.0.113.50');
  });

  it('voice rate limit keys on the proxy-appended entry', () => {
    const limit = createRateLimitMiddleware('status');
    const res = {
      setHeader: () => undefined,
      status: () => ({ json: () => undefined }),
    };
    // A fresh forged first entry (and user) per request used to buy a fresh IP bucket.
    const call = (n: number) =>
      limit(
        {
          userId: `user-${n}`,
          headers: { 'x-forwarded-for': `198.51.100.${n % 250}, 203.0.113.99` },
          socket: { remoteAddress: '169.254.8.1' },
        },
        res
      );

    for (let n = 0; n < 100; n++) expect(call(n)).toBe(true);
    expect(call(100)).toBe(false);
  });
});
