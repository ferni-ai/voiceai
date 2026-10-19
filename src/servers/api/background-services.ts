/**
 * Startup sequencing for the UI/API server's background services.
 *
 * Cloud Run runs this service at min-instances 0, so every cold boot is on a
 * caller's critical path. On 2026-10-18 the prod logs showed 42 cold boots
 * where "Firestore initialized" (+6.8s) was followed by nothing until +46.8s:
 * startBackgroundServices awaited two Firestore loads before it attached the
 * Twilio /stream bridge, so an inbound call's media stream had nowhere to land.
 *
 * The rules here:
 * - the /stream bridge attaches first, before anything is awaited;
 * - each load gets a timeout, after which it logs and the step moves on (the
 *   load keeps running and logs its real duration when it finally settles);
 * - steps run concurrently, so one slow load never holds up another;
 * - every step logs its elapsed time, so the next stall names itself.
 *
 * @module servers/api/background-services
 */

import { createLogger } from '../../utils/safe-logger.js';

const defaultLog = createLogger({ module: 'ApiStartup' });

/** Longest a startup load may hold its step before the step moves on. */
export const STARTUP_STEP_TIMEOUT_MS = 10_000;

export type StartupStepOutcome = 'ok' | 'timeout' | 'error';

export interface StartupLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export interface StartupStep {
  /** Stable name for logs, e.g. 'proactive-scheduler'. */
  name: string;
  /** The awaited part (usually a Firestore read). Bounded by the timeout. */
  load?: () => Promise<unknown>;
  /**
   * Starts the service. Runs after `load` settles OR times out, and after a
   * failed load too: each service here works from in-memory state that a late
   * load fills in, and a service running on partial state beats one that
   * never starts.
   */
  start?: () => void;
}

export interface BackgroundServicesOptions {
  /** Must be synchronous; runs before any load is awaited. */
  attachStreamBridge: () => void;
  steps: StartupStep[];
  timeoutMs?: number;
  logger?: StartupLogger;
  now?: () => number;
}

/**
 * Run one startup step: bounded load, then start. Never throws.
 */
export async function runStartupStep(
  step: StartupStep,
  opts: { timeoutMs?: number; logger?: StartupLogger; now?: () => number } = {}
): Promise<StartupStepOutcome> {
  const log = opts.logger ?? defaultLog;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? STARTUP_STEP_TIMEOUT_MS;
  const t0 = now();
  let outcome: StartupStepOutcome = 'ok';

  if (step.load) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loading = Promise.resolve().then(step.load);
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    outcome = await Promise.race([
      loading.then(
        () => 'ok' as const,
        (error: unknown) => {
          log.warn(
            { step: step.name, elapsedMs: now() - t0, error: String(error) },
            'Startup load failed (continuing)'
          );
          return 'error' as const;
        }
      ),
      timedOut,
    ]);
    clearTimeout(timer);

    if (outcome === 'timeout') {
      log.warn(
        { step: step.name, timeoutMs, elapsedMs: now() - t0 },
        'Startup load timed out (continuing; it keeps running in the background)'
      );
      // The late result is the measurement we need to find the real stall.
      loading.then(
        () => log.info({ step: step.name, elapsedMs: now() - t0 }, 'Startup load finished late'),
        (error: unknown) =>
          log.warn(
            { step: step.name, elapsedMs: now() - t0, error: String(error) },
            'Startup load failed late'
          )
      );
    }
  }

  if (step.start) {
    try {
      step.start();
    } catch (error) {
      log.warn(
        { step: step.name, elapsedMs: now() - t0, error: String(error) },
        'Startup service failed to start (continuing)'
      );
      return 'error';
    }
  }

  if (outcome === 'ok') {
    log.info({ step: step.name, elapsedMs: now() - t0 }, 'Startup step finished');
  }
  return outcome;
}

/**
 * Attach the /stream bridge, then run every step concurrently.
 * Resolves once every step has finished or timed out; never throws.
 */
export async function runBackgroundServices(
  opts: BackgroundServicesOptions
): Promise<Record<string, StartupStepOutcome>> {
  const log = opts.logger ?? defaultLog;
  const now = opts.now ?? Date.now;
  const t0 = now();

  try {
    opts.attachStreamBridge();
    log.info({ step: 'twilio-stream-bridge', elapsedMs: now() - t0 }, 'Startup step finished');
  } catch (error) {
    log.warn(
      { step: 'twilio-stream-bridge', error: String(error) },
      'Twilio Stream Bridge failed to start (non-blocking)'
    );
  }

  const byName: Record<string, StartupStepOutcome> = {};
  await Promise.all(
    opts.steps.map(async (step) => {
      byName[step.name] = await runStartupStep(step, {
        timeoutMs: opts.timeoutMs,
        logger: log,
        now,
      });
    })
  );
  log.info({ elapsedMs: now() - t0, outcomes: byName }, 'Background services started');
  return byName;
}
