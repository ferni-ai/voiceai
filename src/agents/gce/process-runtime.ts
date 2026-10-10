/**
 * What every process that runs calls needs: crash analytics, the memory event
 * workers (fast capture queues deep extraction on in-memory events, so the
 * worker must live in the same process as the call), knowledge capture, and the
 * orphan cleanups for per-session maps.
 *
 * The worker runs it today. A per-call child process will run it too
 * (docs/plans/2026-10-10-process-per-job.md).
 *
 * @module agents/gce/process-runtime
 */

import { configureAsyncEvents } from '../../memory/dynamic/async-events-config.js';
import { configureSyncService, startDeepExtractionWorker } from '../../memory/dynamic/index.js';
import { initializeKnowledgeCapture } from '../../memory/knowledge-graph/index.js';
import { memoryAsyncEvents } from '../../services/async-events/index.js';
import { startRegistryOrphanCleanup, stopRegistryOrphanCleanup } from '../session/index.js';
import { initCrashAnalytics } from '../shared/crash-analytics.js';
import { startOrphanCleanup, stopOrphanCleanup } from '../shared/openai-health-monitor.js';
import {
  startClosingTrackerCleanup,
  stopClosingTrackerCleanup,
} from '../shared/session-closing-tracker.js';

type LogFn = (msg: string, data?: Record<string, unknown>) => void;

/** Starts the per-process runtime; `stop()` stops its timers. */
export function startProcessRuntime(log: LogFn): { stop(): void } {
  initCrashAnalytics();
  log('✅ Crash analytics initialized');

  // Configure AsyncEvents before starting the workers that listen on it.
  try {
    configureAsyncEvents(memoryAsyncEvents);
    log('✅ AsyncEvents configured for memory workers');
  } catch (diError) {
    log('⚠️ AsyncEvents DI setup failed (deep extraction will be disabled)', {
      error: String(diError),
    });
  }

  // Processes memory jobs queued by fastCapture() in the background.
  startDeepExtractionWorker();
  log('✅ Deep extraction worker started');

  // Must be ready before the first turns, or captureTurn is a no-op.
  void initializeKnowledgeCapture()
    .then(() => log('✅ Knowledge capture initialized'))
    .catch((err: unknown) =>
      log('⚠️ Knowledge capture init failed (entity persistence may be delayed)', {
        error: String(err),
      })
    );

  // No Spanner instance exists (gcloud instances list empty, 2026-10). Keep L2 Firestore.
  configureSyncService({ enabled: false });
  log('ℹ️ Spanner L3 removed — Firestore L2 only');

  // Orphan cleanups keep per-session maps bounded when a session dies without cleanup:
  // OpenAI health monitors (10 min), session registries (15 min, 2 h TTL),
  // sessions stuck closing (2 min, 5 min TTL).
  startOrphanCleanup();
  startRegistryOrphanCleanup();
  startClosingTrackerCleanup();
  log('✅ Session orphan cleanups started');

  return {
    stop(): void {
      for (const [name, stop] of [
        ['OpenAI health monitor cleanup', stopOrphanCleanup],
        ['Session cleanup registry', stopRegistryOrphanCleanup],
        ['Session closing tracker cleanup', stopClosingTrackerCleanup],
      ] as const) {
        try {
          stop();
          log(`${name} stopped`);
        } catch (error) {
          log(`${name} failed to stop`, { error: String(error) });
        }
      }
    },
  };
}
