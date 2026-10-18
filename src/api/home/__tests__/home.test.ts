/**
 * GET /api/home: light topics only, the caller's own data only, and a plain
 * greeting whenever nothing qualifies.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenerAsk } from '../../../intelligence/pondering/pondering-opener.js';
import { ponderedNoteId } from '../../../intelligence/pondering/note-id.js';
import type { FollowUp, FollowUpStore } from '../../../services/follow-through/index.js';
import { followUp } from '../../../services/follow-through/__tests__/fixtures.js';
import type { AuthContext } from '../../auth-middleware.js';
import { handleHomeRoute } from '../home-route.js';
import { buildHome, type HomeDeps } from '../home-service.js';
import { isLightTopic } from '../light-topic.js';

const NOW = new Date('2026-10-14T18:00:00.000Z'); // 14:00 in New York
const ON = { FOLLOW_THROUGH_OPENER: 'on' };

/** Follow-ups by uid; every read is recorded so a test can see whose data was asked for. */
function storeOf(byUser: Record<string, FollowUp[]>, reads: string[] = []): FollowUpStore {
  return {
    live: async (uid: string) => {
      reads.push(uid);
      return byUser[uid] ?? [];
    },
  } as unknown as FollowUpStore;
}

function deps(over: Partial<HomeDeps> = {}): HomeDeps {
  return {
    userId: 'u1',
    now: NOW,
    zone: 'America/New_York',
    env: ON,
    store: storeOf({ u1: [followUp({ userId: 'u1' })] }),
    forgotten: async () => [],
    pondered: async () => undefined,
    hasHistory: async () => true,
    ...over,
  };
}

describe('the light-topic filter', () => {
  it.each([
    'call mom',
    'the interview on Thursday',
    'the trip to Lisbon',
    'ask how Biscuit is settling in',
    "Sue's birthday dinner",
    'the call with Dana',
  ])('keeps "%s"', (text) => expect(isLightTopic(text)).toBe(true));

  it.each([
    // welcome-back's isSensitiveThread: grief, health, money, relationships, job loss
    'the funeral for your grandfather',
    'your divorce paperwork',
    'being laid off',
    'the biopsy results',
    'the money you owe',
    // coach-media's isSensitiveTopic: what the first one lets through
    'your back pain',
    'the workout plan',
    'sleep lately',
    // legal and other heavy topics neither covers
    'the custody hearing',
    'talking to the lawyer',
    'the immigration appointment',
  ])('holds back "%s"', (text) => expect(isLightTopic(text)).toBe(false));
});

describe('the Home line', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the follow-up the opener would pick, with its opaque id', async () => {
    const home = await buildHome(deps());
    expect(home.greeting).toEqual({ kind: 'followUp', text: 'call mom', topicId: 'f1' });
  });

  it('shows nothing heavy: a heavy pick becomes the time-of-day greeting, not a lighter row', async () => {
    const heavy = followUp({
      id: 'h',
      text: 'the biopsy results',
      createdAt: '2026-10-13T00:00:00Z',
    });
    const light = followUp({
      id: 'l',
      text: 'the trip to Lisbon',
      dueAt: null,
      source: { store: 'x', ref: '2' },
    });
    // The opener prefers the due, newer row: the heavy one. Home does not swap in the light one.
    const home = await buildHome(deps({ store: storeOf({ u1: [heavy, light] }) }));
    expect(home.greeting).toEqual({ kind: 'timeOfDay', text: 'Good afternoon.' });
  });

  it('is the time of day with the flag off', async () => {
    const home = await buildHome(deps({ env: {} }));
    expect(home.greeting).toEqual({ kind: 'timeOfDay', text: 'Good afternoon.' });
  });

  it('is the time of day when nothing qualifies, and by the zone it is given', async () => {
    const none = deps({ store: storeOf({ u1: [] }), zone: 'Asia/Tokyo' });
    expect((await buildHome(none)).greeting).toEqual({
      kind: 'timeOfDay',
      text: "You're up late.",
    });
    expect((await buildHome({ ...none, zone: undefined })).greeting.text).toBe('Hi.');
    expect((await buildHome({ ...none, zone: 'Not/AZone' })).greeting.text).toBe('Hi.');
  });

  it('is the first-visit line only for someone who has never had a call', async () => {
    const none = deps({ store: storeOf({}), hasHistory: async () => false });
    expect((await buildHome(none)).greeting.kind).toBe('firstVisit');
    // An unreadable history is not a first visit.
    const broken = { ...none, hasHistory: async () => Promise.reject(new Error('down')) };
    expect((await buildHome(broken)).greeting.kind).toBe('timeOfDay');
  });

  it('skips a topic the caller asked Ferni to forget, and offers nothing when that list is unreadable', async () => {
    const forgot = await buildHome(deps({ forgotten: async () => ['call mom'] }));
    expect(forgot.greeting.kind).toBe('timeOfDay');
    const unreadable = await buildHome(deps({ forgotten: async () => null }));
    expect(unreadable.greeting.kind).toBe('timeOfDay');
  });

  it('falls back when the store throws', async () => {
    const store = {
      live: async () => Promise.reject(new Error('boom')),
    } as unknown as FollowUpStore;
    expect((await buildHome(deps({ store }))).greeting.kind).toBe('timeOfDay');
  });

  it('does not mark anything surfaced: the store is only ever read', async () => {
    const store = storeOf({ u1: [followUp()] });
    await buildHome(deps({ store }));
    expect(Object.keys(store).sort()).toEqual(['live']);
  });
});

describe('the note', () => {
  const PASS = '2026-10-13T03:00:00Z';
  const ask = (text: string, ...at: [] | [string | undefined]): OpenerAsk => ({
    text,
    item: { text, basis: 's3' },
    generatedAt: at.length ? at[0] : PASS,
  });

  it('is the grounded pondered item, with a stable id and the pass time', async () => {
    const home = await buildHome(
      deps({ pondered: async () => ask('your sister moving to Denver') })
    );
    expect(home.note).toEqual({
      id: ponderedNoteId({ text: 'your sister moving to Denver', basis: 's3' }),
      text: 'your sister moving to Denver',
      createdAt: '2026-10-13T03:00:00Z',
    });
  });

  it('is left out when nothing is pondered, the pass time is unknown, or the topic is heavy', async () => {
    expect((await buildHome(deps())).note).toBeUndefined();
    expect(
      (await buildHome(deps({ pondered: async () => ask('your move', undefined) }))).note
    ).toBeUndefined();
    const heavy = await buildHome(deps({ pondered: async () => ask('how the chemo is going') }));
    expect(heavy.note).toBeUndefined();
  });

  it('is left out, with the greeting intact, when pondering throws', async () => {
    const home = await buildHome(deps({ pondered: async () => Promise.reject(new Error('down')) }));
    expect(home.greeting.kind).toBe('followUp');
    expect(home.note).toBeUndefined();
  });
});

describe('GET /api/home over HTTP', () => {
  const reads: string[] = [];
  const asked: string[] = [];
  let server: Server;
  let base = '';
  let auth: AuthContext | null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void handleHomeRoute(req, res, url.pathname, url, {
        authenticate: async () => auth,
        now: () => NOW,
        services: () => ({
          store: storeOf(
            {
              'uid-A': [followUp({ userId: 'uid-A', text: 'the interview on Thursday' })],
              'uid-B': [followUp({ userId: 'uid-B', text: "B's private errand" })],
            },
            reads
          ),
          forgotten: async () => [],
          pondered: async (uid) => {
            asked.push(uid);
            return undefined;
          },
          hasHistory: async () => true,
        }),
      }).then((handled) => {
        if (!handled) res.writeHead(404).end();
      });
    });
    await new Promise<void>((r) => {
      server.listen(0, '127.0.0.1', r);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.stubEnv('FOLLOW_THROUGH_OPENER', 'on');
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise<void>((r) => {
      server.close(() => r());
    });
  });
  beforeEach(() => {
    reads.length = 0;
    asked.length = 0;
    auth = { userId: 'uid-A', isAdmin: false, isDevMode: false, authMethod: 'firebase' };
  });

  it('answers the verified caller, including an anonymous one', async () => {
    auth = { ...auth!, isAnonymous: true };
    const res = await fetch(`${base}/api/home?tz=America/New_York`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/no-store|no-cache/);
    expect(await res.json()).toEqual({
      greeting: { kind: 'followUp', text: 'the interview on Thursday', topicId: 'f1' },
    });
  });

  it('binds to the token alone: a named userId, header or admin flag reads no one else', async () => {
    auth = { ...auth!, isAdmin: true };
    const res = await fetch(`${base}/api/home?userId=uid-B&tz=UTC`, {
      headers: { 'x-user-id': 'uid-B', 'x-firebase-uid': 'uid-B' },
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain('private errand');
    expect(new Set(reads)).toEqual(new Set(['uid-A']));
    expect(new Set(asked)).toEqual(new Set(['uid-A']));
  });

  it('is 401 with no verified person, and for a service API key', async () => {
    auth = null;
    expect((await fetch(`${base}/api/home`)).status).toBe(401);
    auth = { userId: 'svc', isAdmin: false, isDevMode: false, authMethod: 'api_key' };
    expect((await fetch(`${base}/api/home`)).status).toBe(401);
    expect(reads).toEqual([]);
  });

  it('answers only GET /api/home', async () => {
    expect((await fetch(`${base}/api/home`, { method: 'POST' })).status).toBe(404);
  });
});
