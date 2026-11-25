/**
 * A call that ends with no turn logged "addTurn() was never called" at warn (prod: 2 of 308 call
 * ends in 3 days, both under a minute). A caller who hangs up before anyone speaks is normal; only
 * a call that ran a while with no turn at all points at a wiring fault. Drives the real
 * createSessionServices and endSession; only the global store and the logger are faked.
 * Fictional data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserProfile } from '../../../types/user-profile.js';

const logged = vi.hoisted(() => [] as Array<{ level: string; fields: unknown; msg: unknown }>);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (fields: unknown, msg?: unknown) => logged.push({ level, fields, msg });
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});

const store = {
  getProfileForWrite: vi.fn(async (uid: string) => createUserProfile(uid, 'Sam')),
  saveProfile: vi.fn(async () => undefined),
  saveSummary: vi.fn(async () => undefined),
};
vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));

const { createSessionServices } = await import('../session-manager.js');
const { EMPTY_CALL_MAX_SECONDS } = await import('../constants.js');

/** Ends a call with no turns after `secondsIn` seconds; returns the empty-call log lines. */
async function endEmptyCall(secondsIn: number): Promise<typeof logged> {
  const services = await createSessionServices(`empty-call-${secondsIn}-${Date.now()}`, 'user-pat-3');
  vi.setSystemTime(Date.now() + secondsIn * 1000);
  logged.length = 0;
  await services.endSession();
  return logged.filter(
    ({ msg }) => typeof msg === 'string' && /No conversation turns|before any turn/.test(msg)
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  logged.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a call that ends with no turn', () => {
  it('is info, not a warning, when the caller left within a minute', async () => {
    const lines = await endEmptyCall(6);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('info');
    expect(lines[0]?.fields).toMatchObject({ durationSec: 6 });
  });

  it('is still a warning when the call ran past the limit with no turn', async () => {
    const lines = await endEmptyCall(EMPTY_CALL_MAX_SECONDS + 30);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('warn');
    expect(String(lines[0]?.msg)).toContain('addTurn() was likely never called');
  });

  it('flips exactly at the limit', async () => {
    expect((await endEmptyCall(EMPTY_CALL_MAX_SECONDS - 1))[0]?.level).toBe('info');
    expect((await endEmptyCall(EMPTY_CALL_MAX_SECONDS))[0]?.level).toBe('warn');
  });
});
