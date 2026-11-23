/**
 * ALARM_ONE_SHAPE (#4316): an alarm set through chat (the productivity executor's setAlarm) and
 * one set by the voice tool are saved by one path, in one shape, so each can be listed, deleted
 * and snoozed from either side. A stored alarm from before (chat's old shape: `active`, no
 * `enabled`) reads as set. Off, as on main: a chat-set alarm is saved without `enabled`, and the
 * list never shows it. Real voice tools, the real chat executor and bridge, and the real alarm
 * store, over an in-memory Firestore. Every name here is made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../../agents/shared/tool-executors/types.js';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const depth = (p: string): number => p.split('/').length;
  const children = (path: string): Array<[string, Record<string, unknown>]> =>
    [...docs.entries()].filter(([p]) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1);
  const snap = (rows: Array<[string, Record<string, unknown>]>) => ({
    docs: rows.map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) })),
  });
  const coll = (path: string): Record<string, unknown> => ({
    doc: (id: string) => doc(`${path}/${id}`),
    get: async () => snap(children(path)),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => snap(children(path).filter(([, d]) => d[field] === value)),
    }),
  });
  const doc = (path: string): Record<string, unknown> => ({
    collection: (name: string) => coll(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => {
      docs.set(path, structuredClone(data));
    },
    delete: async () => {
      docs.delete(path);
    },
  });
  return { docs, db: { collection: (name: string) => coll(name) } };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fs.db,
}));
vi.mock('../../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => fs.db,
}));

const tools = await import('../alarm-tools.js');
const { productivityExecutor } =
  await import('../../../../agents/shared/tool-executors/productivity-executor.js');

const saved = { ...process.env };
let n = 0;
let uid = '';
let ctx: ToolExecutionContext = {};

beforeEach(() => {
  uid = `riley-test-${++n}`;
  ctx = { userId: uid };
});
afterEach(() => {
  process.env = { ...saved };
  vi.useRealTimers();
});

const on = (): void => {
  process.env.ALARM_ONE_SHAPE = 'on';
};

/** The chat path: the productivity executor, as the text-chat tool loop calls it. */
const chat = async (fn: string, args: Record<string, unknown> = {}): Promise<string> =>
  String(await productivityExecutor.execute(fn, args, ctx));

/** The voice path: the registered alarm tool. */
async function voice(id: string, args: Record<string, unknown> = {}): Promise<string> {
  const def = tools.alarmToolDefinitions.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const tool = def.create({ userId: uid } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return String(await tool.execute(args, {}));
}

const docsOf = (): Array<Record<string, unknown>> =>
  [...fs.docs.entries()]
    .filter(([p]) => p.startsWith(`bogle_users/${uid}/alarms/`))
    .map(([, d]) => d);

/** Pins the clock to 07:02 today, so an alarm at 07:00 is the one a snooze finds. */
function sevenOhTwo(): void {
  const now = new Date();
  now.setHours(7, 2, 0, 0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
}

describe('ALARM_ONE_SHAPE', () => {
  it('main: an alarm set through chat is saved, but no list shows it', async () => {
    expect(await chat('setAlarm', { time: '7am', label: 'fern run' })).toMatch(/^Saved an alarm/);
    expect(docsOf()).toHaveLength(1);
    expect(docsOf()[0]).not.toHaveProperty('enabled');
    expect(await chat('getAlarms')).toMatch(/^You don't have any alarms set/);
    expect(await voice('getAlarms')).not.toMatch(/fern run/);
  });

  // Each way of setting an alarm, then each way of reading or changing it.
  const SETTERS = {
    chat: async () => chat('setAlarm', { time: '7am', label: 'fern run', recurring: 'daily' }),
    voice: async () => voice('setAlarm', { time: '7am', label: 'fern run', repeat: 'daily' }),
  };

  it.each(Object.keys(SETTERS))('on, set by %s: listed by chat and by voice', async (by) => {
    on();
    expect(await SETTERS[by as keyof typeof SETTERS]()).toMatch(/^Saved an alarm for 7 AM/);
    expect(docsOf()).toEqual([
      expect.objectContaining({ time: '07:00', label: 'fern run', repeat: 'daily', enabled: true }),
    ]);
    expect(await chat('getAlarms')).toBe('Your alarms:\n1. 07:00 - fern run');
    expect(await voice('getAlarms')).toMatch(/^\*\*Your Alarms:\*\*\n1\. \*\*7 AM\*\*.*fern run/);
  });

  it.each(Object.keys(SETTERS))('on, set by %s: deleted by chat and by voice', async (by) => {
    on();
    await SETTERS[by as keyof typeof SETTERS]();
    expect(await chat('deleteAlarm', { query: 'fern run' })).toBe('Deleted alarm for 07:00.');
    expect(docsOf()).toEqual([]);
    await SETTERS[by as keyof typeof SETTERS]();
    expect(await voice('deleteAlarm', { query: 'fern run' })).toMatch(/^Deleted alarm "fern run"/);
    expect(docsOf()).toEqual([]);
  });

  it.each(Object.keys(SETTERS))('on, set by %s: snoozed by chat and by voice', async (by) => {
    on();
    await SETTERS[by as keyof typeof SETTERS]();
    sevenOhTwo();
    expect(await chat('snoozeAlarm', { minutes: 5 })).toBe(
      "Snoozed for 5 minutes. I'll remind you again soon."
    );
    expect(docsOf()[0]?.snoozedUntil).toBe(Date.now() + 5 * 60_000);
    expect(await voice('snoozeAlarm', { minutes: 10 })).toMatch(/Snoozed for 10 minutes/);
    expect(docsOf()[0]?.snoozedUntil).toBe(Date.now() + 10 * 60_000);
  });

  /** An alarm chat saved before this change: its old shape, as main writes it. */
  function legacyDoc(extra: Record<string, unknown> = {}): void {
    fs.docs.set(`bogle_users/${uid}/alarms/alarm_1`, {
      id: 'alarm_1',
      time: '7am',
      label: 'fern run',
      recurring: 'weekdays',
      createdAt: new Date(0),
      active: true,
      ...extra,
    });
  }

  it("on: a stored alarm in chat's old shape (no enabled) is listed, deleted and snoozed", async () => {
    on();
    legacyDoc();
    expect(await chat('getAlarms')).toBe('Your alarms:\n1. 07:00 - fern run');
    expect(await voice('getAlarms')).toMatch(/7 AM.*fern run/);
    sevenOhTwo();
    expect(await chat('snoozeAlarm', { minutes: 5 })).toMatch(/^Snoozed for 5 minutes/);
    expect(docsOf()[0]).toMatchObject({ time: '07:00', repeat: 'weekdays', enabled: true });
    vi.useRealTimers();
    expect(await voice('deleteAlarm', { query: 'fern run' })).toMatch(/^Deleted alarm "fern run"/);
    expect(docsOf()).toEqual([]);
  });

  it('on: an old-shape alarm turned off, or with a time it cannot read, stays unlisted', async () => {
    on();
    legacyDoc({ active: false });
    fs.docs.set(`bogle_users/${uid}/alarms/alarm_2`, {
      id: 'alarm_2',
      time: 'whenever',
      active: true,
    });
    fs.docs.set(`bogle_users/${uid}/alarms/alarm_3`, {
      ...docsOf()[0],
      id: 'alarm_3',
      enabled: false,
    });
    expect(await chat('getAlarms')).toMatch(/^You don't have any alarms set/);
    expect(docsOf()).toHaveLength(3); // reading wrote nothing
  });

  it('off: as on main, chat saves the old shape and the store reads only enabled alarms', async () => {
    process.env.ALARM_ONE_SHAPE = 'off';
    await chat('setAlarm', { time: '7am', label: 'fern run' });
    expect(docsOf()[0]).toMatchObject({ time: '7am', label: 'fern run', active: true });
    expect(docsOf()[0]).not.toHaveProperty('enabled');
    legacyDoc();
    expect(await tools.loadAlarms(uid)).toEqual([]);
    await voice('setAlarm', { time: '6am' });
    expect((await tools.loadAlarms(uid)).map((a) => a.time)).toEqual(['06:00']);
  });
});
