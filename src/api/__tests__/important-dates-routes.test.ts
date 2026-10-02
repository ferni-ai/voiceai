import { Readable } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeDb,
  type FakeDb,
} from '../../services/important-dates/__tests__/fake-firestore.js';

let db: FakeDb;
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import { handleImportantDatesRoutes, isImportantDatesRoute } from '../important-dates-routes.js';
import { importantDateIdFor } from '../../services/important-dates/index.js';
import { resetMigrationCacheForTests } from '../../services/important-dates/legacy-migration.js';

interface Res {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  method: string,
  path: string,
  opts: { user?: string | null; body?: unknown; raw?: string } = {}
): Promise<Res & { handled: boolean }> {
  const payload = opts.raw ?? (opts.body === undefined ? '' : JSON.stringify(opts.body));
  const headers: Record<string, string> = {};
  if (opts.user !== null) headers['x-firebase-uid'] = opts.user ?? 'user-1';
  const req = Object.assign(Readable.from(payload ? [Buffer.from(payload)] : []), {
    method,
    url: path,
    headers,
  }) as unknown as IncomingMessage;
  const out: Res = { status: 0, body: {} };
  let text = '';
  const res = {
    headersSent: false,
    setHeader: () => undefined,
    writeHead(status: number) {
      out.status = status;
      this.headersSent = true;
      return this;
    },
    end(chunk?: string) {
      text = chunk ?? '';
    },
  } as unknown as ServerResponse;
  const handled = await handleImportantDatesRoutes(req, res, path);
  out.body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { ...out, handled };
}

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-01T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('important dates routes', () => {
  it('only claims its own paths', async () => {
    expect(isImportantDatesRoute('/api/memory/me')).toBe(false);
    expect(isImportantDatesRoute('/api/memory/me/dates')).toBe(true);
    expect(isImportantDatesRoute('/api/memory/me/dates/x')).toBe(true);
    expect(isImportantDatesRoute('/api/memory/me/reminder-settings')).toBe(true);
    expect((await call('GET', '/api/memory/feedback')).handled).toBe(false);
  });

  it('requires a verified or anonymous-device identity', async () => {
    expect((await call('GET', '/api/memory/me/dates', { user: null })).status).toBe(401);
    expect((await call('GET', '/api/memory/me/reminder-settings', { user: null })).status).toBe(
      401
    );
  });

  it('creates, lists, edits and deletes a date', async () => {
    const created = await call('POST', '/api/memory/me/dates', {
      body: {
        title: "Sam's birthday",
        date: '--06-12',
        kind: 'birthday',
        person: 'Sam',
        reminderOffsets: [7, 0],
      },
    });
    expect(created.status).toBe(201);
    const date = created.body.date as Record<string, unknown>;
    expect(date).toMatchObject({
      id: importantDateIdFor('birthday:sam'),
      recurring: true,
      reminderOffsets: [7, 0],
      nextOccurrence: '2026-06-12',
      daysUntil: 11,
      source: 'user',
    });

    const listed = await call('GET', '/api/memory/me/dates');
    expect((listed.body.dates as unknown[]).length).toBe(1);

    const id = date.id as string;
    const patched = await call('PATCH', `/api/memory/me/dates/${id}`, {
      body: { remindersEnabled: false, channels: ['push'] },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.date).toMatchObject({
      remindersEnabled: false,
      channels: ['push'],
      nextReminderAt: null,
    });

    expect((await call('DELETE', `/api/memory/me/dates/${id}`)).body).toEqual({ deleted: true });
    expect((await call('DELETE', `/api/memory/me/dates/${id}`)).status).toBe(404);
  });

  it("can't see or change another user's date", async () => {
    const created = await call('POST', '/api/memory/me/dates', {
      body: { title: 'Taxes', date: '2026-06-15', kind: 'deadline' },
    });
    const id = (created.body.date as { id: string }).id;
    expect(
      (await call('PATCH', `/api/memory/me/dates/${id}`, { user: 'user-2', body: { title: 'x' } }))
        .status
    ).toBe(404);
    expect((await call('DELETE', `/api/memory/me/dates/${id}`, { user: 'user-2' })).status).toBe(
      404
    );
    expect(
      ((await call('GET', '/api/memory/me/dates', { user: 'user-2' })).body.dates as unknown[])
        .length
    ).toBe(0);
    expect(db.read(`bogle_users/user-1/important_dates/${id}`)?.title).toBe('Taxes');
  });

  it('validates input', async () => {
    expect((await call('POST', '/api/memory/me/dates', { body: { title: 'x' } })).status).toBe(400);
    expect(
      (await call('POST', '/api/memory/me/dates', { body: { title: 'x', date: 'June 12' } })).status
    ).toBe(400);
    expect(
      (
        await call('POST', '/api/memory/me/dates', {
          body: { title: 'x', date: '--06-12', kind: 'deadline' },
        })
      ).status
    ).toBe(400); // one-off without a year
    expect((await call('POST', '/api/memory/me/dates', { raw: '{nope' })).status).toBe(400);
    expect((await call('PATCH', '/api/memory/me/dates/not-an-id', { body: {} })).status).toBe(404);
    expect((await call('PUT', '/api/memory/me/dates')).status).toBe(405);
  });

  it('reads and updates reminder settings, rescheduling dates in the new time zone', async () => {
    const got = await call('GET', '/api/memory/me/reminder-settings');
    expect(got.body).toMatchObject({
      settings: { channels: { conversation: true, push: true, sms: false, email: false } },
      timeZone: 'America/New_York',
    });

    const created = await call('POST', '/api/memory/me/dates', {
      body: { title: "Sam's birthday", date: '--06-12', kind: 'birthday', reminderOffsets: [0] },
    });
    expect((created.body.date as { nextReminderAt: string }).nextReminderAt).toBe(
      '2026-06-12T13:00:00.000Z'
    );

    const put = await call('PUT', '/api/memory/me/reminder-settings', {
      body: {
        timeZone: 'America/Los_Angeles',
        channels: { sms: true },
        quietHours: { start: '22:00' },
      },
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      settings: {
        channels: { sms: true, push: true },
        quietHours: { start: '22:00', end: '08:00' },
      },
      timeZone: 'America/Los_Angeles',
    });
    const listed = await call('GET', '/api/memory/me/dates');
    expect((listed.body.dates as Array<{ nextReminderAt: string }>)[0].nextReminderAt).toBe(
      '2026-06-12T16:00:00.000Z'
    );

    expect(
      (await call('PUT', '/api/memory/me/reminder-settings', { body: { timeZone: 'Mars/Base' } }))
        .status
    ).toBe(400);
    expect(
      (await call('PUT', '/api/memory/me/reminder-settings', { body: { channels: { fax: true } } }))
        .status
    ).toBe(400);
    expect(
      (await call('PUT', '/api/memory/me/reminder-settings', { body: { sendTime: '25:00' } }))
        .status
    ).toBe(400);
  });
});
