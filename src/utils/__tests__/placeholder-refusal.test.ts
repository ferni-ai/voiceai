/**
 * #2651: a refused placeholder store access is logged with its site and a count, at
 * 1, 10, 100, ...; a member or a minted anon: id is never refused or logged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../safe-logger.js', async (importOriginal) => {
  const recorder = (): Record<string, unknown> => {
    const logger: Record<string, unknown> = { child: () => logger };
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
      logger[level] = (...args: unknown[]) => logged.push(args);
    }
    return logger;
  };
  return { ...(await importOriginal<Record<string, unknown>>()), getLogger: recorder };
});

const { refusedPlaceholder } = await import('../placeholder-refusal.js');

describe('refusedPlaceholder', () => {
  beforeEach(() => {
    logged.length = 0;
  });

  it('refuses every placeholder and logs the site counted at 1 and 10, never the id', () => {
    const ids = [
      undefined,
      null,
      '',
      'anon',
      'guest',
      'unknown',
      'undefined',
      'null',
      'Guest',
      ' NULL ',
    ];
    for (const id of ids) expect(refusedPlaceholder(id, 'test-site-a')).toBe(true);
    expect(logged.map(([fields]) => fields)).toEqual([
      { site: 'test-site-a', count: 1 },
      { site: 'test-site-a', count: 10 },
    ]);
  });

  it('counts each site on its own', () => {
    refusedPlaceholder('anon', 'test-site-b');
    expect(logged.map(([fields]) => fields)).toEqual([{ site: 'test-site-b', count: 1 }]);
  });

  it('lets a member or a minted anon: id through, silently', () => {
    expect(refusedPlaceholder('uid-member-1', 'test-site-c')).toBe(false);
    expect(refusedPlaceholder('anon:3f9c2b', 'test-site-c')).toBe(false);
    expect(logged).toEqual([]);
  });
});
