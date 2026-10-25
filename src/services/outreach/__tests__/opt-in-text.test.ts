/**
 * Turning texts on gets one confirmation text (CTIA), through the guarded
 * sender; in quiet hours it is held and goes at 08:00 their time.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextDeps } from '../guarded-text.js';
import {
  HELD_STALE_MS,
  releaseHeldTexts,
  type HeldText,
  type HeldTextStore,
} from '../held-texts.js';
import { confirmSmsOptIn, OPT_IN_CONFIRMATION, type OptInDeps } from '../opt-in-text.js';

const NOON_NY = new Date('2026-10-15T16:00:00.000Z');
const ELEVEN_PM_NY = new Date('2026-10-16T03:00:00.000Z');
const EIGHT_AM_NY = new Date('2026-10-16T12:00:00.000Z');
const NY = { outreachPreferences: { timezone: 'America/New_York' } };

function optInDeps(now: Date) {
  const text = { now: () => now, store: { userDoc: vi.fn(async () => NY) } } as unknown as TextDeps;
  const send = vi.fn(async () => ({ sent: true as const }));
  const hold = vi.fn(async (_t: GuardedText, _at: Date, _why: string) => undefined);
  return { text, send, hold } as OptInDeps & { send: typeof send; hold: typeof hold };
}

describe('confirmSmsOptIn', () => {
  it('texts the confirmation once per opt-in, through the guarded sender', async () => {
    const deps = optInDeps(NOON_NY);
    expect(await confirmSmsOptIn('u1', '2026-10-15T16:00:00.000Z', deps)).toBe('sent');
    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.send).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        body: OPT_IN_CONFIRMATION,
        kind: 'opt-in',
        refId: '2026-10-15T16:00:00.000Z',
      }),
      deps.text
    );
    expect(OPT_IN_CONFIRMATION).toBe(
      "Ferni here. You'll get reminders and check-ins at this number, up to 3 a day. Msg & data rates may apply. Reply STOP to cancel, HELP for help."
    );
    expect(deps.hold).not.toHaveBeenCalled();
  });

  it('in their quiet hours it is held until 08:00 their time, not sent', async () => {
    const deps = optInDeps(ELEVEN_PM_NY);
    expect(await confirmSmsOptIn('u1', 'g1', deps)).toBe('held');
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.hold).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'opt-in' }),
      EIGHT_AM_NY,
      'quiet-hours'
    );
  });
});

describe('releaseHeldTexts', () => {
  const text: GuardedText = { userId: 'u1', body: 'b', kind: 'opt-in', refId: 'g1', minGapMs: 1 };
  const store = (items: HeldText[]) => {
    const removed: string[] = [];
    const s: HeldTextStore = {
      add: vi.fn(async () => undefined),
      due: vi.fn(async () => items),
      remove: vi.fn(async (id: string) => void removed.push(id)),
    };
    return { s, removed };
  };
  const at = (ms: number) => new Date(EIGHT_AM_NY.getTime() - ms).toISOString();
  const deps = { now: () => EIGHT_AM_NY } as unknown as TextDeps;

  it('sends what is due, drops what is stale, and keeps one the gap holds', async () => {
    const { s, removed } = store([
      { id: 'due', text, releaseAt: at(0), reason: 'quiet-hours' },
      { id: 'stale', text, releaseAt: at(HELD_STALE_MS + 1), reason: 'quiet-hours' },
      { id: 'gap', text: { ...text, refId: 'g2' }, releaseAt: at(0), reason: 'quiet-hours' },
    ]);
    const send = vi.fn(async (t: GuardedText) =>
      t.refId === 'g2'
        ? { sent: false as const, reason: 'recently-sent' as const }
        : { sent: true as const }
    );
    expect(await releaseHeldTexts(s, deps, send)).toEqual({ sent: 1, dropped: 1, waiting: 1 });
    expect(send).toHaveBeenCalledTimes(2); // never the stale one
    expect(removed.sort()).toEqual(['due', 'stale']);
  });

  it.each(['consent-unknown', 'paused'] as const)(
    'keeps a held text the guarded sender refused for %s, for a later run',
    async (reason) => {
      const { s, removed } = store([{ id: 'h', text, releaseAt: at(0), reason: 'quiet-hours' }]);
      const send = vi.fn(async () => ({ sent: false as const, reason }));
      expect(await releaseHeldTexts(s, deps, send)).toEqual({ sent: 0, dropped: 0, waiting: 1 });
      expect(removed).toEqual([]);
    }
  );

  it('drops (never retries) a held text the minor-care hold refuses', async () => {
    const { s, removed } = store([{ id: 'h', text, releaseAt: at(0), reason: 'quiet-hours' }]);
    const send = vi.fn(async () => ({ sent: false as const, reason: 'held' as const }));
    expect(await releaseHeldTexts(s, deps, send)).toEqual({ sent: 0, dropped: 1, waiting: 0 });
    expect(removed).toEqual(['h']);
  });

  it('texts that keep waiting cannot hide the ones behind them (pages, oldest first)', async () => {
    // Like Firestore: releaseAt then id order, `limit`, and `after` as the cursor.
    const waiting = Array.from({ length: 60 }, (_, i) => ({
      id: `w${String(i).padStart(2, '0')}`,
      text: { ...text, refId: 'paused' },
      releaseAt: at(60_000),
      reason: 'quiet-hours',
    }));
    const items: HeldText[] = [
      ...waiting,
      { id: 'behind', text, releaseAt: at(0), reason: 'quiet-hours' },
    ];
    const key = (h: Pick<HeldText, 'id' | 'releaseAt'>) => `${h.releaseAt}|${h.id}`;
    const s: HeldTextStore = {
      add: vi.fn(async () => undefined),
      due: vi.fn(async (_now: Date, limit: number, after?: Pick<HeldText, 'id' | 'releaseAt'>) =>
        [...items]
          .sort((a, b) => key(a).localeCompare(key(b)))
          .filter((h) => !after || key(h) > key(after))
          .slice(0, limit)
      ),
      remove: vi.fn(async () => undefined),
    };
    const send = vi.fn(async (t: GuardedText) =>
      t.refId === 'paused'
        ? { sent: false as const, reason: 'paused' as const }
        : { sent: true as const }
    );
    expect(await releaseHeldTexts(s, deps, send)).toEqual({ sent: 1, dropped: 0, waiting: 60 });
    expect(send).toHaveBeenCalledTimes(61); // each once
    expect(s.remove).toHaveBeenCalledWith('behind');
  });
});
