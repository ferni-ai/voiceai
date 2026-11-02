/**
 * Last call's topic opens one call, not every call (LAST_TOPIC_ONCE, greeting-topic-once.ts).
 * Prod 2026-10-31: the owner's hello asked again about a thread already talked through,
 * because the profile's last summary was never replaced and nothing remembered asking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let line = 'Hey Sam, did the garden plan with your neighbour work out?';
const directedText = vi.fn(async (_sessionId: string, _req: unknown) => ({
  text: line,
  source: 'actor',
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

/** An in-memory Firestore: any collection/doc path, get and set. */
const docs = new Map<string, Record<string, unknown>>();
const reads = vi.fn();
const writes = vi.fn();
let failReads = false;
const docRef = (path: string): unknown => ({
  collection: (name: string) => collectionRef(`${path}/${name}`),
  get: async () => {
    reads(path);
    if (failReads) throw new Error('unavailable');
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  },
  set: async (data: Record<string, unknown>) => {
    writes(path, data);
    docs.set(path, data);
  },
});
const collectionRef = (path: string): unknown => ({ doc: (id: string) => docRef(`${path}/${id}`) });
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collection: (name: string) => collectionRef(name) }),
}));

const { directedGreeting, rememberCallerHistory } = await import('../greeting-direction.js');
const { topicKey } = await import('../greeting-topic-once.js');

const TOPIC = 'Planning the shared garden with a neighbour';
const RECORD = 'bogle_users/voice-eval-u1/greeting_state/last_topic';
const TOPIC_FACT = 'what you talked about last time';

type Request = { facts: Record<string, string> };
let n = 0;
/** One call's greeting for the same caller, with last call's summary `topic`. */
async function greet(topic: string): Promise<Request> {
  const sessionId = `gto-${++n}`;
  rememberCallerHistory(sessionId, { calls: 6, daysSince: 2, lastTopic: topic });
  await directedGreeting(sessionId, 'ferni', { userId: 'voice-eval-u1', userName: 'Sam' });
  await new Promise((r) => setTimeout(r, 0)); // the record is written in the background
  return directedText.mock.calls.at(-1)![1] as unknown as Request;
}

beforeEach(() => {
  docs.clear();
  reads.mockClear();
  writes.mockClear();
  failReads = false;
  line = 'Hey Sam, did the garden plan with your neighbour work out?';
});
afterEach(() => vi.unstubAllEnvs());

describe('LAST_TOPIC_ONCE on', () => {
  beforeEach(() => vi.stubEnv('LAST_TOPIC_ONCE', 'on'));

  it('offers the topic once, then leaves it out while the summary is unchanged', async () => {
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
    expect(docs.get(RECORD)?.key).toBe(topicKey(TOPIC));
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBeUndefined();
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBeUndefined();
  });

  it('offers a new summary again', async () => {
    await greet(TOPIC);
    const next = 'Training for the autumn 10k';
    line = 'Hey Sam, how is the 10k training going?';
    expect((await greet(next)).facts[TOPIC_FACT]).toBe(next);
    expect(docs.get(RECORD)?.key).toBe(topicKey(next));
  });

  it('keeps offering a topic the hello did not raise', async () => {
    line = 'Hey Sam, good to hear from you. How is your evening?';
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
    expect(writes).not.toHaveBeenCalled();
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
  });

  it('offers the topic when the record cannot be read', async () => {
    await greet(TOPIC);
    failReads = true;
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
  });

  it('stores a hash, never the words', async () => {
    await greet(TOPIC);
    const stored = JSON.stringify(docs.get(RECORD));
    for (const word of ['garden', 'neighbour', 'planning']) expect(stored).not.toContain(word);
    expect(docs.get(RECORD)?.expireAt).toBeInstanceOf(Date);
  });
});

describe('LAST_TOPIC_ONCE off', () => {
  it('offers the topic every call and reads or writes nothing', async () => {
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
    expect(reads.mock.calls.filter(([p]) => String(p).includes('greeting_state'))).toEqual([]);
    expect(writes.mock.calls.filter(([p]) => String(p).includes('greeting_state'))).toEqual([]);
  });
});

describe('topicKey', () => {
  it('is the same however the summary is spaced or cased, and differs by topic', () => {
    expect(topicKey('  Planning the  shared garden ')).toBe(topicKey('planning the shared garden'));
    expect(topicKey('Planning the shared garden')).not.toBe(topicKey('Training for a 10k'));
  });
});
