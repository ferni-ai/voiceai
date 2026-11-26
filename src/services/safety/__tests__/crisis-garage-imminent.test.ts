/**
 * CRISIS_CO_GARAGE_IMMINENT (#4314): a vehicle running in a shut garage, said in everyday words,
 * reads as the caller's own imminent crisis through the real detectCrisis, so 911 comes first.
 * Off, every read equals main's. On, no read is lower, and everyday garage lines stay non-crisis.
 * All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis } from '../crisis-guard.js';

const FLAG = 'CRISIS_CO_GARAGE_IMMINENT';

/** Main reads this one imminent already: "engine running" side by side with "garage". */
const MAIN_IMMINENT = 'engine running in the garage, the door is shut';

/** Read no crisis on main (#4314). */
const SHUT_GARAGE = [
  'the engine is running in the garage and the door is shut',
  'the car is running in the garage with the door closed',
  "i'm sitting in the car in the garage, engine on, door's down",
  'i left the car running in the garage and shut the door',
  "the truck's idling in the garage and i'm breathing the fumes",
  'the garage door is closed and the engine is on',
];

/** A crisis on main, not urgent: the caller's own crisis words beside a car running in the garage. */
const WITH_CRISIS_WORDS = [
  "i don't want to be here anymore. the car is running in the garage.",
  "i want to die. i'm in the garage with the car on",
  // An everyday word ("leaving") does not lower the caller's own crisis words.
  "i want to die. i'm sitting in the garage with the car on and i'm leaving everyone behind",
];

/** Everyday garage lines: no crisis on main, and none with the flag on. */
const EVERYDAY = [
  'warming up the car in the garage before work',
  "the engine's running, i'm heading out",
  'the car is running in the garage while i load the groceries',
  "left the engine on in the garage to warm it up, the door's open",
  "my mechanic says the engine is running rough, it's in the garage",
  'the garage door is shut and the car is off',
  "the car isn't running, it's been in the garage all week",
  'the engine is running fine now, the garage fixed it',
  'the lawn mower is running in the garage with the door shut',
  'started the car in the garage and opened the door to let it warm up',
  "our garage is a mess and the car won't start",
  "the car is running in the garage, door's shut, the kids are buckled in and we're leaving now",
  'the engine is not running and the garage door is open',
  'lol the car is running in the garage with the door shut, i forgot my keys inside',
];

/** Someone else's car, or the past: main's read, whatever it is. */
const NOT_MINE_NOW = [
  "my dad's car is running in the garage with the door shut",
  'years ago i sat in the garage with the engine running and the door shut',
];

/** The engine turned off, the door open, or no garage, even beside crisis words: main's read. */
const NOT_A_SHUT_GARAGE = [
  'the car was running in the garage with the door shut, but i turned it off',
  'i want to die. the car is running in the garage but the door is open',
  'the car is running in the driveway with the doors locked',
  'i want to die and my car is running in the driveway',
];

const ALL = [
  MAIN_IMMINENT,
  ...SHUT_GARAGE,
  ...WITH_CRISIS_WORDS,
  ...EVERYDAY,
  ...NOT_MINE_NOW,
  ...NOT_A_SHUT_GARAGE,
];

const read = (line: string, flag?: 'on' | 'off') => {
  vi.unstubAllEnvs();
  if (flag) vi.stubEnv(FLAG, flag);
  return detectCrisis(line);
};

afterEach(() => vi.unstubAllEnvs());

describe('CRISIS_CO_GARAGE_IMMINENT', () => {
  it('reproduces #4314 with the flag off: a shut garage in everyday words reads no crisis', () => {
    expect(read(MAIN_IMMINENT, 'off').indicators).toContain('imminent_danger');
    for (const line of SHUT_GARAGE) {
      const off = read(line, 'off');
      expect(off.isCrisis, line).toBe(false);
      expect(off.indicators, line).toEqual([]);
    }
    for (const line of WITH_CRISIS_WORDS) {
      const off = read(line, 'off');
      expect(off.isCrisis, line).toBe(true);
      expect(off.indicators, line).not.toContain('imminent_danger');
    }
  });

  it.each([...SHUT_GARAGE, ...WITH_CRISIS_WORDS])(
    '"%s" reads as the caller own imminent crisis, 911 first',
    (line) => {
      const on = read(line, 'on');
      expect(on.isCrisis).toBe(true);
      expect(on.subject).toBe('self');
      expect(on.indicators).toEqual(
        expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
      );
      const reply = on.suggestedResponse ?? '';
      expect(reply).toMatch(/\b911\b/);
      expect(reply.indexOf('911')).toBeLessThan(reply.indexOf('988'));
    }
  );

  it('keeps every everyday garage line non-crisis with the flag on', () => {
    expect(EVERYDAY.length).toBeGreaterThanOrEqual(10);
    for (const line of EVERYDAY) {
      const on = read(line, 'on');
      expect(on.isCrisis, line).toBe(false);
      expect(on.indicators, line).not.toContain('imminent_danger');
      expect(on, line).toEqual(read(line, 'off'));
    }
  });

  it("leaves an engine turned off, an open door or no garage at main's read", () => {
    for (const line of NOT_A_SHUT_GARAGE) {
      const on = read(line, 'on');
      expect(on.indicators, line).not.toContain('imminent_danger');
      expect(on, line).toEqual(read(line, 'off'));
    }
  });

  it("leaves someone else's car and the past at main's read", () => {
    for (const line of NOT_MINE_NOW) expect(read(line, 'on'), line).toEqual(read(line, 'off'));
  });

  it('flag off reads every line exactly as main (flag unset) does', () => {
    for (const line of ALL) expect(read(line, 'off'), line).toEqual(read(line));
  });

  it('the line main already reads imminent reads the same with the flag on', () => {
    expect(read(MAIN_IMMINENT, 'on')).toEqual(read(MAIN_IMMINENT, 'off'));
  });

  it('never lowers a read: on keeps every indicator, the level, the crisis, 988 and 911', () => {
    for (const line of ALL) {
      const off = read(line, 'off');
      const on = read(line, 'on');
      expect(on.severity, line).toBeGreaterThanOrEqual(off.severity);
      expect(on.indicators, line).toEqual(expect.arrayContaining(off.indicators));
      if (off.isCrisis) expect(on.isCrisis, line).toBe(true);
      for (const number of ['988', '911']) {
        if (off.suggestedResponse?.includes(number))
          expect(on.suggestedResponse, line).toContain(number);
      }
    }
  });
});
