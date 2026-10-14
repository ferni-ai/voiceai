import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import {
  asCheckIn,
  markSurfaced,
  readPonderingForGreeting,
  surfacedKey,
} from '../pondering-reader.js';

const now = new Date('2026-10-10T15:00:00Z');
const on = { PONDERING: 'on' };

function fakeDb(doc: Record<string, unknown> | null) {
  const set = vi.fn(async (..._args: unknown[]) => undefined);
  const get = vi.fn(async () => ({ exists: doc !== null, data: () => doc }));
  const db = {
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get, set }) }) }) }),
  };
  return { db: db as unknown as Firestore, get, set };
}

const stored = (over: Record<string, unknown> = {}) => ({
  followUps: [
    { text: 'Ask how the Stripe interview went', when: '2026-10-12', basis: 's1' },
    { text: 'How is martial arts training going?', basis: 's2' },
  ],
  thinkingOf: [{ text: 'your sister moving to Denver', basis: 's3' }],
  generatedAt: '2026-10-09T03:00:00Z',
  surfaced: [],
  ...over,
});

describe('asCheckIn', () => {
  it('rewords a why-about-a-setback into an open check-in', () => {
    expect(asCheckIn('Why has your match sparring been limited lately?')).toBe(
      "How's your match sparring going?"
    );
  });

  it('drops a why about a setback it cannot name, and any other why', () => {
    expect(asCheckIn("Why couldn't you go?")).toBeUndefined();
    expect(asCheckIn('Why does he do that?')).toBeUndefined();
  });

  it('keeps an ordinary check-in as it is', () => {
    expect(asCheckIn('How is martial arts training going?')).toBe(
      'How is martial arts training going?'
    );
  });
});

describe('readPonderingForGreeting', () => {
  it('is empty when PONDERING is off, and never reads', async () => {
    const { db, get } = fakeDb(stored());
    expect(await readPonderingForGreeting(db, 'u1', { now, env: {} })).toEqual({});
    expect(get).not.toHaveBeenCalled();
  });

  it('skips a follow-up whose day has not come and picks one that is due', async () => {
    const { db } = fakeDb(stored());
    const pick = await readPonderingForGreeting(db, 'u1', { now, env: on });
    expect(pick.followUp?.basis).toBe('s2');
  });

  it('on the day, picks the dated follow-up', async () => {
    const { db } = fakeDb(stored());
    const pick = await readPonderingForGreeting(db, 'u1', {
      now: new Date('2026-10-12T15:00:00Z'),
      env: on,
    });
    expect(pick.followUp?.basis).toBe('s1');
  });

  it('never repeats an item already raised; falls back to a note', async () => {
    const s = stored();
    const surfaced = s.followUps.map((f) => surfacedKey(f));
    const { db } = fakeDb(stored({ surfaced }));
    const pick = await readPonderingForGreeting(db, 'u1', {
      now: new Date('2026-10-12T15:00:00Z'),
      env: on,
    });
    expect(pick).toEqual({ note: { text: 'your sister moving to Denver', basis: 's3' } });
  });

  it('surfaces a prying why only reworded as a check-in', async () => {
    const { db } = fakeDb(
      stored({
        followUps: [{ text: 'Why has your match sparring been limited lately?', basis: 's4' }],
      })
    );
    const pick = await readPonderingForGreeting(db, 'u1', { now, env: on });
    expect(pick.followUp?.text).toBe("How's your match sparring going?");
  });

  it('is empty when the pondering is older than 14 days', async () => {
    const { db } = fakeDb(stored({ generatedAt: '2026-09-20T03:00:00Z' }));
    expect(await readPonderingForGreeting(db, 'u1', { now, env: on })).toEqual({});
  });

  it('is empty when nothing is stored', async () => {
    const { db } = fakeDb(null);
    expect(await readPonderingForGreeting(db, 'u1', { now, env: on })).toEqual({});
  });
});

describe('markSurfaced', () => {
  it('merges the item key into surfaced', async () => {
    const { db, set } = fakeDb(stored());
    await markSurfaced(db, 'u1', { basis: 's2', text: 'How is martial arts training going?' });
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0]?.[1]).toEqual({ merge: true });
  });
});
