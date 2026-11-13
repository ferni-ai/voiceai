/**
 * The goodbye watch tally never throws into the farewell watcher, even when its own failure log
 * throws, and reports a call once: a report that fails is dropped, never retried.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      return bindings.module === 'goodbye-watch-summary' ? { ...logger, warn } : logger;
    },
  };
});
import { goodbyeWatchTally } from '../goodbye-watch-summary.js';

const broken = (): never => {
  throw new Error('broken');
};

describe('goodbyeWatchTally', () => {
  afterEach(() => warn.mockReset());

  it('never throws, even when the failure log throws too', () => {
    warn.mockImplementation(broken);
    const tally = goodbyeWatchTally('s-log-broken', { report: broken, now: broken });
    expect(() => {
      tally.farewell();
      tally.close();
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('reports once: a failed report is dropped, not retried on a later close', () => {
    const report = vi.fn(broken);
    const tally = goodbyeWatchTally('s-report-once', { report });
    tally.close();
    tally.close();
    expect(report).toHaveBeenCalledTimes(1);
  });
});
