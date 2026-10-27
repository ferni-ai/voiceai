/**
 * AI_NOTICE_SPOKEN, the opening (NY GBL Art. 47, Seth 2026-10-26): the first call of the day
 * says Ferni is an AI inside its first line (greetingOrResume, the line the orchestrator
 * speaks); a second call within 24 h does not; each notice is recorded with its channel and
 * no words from the call. Flag off: the first line is exactly what it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { at: Date };
const fs = vi.hoisted(() => ({
  rows: new Map<string, Row[]>(),
  added: [] as Array<{ userId: string; row: Row }>,
  reads: 0,
  slow: false,
}));

function fakeDb() {
  return {
    collection: (top: string) => ({
      doc: (userId: string) => ({
        collection: (sub: string) => {
          if (top !== 'bogle_users' || sub !== 'ai_notices') throw new Error(`${top}/${sub}`);
          return {
            orderBy: (field: string, dir: string) => ({
              limit: (n: number) => ({
                get: async () => {
                  fs.reads++;
                  if (fs.slow)
                    await new Promise((r) => {
                      setTimeout(r, 5_000);
                    });
                  expect([field, dir, n]).toEqual(['at', 'desc', 1]);
                  const rows = [...(fs.rows.get(userId) ?? [])].sort(
                    (a, b) => b.at.getTime() - a.at.getTime()
                  );
                  return { docs: rows.slice(0, 1).map((r) => ({ get: (k: string) => r[k] })) };
                },
              }),
            }),
            add: async (row: Row) => {
              fs.added.push({ userId, row });
              fs.rows.set(userId, [...(fs.rows.get(userId) ?? []), row]);
            },
          };
        },
      }),
    }),
  };
}

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fakeDb(),
}));
const directedGreeting = vi.fn(async () => 'Hey Sam, how was the hike?');
vi.mock('../greeting-direction.js', () => ({
  directedGreeting,
  calmGreeting: (t: string) => t,
}));

const { greetingOrResume } = await import('../resume-after-drop.js');
const { noteNoticeChannel, resetAiNotices, weaveNotice, OPENING_NOTICE } =
  await import('../../shared/ai-notice.js');

const HOUR = 60 * 60 * 1000;
let n = 0;
const nextSession = () => `session-notice-${++n}`;
const firstLine = (sessionId: string, userId?: string) =>
  greetingOrResume(sessionId, { personaId: 'ferni' }, { userId, userName: 'Sam' });
const flush = () =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

beforeEach(() => {
  fs.rows.clear();
  fs.added = [];
  fs.reads = 0;
  fs.slow = false;
  resetAiNotices();
});
afterEach(() => {
  delete process.env.AI_NOTICE_SPOKEN;
});

describe('AI notice in the first line (AI_NOTICE_SPOKEN=on)', () => {
  beforeEach(() => {
    process.env.AI_NOTICE_SPOKEN = 'on';
  });

  it('first call of the day: the hello, then the notice, then the question; recorded with the phone channel', async () => {
    const sessionId = nextSession();
    noteNoticeChannel(sessionId, true);
    expect(fs.rows.get('user-1')).toBeUndefined();

    const line = await firstLine(sessionId, 'user-1');
    await flush();

    expect(line).toBe("Hey Sam. Just so you know, I'm an AI, not a person. How was the hike?");
    expect(fs.added).toHaveLength(1);
    const [{ userId, row }] = fs.added as [{ userId: string; row: Row }];
    expect(userId).toBe('user-1');
    expect(row).toMatchObject({ kind: 'opening', channel: 'phone', sessionId, personaId: 'ferni' });
    expect(row.at).toBeInstanceOf(Date);
    // ids, a time and enums only: never the words of the call
    expect(Object.keys(row).sort()).toEqual(['at', 'channel', 'kind', 'personaId', 'sessionId']);
  });

  it('second call within 24 h: no notice, nothing recorded', async () => {
    fs.rows.set('user-1', [{ at: new Date(Date.now() - 2 * HOUR), kind: 'opening' }]);
    const line = await firstLine(nextSession(), 'user-1');
    await flush();
    expect(fs.reads).toBe(1);
    expect(line).toBe('Hey Sam, how was the hike?');
    expect(fs.added).toHaveLength(0);
  });

  it('first call after 24 h: the notice again', async () => {
    fs.rows.set('user-1', [{ at: new Date(Date.now() - 25 * HOUR), kind: 'opening' }]);
    const line = await firstLine(nextSession(), 'user-1');
    await flush();
    expect(line).toContain(OPENING_NOTICE);
    expect(fs.added).toHaveLength(1);
  });

  it('two calls in a row: the first says it, the second does not', async () => {
    const first = await firstLine(nextSession(), 'user-2');
    await flush();
    const second = await firstLine(nextSession(), 'user-2');
    expect(first).toContain(OPENING_NOTICE);
    expect(second).not.toContain(OPENING_NOTICE);
  });

  it('a lookup that does not answer in time: says it (never skips on doubt)', async () => {
    fs.slow = true;
    const started = Date.now();
    const line = await firstLine(nextSession(), 'user-1');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(line).toContain(OPENING_NOTICE);
  });

  it('a caller with no member id: said every call, nothing stored about them', async () => {
    const line = await firstLine(nextSession(), 'anon:abc123');
    await flush();
    expect(line).toContain(OPENING_NOTICE);
    expect(fs.reads).toBe(0);
    expect(fs.added).toHaveLength(0);
  });
});

describe('AI notice off (default)', () => {
  it('leaves the first line exactly as it was, and reads and writes nothing', async () => {
    const line = await firstLine(nextSession(), 'user-1');
    await flush();
    expect(line).toBe('Hey Sam, how was the hike?');
    expect(fs.reads).toBe(0);
    expect(fs.added).toHaveLength(0);
  });
});

describe('weaveNotice', () => {
  it.each([
    [
      'Hey, what are you up to?',
      "Hey. Just so you know, I'm an AI, not a person. What are you up to?",
    ],
    [
      'Good morning Sam, sleep okay?',
      "Good morning Sam. Just so you know, I'm an AI, not a person. Sleep okay?",
    ],
    [
      'Sorry, I dropped for a second. You were telling me about Ryan.',
      "Sorry, I dropped for a second. Just so you know, I'm an AI, not a person. You were telling me about Ryan.",
    ],
    ['What a day.', "What a day. Just so you know, I'm an AI, not a person."],
    ['', OPENING_NOTICE],
  ])('%j', (line, woven) => {
    expect(weaveNotice(line)).toBe(woven);
  });

  it('the spoken words follow the voice rules: no em dash, ellipsis or exclamation', () => {
    expect(weaveNotice('Hey Sam, how was the hike?')).not.toMatch(/[—–…!]|\.\.\./);
  });
});
