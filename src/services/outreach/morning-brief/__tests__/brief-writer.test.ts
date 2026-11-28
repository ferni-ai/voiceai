/**
 * MORNING_BRIEF_WRITER through the real run (runMorningBriefs), the real writer and the
 * real check: the issue's rows (#4412). The model, the crisis read, the opener store and
 * the send are fakes. Fictional user Sam in Chicago.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';

const screen = vi.hoisted(() => ({ refuse: '' }));
const logs = vi.hoisted(() => [] as Array<[string, Record<string, unknown>]>);
vi.mock('../../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<typeof import('../../../../utils/safe-logger.js')>();
  const keep = (o: Record<string, unknown>, m: string) => void logs.push([m, o]);
  const fake = { info: keep, warn: keep, error: keep, debug: keep, child: () => fake };
  return { ...real, createLogger: () => fake };
});
vi.mock('../../../../tools/domains/proactive/outreach/index.js', async (orig) => {
  const real = await orig<typeof import('../../../../tools/domains/proactive/outreach/index.js')>();
  return {
    ...real,
    storedTextForOwner: (texts: string[], ...rest: Parameters<typeof real.storedTextForOwner> extends [unknown, ...infer R] ? R : never) => // prettier-ignore
      screen.refuse !== '' && texts.some((t) => t.includes(screen.refuse)) ? false : real.storedTextForOwner(texts, ...rest), // prettier-ignore
  };
});

const { briefToSend, runMorningBriefs } = await import('../brief-job.js');
type Deps = import('../brief-job.js').MorningBriefDeps;
type Day = import('../brief-job.js').DayItems;

const SAM = 'uid-sam';
const ZONE = 'America/Chicago';
const DAY_ONE = new Date('2026-10-18T13:05:00Z'); // 08:05 in Chicago
const DAY_TWO = new Date('2026-10-19T13:05:00Z');
const ON = { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: SAM, MORNING_BRIEF_WRITER: 'on' };

const tasks = (titles: string[]) => titles.map((_, i) => ({ store: 'tasks' as const, ref: `t${i}` })); // prettier-ignore
const dayOf = (titles: string[], extra: Partial<Day> = {}): Day => ({
  events: [],
  reminders: ['Call the plumber'],
  tasks: titles,
  commitments: [],
  refs: {
    reminders: [{ store: 'reminders', ref: 'r1', dueAt: '2026-10-18T15:00:00Z' }],
    tasks: tasks(titles),
    commitments: [],
  },
  ...extra,
});
const THREE = dayOf(['Book the dentist', 'Return the library books']);
const ALEX =
  "Morning Sam, it's Alex. Call the plumber at 10am, then Book the dentist and Return the " +
  'library books when you can. Call me if you want a hand.';

function run(opts: {
  day?: Day;
  replies?: Array<string | null | Error>;
  env?: Record<string, string>;
  user?: Record<string, unknown>;
  crisis?: boolean;
  openers?: Map<string, string>;
  now?: Date;
}) {
  const replies = [...(opts.replies ?? [ALEX])];
  const generate = vi.fn(async (_p: string) => {
    const next = replies.length > 1 ? replies.shift() : replies[0];
    if (next instanceof Error) throw next;
    return next ?? null;
  });
  const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
  const openers = opts.openers ?? new Map<string, string>();
  const user = opts.user ?? { contactInfo: { timezone: ZONE }, name: 'Sam Rivera' };
  const deps: Deps = {
    env: { ...ON, ...opts.env },
    cohortUsers: async () => [],
    userDoc: async () => user,
    readDay: async () => opts.day ?? THREE,
    claims: { claim: async () => true, release: async () => undefined },
    sendText,
    sendPush: async () => true,
    writer: {
      generate,
      recentCrisis: async () => opts.crisis ?? false,
      openers: {
        get: async (_u, key) => openers.get(key) ?? null,
        set: async (_u, key, hash) => void openers.set(key, hash),
      },
    },
  };
  const now = opts.now ?? DAY_ONE;
  const template = briefToSend({ ...(opts.day ?? THREE), timeZone: ZONE, name: user.name ? 'Sam' : undefined }, SAM, deps.env); // prettier-ignore
  return {
    go: async () => {
      await runMorningBriefs(deps, now);
      return sendText.mock.calls[0]?.[0].body;
    },
    generate,
    template,
    openers,
  };
}

afterEach(() => {
  screen.refuse = '';
  logs.length = 0;
});

const written = () => logs.filter(([m]) => m === 'BRIEF_WRITTEN').map(([, o]) => o);

describe('MORNING_BRIEF_WRITER', () => {
  it('three items: Alex names all three, within 320', async () => {
    const r = run({});
    const sent = await r.go();
    expect(sent).toBe(ALEX);
    expect(sent!.length).toBeLessThanOrEqual(320);
    expect(r.generate.mock.calls[0][0]).toContain('"Return the library books"');
  });

  it('seven items: the top items plus a count of the rest', async () => {
    const seven = dayOf(['Book the dentist', 'Return the library books', 'Renew the passport', 'Water the garden', 'Pay the gym', 'Sort the garage']); // prettier-ignore
    const top = "Morning Sam, it's Alex. Call the plumber at 10am, Book the dentist and Return the library books, and four more."; // prettier-ignore
    const r = run({ day: seven, replies: [top] });
    expect(await r.go()).toBe(top);
  });

  it('a reply naming an item that is not in the facts sends the template', async () => {
    const r = run({ replies: [ALEX.replace('when you can', 'and pick up dry cleaning')] });
    expect(await r.go()).toBe(r.template);
  });

  it('a reply that drops an item sends the template', async () => {
    const r = run({ replies: [ALEX.replace(', then Book the dentist', '')] });
    expect(await r.go()).toBe(r.template);
  });

  it('a reply over 320 characters sends the template', async () => {
    const r = run({ replies: [`${ALEX} ${'Call me. '.repeat(30)}`] });
    expect(await r.go()).toBe(r.template);
  });

  it('a model error or no reply (a timeout) sends the template', async () => {
    const thrown = run({ replies: [new Error('model down')] });
    expect(await thrown.go()).toBe(thrown.template);
    const empty = run({ replies: [null] });
    expect(await empty.go()).toBe(empty.template);
  });

  it('a crisis read in the last 24 hours sends the template, and the model is not asked', async () => {
    const r = run({ crisis: true });
    expect(await r.go()).toBe(r.template);
    expect(r.generate).not.toHaveBeenCalled();
  });

  it('the same opener two days running is written again once', async () => {
    const openers = new Map<string, string>();
    await run({ openers }).go();
    const again = "Hey Sam, here's today. Call the plumber at 10am, then Book the dentist and Return the library books. Call me if you want a hand."; // prettier-ignore
    const r = run({ openers, now: DAY_TWO, replies: [ALEX, again] });
    expect(await r.go()).toBe(again);
    expect(r.generate.mock.calls[1][0]).toContain('first sentence different');
  });

  it('the same opener twice on the second day sends the template', async () => {
    const openers = new Map<string, string>();
    await run({ openers }).go();
    const r = run({ openers, now: DAY_TWO, replies: [ALEX] });
    expect(await r.go()).toBe(r.template);
  });

  it('no name on file: the prompt has none, and a reply with a name sends the template', async () => {
    const r = run({ user: { contactInfo: { timezone: ZONE } } });
    const sent = await r.go();
    expect(r.generate.mock.calls[0][0]).not.toContain('Sam');
    expect(sent).toBe(r.template);
    expect(sent).not.toContain('Sam');
  });

  it('a written brief the stored-text screen refuses sends the template', async () => {
    screen.refuse = 'when you can';
    const r = run({});
    expect(await r.go()).toBe(r.template);
  });

  it('a keep-ask item (#4390) sends the template, and the model is not asked', async () => {
    const asked = dayOf(['Book the dentist'], {});
    asked.refs!.tasks = [{ store: 'tasks', ref: 't0', keepAsk: true }];
    const r = run({ day: asked });
    expect(await r.go()).toBe(r.template);
    expect(r.generate).not.toHaveBeenCalled();
  });

  it('BRIEF_WRITTEN logs source, reason, chars and factCount, never the words', async () => {
    await run({}).go();
    await run({ replies: [null] }).go();
    expect(written()).toEqual([
      { source: 'model', reason: 'written', chars: ALEX.length, factCount: 3 },
      { source: 'template', reason: 'model-error', chars: expect.any(Number), factCount: 3 },
    ]);
    expect(JSON.stringify(written())).not.toMatch(/plumber|dentist|Sam/);
  });

  it('flag off == main: the template goes byte for byte, and the model is not asked', async () => {
    const r = run({ env: { MORNING_BRIEF_WRITER: 'off' } });
    expect(await r.go()).toBe(r.template);
    expect(r.generate).not.toHaveBeenCalled();
    expect(r.openers.size).toBe(0);
    expect(written()).toEqual([]);
  });
});
