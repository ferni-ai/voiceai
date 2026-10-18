/**
 * The request a Google create actually sends (#1749), through the real Google
 * adapter and the real google-calendar-oauth client, with only fetch stubbed.
 * Pins: no guests, reminders as calendar-service sends them, and one id per
 * ask so a repeated create is Google's 409, which counts as already saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});
// Token storage only; createEvent is the real client.
vi.mock('../../identity/google-calendar-oauth.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getValidAccessToken: vi.fn(async () => 'token-1'),
}));
vi.mock('../unified-calendar-store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  importExternalEvent: vi.fn(),
}));

import { createEventInGoogle, googleEventIdFor } from '../provider-write.js';

const USER = 'request-user';
const INPUT = {
  title: 'Dentist',
  startTime: new Date('2026-11-03T18:00:00.000Z'),
  durationMinutes: 30,
  attendees: ['sam@example.com'],
};

type Sent = { url: URL; body: Record<string, unknown> };
const sent: Sent[] = [];
const replies: Response[] = [];

beforeEach(() => {
  sent.length = 0;
  replies.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({
        url: new URL(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return replies.shift() ?? new Response('{}', { status: 500 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const created = (id: string): Response =>
  new Response(JSON.stringify({ id, start: {}, end: {} }), { status: 200 });

describe('Google create request', () => {
  it('sends no guests, default reminders with no overrides, sendUpdates=none and our id', async () => {
    const id = googleEventIdFor(USER, INPUT);
    replies.push(created(id));

    const result = await createEventInGoogle(USER, INPUT);

    expect(result).toEqual({ status: 'saved', externalId: id });
    expect(sent).toHaveLength(1);
    expect(sent[0].url.searchParams.get('sendUpdates')).toBe('none');
    expect(sent[0].body.id).toBe(id);
    expect(sent[0].body.attendees).toEqual([]);
    expect(sent[0].body.reminders).toEqual({ useDefault: true });
    expect(JSON.stringify(sent[0].body)).not.toContain('example.com');
  });

  it('a repeated create sends the same id, and its 409 counts as already saved', async () => {
    const id = googleEventIdFor(USER, INPUT);
    replies.push(
      created(id),
      new Response('{"error":{"code":409,"message":"The requested identifier already exists."}}', {
        status: 409,
      })
    );

    const first = await createEventInGoogle(USER, INPUT);
    const second = await createEventInGoogle(USER, INPUT);

    expect(first).toEqual({ status: 'saved', externalId: id });
    expect(second).toEqual({ status: 'saved', externalId: id });
    expect(sent.map((s) => s.body.id)).toEqual([id, id]);
  });

  it('a different start is a different event id', () => {
    const later = { ...INPUT, startTime: new Date('2026-11-03T19:00:00.000Z') };
    expect(googleEventIdFor(USER, later)).not.toBe(googleEventIdFor(USER, INPUT));
    expect(googleEventIdFor(USER, INPUT)).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it('any other refusal is a failure, not a save', async () => {
    replies.push(new Response('{"error":{"code":403}}', { status: 403 }));

    expect(await createEventInGoogle(USER, INPUT)).toEqual({ status: 'failed' });
  });
});
