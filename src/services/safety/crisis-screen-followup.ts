/**
 * The caller's turn after their answer to the screening question (#2511): one model read.
 *
 * A no taken back on the next turn ("No." … "Actually, yes, I have.") or a yes after the
 * gentle offer must get crisis guidance. Word lists fail open on any wording they don't name
 * (#2516 round 2: "I kind of lied before.", "It crosses my mind.", "Next question." all passed),
 * the same failure as the 10-17 lexical check-in. So one read sees the question, the caller's
 * answer, what Ferni said since and this turn, and picks from a closed set. It runs once per
 * release (twice with a backchannel between), so its cost is trivial. A timeout, an error or an
 * unusable reply counts as a take-back: crisis guidance.
 *
 * @module CrisisScreenFollowup
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createGeminiCrisisGenerate, type CrisisGenerateFn } from './crisis-classifier.js';

const log = createLogger({ module: 'CrisisScreenFollowup' });

/** crisis: crisis guidance with 988; gentle: the gentle offer; pass: nothing. */
export type WatchResult = 'crisis' | 'gentle' | 'pass';
export const WATCH_RANK: Record<WatchResult, number> = { pass: 0, gentle: 1, crisis: 2 };

/**
 * A timeout is crisis guidance, so the bound sits past the read's tail: over 1,194 reads
 * (2026-10-23, gemini-3.5-flash-lite, 6 concurrent) p50 555 ms, p99 991 ms, 11 over 1 s,
 * 1 over 1.5 s, none over 2 s. The reply is held this long at most, on one turn per release.
 */
export const DEFAULT_SCREEN_FOLLOWUP_TIMEOUT_MS = 2000;

export const SCREEN_FOLLOWUP_PROMPT = `A voice companion asked the caller a direct screening question about suicide and self-harm (QUESTION). The caller answered (ANSWER). The companion then said FERNI_SINCE. LATEST is the caller's next turn. Decide what LATEST says about the screening question, given the whole exchange.

Labels:
- "takes_back_or_risk": LATEST says yes to the question, or takes back, softens or qualifies the answer (owning that the answer wasn't true, a yes after a pause, a partial or conditional yes, thoughts that come and go, a time when they did, "not lately" or "not anymore" style answers that admit it happened), dodges or refuses the question, says they are not okay or things are very bad, or carries any risk at all (being gone, not being around, hurting themselves, others being better off). A yes or a "sure" that also carries risk is this label even when it answers something FERNI_SINCE asked.
- "answers_ferni_question_ordinary": LATEST plainly answers or reacts to an everyday question or offer in FERNI_SINCE, and nothing in it bears on the screening question.
- "unrelated_ordinary": LATEST moves on to everyday talk, with nothing that bears on the screening question.
- "unclear": LATEST is only a laugh, a filler, "what?", or not knowing, with nothing else, and its meaning for the question can't be told.

Dodging includes asking to skip the subject, drop it or move past it ("skip it", "can we change the subject"): the companion has already moved on, so asking to move on is about the screening question.

Judge meaning, not keywords:
- FERNI_SINCE may invite a reply without a question mark ("So Friday then.", "Pasta it is."). A yes, "I guess", "I think so", a time or a plan in reply to that is "answers_ferni_question_ordinary".
- An everyday "actually" or "honestly" about plans, food, work or the time is ordinary, and so is leaving the call or raising a new everyday topic ("I need to run", "quick question about the trip").
- A bare backchannel ("okay", "mm-hm") after an everyday line from the companion is ordinary.
- A bare "yeah" or "yes" is "takes_back_or_risk" unless FERNI_SINCE asked or proposed something everyday it plainly answers.
When unsure between "takes_back_or_risk" and another label, choose "takes_back_or_risk".

Return JSON only: {"answer":"takes_back_or_risk"|"answers_ferni_question_ordinary"|"unrelated_ordinary"|"unclear"}`;

const LABELS: Record<string, WatchResult> = {
  takes_back_or_risk: 'crisis',
  answers_ferni_question_ordinary: 'pass',
  unrelated_ordinary: 'pass',
  unclear: 'gentle',
};

/** The read's label as a result; null when the reply is unusable. */
export function parseScreenFollowup(reply: string): WatchResult | null {
  const json = /\{[\s\S]*\}/.exec(String(reply ?? ''))?.[0];
  if (!json) return null;
  try {
    const answer = (JSON.parse(json) as { answer?: unknown }).answer;
    return typeof answer === 'string' && Object.hasOwn(LABELS, answer) ? LABELS[answer] : null;
  } catch {
    return null;
  }
}

export interface ScreenFollowupInput {
  question: string;
  answer: string;
  ferni: readonly string[];
  latest: string;
}

let defaultGenerate: CrisisGenerateFn | undefined;

function timeoutFrom(env: Record<string, string | undefined>): number {
  const ms = Number(env.CRISIS_SCREEN_FOLLOWUP_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_SCREEN_FOLLOWUP_TIMEOUT_MS;
}

/** One read. Never rejects: a timeout, an error or an unusable reply is 'crisis'. */
export async function readScreenFollowup(
  input: ScreenFollowupInput,
  generate?: CrisisGenerateFn,
  env: Record<string, string | undefined> = process.env
): Promise<WatchResult> {
  const startedAt = Date.now();
  const controller = new globalThis.AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutFrom(env));
  });
  let result: WatchResult | null = null;
  let failure: string | undefined;
  try {
    const content = JSON.stringify({
      QUESTION: input.question,
      ANSWER: input.answer,
      FERNI_SINCE: input.ferni,
      LATEST: input.latest,
    });
    const send = generate ?? (defaultGenerate ??= createGeminiCrisisGenerate());
    const reply = await Promise.race([
      send(SCREEN_FOLLOWUP_PROMPT, content, controller.signal),
      timeout,
    ]);
    if (reply === null) failure = 'timeout';
    else if (!(result = parseScreenFollowup(reply))) failure = 'unparsed';
  } catch (error) {
    failure = String(error);
  } finally {
    clearTimeout(timer);
  }
  const outcome = result ?? 'crisis';
  log.info(
    { outcome, latencyMs: Date.now() - startedAt, ...(failure ? { failure } : {}) },
    'CRISIS_SCREEN_FOLLOWUP'
  );
  return outcome;
}
