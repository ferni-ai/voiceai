/**
 * The K0 baseline (scripts/crisis-eval/baseline/generate.ts) reads every line with the zone at
 * UTC, pinned once per pass. Whatever happens in the pass, the caller's zone comes back: a zone
 * left at UTC would quietly change every later date reading in the same process.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** detectCrisis, the first reader of every line: records the zone it saw, or throws when asked. */
const reader = vi.hoisted(() => ({ fail: false, zones: new Set<string | undefined>() }));
vi.mock('../../../src/services/safety/crisis-guard.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../../src/services/safety/crisis-guard.js')>();
  return {
    ...real,
    detectCrisis: (...args: Parameters<typeof real.detectCrisis>) => {
      reader.zones.add(process.env.TZ);
      if (reader.fail) throw new Error('reader failed');
      return real.detectCrisis(...args);
    },
  };
});

import { readAll, readLine } from '../baseline/generate.js';

const callerZone = process.env.TZ;
const setZone = (zone: string | undefined): void => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
};
afterEach(() => {
  reader.fail = false;
  reader.zones.clear();
  setZone(callerZone);
});

const ZONES = [['America/New_York'], ['Etc/GMT-12'], ['UTC'], [undefined]] as const;

describe('the K0 baseline zone pin', () => {
  it.each(ZONES)('one line reads at UTC, then the zone is back (caller zone %s)', (zone) => {
    setZone(zone);
    readLine('Long day at work, heading to bed.', 'zone-test:1');
    expect([...reader.zones]).toEqual(['UTC']);
    expect(process.env.TZ).toBe(zone);
  });

  it.each(ZONES)('a reader that throws mid-pass still gives the zone back (%s)', (zone) => {
    setZone(zone);
    reader.fail = true;
    expect(() => readAll({})).toThrow('reader failed');
    expect([...reader.zones]).toEqual(['UTC']);
    expect(process.env.TZ).toBe(zone);
  });

  it('a reader that throws on a single line still gives the zone back', () => {
    setZone('America/New_York');
    reader.fail = true;
    expect(() => readLine('Long day at work, heading to bed.', 'zone-test:2')).toThrow(
      'reader failed'
    );
    expect(process.env.TZ).toBe('America/New_York');
  });
});
