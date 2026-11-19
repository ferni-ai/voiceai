/**
 * The reply never-lower grid, part 4 of 4: the clock reads counted, and the calls read at every moment.
 * Split from crisis-reply-never-lower.test.ts for CI time; that file's header says what the
 * grid reads, what counts as lowered and what it does not cover.
 */
import { describe, expect, it, vi } from 'vitest';

import { FERNI_HOME_TZ } from '../ferni-state.js';
import {
  allBut,
  asUtc,
  AT_MOMENTS,
  BASES,
  clock,
  clockReadsIn,
  fieldsOf,
  type FlagValues,
  HOME_ZONE,
  inReply,
  installGrid,
  instantIn,
  instantOf,
  lostIn,
  MOMENTS,
  place,
  placeAllUnder,
  placedAt,
  REACHES,
  READ_BY_GATE,
  type Readings,
  readUnder,
  wallClock,
  WORDS,
  ZONE,
  zoneOf,
} from './crisis-reply-never-lower.grid.js';
import { ANSWERS, CALLS, CLOCK_READ_BY } from './crisis-reply.never-lower.js';

// The model client is replaced with none, as on a machine with no model key, so the grid reads
// the same where a key is set. A vi.mock factory is per file, so each grid file carries this.
vi.mock('../../../config/gemini-config.js', async (importOriginal) => {
  const { reached, STUBBED_CLIENT } = await import('./crisis-reply-never-lower.reach.js');
  const getGeminiClient = async (): Promise<null> => ((reached['model clients'] += 1), null);
  return {
    ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
    getGeminiClient: Object.assign(getGeminiClient, { [STUBBED_CLIENT]: true }),
  };
});
installGrid();

describe('no flag lowers what a caller in crisis hears', () => {
  // The clock guard can fail: each kind of read is counted inside a reply, and only there.
  it('counts a clock read made while a reply is being made, and no other', async () => {
    const zoned = new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: ZONE });
    const ask = (): unknown => [
      new Date().getHours(),
      new Date().getUTCDay(),
      zoned.format(0),
      zoned.formatToParts(0),
    ];
    const [reads, asked] = [clock.reads, [...clock.asked]];
    clock.asked.clear();
    ask();
    expect(clock.reads).toBe(reads);
    await inReply.run(true, async () => {
      await Promise.resolve();
      ask();
    });
    expect(clock.reads).toBe(reads + 4);
    expect([...clock.asked]).toEqual([
      'getHours',
      'getUTCDay',
      'Intl.DateTimeFormat.format(hour)',
      'Intl.DateTimeFormat.formatToParts(hour)',
    ]);
    clock.reads = reads;
    clock.asked = new Set(asked);
  });

  it.each(READ_BY_GATE)('%s has a reply read the clock exactly if it is listed', async (name) => {
    let reads = 0;
    for (const word of WORDS) reads += clockReadsIn.get(await readUnder({ [name]: word })) ?? NaN;
    expect(reads > 0, `${reads} reads through ${[...clock.asked]}`).toBe(
      CLOCK_READ_BY.includes(name)
    );
  });

  it('no reply reads the clock unless a listed flag is set', async () => {
    expect(clockReadsIn.get(await readUnder({}))).toBe(0);
    for (const base of BASES) {
      const others = Object.fromEntries(
        Object.entries(allBut('', base)).filter(([name]) => !CLOCK_READ_BY.includes(name))
      );
      expect(clockReadsIn.get(await readUnder(others)), `every other flag ${base}`).toBe(0);
    }
  });

  it('places each moment at the wall clock it names, in its zone, on a day with no clock change', async () => {
    expect(FERNI_HOME_TZ).toBe(HOME_ZONE);
    const hours = [...new Set([12, ...CALLS.map((call) => call.hour ?? 12)])];
    for (const [moment, at] of Object.entries(MOMENTS)) {
      for (const hour of hours) {
        const [zone, want] = [zoneOf(at), fieldsOf(hour, at)];
        const named = `${moment}, a call at ${hour}:00, in ${zone}`;
        expect(wallClock(instantOf(hour, at), zone), named).toEqual(want);
        const offset = (h: number, m: number): number => {
          const ms = instantIn(zone, [want[0], want[1], want[2], h, m]);
          return asUtc(wallClock(ms, zone)) - ms;
        };
        expect(offset(0, 0), `${named}: the clock changes that day`).toBe(offset(23, 59));
      }
    }
    expect(wallClock(instantOf(0), 'America/Denver')).toEqual([2026, 5, 10, 0, 0]);
    expect(wallClock(instantOf(12, MOMENTS['a timezone far ahead']), 'Pacific/Kiritimati')).toEqual(
      [2026, 5, 10, 21, 0]
    );
    expect(zoneOf(MOMENTS['a timezone that does not exist'])).toBe(HOME_ZONE);
    // And place() sets that instant, so no reading sits on the process's own clock.
    const [call, answer] = [CALLS[0], ANSWERS[0]];
    for (const [moment, at] of Object.entries(MOMENTS)) {
      await place(call, answer, at);
      expect(placedAt, `${moment}: the clock place() set`).toBe(instantOf(call.hour ?? 12, at));
    }
  });

  // The readings below read something: with the flag on, the two moments are not asked alike.
  it.each(REACHES)('%s: %s and %s do not read the same', async (name, one, other) => {
    // Two moments that set the hour are two hours on Ferni's home clock, which FERNI_STATE
    // reads, so the comparison below cannot pass on two equal clocks.
    const homeHour = (moment: string): number | string =>
      MOMENTS[moment].hour === undefined
        ? moment
        : wallClock(instantOf(12, MOMENTS[moment]), HOME_ZONE)[3];
    expect(homeHour(one)).not.toBe(homeHour(other));
    const at = (moment: string): Promise<Readings> =>
      placeAllUnder({ [name]: 'on' }, false, MOMENTS[moment]);
    expect(Object.fromEntries(await at(one))).not.toEqual(Object.fromEntries(await at(other)));
  });

  it.each(AT_MOMENTS)(
    '%s lowers no reply at %s, alone or on top of every other flag',
    async (name, moment) => {
      const read = (flags: FlagValues): Promise<Readings> =>
        placeAllUnder(flags, false, MOMENTS[moment]);
      for (const word of BASES) {
        expect(lostIn(await read({}), await read({ [name]: word })), `${word} alone`).toEqual([]);
        const others = allBut(name, word);
        expect(
          lostIn(await read(others), await read({ ...others, [name]: word })),
          `${word} on top`
        ).toEqual([]);
      }
    }
  );
});
