/**
 * CRISIS_GROUNDED_RELEASE=live runs live only with CRISIS_GUARD_MODE literally 'live' (#2461).
 * Anything else, unset included, runs as shadow: that stays, and it is now said out loud, once
 * per process, so a release that was meant to be live can't quietly run as shadow.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, default: logger, logger };
});

import { resetGroundedRelease, resolveGroundedReleaseMode } from '../crisis-grounded-release.js';

const NOT_LIVE = 'CRISIS_GROUNDED_RELEASE_NOT_LIVE';
const notLiveWarnings = () => warn.mock.calls.filter((c) => c[1] === NOT_LIVE).map((c) => c[0]);

beforeEach(() => {
  resetGroundedRelease();
  warn.mockClear();
});

describe('CRISIS_GROUNDED_RELEASE=live without CRISIS_GUARD_MODE=live', () => {
  it('runs as shadow and warns once, naming the guard as unset', () => {
    expect(notLiveWarnings()).toEqual([]);
    const env = { CRISIS_GROUNDED_RELEASE: 'live' };
    expect(resolveGroundedReleaseMode(env)).toBe('shadow');
    expect(resolveGroundedReleaseMode(env)).toBe('shadow');
    expect(notLiveWarnings()).toEqual([{ guardMode: 'unset', runsAs: 'shadow' }]);
  });

  it.each(['', 'shadow', 'off', 'LIVE ', 'true', 'on'])(
    'guard %j: shadow, with the warning',
    (g) => {
      const env = { CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: g };
      expect(resolveGroundedReleaseMode(env)).toBe('shadow');
      expect(notLiveWarnings()).toEqual([{ guardMode: g.trim(), runsAs: 'shadow' }]);
    }
  );

  it('clips a long guard value', () => {
    const env = { CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: 'x'.repeat(40) };
    resolveGroundedReleaseMode(env);
    expect(notLiveWarnings()).toEqual([{ guardMode: 'x'.repeat(16), runsAs: 'shadow' }]);
  });

  it('still returns shadow when the logger throws', () => {
    warn.mockImplementationOnce(() => {
      throw new Error('logger down');
    });
    expect(resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'live' })).toBe('shadow');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warns again after a reset', () => {
    const env = { CRISIS_GROUNDED_RELEASE: 'live' };
    resolveGroundedReleaseMode(env);
    resetGroundedRelease();
    resolveGroundedReleaseMode(env);
    expect(notLiveWarnings()).toHaveLength(2);
  });
});

describe('no warning where nothing is downgraded', () => {
  it.each([
    [{ CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: 'live' }, 'live'],
    [{ CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: ' live ' }, 'live'],
    [{ CRISIS_GROUNDED_RELEASE: 'shadow' }, 'shadow'],
    [{ CRISIS_GROUNDED_RELEASE: 'off', CRISIS_GUARD_MODE: 'off' }, 'off'],
    [{}, 'off'],
  ] as const)('%j -> %s', (env, mode) => {
    expect(resolveGroundedReleaseMode(env)).toBe(mode);
    expect(notLiveWarnings()).toEqual([]);
  });
});
