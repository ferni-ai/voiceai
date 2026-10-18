/**
 * Queued Google revokes (from account erasure) are stored encrypted with no
 * user id, retried with backoff, deleted once Google takes them, and dropped
 * after 14 days.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type FakeDocs } from './fake-firestore-collections.js';

process.env.OAUTH_ENCRYPTION_KEY = 'revocations-test-key';

const docs: FakeDocs = new Map();
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fakeFirestore(docs) }));
const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../utils/safe-logger.js', () => {
  const record = (...args: unknown[]) => void logged.push(args);
  return { createLogger: () => ({ debug: record, info: record, warn: record, error: record }) };
});

const { queueGoogleRevocation, retryPendingRevocations, revokeGoogleToken, GOOGLE_REVOKE_URL } =
  await import('../google-revocations.js');
const { decryptData } = await import('../../../utils/token-encryption.js');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18, 12);
const pending = () => docs.get('pending_revocations') ?? new Map();

let googleStatus: number | 'offline' = 200;
let googleBody = '';
const revoked: string[] = [];
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  expect(url).toBe(GOOGLE_REVOKE_URL);
  revoked.push(new URLSearchParams(String(init.body)).get('token') ?? '');
  if (googleStatus === 'offline') throw new TypeError('fetch failed');
  return new Response(googleBody, { status: googleStatus });
});

beforeEach(() => {
  docs.clear();
  logged.length = 0;
  revoked.length = 0;
  googleStatus = 200;
  googleBody = '';
  vi.stubGlobal('fetch', fetchMock);
});

describe('revokeGoogleToken', () => {
  const invalidToken = '{"error":"invalid_token","error_description":"Token expired or revoked"}';
  // Only a definitive "this token is dead" is refused; anything else may leave
  // the grant live, so it is unreachable and gets retried.
  it.each([
    [200, '', 'revoked'],
    [400, invalidToken, 'refused'],
    [400, '{"error":"invalid_request"}', 'refused'],
    [400, '{"error":"unsupported_token_type"}', 'unreachable'],
    [400, 'not json', 'unreachable'],
    [401, invalidToken, 'unreachable'],
    [403, '', 'unreachable'],
    [404, '', 'unreachable'],
    [408, '', 'unreachable'],
    [429, '{"error":"rate_limit_exceeded"}', 'unreachable'],
    [500, '', 'unreachable'],
    [502, '', 'unreachable'],
    [503, '', 'unreachable'],
  ] as const)('HTTP %i %s -> %s', async (status, body, outcome) => {
    googleStatus = status;
    googleBody = body;
    expect(await revokeGoogleToken('t')).toBe(outcome);
  });

  it('a network failure is unreachable', async () => {
    googleStatus = 'offline';
    expect(await revokeGoogleToken('t')).toBe('unreachable');
  });
});

describe('queueGoogleRevocation', () => {
  it('stores the token encrypted, with no user id', async () => {
    await queueGoogleRevocation('refresh-secret', NOW);

    const [[id, entry]] = [...pending()];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(entry).sort()).toEqual(
      ['attempts', 'createdAt', 'encrypted', 'nextAttemptAt', 'provider'].sort()
    );
    expect(entry).toMatchObject({ provider: 'google', attempts: 0, createdAt: NOW });
    expect(JSON.stringify(entry)).not.toContain('refresh-secret');
    expect(decryptData<{ token: string }>(entry.encrypted as string)?.token).toBe('refresh-secret');
  });
});

describe('retryPendingRevocations', () => {
  it('revokes a due entry at Google and deletes it', async () => {
    await queueGoogleRevocation('tok-1', NOW - 60_000);

    expect(await retryPendingRevocations(NOW)).toMatchObject({ due: 1, revoked: 1 });
    expect(revoked).toEqual(['tok-1']);
    expect(pending().size).toBe(0);
  });

  it('keeps the entry while Google is unreachable or rate-limiting, and backs off', async () => {
    await queueGoogleRevocation('tok-2', NOW - 60_000);
    googleStatus = 429;

    expect(await retryPendingRevocations(NOW)).toMatchObject({ retrying: 1, revoked: 0 });
    const [entry] = [...pending().values()];
    expect(entry.attempts).toBe(1);
    expect(entry.nextAttemptAt as number).toBeGreaterThan(NOW);

    // Not due again yet: Google isn't asked.
    revoked.length = 0;
    expect(await retryPendingRevocations(NOW + 1000)).toMatchObject({ due: 0 });
    expect(revoked).toEqual([]);
  });

  it('drops an entry Google refuses (the token is already invalid)', async () => {
    await queueGoogleRevocation('tok-3', NOW - 60_000);
    googleStatus = 400;
    googleBody = '{"error":"invalid_token"}';

    expect(await retryPendingRevocations(NOW)).toMatchObject({ refused: 1 });
    expect(pending().size).toBe(0);
  });

  it('gives up after 14 days without asking Google, and logs a count only', async () => {
    await queueGoogleRevocation('tok-old-secret', NOW - 15 * DAY);

    expect(await retryPendingRevocations(NOW)).toMatchObject({ gaveUp: 1 });
    expect(revoked).toEqual([]);
    expect(pending().size).toBe(0);
    expect(logged).toContainEqual([{ gaveUp: 1 }, 'Gave up on pending revocations']);
    expect(JSON.stringify(logged)).not.toContain('tok-old-secret');
  });
});
