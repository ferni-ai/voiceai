/**
 * #2689: addTurn's "Turn added" debug line logs the turn's length, never its words.
 * Drives the real createSessionServices and addTurn with only the global store
 * faked; no piece of the sentinel may reach any log call. Before the fix it logged
 * `contentPreview: content.slice(0, 50)` for the first five turns of every session.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leakedPieces, SENTINEL } from '../../../tests/helpers/snippet-leak.js';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (...args: unknown[]) => logged.push(args);
    }
    return logger;
  };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    getLogger: recorder,
    createLogger: recorder,
  };
});

const store = { getProfileForWrite: vi.fn(async () => null), saveProfile: vi.fn(async () => {}) };
vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => {},
  invalidateProfile: async () => {},
}));

const { createSessionServices } = await import('../session-manager.js');

describe('addTurn logs no conversation text (#2689)', () => {
  beforeEach(() => {
    logged.length = 0;
  });

  it.each(['user', 'assistant'] as const)(
    'logs the %s turn length, not its words',
    async (role) => {
      const services = await createSessionServices({
        sessionId: `turn-log-${role}`,
        userId: 'user-log-2',
      });
      logged.length = 0;

      services.addTurn(role, SENTINEL);

      expect(leakedPieces(logged)).toEqual([]);
      const added = logged.find(
        ([, msg]) => typeof msg === 'string' && msg.startsWith('📝 Turn added')
      );
      expect(added?.[0]).toMatchObject({ role, contentLen: SENTINEL.length });
    }
  );
});
