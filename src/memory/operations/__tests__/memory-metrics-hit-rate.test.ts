/**
 * The memory health check runs in the UI service (/api/jobs/memory-health-check),
 * but retrievals are recorded where semantic search runs. With no lookups in
 * this process the hit rate read 0% and raised a critical alert every 4 hours
 * since 2026-10-10. The alert must wait for lookups, and still fire on a real
 * miss streak.
 */
import { describe, expect, it } from 'vitest';
import { MemoryMetricsCollector } from '../memory-metrics.js';

const hitRateAlerts = async (c: MemoryMetricsCollector) =>
  (await c.checkThresholds()).filter((a) => a.metric === 'hitRate');

describe('memory hit-rate alert', () => {
  it('stays quiet when this process served no lookups', async () => {
    const c = new MemoryMetricsCollector();
    expect((await c.collectMetrics()).retrieval.totalRetrievals).toBe(0);
    expect(await hitRateAlerts(c)).toEqual([]);
  });

  it('fires critical when lookups come back empty', async () => {
    const c = new MemoryMetricsCollector();
    for (let i = 0; i < 10; i++) c.recordRetrieval(5, 0, undefined);
    expect(await hitRateAlerts(c)).toEqual([
      expect.objectContaining({ metric: 'hitRate', currentValue: 0, severity: 'critical' }),
    ]);
  });

  it('stays quiet when lookups mostly hit', async () => {
    const c = new MemoryMetricsCollector();
    for (let i = 0; i < 10; i++) c.recordRetrieval(5, i < 8 ? 3 : 0, i < 8 ? 0.9 : undefined);
    expect(await hitRateAlerts(c)).toEqual([]);
  });
});
