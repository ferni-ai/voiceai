/**
 * GCE Post-Warmup Tasks
 *
 * Work that runs once the blocking warmup tasks have finished.
 * Extracted from warmup.ts for maintainability.
 *
 * @module agents/gce/post-warmup
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

/**
 * Run the steps that follow the blocking warmup tasks: install the TTS cache
 * (awaited), then start the dynamic domain warmup (not awaited).
 */
export async function runPostWarmupTasks(log: LogFn): Promise<void> {
  // Wire prewarmed greeting/conversational audio into gateway hot path
  try {
    const { installProductionTTSCache } = await import('./tts-cache-install.js');
    await installProductionTTSCache();
  } catch (e) {
    log('⚠️ TTS cache install failed (non-fatal)', { error: String(e) });
  }

  // Not awaited: readiness must not wait on ~47 domain imports. Started after
  // the blocking tasks so it doesn't compete with them for the event loop.
  void startDynamicDomainWarmup(log);
}
