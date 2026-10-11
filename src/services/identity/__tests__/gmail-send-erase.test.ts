/**
 * Deleting an account revokes the "send email as me" grant at Google and
 * deletes our copy, before the user record is erased (while the token can
 * still be read).
 *
 * Runs the REAL deleteAllData and gmail-send-as-user. Mocked: Firestore (an
 * in-memory persistence store), eraseUserRecord and Google (fetch).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
  OAUTH_ENCRYPTION_KEY: 'test-key',
});

const docs = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    const col = docs.get(collection) ?? new Map<string, unknown>();
    docs.set(collection, col);
    return {
      load: async (uid: string) => col.get(uid) ?? null,
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

const { completeGmailSendConnect } = await import('../gmail-send-as-user.js');
const { getDataExportService } = await import('../../data-export.js');

let calls: { url: string; body: string }[] = [];

beforeEach(() => {
  for (const col of docs.values()) col.clear();
  order.length = 0;
  calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? '') });
    if (url === 'https://oauth2.googleapis.com/revoke') order.push('revoke');
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
