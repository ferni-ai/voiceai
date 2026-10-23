/**
 * The Focus hold's pure half (ENGAGEMENT-SPEC 3.3, PR F1): the safety cap in
 * the person's own zone, every device's say, and what the policy reads.
 */
import { describe, expect, it } from 'vitest';
import { zonedWallTimeToUtc } from '../../../utils/time-zone.js';
import {
  focusCapUntil,
  focusFromDoc,
  focusHold,
  nextFocus,
  parseFocusPost,
  type FocusPost,
  type FocusRecord,
} from '../focus.js';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const H = 3_600_000;
/** A local wall time in a zone, as its UTC instant. */
const at = (day: number, hour: number, zone = NY, minute = 0): Date =>
  zonedWallTimeToUtc({ year: 2026, month: 10, day, hour, minute }, zone);

const post = (o: Partial<FocusPost> = {}): FocusPost => ({
  held: true,
  kind: 'sleep',
  holdCheckIns: true,
  remindersThrough: true,
  deviceId: 'iphone',
  ...o,
});
const saved = (r: FocusRecord | 'too-many-devices'): FocusRecord => {
  if (r === 'too-many-devices') throw new Error('too many devices');
  return r;
};

describe('focusCapUntil: in the person zone', () => {
  it('Sleep at 23:00 ET caps at 10:00 ET the next morning', () => {
    expect(focusCapUntil(at(14, 23), 'sleep', NY)).toEqual(at(15, 10));
  });

  it('Sleep at 23:00 LA caps at 10:00 LA, not 10:00 ET', () => {
    expect(focusCapUntil(at(14, 23, LA), 'sleep', LA)).toEqual(at(15, 10, LA));
  });

  it('Sleep at 21:00 ET caps 12 h later (09:00), before 10:00', () => {
    expect(focusCapUntil(at(14, 21), 'sleep', NY)).toEqual(at(15, 9));
  });

  it('Sleep after midnight caps at 10:00 that same morning', () => {
    expect(focusCapUntil(at(15, 1, NY, 30), 'sleep', NY)).toEqual(at(15, 10));
  });

  it('Work and other cap 10 h later', () => {
    expect(focusCapUntil(at(14, 9), 'work', NY)).toEqual(at(14, 19));
    expect(focusCapUntil(at(14, 9), 'other', NY)).toEqual(at(14, 19));
  });

  it('no zone known: Sleep caps 12 h later', () => {
    expect(focusCapUntil(at(14, 23), 'sleep', undefined)).toEqual(
      new Date(at(14, 23).getTime() + 12 * H)
    );
  });

  it('across the fall-back night it is still 10:00 local', () => {
    // 2026-11-01: New York falls back at 02:00
    const since = zonedWallTimeToUtc({ year: 2026, month: 10, day: 31, hour: 23, minute: 0 }, NY);
    const wake = zonedWallTimeToUtc({ year: 2026, month: 11, day: 1, hour: 10, minute: 0 }, NY);
    expect(focusCapUntil(since, 'sleep', NY)).toEqual(wake);
  });
});

describe('nextFocus: devices', () => {
  const t0 = at(14, 23);

  it('the first held post starts the hold with its cap', () => {
    const r = saved(nextFocus(undefined, post(), t0, NY));
    expect(r).toMatchObject({ held: true, kind: 'sleep', since: t0.toISOString() });
    expect(r.capUntil).toBe(at(15, 10).toISOString());
  });

  it('two devices: one clears while the other still holds, so the hold stays', () => {
    const phone = saved(nextFocus(undefined, post(), t0, NY));
    const both = saved(
      nextFocus(phone, post({ deviceId: 'ipad' }), new Date(t0.getTime() + H), NY)
    );
    const later = new Date(t0.getTime() + 2 * H);
    const ipadOff = saved(nextFocus(both, post({ deviceId: 'ipad', held: false }), later, NY));
    expect(ipadOff.held).toBe(true);
    expect(ipadOff.since).toBe(t0.toISOString()); // the hold did not restart
    expect(ipadOff.capUntil).toBe(at(15, 10).toISOString());
    const phoneOff = saved(nextFocus(ipadOff, post({ held: false }), later, NY));
    expect(phoneOff).toMatchObject({ held: false });
    expect(phoneOff.capUntil).toBeUndefined();
  });

  it('a re-post on foreground keeps the first since and cap', () => {
    const first = saved(nextFocus(undefined, post(), t0, NY));
    const again = saved(nextFocus(first, post(), new Date(t0.getTime() + 3 * H), NY));
    expect(again.since).toBe(first.since);
    expect(again.capUntil).toBe(first.capUntil);
  });

  it('past the cap, a device that never said off is forgotten', () => {
    const phone = saved(nextFocus(undefined, post(), t0, NY));
    const next = saved(nextFocus(phone, post({ deviceId: 'ipad', held: false }), at(15, 11), NY));
    expect(next.held).toBe(false);
  });

  it('a Focus with "Hold my check-ins" off holds nothing', () => {
    expect(saved(nextFocus(undefined, post({ holdCheckIns: false }), t0, NY)).held).toBe(false);
  });

  it('a device clearing does not change the kind or reminders choice', () => {
    const work = saved(
      nextFocus(undefined, post({ kind: 'work', remindersThrough: false }), t0, NY)
    );
    const two = saved(
      nextFocus(work, post({ deviceId: 'ipad', kind: 'work', remindersThrough: false }), t0, NY)
    );
    const off = saved(
      nextFocus(two, post({ deviceId: 'ipad', held: false, kind: 'other' }), t0, NY)
    );
    expect(off).toMatchObject({ held: true, kind: 'work', remindersThrough: false });
  });

  it('more devices than anyone owns, all holding, is refused', () => {
    let r: FocusRecord | undefined;
    for (let k = 0; k < 8; k++) r = saved(nextFocus(r, post({ deviceId: `d${k}` }), t0, NY));
    expect(nextFocus(r, post({ deviceId: 'd8' }), t0, NY)).toBe('too-many-devices');
  });
});

describe('focusHold and focusFromDoc', () => {
  const r = saved(nextFocus(undefined, post({ kind: 'work' }), at(14, 9), NY));

  it('reads back what was saved, and the policy sees the hold until its cap', () => {
    const back = focusFromDoc(JSON.parse(JSON.stringify(r)));
    expect(back).toEqual(r);
    expect(focusHold(back, at(14, 12))).toEqual({
      held: true,
      kind: 'work',
      remindersThrough: true,
      capUntil: at(14, 19),
    });
    expect(focusHold(back, at(14, 19))).toBeUndefined();
  });

  it('an unreadable record is no hold', () => {
    expect(focusFromDoc({ held: 'yes' })).toBeUndefined();
    expect(focusHold(undefined, at(14, 12))).toBeUndefined();
  });
});

describe('parseFocusPost', () => {
  it('takes the filter body', () => {
    const body = {
      held: true,
      kind: 'work',
      holdCheckIns: true,
      remindersThrough: false,
      deviceId: 'x',
    };
    expect(parseFocusPost(body)).toEqual({ ok: true, post: body });
  });

  it.each([
    [{ kind: 'sleep', deviceId: 'x' }, 'held'],
    [{ held: true, kind: 'nap', deviceId: 'x' }, 'kind'],
    [{ held: true, kind: 'work', remindersThrough: 'yes', deviceId: 'x' }, 'remindersThrough'],
    [{ held: true, kind: 'work' }, 'deviceId'],
  ])('refuses %j', (body, word) => {
    const r = parseFocusPost(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(word);
  });
});
