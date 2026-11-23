/**
 * The settings record and the service's brief cache: a stored field that is not a
 * non-negative number reads as its default, a fresh read is reused for the TTL and the
 * store is asked again after it, and a store that throws is FinOpsSettingsUnavailableError.
 */
import { setImmediate } from 'node:timers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FINOPS_SETTINGS,
  parseFinOpsSettings,
  type SavedFinOpsSettings,
} from '../domain/finops-settings.js';
import type { FinOpsSettingsStore } from '../ports/finops-settings-store.js';
import {
  createFinOpsSettingsService,
  FinOpsSettingsUnavailableError,
} from '../use-cases/finops-settings-service.js';

describe('parseFinOpsSettings', () => {
  it('keeps saved numbers, a cash reserve of 0 and a partial thresholds map', () => {
    const s = parseFinOpsSettings({
      monthlyRevenue: 900,
      cashReserve: 0,
      thresholds: { maxMonthlyBurn: 50 },
      updatedBy: 'uid-a',
    });
    expect(s).toMatchObject({ monthlyRevenue: 900, cashReserve: 0, updatedBy: 'uid-a' });
    expect(s.thresholds).toEqual({ ...DEFAULT_FINOPS_SETTINGS.thresholds, maxMonthlyBurn: 50 });
  });

  it('reads a string, a negative or a missing field as its default, never NaN', () => {
    const s = parseFinOpsSettings({
      monthlyRevenue: '900',
      cashReserve: -1,
      churnRateMonthly: 7,
      thresholds: { minGrossMargin: 'high' },
    });
    expect(s.monthlyRevenue).toBe(0);
    expect(s.cashReserve).toBeNull();
    expect(s.churnRateMonthly).toBe(1);
    expect(s.thresholds.minGrossMargin).toBe(0.3);
  });
});

function countingStore(saved: SavedFinOpsSettings | null, fail = false) {
  const calls = { reads: 0 };
  const store: FinOpsSettingsStore = {
    async read() {
      calls.reads += 1;
      if (fail) throw new Error('offline');
      return saved;
    },
    async merge() {
      if (fail) throw new Error('offline');
    },
  };
  return { store, calls };
}

describe('createFinOpsSettingsService', () => {
  it('reuses a read for the TTL and reads again after it', async () => {
    let t = 1_000;
    const saved = { ...DEFAULT_FINOPS_SETTINGS, monthlyRevenue: 5 };
    const { store, calls } = countingStore(saved);
    const service = createFinOpsSettingsService(store, { now: () => t, ttlMs: 5_000 });
    expect(service.current().monthlyRevenue).toBe(0);
    expect((await service.load()).monthlyRevenue).toBe(5);
    t += 4_999;
    await service.load();
    expect(calls.reads).toBe(1);
    t += 1;
    await service.load();
    expect(calls.reads).toBe(2);
  });

  it('a store that throws is FinOpsSettingsUnavailableError with the reason, on load and save', async () => {
    const service = createFinOpsSettingsService(countingStore(null, true).store);
    await expect(service.load()).rejects.toEqual(new FinOpsSettingsUnavailableError('offline'));
    await expect(service.save({ monthlyRevenue: 1 }, 'uid')).rejects.toMatchObject({ reason: 'offline' }); // prettier-ignore
  });

  describe('a store that answers only after 40 s (the Admin SDK retrying UNAVAILABLE)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    const late = (): Promise<never> =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('14 UNAVAILABLE')), 40_000);
      });
    const slow: FinOpsSettingsStore = { read: late, merge: late };

    it.each([
      ['load', (s: ReturnType<typeof createFinOpsSettingsService>) => s.load()],
      [
        'save',
        (s: ReturnType<typeof createFinOpsSettingsService>) => s.save({ cashReserve: 1 }, 'uid'),
      ],
    ])('%s gives up after 5 s, and the late rejection is not unhandled', async (_name, run) => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        vi.useFakeTimers();
        let settled = false;
        const outcome = run(createFinOpsSettingsService(slow)).then(
          () => 'resolved',
          (error: unknown) => error
        );
        void outcome.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(4_999);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await outcome).toEqual(
          new FinOpsSettingsUnavailableError('Firestore did not answer within 5s')
        );
        await vi.advanceTimersByTimeAsync(40_000); // Firestore finally gives up
        vi.useRealTimers();
        await new Promise((resolve) => {
          setImmediate(resolve); // one macrotask: a late unhandledRejection would fire here
        });
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });

  it('a save whose read-back fails still answers the saved values over the last read', async () => {
    let reads = 0;
    const store: FinOpsSettingsStore = {
      async read() {
        reads += 1;
        if (reads > 1) throw new Error('offline');
        return { ...DEFAULT_FINOPS_SETTINGS, monthlyRevenue: 300, customerAcquisitionCost: 40 };
      },
      merge: async () => undefined,
    };
    const service = createFinOpsSettingsService(store, { ttlMs: 0 });
    await service.load();
    const saved = await service.save(
      {
        churnRateMonthly: 0.02,
        customerAcquisitionCost: undefined,
        thresholds: { maxMonthlyBurn: 9 },
      },
      'uid-a'
    );
    expect(saved).toMatchObject({ monthlyRevenue: 300, customerAcquisitionCost: 40, churnRateMonthly: 0.02, updatedBy: 'uid-a' }); // prettier-ignore
    expect(saved.thresholds).toEqual({ ...DEFAULT_FINOPS_SETTINGS.thresholds, maxMonthlyBurn: 9 });
    expect(service.current()).toEqual(saved);
  });
});
