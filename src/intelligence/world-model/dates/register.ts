/**
 * The after-call task that reads a call for dates that matter and stores them
 * (DATES_THAT_MATTER=on). Registered by agents/after-call-register.ts, so
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
 * @module intelligence/world-model/dates/register
 */
import { firestoreForgetStore } from '../../../memory/recall/forget.js';
import { isForgotten } from '../../../memory/recall/session-recall.js';
import { callLLM } from '../../../services/llm-utils.js';
import {
  registerAfterCallTask,
  type AfterCallContext,
} from '../../../services/session/after-call-tasks.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { transcriptOf, type ExtractionLlm } from '../extraction/after-call-extraction.js';
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

export interface DatesDeps {
  llm?: ExtractionLlm;
  store?: WorldFactStore;
  topics?: (userId: string) => Promise<string[]>;
  env?: Record<string, string | undefined>;
}

/** The call's dates, resolved against its date in the caller's timezone. */
export async function datesFromCall(
  ctx: Pick<AfterCallContext, 'turns' | 'sessionId' | 'startedAt' | 'timezone'>,
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
export async function extractDatesAfterCall(
  ctx: AfterCallContext,
  deps: DatesDeps = {}
): Promise<void> {
  if (!datesThatMatterOn(deps.env) || !ctx.userId || ctx.userId === 'anonymous') return;
  const dates = await datesFromCall(ctx, deps.llm);
  if (dates.length === 0) return;
  // What they asked Ferni to forget on this call is not written down after it.
  const topics = await (deps.topics ?? firestoreForgetStore.topics)(ctx.userId);
  const kept = dates.filter(
    (d) => !isForgotten([d.subject, d.relation, d.value, d.source.quote].join(' '), topics)
  );
  const result = await recordDates(ctx.userId, kept, deps.store);
  log.info(
    { sessionId: ctx.sessionId, found: dates.length, ...result, toConfirm: kept.filter((d) => d.needsConfirmation).length },
    'DATES_RECORDED'
  ); // prettier-ignore
}

registerAfterCallTask(DATES_TASK, (ctx) => extractDatesAfterCall(ctx), { timeoutMs: 30_000 });
