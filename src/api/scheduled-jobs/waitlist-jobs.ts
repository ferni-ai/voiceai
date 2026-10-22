/**
 * POST /api/jobs/waitlist-wave   (Mon and Thu 17:00 UTC; ?dryRun=true; WAITLIST_WAVES)
 *
 * Lets the next wave in (services/waitlist/wave.ts). Off unless the UI server
 * has WAITLIST_WAVES=on; until then every run answers flag-off. The wave id is
 * the UTC date, so a scheduler retry is the same wave, not a second one.
 *
 * @module api/scheduled-jobs/waitlist-jobs
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { sendJson } from './helpers.js';
import type { WaveDeps } from '../../services/waitlist/wave.js';

const log = createLogger({ module: 'WaitlistJobs' });

export const wavesOn = (env: Record<string, string | undefined> = process.env): boolean =>
  env['WAITLIST_WAVES'] === 'on';

async function defaultWaveDeps(now: Date, dryRun: boolean): Promise<WaveDeps | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  const [{ firestoreWaveStore }, { bigQuerySignals, readGuard }] = await Promise.all([
    import('../../services/waitlist/wave-store.js'),
    import('../../services/waitlist/capacity-guard.js'),
  ]);
  const signals = bigQuerySignals();
  return { store: firestoreWaveStore(db), guard: (s) => readGuard(signals, s), now, dryRun };
}

export async function runWaitlistWaveJob(opts: {
  dryRun: boolean;
  env?: Record<string, string | undefined>;
  deps?: (now: Date, dryRun: boolean) => Promise<WaveDeps | null>;
  now?: Date;
}): Promise<Record<string, unknown>> {
  if (!wavesOn(opts.env)) return { skipped: 'flag-off' };
  const now = opts.now ?? new Date();
  const deps = await (opts.deps ?? defaultWaveDeps)(now, opts.dryRun);
  if (!deps) return { skipped: 'no-firestore' };
  const { runWave, scheduledWaveId } = await import('../../services/waitlist/wave.js');
  const report = await runWave(deps, scheduledWaveId(now));
  log.info({ ...report, guard: report.guard?.state }, 'Waitlist wave');
  return { ...report };
}

export async function handleWaitlistWave(
  req: IncomingMessage,
  res: ServerResponse,
  run = runWaitlistWaveJob
): Promise<void> {
  // prettier-ignore
  const dryRun = ['true', '1'].includes(
    new URL(req.url ?? '/', 'http://localhost').searchParams.get('dryRun') ?? ''
  );
  try {
    sendJson(res, 200, { success: true, job: 'waitlist-wave', ...(await run({ dryRun })) }); // prettier-ignore
  } catch (error) {
    log.error({ error: String(error) }, 'Waitlist wave failed');
    sendJson(res, 500, { success: false, job: 'waitlist-wave', error: 'wave_failed' }); // detail stays in the log
  }
}
