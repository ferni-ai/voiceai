/**
 * /api/memory/me/finances — auth, ownership, list/edit/delete, validation,
 * redaction on edit (fake Firestore).
 */

import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  type FakeFirestore,
} from '../../services/user-preferences/__tests__/fake-firestore.js';

let fake: FakeFirestore;
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => fake,
}));
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false }));
vi.mock('../../services/important-dates/index.js', () => ({
  deleteImportantDate: async () => ({ success: true, data: { deleted: true } }),
}));

const { handleFinanceMemoryRoutes, isFinanceMemoryRoute } =
  await import('../finance-memory-routes.js');
const consent = await import('../../services/memory-consent/index.js');
const fin = await import('../../services/finance-memory/index.js');

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  opts: { uid?: string; body?: unknown } = { uid: 'user-1' }
): Promise<Captured & { handled: boolean }> {
  const raw = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = opts.uid ? { 'x-firebase-uid': opts.uid } : {};
  const captured: Captured = { status: 0, body: {} };
  const res = {
    headersSent: false,
    writeHead: (status: number) => {
      captured.status = status;
      return res;
    },
    setHeader: () => res,
    end: (data?: string) => {
      captured.body = data ? (JSON.parse(data) as Record<string, unknown>) : {};
    },
  } as unknown as ServerResponse;
  const handled = await handleFinanceMemoryRoutes(req, res, path.split('?')[0]!);
  return { ...captured, handled };
}

const U = { uid: 'user-1' };
let id = '';

beforeEach(async () => {
  fake = createFakeFirestore();
  consent.clearConsentCache();
  await consent.setCategoryConsent('user-1', 'finances', true, 'page');
  const r = await fin.upsertFinanceItem('user-1', {
    kind: 'debt',
    subject: 'credit card',
    text: 'Paying off their credit card',
    confidence: 0.85,
    source: 'explicit',
    conversationId: 'c1',
    amount: { value: 4000, currency: 'USD', said: '$4,000' },
  });
  id = r.item!.id;
});

describe('finance memory routes', () => {
  it('only claims its own paths and requires an identity', async () => {
    expect(isFinanceMemoryRoute('/api/memory/me/finances')).toBe(true);
    expect(isFinanceMemoryRoute('/api/memory/me/financesx')).toBe(false);
    expect((await call('GET', '/api/memory/me')).handled).toBe(false);
    expect((await call('GET', '/api/memory/me/finances', {})).status).toBe(401);
  });

  it('lists items and whether Money is on', async () => {
    const r = await call('GET', '/api/memory/me/finances');
    expect(r.status).toBe(200);
    expect(r.body.enabled).toBe(true);
    expect(r.body.items).toHaveLength(1);
    await consent.setCategoryConsent('user-1', 'finances', false, 'page');
    const off = await call('GET', '/api/memory/me/finances');
    expect(off.body.enabled).toBe(false);
    expect(off.body.items).toHaveLength(1); // still visible so it can be deleted
  });

  it('another user sees nothing and cannot touch the item', async () => {
    const other = { uid: 'user-2' };
    expect((await call('GET', '/api/memory/me/finances', other)).body.items).toEqual([]);
    expect((await call('DELETE', `/api/memory/me/finances/${id}`, other)).status).toBe(404);
    expect(
      (await call('PATCH', `/api/memory/me/finances/${id}`, { ...other, body: { text: 'x y z' } }))
        .status
    ).toBe(404);
  });

  it('edits (user wins, secrets redacted) and validates', async () => {
    const r = await call('PATCH', `/api/memory/me/finances/${id}`, {
      ...U,
      body: { text: 'Paying off the Visa 4111 1111 1111 1111', amount: null, dueDay: 12 },
    });
    expect(r.status).toBe(200);
    const item = r.body.item as Record<string, unknown>;
    expect(item).toMatchObject({ userEdited: true, dueDay: 12 });
    expect(item.text).not.toContain('4111');
    expect(item.amount).toBeUndefined();
    expect(
      (await call('PATCH', `/api/memory/me/finances/${id}`, { ...U, body: { dueDay: 99 } })).status
    ).toBe(400);
    expect((await call('PATCH', `/api/memory/me/finances/${id}`, { ...U, body: {} })).status).toBe(
      400
    );
    expect((await call('PATCH', '/api/memory/me/finances/not-an-id', U)).status).toBe(404);
  });

  it('deletes (tombstoned) and 405s other methods', async () => {
    expect((await call('POST', '/api/memory/me/finances')).status).toBe(405);
    const r = await call('DELETE', `/api/memory/me/finances/${id}`);
    expect(r.body).toEqual({ deleted: true });
    expect(fake.store.get(`bogle_users/user-1/memory_tombstones/${id}`)).toBeDefined();
    expect((await call('DELETE', `/api/memory/me/finances/${id}`)).status).toBe(404);
  });
});
