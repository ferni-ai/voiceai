/**
 * The after-call task body that reads a call for dates that matter and stores
 * them (DATES_THAT_MATTER=on). agents/dates-register.ts registers it, so
 * endSession starts it once the call has ended and the job process waits for
 * it. One model call per call with something the caller said; nothing on the
 * live path.
 *
 * Why its own task: the only writer of special_dates (saveSpecialDate) had no
 * caller, so the store stayed empty on prod; the signal extractor's regexes
 * caught only "my birthday is on <date>", never "my mom's birthday is the
 * 14th"; and the world extractor stores a birthday as a one-time event with a
 * date the model computed itself.
 *
 * @module intelligence/world-model/dates/after-call
 */
import { forgottenTopicsOrNull, isForgotten } from '../../../memory/index.js';
import { envForCaller, type CohortStore } from '../../../services/platform/cohort-flags.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { callLLM } from '../../../services/llm-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  transcriptOf,
  type CallTurn,
  type ExtractionLlm,
} from '../extraction/after-call-extraction.js';
import { callMomentFor } from '../extraction/extraction-prompt.js';
import type { WorldFactStore } from '../temporal/store.js';
import {
  buildDatesPrompt,
  datesThatMatterOn,
  parseDateMentions,
  toDateObservations,
  type DateObservation,
} from './extract.js';
import { recordDates } from './store.js';

const log = createLogger({ module: 'dates-that-matter' });

export const DATES_TASK = 'dates-that-matter';

const llm: ExtractionLlm = (prompt) =>
  callLLM(prompt, { maxTokens: 1500, temperature: 0, timeout: 20_000 });

/** The ended call, as the after-call registry hands it over (AfterCallContext). */
export interface DatesCall {
  userId: string;
  sessionId: string;
  startedAt: Date;
  timezone?: string;
  turns: readonly CallTurn[];
}

export interface DatesDeps {
  llm?: ExtractionLlm;
  store?: WorldFactStore;
  /** Forgotten topics; null when they can't be read. */
  topics?: (userId: string) => Promise<string[] | null>;
  env?: Record<string, string | undefined>;
  /** Where the caller's cohort flags are read (cohort-flags.ts); Firestore by default. */
  cohorts?: CohortStore;
}

/** The call's dates, resolved against its date in the caller's timezone. */
export async function datesFromCall(
  ctx: Omit<DatesCall, 'userId'>,
  model: ExtractionLlm = llm
): Promise<DateObservation[]> {
  if (!ctx.turns.some((t) => t.role === 'user' && t.content?.trim())) return [];
  const moment = callMomentFor(ctx.startedAt, ctx.timezone ?? 'UTC');
  const reply = await model(buildDatesPrompt(transcriptOf([...ctx.turns]), moment));
  return toDateObservations(parseDateMentions(reply), {
    sessionId: ctx.sessionId,
    observedAt: ctx.startedAt.toISOString(),
    callDate: moment.date,
  });
}

/** The task body; exported so tests can run it with a fake model and store. */
export async function extractDatesAfterCall(ctx: DatesCall, deps: DatesDeps = {}): Promise<void> {
  // Never an unrecognised caller (anon:) or the third party on a call placed for someone (onbehalf:).
  if (!isMemberIdentity(ctx.userId)) return;
  // DATES_THAT_MATTER as this caller's call had it: process.env may hold the next caller's.
  const env = await envForCaller(ctx.userId, { env: deps.env, store: deps.cohorts });
  if (!datesThatMatterOn(env)) return;
  const dates = await datesFromCall(ctx, deps.llm);
  if (dates.length === 0) return;
  // What they asked Ferni to forget on this call is not written down after it.
  // Unreadable topics (null) could hide one of them, so nothing is stored this call.
  const topics = await (deps.topics ?? forgottenTopicsOrNull)(ctx.userId);
  if (topics === null) {
    log.warn({ sessionId: ctx.sessionId, found: dates.length }, 'DATES_SKIPPED_TOPICS_UNREADABLE');
    return;
  }
  const kept = dates.filter(
    (d) => !isForgotten([d.subject, d.relation, d.value, d.source.quote].join(' '), topics)
  );
  const callDay = callMomentFor(ctx.startedAt, ctx.timezone ?? 'UTC').date;
  const result = await recordDates(ctx.userId, kept, deps.store, callDay);
  log.info(
    { sessionId: ctx.sessionId, found: dates.length, ...result, toConfirm: kept.filter((d) => d.needsConfirmation).length },
    'DATES_RECORDED'
  ); // prettier-ignore
}
