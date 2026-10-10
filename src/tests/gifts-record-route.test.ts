/**
 * POST /api/gifts records the gift the app sends, on the day the person chose.
 *
 * Record a Gift sent no `contactName`, which the route requires, so every save was a 400.
 * And the route stamped every gift with today, whatever "When" said.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

const { recordGift, recordInteraction } = vi.hoisted(() => ({
  recordGift: vi.fn(async (_userId: string, gift: Record<string, unknown>) => ({ id: 'g1', ...gift })),
  recordInteraction: vi.fn(async () => undefined),
}));

vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'u1', isAdmin: false })),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../services/contacts/gift-tracking-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordGift,
}));
vi.mock('../services/contacts/contact-relationship-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordInteraction,
}));

import { handleGiftRoutes } from '../api/gift-routes.js';

/** What Record a Gift sends for "a chalk bag, for her birthday, on 2026-09-30" */
const FROM_THE_APP = {
  contactId: 'c1',
  contactName: 'Priya Raman',
  direction: 'given',
  item: 'A climbing chalk bag',
  occasion: 'birthday',
  date: '2026-09-30',
  reaction: 'loved',
};

async function post(body: unknown): Promise<number> {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'POST';
  req.headers = { 'x-firebase-uid': 'u1' };
  let status = 200;
  const res = {
    writeHead: vi.fn((code: number) => {
      status = code;
    }),
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  }, 0);
  await handleGiftRoutes(req, res, '/api/gifts', new URL('http://localhost/api/gifts'));
  return status;
}

describe('POST /api/gifts', () => {
  beforeEach(() => {
    recordGift.mockClear();
    recordInteraction.mockClear();
  });

  it('records the gift on the day chosen, and the moment with it', async () => {
    expect(await post(FROM_THE_APP)).toBe(201);
    const gift = recordGift.mock.calls[0][1];
    expect(gift).toMatchObject({ contactName: 'Priya Raman', item: 'A climbing chalk bag', reaction: 'loved' });
    expect((gift.date as Date).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect((recordInteraction.mock.calls[0] as unknown[])[1]).toMatchObject({ date: gift.date, linkedGiftId: 'g1' });
  });

  it('uses today when the date is missing or not a date', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await post({ ...FROM_THE_APP, date: 'not a date' });
    await post({ ...FROM_THE_APP, date: undefined });
    for (const [, gift] of recordGift.mock.calls) {
      expect((gift.date as Date).toISOString().slice(0, 10)).toBe(today);
    }
  });

  it('still needs a name to record a gift', async () => {
    expect(await post({ ...FROM_THE_APP, contactName: undefined })).toBe(400);
    expect(recordGift).not.toHaveBeenCalled();
  });
});
