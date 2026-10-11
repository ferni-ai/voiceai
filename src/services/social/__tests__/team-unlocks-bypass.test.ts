/**
 * BYPASS_TEAM_UNLOCKS has one parser (parseBypassConfig). Dev had it set to
 * "off", which used to be read as a member name: it logged "Unknown team
 * member in BYPASS_TEAM_UNLOCKS name:off" and unlocked no one by accident.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
}));

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.BYPASS_TEAM_UNLOCKS;
  warn.mockClear();
  vi.resetModules();
});
afterEach(() => {
  if (saved === undefined) delete process.env.BYPASS_TEAM_UNLOCKS;
  else process.env.BYPASS_TEAM_UNLOCKS = saved;
});

async function parse(value: string | undefined) {
  if (value === undefined) delete process.env.BYPASS_TEAM_UNLOCKS;
  else process.env.BYPASS_TEAM_UNLOCKS = value;
  const mod = await import('../team-unlocks.js');
  return { bypass: mod.parseBypassConfig(), mod };
}

describe('BYPASS_TEAM_UNLOCKS', () => {
  it('treats off, false, 0, none and empty as no bypass, without a warning', async () => {
    for (const value of [undefined, '', 'off', 'OFF', ' false ', '0', 'none']) {
      vi.resetModules();
      const { bypass } = await parse(value);
      expect(bypass, String(value)).toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('unlocks everyone for all or true', async () => {
    for (const value of ['all', 'true', 'TRUE']) {
      vi.resetModules();
      const { bypass, mod } = await parse(value);
      expect(bypass, value).toBe('all');
      expect(mod.isFullTeamUnlocked(null, 'free'), value).toBe(true);
    }
  });

  it('unlocks named members only', async () => {
    const { bypass, mod } = await parse('peter-john');
    expect(bypass).toEqual(new Set(['ferni', 'peter-john']));
    expect(mod.isMemberBypassed('peter-john')).toBe(true);
    expect(mod.isMemberBypassed('maya-santos')).toBe(false);
    expect(mod.isFullTeamUnlocked(null, 'free')).toBe(false);
  });

  it('still warns about a name it does not know', async () => {
    const { bypass } = await parse('mayaa');
    expect(bypass).toBeNull();
    expect(warn).toHaveBeenCalledWith({ name: 'mayaa' }, expect.stringContaining('Unknown'));
  });
});
