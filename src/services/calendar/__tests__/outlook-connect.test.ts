/**
 * OUTLOOK_CONNECT end to end below the HTTP layer: the grant is sealed on the shared
 * store, the calendar tools read and create on Graph for the person on the call only,
 * and a link that can't answer says why (needs reconnecting / couldn't reach it),
 * never "your calendar is clear". Flag off keeps the old path.
 *
 * Real: outlook-link, the shared store and persistence layer over the Firestore fake,
 * calendar-service, the tool gate and the getCalendarToday / createCalendarEvent tools.
 * Mocked: Microsoft's token and Graph endpoints (fetch), Google (not connected).
 * Fixtures are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));
vi.mock('../../identity/google-calendar-oauth.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isCalendarConfigured: vi.fn(async () => false),
}));

const state: MergeFakeState = newMergeFakeState();
fake.db = createMergeFakeFirestore(state);

const link = await import('../providers/outlook-link.js');
const { getCalendarMode } = await import('../calendar-service.js');
const { smartCalendarTools } =
  await import('../../../tools/domains/calendar/calendar-connection-gate.js');
const { outlookCalendarProvider } = await import('../providers/outlook-provider.js');
const { outlookDisconnect } = await import('../index.js');
const { handleProvidersStatus } = await import('../../../api/calendar-routes/status-handlers.js');
const { isCalendarConfigured } = await import('../../identity/google-calendar-oauth.js');
const { createEvent: createUnifiedEvent } = await import('../unified-calendar-store.js');
const { CALENDAR_UNCHECKED, CALENDAR_MAYBE_INCOMPLETE } = await import('../not-connected-copy.js');
const { handleOutlookDisconnect } =
  await import('../../../api/calendar-routes/provider-handlers.js');

const A = 'uid-alice-0000000000000000';
const B = 'uid-bobby-0000000000000000';
const docOf = (uid: string) => `bogle_users/${uid}/outlook_tokens/data`;

/** Graph and the token endpoint, per test. Events are keyed by the bearer token. */
const net = {
  events: new Map<string, Array<{ id: string; subject: string; isCancelled?: boolean }>>(),
  graphStatus: 200,
  tokenReply: null as null | { status: number; body: unknown },
  tokenCalls: [] as URLSearchParams[],
  graphCalls: [] as Array<{ method: string; url: string; auth: string; body?: unknown }>,
};

const at = (hour: number) => {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace('Z', '');
};

function fetchMock(input: unknown, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.endsWith('/oauth2/v2.0/token')) {
    const params = new URLSearchParams(String(init?.body));
    net.tokenCalls.push(params);
    const reply = net.tokenReply ?? {
      status: 200,
      body: {
        access_token: `at-${params.get('code') ?? 'refreshed'}`,
        refresh_token: 'rt-new',
        expires_in: 3600,
      },
    };
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
  }
  const auth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
  const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
  net.graphCalls.push({ method: init?.method ?? 'GET', url, auth, body });
  if (net.graphStatus !== 200) {
    return Promise.resolve(new Response('{"error":{}}', { status: net.graphStatus }));
  }
  if ((init?.method ?? 'GET') === 'POST') {
    return Promise.resolve(new Response(JSON.stringify({ id: 'graph-evt-1' }), { status: 201 }));
  }
  const value = (net.events.get(auth.replace('Bearer ', '')) ?? []).map((e) => ({
    ...e,
    start: { dateTime: at(15), timeZone: 'UTC' },
    end: { dateTime: at(16), timeZone: 'UTC' },
  }));
  return Promise.resolve(new Response(JSON.stringify({ value }), { status: 200 }));
}

type Exec = { execute: (p: unknown, o: unknown) => Promise<unknown> };
const tool = (id: string, userId: string) =>
  smartCalendarTools.find((d) => d.id === id)!.create({ userId } as never) as Exec;
const today = (uid: string) => tool('getCalendarToday', uid).execute({}, {});

/** A grant whose access token is already expired, so the next read refreshes. */
async function connectExpired(uid: string) {
  net.tokenReply = {
    status: 200,
    body: { access_token: 'at-stale', refresh_token: 'rt-a', expires_in: 0 },
  };
  await connect(uid, 'code-x');
  net.tokenReply = null;
}

async function connect(uid: string, code: string) {
  return link.connectOutlook(uid, code, 'https://app.example/auth/microsoft/callback', `v-${code}`);
}

beforeEach(() => {
  // Same fake instance throughout (the stores keep the Firestore they first built), emptied.
  Object.assign(state, { ...newMergeFakeState(), docs: state.docs, writes: state.writes });
  state.docs.clear();
  state.writes.length = 0;
  Object.assign(net, { graphStatus: 200, tokenReply: null, tokenCalls: [], graphCalls: [] });
  net.events = new Map([
    ['at-code-a', [{ id: 'a1', subject: 'Dentist with Dr Rivera' }]],
    ['at-code-b', [{ id: 'b1', subject: 'Bobby private therapy' }]],
  ]);
  process.env.OUTLOOK_CONNECT = 'on';
  process.env.MICROSOFT_CLIENT_ID = 'fixture-client';
  process.env.MICROSOFT_CLIENT_SECRET = 'fixture-secret';
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-outlook-key-0123456789';
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as typeof fetch);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const uid of [A, B]) await link.disconnectOutlook(uid); // clears the store's caches
  for (const k of ['OUTLOOK_CONNECT', 'OAUTH_ENCRYPTION_KEY', 'CALENDAR_WRITE_TO_PROVIDER'])
    delete process.env[k];
});

describe('connect', () => {
  it('stores one sealed record: no plaintext token anywhere in the raw doc', async () => {
    expect(state.docs.get(docOf(A))).toBeUndefined();
    expect(await connect(A, 'code-a')).toBe('saved');

    const raw = JSON.stringify(state.docs.get(docOf(A)));
    expect(raw).toContain('encrypted');
    expect(raw).not.toContain('at-code-a');
    expect(raw).not.toContain('rt-new');
    const exchange = net.tokenCalls[0];
    expect(exchange.get('code_verifier')).toBe('v-code-a');
    expect(exchange.get('scope')).toBe('offline_access User.Read Calendars.ReadWrite');
    expect(await link.outlookLinkState(A)).toBe('connected');
  });

  it('fails closed with no token key: nothing written, no token exchange', async () => {
    delete process.env.OAUTH_ENCRYPTION_KEY;
    const saved = { s: process.env.TOKEN_SEALING_KEY, l: process.env.LOG_HASH_SECRET };
    delete process.env.TOKEN_SEALING_KEY;
    delete process.env.LOG_HASH_SECRET;
    try {
      expect(await connect(A, 'code-a')).toBe('no_key');
      expect(state.writes).toHaveLength(0);
      expect(net.tokenCalls).toHaveLength(0);
    } finally {
      if (saved.s !== undefined) process.env.TOKEN_SEALING_KEY = saved.s;
      if (saved.l !== undefined) process.env.LOG_HASH_SECRET = saved.l;
    }
  });

  it('disconnect deletes the record', async () => {
    await connect(A, 'code-a');
    await outlookDisconnect(A); // what /auth/microsoft/unlink and /calendar/outlook/disconnect call
    expect(state.docs.get(docOf(A))).toBeUndefined();
    expect(await link.outlookLinkState(A)).toBe('not_connected');
  });
});

describe('disconnect', () => {
  const disconnectRoute = async (uid: string) => {
    const res = {
      status: 0,
      writeHead(code: number) {
        this.status = code;
        return this;
      },
      setHeader() {},
      end() {},
    };
    await handleOutlookDisconnect({} as never, res as never, uid);
    return res.status;
  };

  it('deletes the sealed grant with the flag off too', async () => {
    await connect(A, 'code-a');
    delete process.env.OUTLOOK_CONNECT;
    expect(state.docs.has(docOf(A))).toBe(true);
    expect(await disconnectRoute(A)).toBe(200);
    expect(state.docs.has(docOf(A))).toBe(false);
  });

  it('a delete that fails answers 500, not success, and says so', async () => {
    await connect(A, 'code-a');
    state.failWrites.add(docOf(A));
    try {
      await expect(outlookDisconnect(A)).rejects.toThrow();
      expect(await disconnectRoute(A)).toBe(500);
      expect(state.docs.has(docOf(A))).toBe(true);
    } finally {
      state.failWrites.clear();
    }
  });

  it('no database (the strict read throws) is not a confirmed delete', async () => {
    const { removeStrict } = await import('../../identity/user-oauth-store.js');
    const noDb = {
      remove: async () => undefined,
      linkStatus: async () => {
        throw new Error('No Firestore (outlook_tokens)');
      },
    };
    expect(await removeStrict(noDb as never, A)).toEqual({ ok: false });
  });

  it('an undecryptable grant whose delete fails is still a failure (raw doc check)', async () => {
    state.docs.set(docOf(A), { encrypted: '{"encrypted":true,"data":"not-ours"}', updated_at: 1 });
    state.failWrites.add(docOf(A));
    try {
      await expect(outlookDisconnect(A)).rejects.toThrow();
      expect(await disconnectRoute(A)).toBe(500);
      expect(state.docs.has(docOf(A))).toBe(true);
    } finally {
      state.failWrites.clear();
    }
  });
});

describe('calendar tools read Outlook live, for the caller only', () => {
  it("A's read shows A's event and never B's", async () => {
    await connect(A, 'code-a');
    await connect(B, 'code-b');
    const reply = String(await today(A));
    expect(reply).toContain('Dentist with Dr Rivera');
    expect(reply).not.toContain('Bobby');
    expect(net.graphCalls.every((c) => c.auth === 'Bearer at-code-a')).toBe(true);
  });

  it('a cancelled Outlook event is not read out as a meeting', async () => {
    net.events.set('at-code-a', [{ id: 'a9', subject: 'Cancelled standup', isCancelled: true }]);
    await connect(A, 'code-a');
    const reply = String(await today(A));
    expect(reply).not.toContain('Cancelled standup');
    expect(net.graphCalls.length).toBeGreaterThan(0);
  });

  it("B's read after both connected shows B's event and never A's", async () => {
    await connect(A, 'code-a');
    await connect(B, 'code-b');
    const reply = String(await today(B));
    expect(reply).toContain('Bobby private therapy');
    expect(reply).not.toContain('Dentist');
    expect(net.graphCalls.every((c) => c.auth === 'Bearer at-code-b')).toBe(true);
  });

  it('an unread link doc never names Outlook: no other calendar gets the neutral line', async () => {
    await connect(A, 'code-a');
    state.failReads = new Set([docOf(A)]);
    try {
      expect(String(await today(A))).toBe(CALENDAR_UNCHECKED);
      const create = { title: 'Call the plumber', date: '2026-11-03', startTime: '09:30' };
      const wrote = String(await tool('createCalendarEvent', A).execute(create, {}));
      expect(wrote).toMatch(/couldn't check your calendar just now/);
      expect(wrote).not.toMatch(/Outlook|none is connected/);
      expect(net.graphCalls).toHaveLength(0);
    } finally {
      state.failReads = undefined;
    }
  });

  it("an unread link doc for a Google caller: Google's events are read, Outlook never named", async () => {
    const C = 'uid-carol-0000000000000000';
    const google = vi.mocked(isCalendarConfigured);
    google.mockImplementation(async (uid: string) => uid === C);
    await createUnifiedEvent(
      C,
      { title: 'Google standup', startTime: new Date(), durationMinutes: 30 },
      'google'
    );
    state.failReads = new Set([docOf(C)]);
    try {
      const reply = String(await today(C));
      expect(reply).toContain('Google standup');
      expect(reply).toContain(CALENDAR_MAYBE_INCOMPLETE);
      expect(reply).not.toMatch(/Outlook/);
      expect(net.graphCalls).toHaveLength(0);
    } finally {
      state.failReads = undefined;
      google.mockImplementation(async () => false);
    }
  });

  it('status never answers linked:true from an unread link doc', async () => {
    await connect(A, 'code-a');
    state.failReads = new Set([docOf(A)]);
    const res = {
      status: 0,
      body: '',
      writeHead(code: number) {
        this.status = code;
        return this;
      },
      setHeader() {},
      end(b?: string) {
        this.body = b ?? '';
      },
    };
    try {
      await handleProvidersStatus({} as never, res as never, A);
      expect(res.status).toBe(500);
      expect(res.body).not.toContain('"connected":true');
    } finally {
      state.failReads = undefined;
    }
  });

  it('a refresh Microsoft refuses (401 invalid_grant) is needs_reauth and is recorded', async () => {
    await connectExpired(A);
    net.tokenReply = { status: 401, body: { error: 'invalid_grant', error_codes: [70008] } };
    expect(state.docs.get(docOf(A))?.needs_reauth ?? null).toBeNull();
    const reply = String(await today(A));
    expect(reply).toMatch(/Outlook calendar needs reconnecting/);
    expect(state.docs.get(docOf(A))?.needs_reauth).toMatchObject({ errorClass: 'invalid_grant' });
    expect(await link.outlookLinkState(A)).toBe('needs_reauth');
    expect(net.graphCalls).toHaveLength(0);
  });

  it('needs_reauth reaches the caller as a reconnect line, not an empty day', async () => {
    await connect(A, 'code-a');
    state.docs.set(docOf(A), {
      ...state.docs.get(docOf(A)),
      needs_reauth: { at: 1, errorClass: 'invalid_grant' },
    });
    const reply = String(await today(A));
    expect(reply).toMatch(/Outlook calendar needs reconnecting/);
    expect(reply).not.toMatch(/clear|No meetings/i);
    expect(net.graphCalls).toHaveLength(0);
  });

  it('a Graph 5xx is unreachable: said so, nothing marked', async () => {
    await connect(A, 'code-a');
    net.graphStatus = 503;
    const reply = String(await today(A));
    expect(reply).toMatch(/couldn't reach your Outlook calendar/);
    expect(reply).not.toMatch(/clear|No meetings/i);
    expect(state.docs.get(docOf(A))?.needs_reauth ?? null).toBeNull();
  });

  it('a token endpoint 5xx on refresh is unreachable, not needs_reauth', async () => {
    await connectExpired(A);
    net.tokenReply = { status: 503, body: { error: 'temporarily_unavailable' } };
    const reply = String(await today(A));
    expect(reply).toMatch(/couldn't reach your Outlook calendar/);
    expect(state.docs.get(docOf(A))?.needs_reauth ?? null).toBeNull();
  });

  it('an expired token refreshes and the read goes on with the new one', async () => {
    await connectExpired(A);
    net.events.set('at-refreshed', [{ id: 'a2', subject: 'Yoga at noon' }]);
    expect(String(await today(A))).toContain('Yoga at noon');
    expect(net.tokenCalls.at(-1)?.get('grant_type')).toBe('refresh_token');
  });
});

describe('create through the tool', () => {
  const params = { title: 'Call the plumber', date: '2026-11-03', startTime: '09:30' };

  it('creates on Graph for the caller, in UTC, with no attendees', async () => {
    await connect(A, 'code-a');
    const reply = String(
      await tool('createCalendarEvent', A).execute({ ...params, attendees: ['x@example.com'] }, {})
    );
    const post = net.graphCalls.find((c) => c.method === 'POST');
    expect(post?.url).toMatch(/\/me\/events$/);
    expect(post?.auth).toBe('Bearer at-code-a');
    expect(post?.body).toMatchObject({ subject: 'Call the plumber', start: { timeZone: 'UTC' } });
    expect(post?.body).not.toHaveProperty('attendees');
    expect(reply).not.toMatch(/couldn't|reconnect/i);
  });

  it('a Graph failure on create says nothing was added', async () => {
    await connect(A, 'code-a');
    net.graphStatus = 500;
    const reply = String(await tool('createCalendarEvent', A).execute(params, {}));
    expect(reply).toMatch(/couldn't reach your Outlook calendar.*nothing was added/);
  });
});

describe('flag off', () => {
  it('keeps the old path: no Outlook mode, no Graph call, the store is not read', async () => {
    await connect(A, 'code-a');
    delete process.env.OUTLOOK_CONNECT;
    const readsBefore = state.writes.length;
    expect(await getCalendarMode(A)).toBe('local');
    const reply = String(await today(A));
    expect(reply).not.toContain('Dentist');
    expect(net.graphCalls).toHaveLength(0);
    expect(await outlookCalendarProvider.isConnected(A)).toBe(false); // legacy doc only
    expect(state.writes.length).toBe(readsBefore);
  });
});
