/**
 * Last call's topic opens one call, not every call (LAST_TOPIC_ONCE, greeting-topic-once.ts).
 * Prod 2026-10-31: the owner's hello asked again about a thread already talked through,
 * because the profile's last summary was never replaced and nothing remembered asking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let line = 'Hey Sam, did the garden plan with your neighbour work out?';
let source: 'actor' | 'understudy' = 'actor';
const directedText = vi.fn(async (_sessionId: string, _req: unknown) => ({ text: line, source }));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

/** An in-memory Firestore: any collection/doc path, get and set. */
const docs = new Map<string, Record<string, unknown>>();
const reads = vi.fn();
const writes = vi.fn();
let failReads = false;
let failWrites = false;
let readDelayMs = 0;
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
const docRef = (path: string): unknown => ({
  collection: (name: string) => collectionRef(`${path}/${name}`),
  get: async () => {
    reads(path);
    if (readDelayMs) await wait(readDelayMs);
    if (failReads) throw new Error('unavailable');
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  },
  set: async (data: Record<string, unknown>) => {
    writes(path, data);
    if (failWrites) throw new Error('unavailable');
    docs.set(path, data);
  },
});
const collectionRef = (path: string): unknown => ({ doc: (id: string) => docRef(`${path}/${id}`) });
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collection: (name: string) => collectionRef(name) }),
}));

const { directedGreeting, rememberCallerHistory } = await import('../greeting-direction.js');
const { raisesTopic, topicKey } = await import('../greeting-topic-once.js');

const TOPIC = 'Planning the shared garden with a neighbour';
const RECORD = 'bogle_users/voice-eval-u1/greeting_state/last_topic';
const TOPIC_FACT = 'what you talked about last time';

type Request = { facts: Record<string, string> };
let n = 0;
/** One call's greeting for the same caller, with last call's summary `topic`. */
async function greet(topic: string, daysSince = 2): Promise<Request> {
  const sessionId = `gto-${++n}`;
  rememberCallerHistory(sessionId, { calls: 6, daysSince, lastTopic: topic });
  await directedGreeting(sessionId, 'ferni', { userId: 'voice-eval-u1', userName: 'Sam' });
  await wait(0); // the record is written in the background
  return directedText.mock.calls.at(-1)![1] as unknown as Request;
}

beforeEach(() => {
  docs.clear();
  reads.mockClear();
  writes.mockClear();
  failReads = false;
  failWrites = false;
  readDelayMs = 0;
  source = 'actor';
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
    line = 'Hey Sam, how is the training for the autumn 10k going?';
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

  it('does not mark a topic the hello was not given (same-day return holds it back)', async () => {
    expect((await greet(TOPIC, 0)).facts[TOPIC_FACT]).toBeUndefined();
    expect(writes).not.toHaveBeenCalled();
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
  });

  it('does not mark when the line spoken is the fallback, not the model', async () => {
    source = 'understudy';
    await greet(TOPIC);
    expect(writes).not.toHaveBeenCalled();
    source = 'actor';
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
  });

  it('a warm hello sharing only a feeling word does not burn the topic', async () => {
    const concert = 'Sam loved the concert and was so glad to go';
    line = 'Love hearing your voice, so glad you called!';
    expect((await greet(concert)).facts[TOPIC_FACT]).toBe(concert);
    expect(writes).not.toHaveBeenCalled();
    expect((await greet(concert)).facts[TOPIC_FACT]).toBe(concert);
  });

  it('waits at most a moment for the record, then offers the topic', async () => {
    await greet(TOPIC);
    readDelayMs = 1500;
    const started = Date.now();
    expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('a failed write is logged, never an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      failWrites = true;
      expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
      await wait(10);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
      expect((await greet(TOPIC)).facts[TOPIC_FACT]).toBe(TOPIC);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
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

describe('raisesTopic', () => {
  const summary =
    'Sam loved the concert, felt happy and excited, hoping to catch up with the band; ' +
    'missed the encore, thinking of the setlist, glad and grateful';
  it.each([
    'Love hearing your voice, so glad you called!',
    'Hey Sam, so happy you called!',
    "Hope your day's been kind to you, Sam.",
    "Sam! I'm excited to hear from you.",
    'Missed you, Sam. How are you?',
    'Welcome back, Sam!',
    'Hey Sam, ready to catch up?',
    'Hey Sam, I was just thinking about you.',
    'So nice to hear your voice, Sam.',
    'Thanks for calling, Sam, how are you feeling?',
    'Hey Sam, feeling grateful to hear from you!',
  ])('a warm hello is not the topic: %s', (hello) => {
    expect(raisesTopic(hello, summary, 'Sam')).toBe(false);
  });
  it.each(['Hey Sam, how was the concert?', 'Did they play the encore you missed, Sam?'])(
    'a hello about the topic raises it: %s',
    (hello) => {
      expect(raisesTopic(hello, summary, 'Sam')).toBe(true);
    }
  );

  // r3: one common word a hello shares with the summary is chance, not the topic.
  it.each([
    ["What's new with you, Sam?", 'Sam started a new job at a design studio.'],
    ["How's life, Sam?", 'Life at home has been chaotic since the new baby arrived.'],
    ['Long time no see, Sam!', 'They went on a long hike up the ridge trail.'],
    ['Big day today, Sam?', 'They planned a big birthday party for their dad.'],
    ['First time calling this week, huh?', 'Nervous about the first week at the studio.'],
    ['Feeling any better, Sam?', 'They want to start therapy and feel better.'],
    ["How's work treating you?", 'Work has been stressful because of a product launch.'],
    ["How's the family, Sam?", 'Their family is visiting and the house is full.'],
    ['How are things at home?', 'Life at home has been chaotic since the new baby arrived.'],
    ['How are the kids, Sam?', 'Their kids have a school play and they are sewing costumes.'],
    ['Anything you planned for tonight?', 'They planned a surprise for their sister.'],
    ['Did you get to start, Sam?', 'They want to start over and started journaling.'],
  ])('one common shared word is not the topic: %s', (hello, topic) => {
    expect(raisesTopic(hello, topic, 'Sam')).toBe(false);
  });
  it.each([
    ['How was the hike, Sam?', 'They went on a long hike up the ridge trail.'],
    ['Are you ready for the recital?', 'A piano recital on Saturday, practising every night.'],
    ["How's the new job going, Sam?", 'Sam started a new job at a design studio.'],
    ["How's the new baby?", 'Life at home has been chaotic since the new baby arrived.'],
  ])('an uncommon word, or two shared words, raises it: %s', (hello, topic) => {
    expect(raisesTopic(hello, topic, 'Sam')).toBe(true);
  });

  // Two common words count only as one phrase in both lines. Apart, they are chance, and
  // marking would drop last call's topic from every later greeting.
  it.each([
    ['Hey Sam, start of a new month!', 'Sam started a new job and the first days were hard.'],
    [
      "Hey Sam, how's the new week starting?",
      'Sam started a new job and the first days were hard.',
    ],
    [
      'Hey Sam, start of a new month!',
      'Sam had a hard time at work and wants to start over somewhere new.',
    ],
    [
      "Hey Sam, how's the new week starting?",
      'Sam had a hard time at work and wants to start over somewhere new.',
    ],
    [
      'Hey Sam, start of a new month!',
      'Sam went to two concerts this month and loved the new album.',
    ],
    // A phrase in the summary only: the hello says the words apart.
    ["Hey Sam, what's new this month?", 'Sam is excited about the new month of training.'],
  ])('two common words apart are not the topic: %s', (hello, topic) => {
    expect(raisesTopic(hello, topic, 'Sam')).toBe(false);
  });
  it('one common word said twice is not a phrase', () => {
    const topic = 'They went on a long, long hike up the ridge.';
    expect(raisesTopic('Hey Sam, long, long time no see!', topic, 'Sam')).toBe(false);
  });
  it.each([
    ['Enjoying the whole month off, Sam?', 'Sam is off work the whole month for surgery.'],
    ["How's the new job, Sam?", 'Sam started a new job last week.'],
    ['Did the kids start school okay, Sam?', "Sam's kids started school this week."],
    ['Hey Sam, how did the big meeting go?', 'Sam has a big meeting with the boss on Friday.'],
    ['Did school start okay, Sam?', "Sam's kids start school on Monday."],
  ])('two common words as one phrase raise it: %s', (hello, topic) => {
    expect(raisesTopic(hello, topic, 'Sam')).toBe(true);
  });
  it.each([
    ["Hey Sam, how's the knee?", 'Sam is training for a 10k and is worried about the knee.'],
    [
      'Hey Sam, any more concerts lately?',
      'Sam went to two concerts this month and loved the new album.',
    ],
    ['Hey Sam, been to any concerts since?', 'Sam went to a concert and loved it.'],
    ['Hey Sam, how was the concert?', 'Sam went to two concerts this month.'],
    [
      'Hey Sam, how is your mom doing after the surgery?',
      "Sam's mom is moving back home after the surgery.",
    ],
    ["Hey Sam, how's your mom recovering?", "Sam's mom is recovering from surgery."],
    ['Hey Sam, is the Ohio trip still on?', 'Sam is planning a big trip to see family in Ohio.'],
    ['Hey Sam, how is the new job?', 'Sam started a new job and the first days were hard.'],
    [
      'Hey Sam, did school start okay for the kids?',
      'Sam was stressed about money and the kids starting school.',
    ],
    ['Hey Sam, how is Biscuit settling in?', 'Sam adopted a puppy named Biscuit.'],
    ['Hey Sam, how did the interview go?', 'Sam has a job interview at the bakery.'],
    ['Hey Sam, any luck with the sourdough?', 'Sam is learning to bake sourdough bread.'],
    ['Hey Sam, how are you feeling about the surgery?', 'Sam is worried about the knee surgery.'],
  ])('a hello about the topic raises it: %s', (hello, topic) => {
    expect(raisesTopic(hello, topic, 'Sam')).toBe(true);
  });

  // Known limits: these assert today's behaviour. A future fix flips each one; when it
  // does, move the case to the list above it belongs in.
  it.each([
    // One common word, so a real mention is missed (the topic is offered again next call).
    ['Hey Sam, how did studying go?', 'Sam is studying for the bar exam.'],
    // "10k" has a digit, so it is not a word here; "training" alone is common.
    ['Hey Sam, how is the 10k training going?', 'Training for the autumn 10k.'],
    // "puppies" singularises to "puppie", so it never meets "puppy".
    ['Hey Sam, how is the puppy?', 'Sam adopted two puppies.'],
  ])('known limit, a real mention is missed today: %s', (hello, topic) => {
    expect(raisesTopic(hello, topic, 'Sam')).toBe(false);
  });
  it('known limit, a common phrase both lines happen to use marks today', () => {
    // "whole family" is one phrase in both, though the hello asks about no trip.
    const topic = 'Sam is planning a long weekend trip with the whole family.';
    expect(raisesTopic("Hey Sam, how's the whole family?", topic, 'Sam')).toBe(true);
  });
});

describe('topicKey', () => {
  it('is the same however the summary is spaced or cased, and differs by topic', () => {
    expect(topicKey('  Planning the  shared garden ')).toBe(topicKey('planning the shared garden'));
    expect(topicKey('Planning the shared garden')).not.toBe(topicKey('Training for a 10k'));
  });
});
