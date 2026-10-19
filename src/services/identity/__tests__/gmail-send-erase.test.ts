/**
 * Deleting an account revokes the "send email as me" grant at Google and
 * deletes our copy, before the user record is erased (while the token can
 * still be read).
 *
 * Runs the REAL deleteAllData and gmail-send-as-user. Mocked: Firestore (an
 * in-memory persistence store), eraseUserRecord and Google (fetch).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore, type FakeDocs } from './fake-firestore-collections.js';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
  OAUTH_ENCRYPTION_KEY: 'test-key',
});

const docs = vi.hoisted(() => new Map<string, Map<string, unknown>>());
/** Every load: which collection, with which options. */
const loads = vi.hoisted(() => [] as { collection: string; options: unknown }[]);
/** Collections whose reads fail (Firestore unavailable). */
const failingReads = vi.hoisted(() => new Set<string>());
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    const col = docs.get(collection) ?? new Map<string, unknown>();
    docs.set(collection, col);
    return {
      load: async (uid: string, options?: { strict?: boolean }) => {
        loads.push({ collection, options });
        if (failingReads.has(collection)) {
          if (options?.strict) throw new Error('Firestore unavailable');
          return null;
        }
        return col.get(uid) ?? null;
      },
      get: async (uid: string) => col.get(uid) ?? null,
      setImmediate: async (uid: string, data: unknown) => void col.set(uid, data),
      delete: async (uid: string) => void col.delete(uid),
      shutdown: async () => undefined,
    };
  },
}));
const order = vi.hoisted(() => [] as string[]);
const eraseUserRecord = vi.hoisted(() => vi.fn(async () => void order.push('erase-record')));
vi.mock('../../platform/erase-user-record.js', () => ({ eraseUserRecord }));

// Pending revocations go to Firestore directly (google-revocations.ts); src/tests/setup.ts
// mocks getFirestoreDb globally, so point that mock at an in-memory store.
const firestoreDocs: FakeDocs = new Map();
const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
vi.mocked(getFirestoreDb).mockImplementation(
  () => fakeFirestore(firestoreDocs) as unknown as ReturnType<typeof getFirestoreDb>
);

const { completeGmailSendConnect } = await import('../gmail-send-as-user.js');
const { getDataExportService } = await import('../../data-export.js');
const { saveTokens: saveCalendarTokens } = await import('../google-calendar-token-store.js');

let calls: { url: string; body: string }[] = [];
/** What Google's revoke endpoint answers. */
let revokeStatus = 200;

beforeEach(() => {
  for (const col of docs.values()) col.clear();
  firestoreDocs.clear();
  loads.length = 0;
  failingReads.clear();
  revokeStatus = 200;
  eraseUserRecord.mockClear();
  order.length = 0;
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? '') });
    if (url === 'https://oauth2.googleapis.com/revoke') {
      order.push('revoke');
      return new Response('', { status: revokeStatus });
    }
    const claims = Buffer.from(JSON.stringify({ email: 'me@gmail.com' })).toString('base64url');
    return new Response(
      JSON.stringify({
        access_token: 'users-own-token',
        refresh_token: 'users-refresh',
        expires_in: 3600,
        scope: 'openid email https://www.googleapis.com/auth/gmail.send',
        id_token: `h.${claims}.s`,
      })
    );
  });
});

describe('account erasure and the Gmail send grant', () => {
  it('revokes the grant at Google, then deletes it, before the record is erased', async () => {
    await completeGmailSendConnect('user-1', 'code');
    expect(docs.get('gmail_send_tokens')?.has('user-1')).toBe(true);

    const results = await getDataExportService().deleteAllData('user-1');

    const revoke = calls.find((c) => c.url === 'https://oauth2.googleapis.com/revoke');
    expect(revoke?.body).toBe('token=users-refresh');
    expect(docs.get('gmail_send_tokens')?.has('user-1')).toBe(false);
    expect(order).toEqual(['revoke', 'erase-record']);
    expect(results.gmail_send_grant).toBe(true);
  });

  it('calls Google for nothing when the user never connected Gmail', async () => {
    const results = await getDataExportService().deleteAllData('user-2');
    expect(calls.filter((c) => c.url.includes('revoke'))).toHaveLength(0);
    expect(results.gmail_send_grant).toBe(true);
  });
});

describe('account erasure and the Google Calendar grant', () => {
  const calendarTokens = {
    access_token: 'cal-access',
    refresh_token: 'cal-refresh',
    expires_at: 0,
  };

  it('revokes the calendar grant and deletes its tokens before the record is erased', async () => {
    await saveCalendarTokens('user-3', calendarTokens);

    const results = await getDataExportService().deleteAllData('user-3');

    const revokes = calls.filter((c) => c.url === 'https://oauth2.googleapis.com/revoke');
    expect(revokes.map((c) => c.body)).toEqual(['token=cal-refresh']);
    expect(docs.get('google_calendar_tokens')?.has('user-3')).toBe(false);
    expect(order).toEqual(['revoke', 'erase-record']);
    expect(results.google_calendar_grant).toBe(true);
  });

  it('with Gmail send too, revokes both grants (Gmail first) before erasing', async () => {
    await completeGmailSendConnect('user-4', 'code');
    await saveCalendarTokens('user-4', calendarTokens);

    await getDataExportService().deleteAllData('user-4');

    const revokes = calls.filter((c) => c.url === 'https://oauth2.googleapis.com/revoke');
    expect(revokes.map((c) => c.body)).toEqual(['token=users-refresh', 'token=cal-refresh']);
    expect(order).toEqual(['revoke', 'revoke', 'erase-record']);
  });
});

describe('account erasure when Google or Firestore fails', () => {
  const calendarTokens = {
    access_token: 'cal-access',
    refresh_token: 'cal-refresh',
    expires_at: 0,
  };
  const pending = () => [...(firestoreDocs.get('pending_revocations')?.values() ?? [])];

  it('a revoke Google cannot take is queued (no user id), then the record is erased', async () => {
    await completeGmailSendConnect('user-5', 'code');
    await saveCalendarTokens('user-5', calendarTokens);
    revokeStatus = 503;

    await getDataExportService().deleteAllData('user-5');

    const queued = pending();
    expect(queued).toHaveLength(2);
    const { decryptData } = await import('../../../utils/token-encryption.js');
    const tokens = queued.map((e) => decryptData<{ token: string }>(e.encrypted as string)?.token);
    expect(tokens.sort()).toEqual(['cal-refresh', 'users-refresh']);
    for (const entry of queued) {
      expect(entry).toMatchObject({ provider: 'google', attempts: 0 });
      expect(JSON.stringify(entry)).not.toMatch(/user-5|refresh/);
    }
    expect(eraseUserRecord).toHaveBeenCalledWith('user-5');
  });

  it('a calendar token read that fails aborts the erasure before the record is erased', async () => {
    await saveCalendarTokens('user-6', calendarTokens);
    failingReads.add('google_calendar_tokens');

    await expect(getDataExportService().deleteAllData('user-6')).rejects.toThrow();
    expect(eraseUserRecord).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.url.includes('revoke'))).toHaveLength(0);
  });

  it('the Gmail grant is read fresh and strict: a failed read aborts too', async () => {
    await getDataExportService().deleteAllData('user-7');
    expect(loads).toContainEqual({
      collection: 'gmail_send_tokens',
      options: { fresh: true, strict: true },
    });

    failingReads.add('gmail_send_tokens');
    await expect(getDataExportService().deleteAllData('user-8')).rejects.toThrow();
    expect(eraseUserRecord).not.toHaveBeenCalledWith('user-8');
  });
});
