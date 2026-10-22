/**
 * MINOR_CARE=shadow: the same detection as `on`, logged once per session with
 * whether the session is a verified owner's, but nothing is held and no note
 * is added.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../safe-logger.js', () => {
  const logger = {
    info: (...args: unknown[]) => void logged.push(args),
    warn: (...args: unknown[]) => void logged.push(args),
    debug: (...args: unknown[]) => void logged.push(args),
    error: (...args: unknown[]) => void logged.push(args),
  };
  return { createLogger: () => logger };
});

import {
  heldAfter,
  likelyMinor,
  memoryHeld,
  MINOR_CARE_NOTE,
  minorCareNote,
  resetMinorCare,
  setVerifiedOwnerCheck,
  userHeld,
} from '../minor-care.js';

const SHADOW = { MINOR_CARE: 'shadow' };
const shadowLines = (): unknown[][] =>
  logged.filter((args) => args[1] === 'MINOR_CARE shadow: likely minor');

afterEach(() => {
  resetMinorCare();
  logged.length = 0;
});

describe('MINOR_CARE=shadow', () => {
  it('logs a stated age under 18 but adds no note and holds nothing', () => {
    expect(minorCareNote('s1', "I'm only 14", { env: SHADOW, userId: 'u1' })).toBe('');
    expect(shadowLines()).toEqual([
      [{ sessionId: 's1', verifiedOwner: false }, 'MINOR_CARE shadow: likely minor'],
    ]);
    expect(likelyMinor('s1')).toBe(false);
    expect(memoryHeld('s1', SHADOW)).toBe(false);
    expect(heldAfter('s1', "I'm only 14", { env: SHADOW, userId: 'u1' })).toBe(false);
    expect(userHeld('u1', SHADOW)).toBe(false);
  });

  it('logs once per session, however often the caller says it', () => {
    minorCareNote('s1', "I'm 15 years old", { env: SHADOW });
    minorCareNote('s1', "I'm 15 years old", { env: SHADOW });
    minorCareNote('s2', "I'm 15 years old", { env: SHADOW });
    expect(shadowLines().map((args) => (args[0] as { sessionId: string }).sessionId)).toEqual([
      's1',
      's2',
    ]);
  });

  it('logs nothing for an adult or for someone else’s age', () => {
    minorCareNote('s1', 'I need a dinner idea', { env: SHADOW });
    minorCareNote('s1', 'my son is 16', { env: SHADOW });
    expect(shadowLines()).toEqual([]);
  });

  it('records a verified owner, so false positives on adults can be counted', () => {
    setVerifiedOwnerCheck((sessionId) => sessionId === 'owner');
    minorCareNote('owner', "I'm 16 years old", { env: SHADOW });
    expect(shadowLines()).toEqual([
      [{ sessionId: 'owner', verifiedOwner: true }, 'MINOR_CARE shadow: likely minor'],
    ]);
  });

  it('still logs on a careful (crisis) turn, and still adds no note', () => {
    expect(minorCareNote('s1', "I'm 13", { env: SHADOW, careful: true })).toBe('');
    expect(shadowLines()).toHaveLength(1);
  });

  it('leaves off and on as they were', () => {
    expect(minorCareNote('s1', "I'm only 14", { env: {} })).toBe('');
    expect(minorCareNote('s2', "I'm only 14", { env: { MINOR_CARE: 'on' } })).toBe(MINOR_CARE_NOTE);
    expect(shadowLines()).toEqual([]);
    expect(likelyMinor('s2')).toBe(true);
  });
});
