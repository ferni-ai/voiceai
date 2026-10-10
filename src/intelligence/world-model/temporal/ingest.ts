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
import { isCrisisText } from '../crisis-filter.js';
import { planResolution, type SupersedeJudge } from './resolve.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from './store.js';
import {
  isDay,
  isWorldModelTemporalOn,
  type SubjectKind,
  type TemporalFact,
  type WorldObservation,
} from './types.js';

const log = createLogger({ module: 'world-model:temporal' });

/** One call rarely says more; a runaway extractor must not fan out judge calls. */
export const MAX_OBSERVATIONS_PER_CALL = 24;

const KINDS: ReadonlySet<SubjectKind> = new Set(['person', 'self', 'goal', 'situation']);

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

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The observation if a writer filled it in well enough to keep, else null. */
export function validObservation(
  raw: WorldObservation,
  sessionId: string
): WorldObservation | null {
  const subject = text(raw.subject);
  const attribute = text(raw.attribute);
  const value = text(raw.value);
  if (!subject || !attribute || !value || !KINDS.has(raw.subjectKind)) return null;
  if (Number.isNaN(Date.parse(raw.observedAt))) return null;
  if ([subject, value, raw.relation].some((t) => isCrisisText(t))) return null;
  const confidence = Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0.5;
  return {
    ...raw,
    subject,
    attribute,
    value,
    relation: text(raw.relation) ?? undefined,
    // A date that does not parse is worse than none: it would fire "due" wrongly.
    eventDate: isDay(raw.eventDate) ? raw.eventDate : undefined,
    since: isDay(raw.since) ? raw.since : undefined,
    confidence,
    source: { ...raw.source, sessionId: raw.source?.sessionId || sessionId },
  };
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
  observations: readonly WorldObservation[],
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
