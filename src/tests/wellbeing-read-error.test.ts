/**
 * "How You're Feeling" read errors: a Firestore read that fails must reach the
 * panel as an error (500, so wellbeing-dashboard.ui.ts shows "couldn't load"),
 * not as an empty history. persistence.ts used to log and return []/null, so a
 * broken read looked exactly like a user who had never said how they feel.
 * Real persistence, data loader and route; only Firestore fails.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

const failingRead = vi.fn(async () => {
  throw new Error('14 UNAVAILABLE: firestore unreachable');
});
/** Any chain of collection/doc/where/orderBy/limit, whose get() fails. */
function failingRef(): Record<string, unknown> {
  const ref: Record<string, unknown> = { get: failingRead };
  for (const m of ['collection', 'doc', 'where', 'orderBy', 'limit']) ref[m] = () => ref;
  return ref;
}
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => failingRef(),
}));
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'reader', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));

const { handleWellbeingRoutes } = await import('../api/wellbeing.routes.js');

async function get(path: string): Promise<number> {
  let status = 0;
  const req = { method: 'GET', url: path, headers: { host: 'localhost' } } as IncomingMessage;
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(s: number) {
      status = s;
      return this;
    },
    end: vi.fn(),
  } as unknown as ServerResponse;
  const url = new URL(path, 'http://localhost');
  await handleWellbeingRoutes(req, res, url.pathname, url);
  return status;
}

describe('wellbeing panel read errors', () => {
  it('a failed Firestore read answers 500, not an empty dashboard', async () => {
    expect(await get('/api/wellbeing/dashboard')).toBe(500);
    expect(failingRead).toHaveBeenCalled();
  });

  it('the trends read fails the same way', async () => {
    expect(await get('/api/wellbeing/trends?period=month')).toBe(500);
  });

  it('other readers keep the old contract: a failed read is "no data"', async () => {
    const { loadSnapshots, loadProfile } =
      await import('../services/wellbeing-tracking/persistence.js');
    await expect(loadSnapshots('reader', 7)).resolves.toEqual([]);
    await expect(loadProfile('reader')).resolves.toBeNull();
  });
});
