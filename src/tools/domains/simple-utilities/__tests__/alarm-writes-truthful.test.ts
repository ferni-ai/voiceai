/**
 * ALARM_WRITES_TRUTHFUL (#4262): when Firestore is there but an alarm save or delete fails, the
 * alarm tools say they couldn't, and the next read still shows the alarms as they were.
 * Off, as on main: the tools report the change done. Real tools, the real chat-path bridge and
 * the real alarm store over an in-memory Firestore whose writes can be made to fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolExecutionContext } from '../../../../agents/shared/tool-executors/types.js';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { failWrites: false };
  const depth = (p: string): number => p.split('/').length;
  const coll = (path: string): Record<string, unknown> => ({
    doc: (id: string) => doc(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({
        docs: [...docs.entries()]
          .filter(([p]) => p.startsWith(`${path}/`) && depth(p) === depth(path) + 1)
          .filter(([, d]) => d[field] === value)
          .map(([p, d]) => ({ id: p.split('/').pop(), data: () => structuredClone(d) })),
      }),
    }),
  });
  const doc = (path: string): Record<string, unknown> => ({
    collection: (name: string) => coll(`${path}/${name}`),
    set: async (data: Record<string, unknown>) => {
      if (state.failWrites) throw new Error('write failed');
      docs.set(path, structuredClone(data));
    },
    delete: async () => {
      if (state.failWrites) throw new Error('write failed');
      docs.delete(path);
    },
  });
  return { docs, state, db: { collection: (name: string) => coll(name) } };
});

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fs.db,
}));

const tools = await import('../alarm-tools.js');
const bridge = await import('../../../../agents/shared/tool-executors/productivity-time-bridge.js');

const COULDNT = /\bcouldn't\b/i;
const saved = { ...process.env };
let n = 0;
let uid = '';

beforeEach(() => {
  uid = `riley-test-${++n}`;
  fs.state.failWrites = false;
});
afterEach(() => {
  process.env = { ...saved };
});

const on = (): void => {
  process.env.ALARM_WRITES_TRUTHFUL = 'on';
};

async function run(id: string, args: Record<string, unknown>): Promise<string> {
  const def = tools.alarmToolDefinitions.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const tool = def.create({ userId: uid } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return String(await tool.execute(args, {}));
}

/** Saves an alarm while Firestore is healthy. `time` defaults to the current minute. */
async function seed(label: string, time?: string): Promise<void> {
  const now = new Date();
  const hhmm = (h: number, m: number): string =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  await tools.saveAlarm(uid, {
    id: `alarm-${label}`,
    userId: uid,
    label,
    time: time ?? hhmm(now.getHours(), now.getMinutes()),
    repeat: 'daily',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  });
}

const stored = async (): Promise<string[]> =>
  (await tools.loadAlarms(uid)).map((a) => `${a.label}@${a.time}`).sort();

describe('setAlarm when the save fails', () => {
  it("flag on: says it couldn't, and the next read has no new alarm", async () => {
    on();
    fs.state.failWrites = true;
    const reply = await run('setAlarm', { time: '7am', label: 'fern run' });
    expect(reply).toBe(
      "I couldn't save that alarm just now, so it isn't set. Want me to try again?"
    );
    fs.state.failWrites = false;
    expect(await stored()).toEqual([]);
  });

  it('off: says it saved the alarm, as on main, though the next read has none', async () => {
    fs.state.failWrites = true;
    const reply = await run('setAlarm', { time: '7am', label: 'fern run' });
    expect(reply).toMatch(/^Saved an alarm for 7 AM \("fern run"\)\./);
    fs.state.failWrites = false;
    expect(await stored()).toEqual([]);
  });

  it('flag on, healthy store: saves it and says so', async () => {
    on();
    const reply = await run('setAlarm', { time: '7am', label: 'fern run' });
    expect(reply).toMatch(/^Saved an alarm for 7 AM/);
    expect(await stored()).toEqual(['fern run@07:00']);
  });
});

describe('deleteAlarm when the delete fails', () => {
  it("flag on, by number: says it couldn't, and the alarm is still there", async () => {
    await seed('fern run', '07:00');
    on();
    fs.state.failWrites = true;
    const reply = await run('deleteAlarm', { query: '1' });
    expect(reply).toBe("I couldn't delete the alarm for 7 AM just now. It's still set.");
    fs.state.failWrites = false;
    expect(await stored()).toEqual(['fern run@07:00']);
  });

  it("flag on, by time and by label: says it couldn't both ways", async () => {
    await seed('fern run', '07:00');
    on();
    fs.state.failWrites = true;
    expect(await run('deleteAlarm', { query: '7am' })).toMatch(COULDNT);
    expect(await run('deleteAlarm', { query: 'fern run' })).toMatch(COULDNT);
    fs.state.failWrites = false;
    expect(await stored()).toEqual(['fern run@07:00']);
  });

  it("flag on, all: says how many it couldn't delete, and they are all still there", async () => {
    await seed('fern run', '07:00');
    await seed('fern walk', '08:00');
    on();
    fs.state.failWrites = true;
    const reply = await run('deleteAlarm', { query: 'all' });
    expect(reply).toBe("I couldn't delete 2 of your 2 alarms just now.");
    fs.state.failWrites = false;
    expect(await stored()).toEqual(['fern run@07:00', 'fern walk@08:00']);
  });

  it('off: says it deleted the alarm, as on main, though the next read still has it', async () => {
    await seed('fern run', '07:00');
    fs.state.failWrites = true;
    expect(await run('deleteAlarm', { query: '1' })).toBe('Deleted alarm for 7 AM.');
    expect(await run('deleteAlarm', { query: 'all' })).toBe('Deleted all 1 alarm.');
    fs.state.failWrites = false;
    expect(await stored()).toEqual(['fern run@07:00']);
  });

  it('flag on, healthy store: deletes it and says so', async () => {
    await seed('fern run', '07:00');
    on();
    expect(await run('deleteAlarm', { query: 'fern run' })).toBe(
      'Deleted alarm "fern run" for 7 AM.'
    );
    expect(await stored()).toEqual([]);
  });
});

describe('snoozeAlarm when the save fails', () => {
  it("flag on: says it couldn't snooze, and the alarm is not snoozed", async () => {
    await seed('fern now');
    on();
    fs.state.failWrites = true;
    expect(await run('snoozeAlarm', { minutes: 5 })).toBe("I couldn't snooze the alarm just now.");
    fs.state.failWrites = false;
    expect((await tools.loadAlarms(uid))[0].snoozedUntil).toBeUndefined();
  });

  it('off: says it snoozed, as on main', async () => {
    await seed('fern now');
    fs.state.failWrites = true;
    expect(await run('snoozeAlarm', { minutes: 5 })).toMatch(/Snoozed for 5 minutes/);
  });
});

describe('the chat path (productivity bridge) when the write fails', () => {
  const ctx = (): ToolExecutionContext => ({ userId: uid });

  it("flag on: delete one, delete all and snooze each say they couldn't", async () => {
    await seed('fern now');
    on();
    fs.state.failWrites = true;
    expect(await bridge.deleteAlarm({ query: 'fern now' }, ctx())).toMatch(
      /^I couldn't delete the alarm for \d\d:\d\d just now\. It's still set\.$/
    );
    expect(await bridge.deleteAlarm({ query: 'all' }, ctx())).toBe(
      "I couldn't delete 1 of your 1 alarms just now."
    );
    expect(await bridge.snoozeAlarm({ minutes: 5 }, ctx())).toBe(
      "I couldn't snooze the alarm just now."
    );
    fs.state.failWrites = false;
    expect(await stored()).toHaveLength(1);
  });

  it('off: reports the delete and the snooze done, as on main', async () => {
    await seed('fern now');
    fs.state.failWrites = true;
    expect(await bridge.snoozeAlarm({ minutes: 5 }, ctx())).toMatch(/^Snoozed for 5 minutes/);
    expect(await bridge.deleteAlarm({ query: 'fern now' }, ctx())).toMatch(/^Deleted alarm for/);
  });
});

describe('alarmSaved', () => {
  it('passes any other error through rather than calling it an unsaved change', async () => {
    on();
    await expect(tools.alarmSaved(Promise.reject(new Error('elsewhere')))).rejects.toThrow(
      'elsewhere'
    );
  });
});
