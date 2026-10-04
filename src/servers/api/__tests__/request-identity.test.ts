/**
 * Identity comes only from verified credentials. On 2026-10-03 production
 * returned a made-up user's data export for a request with no token and a
 * spoofed X-Firebase-UID header or ?userId= query.
 */
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const optionalAuthAsync = vi.fn();
vi.mock('../../../api/auth-middleware.js', () => ({ optionalAuthAsync }));

const { bindVerifiedIdentity } = await import('../request-identity.js');

function req(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, headers: { ...headers } } as unknown as IncomingMessage;
}
const PROD = { NODE_ENV: 'production' };

describe('bindVerifiedIdentity', () => {
  beforeEach(() => {
    optionalAuthAsync.mockReset();
  });

  it('drops a client-supplied x-firebase-uid when there is no credential', async () => {
    const r = req('/api/export', { 'x-firebase-uid': 'victim' });
    expect(await bindVerifiedIdentity(r, PROD)).toBeNull();
    expect(r.headers['x-firebase-uid']).toBeUndefined();
    expect(optionalAuthAsync).not.toHaveBeenCalled();
  });

  it('sets x-firebase-uid from a verified token, overriding a spoofed one', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const r = req('/api/export', { authorization: 'Bearer t', 'x-firebase-uid': 'victim' });
    expect(await bindVerifiedIdentity(r, PROD)).toBe('real-user');
    expect(r.headers['x-firebase-uid']).toBe('real-user');
  });

  it('removes ?userId= from an anonymous request in production', async () => {
    const r = req('/api/export?userId=victim&format=json');
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/export?format=json');
  });

  it('replaces ?userId= with the verified uid in production', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const r = req('/api/export?userId=victim', { authorization: 'Bearer t' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/export?userId=real-user');
  });

  it('keeps an anonymous visitor id on public endpoints', async () => {
    const r = req('/api/v1/public/experiments?userId=visitor-1');
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/v1/public/experiments?userId=visitor-1');
  });

  it('treats a verification error as anonymous', async () => {
    optionalAuthAsync.mockImplementation(async () => {
      throw new Error('firebase down');
    });
    const r = req('/api/export?userId=victim', {
      authorization: 'Bearer t',
      'x-firebase-uid': 'victim',
    });
    expect(await bindVerifiedIdentity(r, PROD)).toBeNull();
    expect(r.headers['x-firebase-uid']).toBeUndefined();
    expect(r.url).toBe('/api/export');
  });

  it('drops a spoofed x-user-id header in production', async () => {
    const r = req('/api/seeds', { 'x-user-id': 'victim' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.headers['x-user-id']).toBeUndefined();
  });

  it('replaces x-user-id with the verified uid in production', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const r = req('/api/seeds', { authorization: 'Bearer t', 'x-user-id': 'victim' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.headers['x-user-id']).toBe('real-user');
  });

  it('fails closed when NODE_ENV is unset', async () => {
    const r = req('/api/export?userId=victim', { 'x-user-id': 'victim' });
    await bindVerifiedIdentity(r, {});
    expect(r.url).toBe('/api/export');
    expect(r.headers['x-user-id']).toBeUndefined();
  });

  it('scrubs a path that only looks like the landing prefix', async () => {
    const r = req('/api/landing-export?userId=victim');
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/landing-export');
  });

  it('lets a verified admin act for the target user it names', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'system', isAdmin: true });
    const r = req('/api/export?userId=target-user', { 'x-api-key': 'k' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/export?userId=target-user');
    expect(r.headers['x-firebase-uid']).toBeUndefined();
  });

  it('binds an admin with no target to their own id', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'admin-uid', isAdmin: true });
    const r = req('/api/export', { authorization: 'Bearer t' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.headers['x-firebase-uid']).toBe('admin-uid');
  });

  it('leaves the query alone outside production', async () => {
    const r = req('/api/export?userId=dev-user');
    await bindVerifiedIdentity(r, { NODE_ENV: 'development' });
    expect(r.url).toBe('/api/export?userId=dev-user');
  });
});
