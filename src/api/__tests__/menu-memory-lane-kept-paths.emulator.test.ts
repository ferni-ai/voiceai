/**
 * "Memory Lane", kept commitments down every real completion path (the #2796
 * verifier's probe, as assertions). Each writer stores its completion time its
 * own way (a number, an ISO string, a Firestore Timestamp) and its text in its
 * own field (summary, statement, content); every one shows exactly one kept
 * card, and none ever reads "undefined". Real routes on node:http, real
 * firebase-admin on the Firestore emulator, loaded after vi.resetModules like
 * the separate API process.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb for every test; the writers
// and the routes read through them, so this file swaps the real ones back in.
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-menu-memory-lane-kept-paths';

const DAY = 24 * 60 * 60 * 1000;
const newUser = (tag: string) => `u-${tag}-${Math.random().toString(36).slice(2, 8)}`;
const kept = (text: string) => `You kept your promise: "${text}"`;
/** Noon one year ago today: On This Day's window. */
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
};

const keeper = () => import('../../services/superhuman/commitment-keeper.js');
const tracking = () => import('../../services/trust-systems/commitment-tracking.js');
const collector = () => import('../../services/memory-lane/memory-collector.js');
async function db() {
  const firestore = (await import('../../utils/firestore-utils.js')).getFirestoreDb();
  if (!firestore) throw new Error('no Firestore emulator');
  return firestore;
}
const userDoc = async (uid: string) => (await db()).collection('bogle_users').doc(uid);

/** The agent saves a commitment mid-call (commitment keeper). */
async function agentSaves(userId: string, summary: string): Promise<string> {
  const now = Date.now();
  const { commitment } = await (
    await keeper()
  ).saveCommitment(
    {
      userId,
      statement: `I'm going to ${summary} this week`,
      summary,
      text: summary,
      type: 'intention',
      emotionalWeight: 0.7,
      createdAt: now,
      lastMentioned: now,
      followUpAfter: now + 3 * DAY,
      status: 'active',
      followUpCount: 0,
    },
    { validateCalendar: false, createCalendarBlocks: false }
  );
  return commitment.id;
}

/** The in-call detector saves one (trust-systems: `content` only, ISO-string dates). */
async function detectorSaves(userId: string, content: string): Promise<string> {
  const id = `commitment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await (
    await tracking()
  ).saveCommitment({
    id,
    userId,
    content,
    type: 'explicit',
    status: 'active',
    createdAt: new Date(),
    lastMentioned: new Date(),
    followUpDate: null,
    followUpType: 'check_in',
    originalQuote: `I'm going to ${content}`,
    progressNotes: [],
    followUpCount: 0,
    followUpReception: 'unknown',
    importance: 'high',
    shouldFollowUp: true,
  } as never);
  return id;
}

/** A stored row in a shape some writer leaves behind. */
async function rawRow(userId: string, data: Record<string, unknown>): Promise<string> {
  const ref = await (
    await userDoc(userId)
  )
    .collection('commitments')
    .add({ userId, type: 'intention', createdAt: Date.now(), ...data });
  return ref.id;
}

async function storedKept(userId: string) {
  const snap = await (
    await userDoc(userId)
  )
    .collection('memory_highlights')
    .where('sourceType', '==', 'commitment_kept')
    .get();
  return snap.docs.map((d) => d.data());
}

let server: Server;
let base: string;

async function startServer(): Promise<void> {
  server?.close();
  vi.resetModules(); // the API server is another process
  const { handleMemoriesRoutes } = await import('../routes/memories.js');
  const { handleCommitmentsRoutes } = await import('../routes/commitments.js');
  server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void (async () => {
      if (await handleMemoriesRoutes(req, res, url.pathname, url)) return;
      if (await handleCommitmentsRoutes(req, res, url.pathname, url)) return;
      res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** The panel's request, as the verified caller (servers/api/request-identity.ts). */
async function call(method: string, path: string, uid: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'x-firebase-uid': uid, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

interface Card {
  content: string;
  type?: string;
  occurredAt?: string;
}
type Tab = 'highlights' | 'on-this-day' | 'timeline';
const TABS: Tab[] = ['highlights', 'on-this-day', 'timeline'];

async function tab(uid: string, which: Tab): Promise<{ cards: Card[]; raw: string }> {
  const r = await call('GET', `/api/memories/${which}`, uid);
  expect(r.status, `${which} status`).toBe(200);
  const body = JSON.parse(r.text);
  const cards: Card[] =
    which === 'timeline'
      ? body.groups.flatMap((g: { memories: Card[] }) => g.memories)
      : body.memories;
  return { cards, raw: r.text };
}

/** Commitment cards on one tab (memory type "commitment"). */
const commitmentCards = async (uid: string, which: Tab) =>
  (await tab(uid, which)).cards.filter((c) => c.type === 'commitment').map((c) => c.content);

describe.skipIf(!emulator)(
  'Memory Lane, kept commitments on every path (Firestore emulator)',
  () => {
    beforeAll(startServer);
    afterAll(() => server?.close());
    afterEach(() => {
      delete process.env.MINOR_CARE;
    });

    it('follow-through "yes" (ISO-string lastMentioned) shows once and writes one doc', async () => {
      const u = newUser('ft');
      const id = await agentSaves(u, 'call grandpa about the fishing trip');
      const ft = await import('../../services/trust-systems/commitment-follow-through.js');
      ft.noteFollowUpOffered(u, { id, content: 'call grandpa about the fishing trip' });
      expect(
        await ft.noteAskedFollowUps(u, 'Did you get to call grandpa about the fishing trip?')
      ).toEqual([id]);
      await (await tracking()).processCommitments(u, 'Yes, I did it, we talked for an hour!');
      const row = (await (await userDoc(u)).collection('commitments').doc(id).get()).data();
      expect(row?.status).toBe('completed');
      expect(typeof row?.lastMentioned).toBe('string'); // the shape this pins

      const card = kept('call grandpa about the fishing trip');
      for (let visit = 0; visit < 3; visit++) {
        expect(await commitmentCards(u, 'highlights')).toEqual([card]);
        await tab(u, 'on-this-day');
      }
      expect(await commitmentCards(u, 'timeline')).toEqual([card]);
      expect(await storedKept(u)).toHaveLength(1);
    });

    it('in-call "I finally ..." (content only, ISO dates) shows its content, once', async () => {
      const u = newUser('fin');
      await detectorSaves(u, 'organize the photo albums');
      await (
        await tracking()
      ).processCommitments(u, 'I finally organize the photo albums, all of them!');
      const card = kept('organize the photo albums');
      expect(await commitmentCards(u, 'highlights')).toEqual([card]);
      expect(await commitmentCards(u, 'highlights')).toEqual([card]);
      await tab(u, 'on-this-day');
      expect(await storedKept(u)).toHaveLength(1);
    });

    it('an in-call detector row completed from the panel never reads "undefined"', async () => {
      const u = newUser('panel');
      const id = await detectorSaves(u, 'repot the fern');
      expect((await call('POST', `/api/commitments/${id}/complete`, u)).status).toBe(200);
      expect(await commitmentCards(u, 'highlights')).toEqual([kept('repot the fern')]);
      for (const w of TABS) expect((await tab(u, w)).raw).not.toContain('undefined');
    });

    it('a completed row with no text shows no card', async () => {
      const u = newUser('blank');
      await rawRow(u, { status: 'completed', closedAt: Date.now(), lastMentioned: Date.now() });
      for (const w of TABS) {
        expect(await commitmentCards(u, w)).toEqual([]);
        expect((await tab(u, w)).raw).not.toContain('undefined');
      }
      expect(await storedKept(u)).toEqual([]);
    });

    it('a Firestore Timestamp completion time counts; an unparseable one is not kept', async () => {
      const { Timestamp } = await import('firebase-admin/firestore');
      const u = newUser('ts');
      const at = Date.now() - 2 * DAY;
      await rawRow(u, {
        status: 'completed',
        summary: 'wax the surfboard',
        lastMentioned: Timestamp.fromMillis(at),
      });
      await rawRow(u, {
        status: 'completed',
        summary: 'sort the spice rack',
        closedAt: 'soon',
        lastMentioned: 'not a date',
      });
      const cards = (await tab(u, 'highlights')).cards.filter((c) => c.type === 'commitment');
      expect(cards.map((c) => c.content)).toEqual([kept('wax the surfboard')]);
      expect(new Date(String(cards[0].occurredAt)).getTime()).toBe(at);
      expect((await storedKept(u)).map((d) => typeof d.keptAt)).toEqual(['number']);
    });

    it('concurrent first visits write one doc and show one card', async () => {
      const u = newUser('conc');
      const id = await agentSaves(u, 'repaint the fence');
      await (await keeper()).updateCommitmentStatus(u, id, 'completed');
      await Promise.all([
        call('GET', '/api/memories/highlights', u),
        call('GET', '/api/memories/on-this-day', u),
        call('GET', '/api/memories/highlights', u),
      ]);
      expect(await commitmentCards(u, 'highlights')).toEqual([kept('repaint the fence')]);
      expect(await storedKept(u)).toHaveLength(1);
      // A later visit never rewrites it, so a reaction left on the card stays.
      const ref = (await userDoc(u)).collection('memory_highlights').doc(`kept_${id}`);
      await ref.update({ reactions: [{ reaction: 'love', at: Date.now() }] });
      await call('GET', '/api/memories/highlights', u);
      expect((await ref.get()).get('reactions')).toHaveLength(1);
    });

    it('a judged (sensitive) commitment is never shown or stored', async () => {
      const u = newUser('sens');
      const id = await rawRow(u, {
        status: 'active',
        summary: 'pay the electric bill',
        statement: 'pay the electric bill',
        source: 'after-call-llm',
        sensitive: true,
        lastMentioned: Date.now(),
      });
      expect((await call('POST', `/api/commitments/${id}/complete`, u)).status).toBe(200);
      for (const w of TABS) expect(await commitmentCards(u, w)).toEqual([]);
      expect(await storedKept(u)).toEqual([]);
    });

    it('a credential is redacted on every tab and in the stored memory', async () => {
      const u = newUser('sec');
      const SECRET = 'Zq9!vortexPlum42';
      const id = await rawRow(u, {
        status: 'active',
        summary: `send mom the wifi password ${SECRET}`,
        statement: `I'll send mom the wifi password ${SECRET} tonight`,
        lastMentioned: Date.now(),
      });
      expect((await call('POST', `/api/commitments/${id}/complete`, u)).status).toBe(200);
      expect(await commitmentCards(u, 'highlights')).toEqual([
        kept('send mom the wifi password [secret]'),
      ]);
      for (const w of TABS) expect((await tab(u, w)).raw).not.toContain(SECRET);
      expect(JSON.stringify(await storedKept(u))).not.toContain(SECRET);
    });

    it('a credential in summary, statement or content alone is redacted the same way', async () => {
      const u = newUser('sec3');
      const SECRET = 'Kx7#lanternFig93';
      const rows: Record<string, Record<string, unknown>> = {
        summary: { summary: `text dad the garage password ${SECRET}` },
        statement: { statement: `email the landlord the alarm password ${SECRET}` },
        content: {
          content: `give the sitter the router password ${SECRET}`,
          originalQuote: `I'll give the sitter the router password ${SECRET}`,
        },
      };
      for (const data of Object.values(rows))
        await rawRow(u, { status: 'completed', closedAt: Date.now(), ...data });
      expect((await commitmentCards(u, 'highlights')).sort()).toEqual(
        [
          kept('email the landlord the alarm password [secret]'),
          kept('give the sitter the router password [secret]'),
          kept('text dad the garage password [secret]'),
        ].sort()
      );
      for (const w of TABS) expect((await tab(u, w)).raw).not.toContain(SECRET);
      const docs = await storedKept(u);
      expect(docs).toHaveLength(3);
      expect(JSON.stringify(docs)).not.toContain(SECRET);
    });

    it('MINOR_CARE: nothing is written for a held caller; after release it shows', async () => {
      const u = newUser('minor');
      const id = await agentSaves(u, 'practice the piano scales');
      const { closeCommitmentOrThrow } =
        await import('../../services/superhuman/commitment-store.js');
      await closeCommitmentOrThrow(u, id, 'completed');
      process.env.MINOR_CARE = 'on';
      // The route's modules are their own copies (startServer resets them), so hold it there.
      const mc = await import('../../utils/minor-care.js');
      expect(mc.heldAfter(`sess-${u}`, "I'm 13 years old", { userId: u })).toBe(true);
      expect(mc.writeHeld(u)).toBe(true);
      for (const w of TABS) expect(await commitmentCards(u, w)).toEqual([]);
      expect(await storedKept(u)).toEqual([]);
      delete process.env.MINOR_CARE;
      expect(await commitmentCards(u, 'highlights')).toEqual([kept('practice the piano scales')]);
    });

    it('Timeline applies the filter too: a made-time copy and a released one stay hidden', async () => {
      const u = newUser('tl');
      const id = await agentSaves(u, 'take the kayak to the lake');
      // The copy main used to save when a commitment was made: labelled kept, no keptAt.
      await (
        await collector()
      ).processCollectionInput({
        userId: u,
        sourceType: 'commitment_kept',
        sourceId: id,
        rawContent: 'take the kayak to the lake',
        occurredAt: new Date(),
      });
      expect(await commitmentCards(u, 'timeline')).toEqual([]);
      await (await keeper()).updateCommitmentStatus(u, id, 'completed');
      expect(await commitmentCards(u, 'highlights')).toEqual([kept('take the kayak to the lake')]);
      expect(await commitmentCards(u, 'timeline')).toEqual([kept('take the kayak to the lake')]);
      await (await keeper()).updateCommitmentStatus(u, id, 'dismissed');
      expect(await commitmentCards(u, 'timeline')).toEqual([]);
    });

    it('the kept date is the completion date (On This Day a year later)', async () => {
      const u = newUser('otd');
      const id = await agentSaves(u, 'run the half marathon');
      const when = yearAgo();
      const { closeCommitmentOrThrow } =
        await import('../../services/superhuman/commitment-store.js');
      expect(await closeCommitmentOrThrow(u, id, 'completed', when)).toBeTruthy();
      const card = kept('run the half marathon');
      const hl = (await tab(u, 'highlights')).cards.filter((c) => c.content === card);
      expect(hl).toHaveLength(1);
      expect(new Date(String(hl[0].occurredAt)).getTime()).toBe(when);
      expect(await commitmentCards(u, 'on-this-day')).toEqual([card]);
    });

    it('the routes fail closed when the store throws or hangs, and still show the rest', async () => {
      const u = newUser('fail');
      const id = await agentSaves(u, 'plant the apple tree');
      await (await keeper()).updateCommitmentStatus(u, id, 'completed');
      await (
        await collector()
      ).processCollectionInput({
        userId: u,
        sourceType: 'dream_progress',
        sourceId: 'dream-x',
        rawContent: 'sail around the bay',
        occurredAt: new Date(),
      });
      expect(await commitmentCards(u, 'highlights')).toEqual([kept('plant the apple tree')]);
      const modes: Record<string, () => Promise<never>> = {
        throws: () => Promise.reject(new Error('STORE_UNREADABLE')),
        hangs: () => new Promise<never>(() => {}),
      };
      try {
        for (const [mode, impl] of Object.entries(modes)) {
          vi.doMock('../../services/superhuman/commitment-store.js', async (orig) => ({
            ...(await orig<object>()),
            loadCompletedCommitmentsOrThrow: impl,
          }));
          await startServer();
          for (const w of TABS) {
            const t0 = Date.now();
            const { cards, raw } = await tab(u, w);
            expect(Date.now() - t0, `${mode} ${w} answers`).toBeLessThan(10_000);
            expect(raw, `${mode} ${w}`).not.toContain('apple tree');
            expect(raw).not.toMatch(/STORE_UNREADABLE|timed out/);
            if (w !== 'on-this-day')
              expect(cards.map((c) => c.content)).toContain('sail around the bay');
          }
          vi.doUnmock('../../services/superhuman/commitment-store.js');
        }
      } finally {
        vi.doUnmock('../../services/superhuman/commitment-store.js');
        await startServer();
      }
      expect(await commitmentCards(u, 'highlights')).toEqual([kept('plant the apple tree')]);
    }, 60_000);
  }
);
