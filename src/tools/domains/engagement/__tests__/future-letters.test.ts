/**
 * The futureSelfLetter tool keeps what it promises: a sealed letter is in the
 * store, read back once on or after its day, dropped when its topic is
 * forgotten, and offered by Jordan's hello only with FUTURE_LETTER_OPENER=on.
 * The real tool and the real store module run against a Firestore fake.
 */
import type { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isForgotten } from '../../../../memory/recall/session-recall.js';
import { createFutureLetterStore } from '../../../../services/stores/future-letter-store.js';
import type { ToolContext } from '../../../registry/types.js';
import { letterToOffer, setFutureLetterPorts } from '../future-letters.js';
import { futureSelfLetterDef } from '../life-planning-games.js';

// A Firestore fake with only the calls the store makes.
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const docRef = (path: string): Record<string, unknown> => ({
    collection: (name: string) => coll(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => void docs.set(path, { ...data }),
    update: async (data: Record<string, unknown>) => {
      if (!docs.has(path)) throw new Error(`no document ${path}`);
      docs.set(path, { ...docs.get(path), ...data });
    },
    delete: async () => void docs.delete(path),
  });
  const coll = (path: string): Record<string, unknown> => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string, op: string, value: unknown) => ({
      get: async () => {
        if (op !== '==') throw new Error(`op ${op} not faked`);
        const hits = [...docs.entries()].filter(
          ([p, d]) => p.startsWith(`${path}/`) && d[field] === value
        );
        return { docs: hits.map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) };
      },
    }),
  });
  return { db: { collection: (n: string) => coll(n) } as unknown as Firestore, docs };
}

const DAY = 24 * 60 * 60 * 1000;
const WRITTEN = new Date('2026-10-18T15:00:00.000Z');
const BODY = 'Dear me: I hope you finally ran the half marathon with Dana.';

let docs: Map<string, Record<string, unknown>>;
let owner: boolean;
let topics: string[] | null;

const ctx: ToolContext = {
  userId: 'u1',
  sessionId: 's1',
  agentId: 'jordan-taylor',
  agentDisplayName: 'Jordan',
};

interface Reply {
  response: string;
  sealed?: boolean;
  hasLetter?: boolean;
}
const letterTool = (): { execute: (args: Record<string, unknown>) => Promise<Reply> } =>
  futureSelfLetterDef.create(ctx) as never;
const seal = async (): Promise<Reply> =>
  letterTool().execute({ action: 'seal', content: BODY, deliveryDate: '1-month' });
const deliver = async (): Promise<Reply> => letterTool().execute({ action: 'deliver' });
const stored = () => [...docs.entries()].filter(([p]) => p.startsWith('bogle_users/u1/'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(WRITTEN);
  const fake = fakeFirestore();
  ({ docs } = fake);
  owner = true;
  topics = [];
  setFutureLetterPorts({
    store: () => createFutureLetterStore(fake.db),
    forgotten: async (_userId, text) => (topics === null ? null : isForgotten(text, topics)),
    ownerOnTheLine: () => owner,
  });
});

afterEach(() => {
  setFutureLetterPorts(null);
  vi.useRealTimers();
});

describe('futureSelfLetter keeps what it promises', () => {
  it('a reply that promises to keep the letter leaves it in the store', async () => {
    const reply = await seal();
    // The promise ("hold onto this", "keep it", "sealed") ...
    expect(reply.response).toMatch(/hold onto|keep it|sealed/i);
    // ... is only true if the store now holds the letter.
    const kept = stored();
    expect(kept).toHaveLength(1);
    expect(reply.response).toMatch(/I'll keep it until November 17, 2026/);
    expect(reply.sealed).toBe(true);
    expect(kept[0][0]).toMatch(/^bogle_users\/u1\/future_letters\//);
    expect(kept[0][1]).toMatchObject({
      body: BODY,
      status: 'sealed',
      writtenAt: WRITTEN.toISOString(),
      deliverAt: new Date(WRITTEN.getTime() + 30 * DAY).toISOString(),
    });
  });

  it('when nothing can be kept (not the owner), the reply promises nothing', async () => {
    owner = false;
    const reply = await seal();
    expect(reply.sealed).toBe(false);
    expect(reply.response).not.toMatch(/I'll keep it|sealed/i);
    expect(stored()).toHaveLength(0);
  });

  it('when the call layer never wired a store, the reply promises nothing', async () => {
    setFutureLetterPorts(null);
    const reply = await seal();
    expect(reply.sealed).toBe(false);
    expect(reply.response).not.toMatch(/I'll keep it/);
  });
});

describe('reading the letter back', () => {
  it('is not ready before its day, is read back once on it, and not again', async () => {
    await seal();
    vi.setSystemTime(new Date(WRITTEN.getTime() + 29 * DAY));
    expect((await deliver()).hasLetter).toBe(false);

    vi.setSystemTime(new Date(WRITTEN.getTime() + 30 * DAY));
    const read = await deliver();
    expect(read.hasLetter).toBe(true);
    expect(read.response).toContain(BODY);
    expect(read.response).toContain('October 18, 2026');
    expect(stored()[0][1]).toMatchObject({ status: 'delivered' });

    expect((await deliver()).hasLetter).toBe(false);
  });

  it('is never read to someone who is not the owner', async () => {
    await seal();
    vi.setSystemTime(new Date(WRITTEN.getTime() + 40 * DAY));
    owner = false;
    expect((await deliver()).hasLetter).toBe(false);
    expect(stored()[0][1]).toMatchObject({ status: 'sealed' });
  });

  it('drops a letter whose topic they asked Ferni to forget', async () => {
    await seal();
    topics = ['half marathon'];
    vi.setSystemTime(new Date(WRITTEN.getTime() + 31 * DAY));
    expect((await deliver()).hasLetter).toBe(false);
    expect(stored()).toHaveLength(0);
  });

  it('holds a letter (neither read nor dropped) while the forget list cannot be read', async () => {
    await seal();
    topics = null;
    vi.setSystemTime(new Date(WRITTEN.getTime() + 31 * DAY));
    expect((await deliver()).hasLetter).toBe(false);
    expect(stored()[0][1]).toMatchObject({ status: 'sealed' });
  });
});

describe("Jordan's hello offers a due letter (FUTURE_LETTER_OPENER)", () => {
  const ON = { FUTURE_LETTER_OPENER: 'on' };
  const jordan = { userId: 'u1', sessionId: 's1', personaId: 'jordan-taylor' };
  const due = new Date(WRITTEN.getTime() + 30 * DAY);

  it('offers it on or after its day, once a week, and only with the flag on', async () => {
    await seal();
    expect(await letterToOffer(jordan, new Date(due.getTime() - DAY), ON)).toBeUndefined();
    expect(await letterToOffer(jordan, due, {})).toBeUndefined();
    const offer = await letterToOffer(jordan, due, ON);
    expect(offer?.writtenOn).toBe('October 18, 2026');
    offer?.mark();
    await vi.waitFor(() => expect(stored()[0][1].offeredAt).toBe(due.toISOString()));
    expect(await letterToOffer(jordan, new Date(due.getTime() + DAY), ON)).toBeUndefined();
    expect(await letterToOffer(jordan, new Date(due.getTime() + 7 * DAY), ON)).toBeDefined();
  });

  it('stays quiet for another persona or a caller who is not the owner', async () => {
    await seal();
    expect(await letterToOffer({ ...jordan, personaId: 'ferni' }, due, ON)).toBeUndefined();
    owner = false;
    expect(await letterToOffer(jordan, due, ON)).toBeUndefined();
  });
});
