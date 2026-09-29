import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'http';
import { isHealthAdminAuthorized, isProtectedHealthPath } from '../health-admin-auth.js';

function req(remoteAddress: string, headers: Record<string, string> = {}): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('isProtectedHealthPath', () => {
  it.each([
    ['/api/memory/cleanup', true],
    ['/api/memory/cleanup?x=1', true],
    ['/api/diagnostics/session?sessionId=abc', true],
    ['/health', false],
    ['/health/ready', false],
    ['/api/memory/metrics', false],
    ['/api/diagnostics', false],
  ])('%s -> %s', (url, expected) => {
    expect(isProtectedHealthPath(url)).toBe(expected);
  });
});

describe('isHealthAdminAuthorized', () => {
  afterEach(() => {
    delete process.env.HEALTH_ADMIN_TOKEN;
  });

  it('allows loopback callers', () => {
    expect(isHealthAdminAuthorized(req('127.0.0.1'))).toBe(true);
    expect(isHealthAdminAuthorized(req('::1'))).toBe(true);
  });

  it('does not trust loopback behind a proxy', () => {
    expect(isHealthAdminAuthorized(req('127.0.0.1', { 'x-forwarded-for': '198.51.100.1' }))).toBe(
      false
    );
  });

  it('rejects remote callers when no token is configured', () => {
    expect(isHealthAdminAuthorized(req('198.51.100.7'))).toBe(false);
    expect(
      isHealthAdminAuthorized(req('198.51.100.7', { authorization: 'Bearer anything' }))
    ).toBe(false);
  });

  it('requires the exact bearer token from remote callers', () => {
    process.env.HEALTH_ADMIN_TOKEN = 's3cret-token';
    expect(isHealthAdminAuthorized(req('198.51.100.7'))).toBe(false);
    expect(isHealthAdminAuthorized(req('198.51.100.7', { authorization: 'Bearer wrong' }))).toBe(
      false
    );
    expect(
      isHealthAdminAuthorized(req('198.51.100.7', { authorization: 'Bearer s3cret-token' }))
    ).toBe(true);
  });
});
