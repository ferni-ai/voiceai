/**
 * Batch persistence of web experiment events (exposure / conversion).
 *
 * Shared by `/api/v1/public/experiments/track/batch` and
 * `/api/landing/experiments/track/batch` so both store events the same way
 * (web-experiments `trackExposure` / `trackConversion` → Firestore).
 */

import { createLogger } from '../../utils/safe-logger.js';
import { trackConversion, trackExposure } from './web-experiments.js';

const log = createLogger({ module: 'experiment-event-batch' });

/** Upper bound per request; the website flushes every few seconds. */
export const MAX_EXPERIMENT_EVENTS_PER_BATCH = 100;

export interface ExperimentEventInput {
  readonly experimentId: string;
  readonly variantId: string;
  readonly userId: string;
  readonly eventType: 'exposure' | 'conversion';
  readonly goalId?: string;
  readonly value?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ExperimentBatchResult {
  tracked: number;
  failed: number;
  invalid: number;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 200;
}

/** Validate an untrusted event from a public endpoint. */
export function isValidExperimentEvent(value: unknown): value is ExperimentEventInput {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  if (!isNonEmptyString(e.experimentId) || !isNonEmptyString(e.variantId)) return false;
  if (!isNonEmptyString(e.userId)) return false;
  if (e.value !== undefined && typeof e.value !== 'number') return false;
  if (e.metadata !== undefined && (typeof e.metadata !== 'object' || e.metadata === null)) {
    return false;
  }
  if (e.eventType === 'exposure') return true;
  return e.eventType === 'conversion' && isNonEmptyString(e.goalId);
}

/**
 * Persist a batch of events. Malformed, unknown-experiment and over-limit
 * events are skipped and counted as `invalid`; rejected writes count as `failed`.
 */
export async function trackExperimentEvents(
  events: readonly unknown[],
  options: { allowedExperimentIds?: ReadonlySet<string> } = {}
): Promise<ExperimentBatchResult> {
  const { allowedExperimentIds } = options;
  const valid = events
    .slice(0, MAX_EXPERIMENT_EVENTS_PER_BATCH)
    .filter(isValidExperimentEvent)
    .filter((e) => !allowedExperimentIds || allowedExperimentIds.has(e.experimentId));
  const invalid = events.length - valid.length;

  const results = await Promise.allSettled(
    valid.map((event) =>
      event.eventType === 'exposure'
        ? trackExposure(event.experimentId, event.variantId, event.userId, event.metadata)
        : trackConversion(
            event.experimentId,
            event.variantId,
            event.userId,
            event.goalId ?? '',
            event.value,
            event.metadata
          )
    )
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    log.warn({ failed, total: valid.length }, 'Some experiment events were not stored');
  }
  return { tracked: valid.length - failed, failed, invalid };
}
