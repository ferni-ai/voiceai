/**
 * The settings record and the service's brief cache: a stored field that is not a
 * non-negative number reads as its default, a fresh read is reused for the TTL and the
 * store is asked again after it, and a store that throws is FinOpsSettingsUnavailableError.
 */
import { describe, expect, it } from 'vitest';
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
});
