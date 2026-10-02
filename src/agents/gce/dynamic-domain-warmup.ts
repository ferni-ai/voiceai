/**
 * Background warmup of the dynamic domain executor, started by warmupResources.
 *
 * @module agents/gce/dynamic-domain-warmup
 */
import type { LogFn } from './warmup.js';

/**
 * Load the dynamic domain executor's tool map in the background.
 *
 * Every tool call that no specialized executor claims goes through the dynamic
 * executor first, so without this the first such call in a worker pays the cold
 * import of every domain module (1.5-4s measured) inside a live voice turn.
 * Never rejects; callers fire and forget. A tool call that lands first shares
 * the same in-flight load.
 */
export async function startDynamicDomainWarmup(log: LogFn): Promise<void> {
  const start = Date.now();
  try {
    const { getDynamicDomainLoadReport } =
      await import('../shared/tool-executors/dynamic-domain-executor.js');
    const report = await getDynamicDomainLoadReport();
    log('✅ Dynamic domain executor warmed', {
      loaded: report.loaded.length,
      failed: Object.keys(report.failed),
      durationMs: Date.now() - start,
    });
  } catch (e) {
    log('⚠️ Dynamic domain executor warmup failed (will load on first call)', {
      error: String(e),
    });
  }
}
