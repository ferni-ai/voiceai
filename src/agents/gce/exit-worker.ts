/**
 * The end of the worker's shutdown (SIGTERM, WORKER_RECYCLE): every step runs and its logs land
 * before the process goes.
 *
 * Node ends a process on its own once no ref'd handle is left. Late in shutdown the connection
 * and timers are closed and flushBqEvents waits on an unref'd timer, so if the insert holds no
 * ref'd handle the process ends inside it: on dev, 2026-11-01 13:57:57Z, a recycled worker
 * stopped right after "Batched memory work drained" and never logged "Shutdown complete".
 *
 * @module agents/gce/exit-worker
 */
import { flushLogs } from '../../utils/safe-logger.js';

/** Keeps the event loop alive until the process exits; call it when shutdown starts. */
export function holdEventLoop(): () => void {
  const timer = setInterval(() => undefined, 60_000);
  return () => clearInterval(timer);
}

export interface ExitDeps {
  flushLogs: () => Promise<void>;
  exit: (code: number) => never;
}

/** Flushes the app logger, then exits with `code`. */
export async function exitAfterFlush(
  code: number,
  deps: ExitDeps = { flushLogs, exit: (c) => process.exit(c) }
): Promise<never> {
  try {
    await deps.flushLogs();
  } catch (error) {
    process.stderr.write(`[worker] log flush before exit failed: ${String(error)}\n`);
  }
  return deps.exit(code);
}
