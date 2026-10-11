/**
 * After-call sink: writers (W1: people, special dates, commitments, open
 * threads) call recordWorldObservations once per call. Each observation is
 * checked, resolved against the facts on file (resolve.ts) and written. Never
 * on the reply path; does nothing unless WORLD_MODEL_TEMPORAL=on.
 *
 * @module intelligence/world-model/temporal/ingest
 */

import { callLLMForJSON } from '../../../services/llm-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { planResolution, type SupersedeJudge } from './resolve.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from './store.js';
import { isWorldModelTemporalOn, type TemporalFact, type WorldObservation } from './types.js';
import { validObservation } from './validate.js';

const log = createLogger({ module: 'world-model:temporal' });

/** One call rarely says more; a runaway extractor must not fan out judge calls. */
export const MAX_OBSERVATIONS_PER_CALL = 24;

export interface IngestDeps {
  store?: WorldFactStore;
  judge?: SupersedeJudge;
  env?: Record<string, string | undefined>;
  newId?: () => string;
}

export interface IngestResult {
  created: number;
  closed: number;
  refreshed: number;
}

/**
 * Asks the model which open facts a new one updates. Any failure means
 * "none": a fact left open is better than one closed by mistake.
 */
export const llmSupersedeJudge: SupersedeJudge = async (obs, open) => {
  const listed = open
    .map(
      (f, i) => `${i + 1}. ${f.attribute}: ${f.value}${f.eventDate ? ` (on ${f.eventDate})` : ''}`
    )
    .join('\n');
  const prompt = `You keep a friend's notes on someone's life. About "${obs.subject}", the notes say:
${listed}

New today: ${obs.attribute}: ${obs.value}${obs.eventDate ? ` (on ${obs.eventDate})` : ''}

Which numbered notes does the new one replace, finish or report the outcome of? A note about something else stays.
Answer as JSON only: {"replaces": [numbers]}`;
  const out = await callLLMForJSON<{ replaces?: unknown }>(prompt, {
    maxTokens: 60,
    temperature: 0,
    timeout: 8000,
  });
  if (!out || !Array.isArray(out.replaces)) return [];
  return out.replaces
    .filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= open.length)
    .map((n) => open[n - 1].id);
};

export async function recordWorldObservations(
  userId: string,
  sessionId: string,
  observations: readonly unknown[],
  deps: IngestDeps = {}
): Promise<IngestResult | null> {
  if (!isWorldModelTemporalOn(deps.env) || !userId) return null;
  const kept = observations
    .map((o) => validObservation(o, sessionId))
    .filter((o): o is WorldObservation => o !== null)
    .slice(0, MAX_OBSERVATIONS_PER_CALL);
  if (kept.length === 0) return { created: 0, closed: 0, refreshed: 0 };

  const store = deps.store ?? createFirestoreWorldFactStore();
  try {
    const open: TemporalFact[] = await store.listOpen(userId);
    const plan = await planResolution(open, kept, {
      judge: deps.judge ?? llmSupersedeJudge,
      newId: deps.newId,
    });
    await store.apply(userId, plan);
    const result = {
      created: plan.create.length,
      closed: plan.close.length + plan.create.filter((f) => f.validTo !== null).length,
      refreshed: plan.refresh.length,
    };
    log.info(
      { userId, sessionId, dropped: observations.length - kept.length, ...result },
      'WORLD_FACTS_RECORDED'
    );
    return result;
  } catch (error) {
    log.warn({ userId, sessionId, error: String(error) }, 'World facts not recorded');
    return null;
  }
}
