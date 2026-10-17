import { describe, expect, it, vi } from 'vitest';
import {
  anniversaryDirection,
  anniversaryDue,
  anniversaryFor,
  lineSaysAnniversary,
  type AnniversaryStore,
} from '../friendship-anniversary.js';
import { callerHistory } from '../greeting-direction.js';

const none = new Set<string>();
const ON = { FRIEND_CELEBRATIONS: 'on' };

describe('anniversaryDue', () => {
  it('is due in the week after each milestone, with the true number', () => {
    expect(anniversaryDue('2026-07-16', '2026-10-16', 9, none)).toEqual({
      key: '3m',
      words: 'three months',
    });
    expect(anniversaryDue('2026-07-16', '2026-10-22', 9, none)?.key).toBe('3m');
    expect(anniversaryDue('2025-10-16', '2026-10-18', 40, none)).toEqual({
      key: '1y',
      words: 'a year',
    });
  });

  it('is quiet before the milestone, after its week, and once said', () => {
    expect(anniversaryDue('2026-07-16', '2026-10-15', 9, none)).toBeNull();
    expect(anniversaryDue('2026-07-16', '2026-10-23', 9, none)).toBeNull();
    expect(anniversaryDue('2026-07-16', '2026-10-17', 9, new Set(['3m']))).toBeNull();
  });

  it('is quiet with too few calls', () => {
    expect(anniversaryDue('2026-07-16', '2026-10-16', 3, none)).toBeNull();
  });

  it('counts calendar months, landing on the last day of a short month', () => {
    expect(anniversaryDue('2026-01-31', '2026-02-28', 5, none)?.key).toBe('1m');
    expect(anniversaryDue('2026-01-31', '2026-02-27', 5, none)).toBeNull();
  });
});

describe('anniversaryFor', () => {
  const store = (said: string[] = []): AnniversaryStore & { mark: ReturnType<typeof vi.fn> } => ({
    said: async () => new Set(said),
    mark: vi.fn(async () => undefined),
  });
  const history = { calls: 9, firstContact: '2026-07-16T15:00:00Z' };

  it('takes the days in the caller time zone, and marks once said', async () => {
    const s = store();
    // 9 pm on the 15th in New York is already the 16th in UTC: not yet three months there.
    const evening = new Date('2026-10-16T01:00:00Z');
    const ny = 'America/New_York';
    expect(
      await anniversaryFor('u1', history, ny, { store: s, now: evening, env: ON })
    ).toBeUndefined();
    const a = await anniversaryFor('u1', history, ny, {
      store: s,
      now: new Date('2026-10-16T15:00:00Z'),
      env: ON,
    });
    expect(a?.words).toBe('three months');
    a?.mark();
    expect(s.mark).toHaveBeenCalledWith('u1', '3m', '2026-10-16');
  });

  it('says nothing with the flag off, no first call date, or a store that fails', async () => {
    const now = new Date('2026-10-16T15:00:00Z');
    expect(
      await anniversaryFor('u1', history, 'UTC', { store: store(), now, env: {} })
    ).toBeUndefined();
    expect(
      await anniversaryFor('u1', { calls: 9 }, 'UTC', { store: store(), now, env: ON })
    ).toBeUndefined();
    const failing: AnniversaryStore = {
      said: async () => Promise.reject(new Error('down')),
      mark: async () => undefined,
    };
    expect(
      await anniversaryFor('u1', history, 'UTC', { store: failing, now, env: ON })
    ).toBeUndefined();
  });
});

describe('the greeting side', () => {
  it('the direction names exactly the number, and a line saying it counts as said', () => {
    expect(anniversaryDirection({ key: '1y', words: 'a year' })).toContain('Say exactly "a year"');
    const year = { key: '1y', words: 'a year' };
    const three = { key: '3m', words: 'three months' };
    expect(lineSaysAnniversary("Hey Sam. Can't believe it's been a year of these.", year)).toBe(
      true
    );
    expect(lineSaysAnniversary("Hey Sam. It's been three  months of this.", three)).toBe(true);
    expect(lineSaysAnniversary('Hey Sam. How was your month?', three)).toBe(false);
    expect(lineSaysAnniversary('Hey Sam. Big year for you at work.', year)).toBe(false);
  });

  it('callerHistory carries the first call, from a date or a Firestore timestamp', () => {
    const at = new Date('2026-07-16T15:00:00Z');
    expect(callerHistory({ totalConversations: 5, firstContact: at })?.firstContact).toBe(
      at.toISOString()
    );
    expect(
      callerHistory({ totalConversations: 5, firstContact: { toDate: () => at } })?.firstContact
    ).toBe(at.toISOString());
    const odd = { toDate: true } as unknown as { toDate: () => Date };
    expect(
      callerHistory({ totalConversations: 5, firstContact: odd })?.firstContact
    ).toBeUndefined();
    expect(
      callerHistory({ totalConversations: 5, firstContact: 'nonsense' })?.firstContact
    ).toBeUndefined();
  });
});
