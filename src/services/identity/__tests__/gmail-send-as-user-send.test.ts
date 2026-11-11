/**
 * sendAsUser: one email from the user's own Gmail with their gmail.send grant.
 *
 * Runs the REAL gmail-send-as-user and token encryption. Mocked: Firestore (an
 * in-memory persistence store) and Google's token and send endpoints (fetch).
 * Addresses and names are fictional.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
  OAUTH_ENCRYPTION_KEY: 'test-key',
  GMAIL_SEND_AS_USER: 'on',
});

const docs = vi.hoisted(() => new Map<string, unknown>());
const failingReads = vi.hoisted(() => ({ on: false }));
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    load: async (uid: string, options?: { strict?: boolean }) => {
      if (failingReads.on) {
        if (options?.strict) throw new Error('Firestore unavailable');
        return null;
      }
      return docs.get(uid) ?? null;
    },
    setImmediate: async (uid: string, data: unknown) => void docs.set(uid, data),
    delete: async (uid: string) => void docs.delete(uid),
  }),
}));

/** Every log line, as written: the test reads it for addresses and bodies. */
const lines = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger: Record<string, unknown> = {};
  for (const k of ['debug', 'info', 'warn', 'error', 'trace', 'fatal'])
    logger[k] = (...args: unknown[]) => void lines.push(args);
  logger.child = () => logger;
  return { createLogger: () => logger, getLogger: () => logger };
});

const { encryptData, decryptData } = await import('../../../utils/token-encryption.js');
const { sendAsUser, gmailSendFrom } = await import('../gmail-send-as-user.js');
const { usePersonFlagLookup } = await import('../../../config/person-flag.js');

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MSG = { to: 'pat.rivera@example.com', subject: 'Lunch Friday', body: 'See you at noon.' };

function grant(uid: string, over: Record<string, unknown> = {}): void {
  const tokens = {
    access_token: `access-${uid}`,
    refresh_token: `refresh-${uid}`,
    expires_at: Date.now() + 3_600_000,
    scope: 'openid email https://www.googleapis.com/auth/gmail.send',
    email: `${uid}@example.com`,
    ...over,
  };
  docs.set(uid, { encrypted: encryptData(tokens), updated_at: Date.now() });
}

let calls: { url: string; auth?: string; body: string }[];
/** What each endpoint answers next (a function so each call can differ). */
let sendReply: () => Response | Promise<Response>;
let tokenReply: () => Response;

const sends = () => calls.filter((c) => c.url === SEND_URL);
const refreshes = () => calls.filter((c) => c.url === TOKEN_URL);
/** The decoded RFC 2822 message of the n-th send. */
const mime = (n = 0) =>
  Buffer.from(JSON.parse(sends()[n].body).raw as string, 'base64url').toString('utf8');

beforeEach(() => {
  docs.clear();
  failingReads.on = false;
  calls = [];
  lines.length = 0;
  sendReply = () => new Response(JSON.stringify({ id: 'msg-123' }));
  tokenReply = () => new Response(JSON.stringify({ access_token: 'access-new', expires_in: 3600 }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, auth: headers.Authorization, body: String(init?.body ?? '') });
    return url === SEND_URL ? sendReply() : tokenReply();
  });
});

describe('sendAsUser', () => {
  it("sends once with the user's own bearer token and a correct MIME message", async () => {
    grant('user-a');
    expect(sends()).toHaveLength(0);

    const out = await sendAsUser('user-a', { ...MSG, replyTo: 'user-a@example.com' });

    expect(out).toEqual({ status: 'sent', messageId: 'msg-123' });
    expect(sends()).toHaveLength(1);
    expect(sends()[0].auth).toBe('Bearer access-user-a');
    expect(refreshes()).toHaveLength(0);
    const [head, body] = mime().split('\r\n\r\n');
    expect(head.split('\r\n')).toEqual([
      'To: pat.rivera@example.com',
      'Reply-To: user-a@example.com',
      'Subject: Lunch Friday',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
    ]);
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('See you at noon.');
  });

  it('encodes a non-ASCII subject as RFC 2047 words and the body as UTF-8 with CRLF', async () => {
    grant('user-a');
    const subject = 'Café à midi 🎂 — on se voit chez Zoë pour fêter son anniversaire demain';

    await sendAsUser('user-a', { ...MSG, subject, body: 'Ça marche.\nÀ demain' });

    const [head, body] = mime().split('\r\n\r\n');
    const subjectHeader = head.slice(head.indexOf('Subject: ') + 9, head.indexOf('\r\nMIME'));
    const encodedWords = subjectHeader.split('\r\n ');
    expect(encodedWords.length).toBeGreaterThan(1);
    for (const w of encodedWords) {
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
      expect(w.length).toBeLessThanOrEqual(75);
    }
    const decoded = encodedWords
      .map((w) => Buffer.from(w.slice(10, -2), 'base64').toString('utf8'))
      .join('');
    expect(decoded).toBe(subject);
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe(
      'Ça marche.\r\nÀ demain'
    );
  });

  it('refreshes an expired token first, sends with the new one and saves it', async () => {
    grant('user-a', { expires_at: Date.now() - 1000 });

    const out = await sendAsUser('user-a', MSG);

    expect(out.status).toBe('sent');
    expect(refreshes()).toHaveLength(1);
    expect(refreshes()[0].body).toContain('grant_type=refresh_token');
    expect(refreshes()[0].body).toContain('refresh_token=refresh-user-a');
    expect(sends().map((s) => s.auth)).toEqual(['Bearer access-new']);
    const saved = decryptData<{ access_token: string; expires_at: number }>(
      (docs.get('user-a') as { encrypted: string }).encrypted
    );
    expect(saved?.access_token).toBe('access-new');
    expect(saved!.expires_at).toBeGreaterThan(Date.now());
  });

  it('an invalid_grant refresh is needs_reauth, and nothing is sent', async () => {
    grant('user-a', { expires_at: Date.now() - 1000 });
    tokenReply = () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });

    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'needs_reauth' });
    expect(sends()).toHaveLength(0);
  });

  it('a 401 gets one refresh and one retry; a second 401 is needs_reauth', async () => {
    grant('user-a');
    sendReply = () => new Response('', { status: 401 });

    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'needs_reauth' });
    expect(sends().map((s) => s.auth)).toEqual(['Bearer access-user-a', 'Bearer access-new']);
    expect(refreshes()).toHaveLength(1);
  });

  it('a 403 is not_permitted, a 5xx, 429, network error or timeout is unreachable', async () => {
    grant('user-a');
    sendReply = () => new Response('', { status: 403 });
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'not_permitted' });
    for (const status of [500, 503, 429]) {
      sendReply = () => new Response('', { status });
      expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'unreachable' });
    }
    sendReply = () => Promise.reject(new TypeError('fetch failed'));
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'unreachable' });
    sendReply = () =>
      Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'unreachable' });
    sendReply = () => new Response('', { status: 400 });
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'rejected' });
  });

  it('puts a timeout on every call to Google', async () => {
    grant('user-a', { expires_at: 0 });
    await sendAsUser('user-a', MSG);
    const signals = vi.mocked(globalThis.fetch).mock.calls.map(([, init]) => init?.signal);
    expect(signals).toHaveLength(2);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  it('a 5xx on refresh is unreachable, not needs_reauth', async () => {
    grant('user-a', { expires_at: 0 });
    tokenReply = () => new Response('', { status: 502 });
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'unreachable' });
    expect(sends()).toHaveLength(0);
  });

  it('no grant is not_connected and calls Google not at all; an unreadable grant is unreachable', async () => {
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'not_connected' });
    failingReads.on = true;
    expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'unreachable' });
    expect(calls).toHaveLength(0);
  });

  it('GMAIL_SEND_AS_USER off: not_connected, and Google is never called', async () => {
    grant('user-a');
    vi.stubEnv('GMAIL_SEND_AS_USER', 'off');
    try {
      expect(await sendAsUser('user-a', MSG)).toEqual({ status: 'not_connected' });
      expect(calls).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('env off: only the person whose own GMAIL_SEND_AS_USER is on sends', async () => {
    grant('user-a');
    grant('user-b');
    vi.stubEnv('GMAIL_SEND_AS_USER', 'off');
    usePersonFlagLookup(async (uid) => (uid === 'user-a' ? 'on' : undefined));
    try {
      expect(await gmailSendFrom('user-b')).toBeNull();
      expect(await sendAsUser('user-b', MSG)).toEqual({ status: 'not_connected' });
      expect(calls).toHaveLength(0);
      expect(await gmailSendFrom('user-a')).toBe('user-a@example.com');
      await sendAsUser('user-a', MSG);
      expect(sends().map((s) => s.auth)).toEqual(['Bearer access-user-a']);
    } finally {
      usePersonFlagLookup(async () => undefined);
      vi.unstubAllEnvs();
    }
  });

  it("user B never sends with user A's token", async () => {
    grant('user-a');
    expect(await sendAsUser('user-b', MSG)).toEqual({ status: 'not_connected' });
    expect(calls).toHaveLength(0);

    grant('user-b');
    await sendAsUser('user-b', MSG);
    expect(sends().map((s) => s.auth)).toEqual(['Bearer access-user-b']);
  });

  it('refuses an address that could smuggle a header, and sends nothing', async () => {
    grant('user-a');
    for (const to of ['pat@example.com\r\nBcc: x@example.com', 'Pat <pat@example.com>', 'a@b']) {
      expect(await sendAsUser('user-a', { ...MSG, to })).toEqual({ status: 'bad_address' });
    }
    const replyTo = 'me@example.com\nBcc: x@example.com';
    expect(await sendAsUser('user-a', { ...MSG, replyTo })).toEqual({ status: 'bad_address' });
    expect(calls).toHaveLength(0);
  });

  it('logs ids and statuses only: never an address, subject or body', async () => {
    grant('user-a', { expires_at: 0 });
    tokenReply = () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    await sendAsUser('user-a', MSG);
    grant('user-a');
    sendReply = () => new Response('', { status: 500 });
    await sendAsUser('user-a', MSG);
    sendReply = () => new Response(JSON.stringify({ id: 'm' }));
    await sendAsUser('user-a', MSG);

    const logged = JSON.stringify(lines);
    expect(logged).toContain('Gmail send');
    for (const secret of [
      '@example.com',
      'Lunch Friday',
      'See you at noon',
      'access-',
      'refresh-',
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});
