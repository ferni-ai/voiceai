/**
 * Telling the owner how a call Ferni made for them went, the way a friend who
 * called your mom for you would: once, in a line, with what she asked to pass on.
 *
 * - In a live session the result already reaches it (call-result-capture
 *   injects it), so nothing more is sent.
 * - Otherwise one text through the guarded sender every member text takes
 *   (verified number, texts on, no STOP, gap per person and phone), never in
 *   the owner's quiet hours. Held texts are not queued: the next call's opener
 *   brings it up from the While You Were Away results, once.
 * - When the text goes, that While You Were Away result is marked delivered,
 *   so the next opener doesn't repeat it.
 * - Nothing is made up: the text is the outcome the call produced (built from
 *   the transcript or, without one, from what the line status supports) plus
 *   the screened words the person asked to pass on.
 *
 * Off unless CALL_RESULT_TEXT=on; off, the owner gets the push as before.
 *
 * @module services/outreach/call-result-text
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { isQuietHour } from '../follow-through/index.js';
import {
  crisisCallerLine,
  cutAtWord,
  isRiskyCallerText,
  riskyCallerLine,
  screenCallerParts,
} from './caller-text.js';
import { isSavedQuietNow } from './quiet-hours.js';
import type { CallOutcome, OnBehalfCallRequest } from '../../tools/domains/telephony/types.js';

const log = createLogger({ module: 'call-result-text' });

/** No second call-result text to one person within this window. */
export const CALL_RESULT_GAP_MS = 10 * 60 * 1000;
/** One SMS segment's worth, so it reads as one text. */
const MAX_TEXT = 300;

export function callResultTextOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.CALL_RESULT_TEXT === 'on';
}

/**
 * What they asked to pass on, screened again right before it goes out (it may
 * have been joined from parts). Their words are only ever quoted and
 * attributed, and only when nothing risky came up; otherwise Ferni's own fixed
 * line goes instead. Crisis words are never lost (#2861): Ferni's safety line
 * comes first, so the length cap can't cut it.
 */
function passedOn(
  contactName: string,
  outcome: CallOutcome
): { quote?: string; before?: string; after?: string } {
  // The lifecycle may already have put the fixed lines in `message`: the screen
  // takes them back out of the quote and reports them as flags.
  const { said, risky, safety } = screenCallerParts(outcome.message, contactName, 200);
  return {
    quote: said && !risky && !isRiskyCallerText(said) ? said : undefined,
    before: safety ? crisisCallerLine(contactName) : undefined,
    after: risky ? riskyCallerLine(contactName) : undefined,
  };
}

/** The flags and the quote, by priority: safety first, the quote, then money. */
function passOnLine(contactName: string, outcome: CallOutcome, lead: string): string | undefined {
  const { quote, before, after } = passedOn(contactName, outcome);
  const said = quote ? `${lead} "${quote}"` : undefined;
  const line = [before, said, after].filter(Boolean).join(' ');
  return line || undefined;
}

/** Cut to one text at a word, without leaving a quote open (a cut quote is closed, so it stays theirs). */
function capped(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  const cut = cutAtWord(text, MAX_TEXT - 1);
  return (cut.match(/"/g)?.length ?? 0) % 2 === 1 ? `${cut}"` : cut;
}

/**
 * The last step before the owner sees it: a screen of the exact string, never
 * a cut. It catches what only this string can hold: the cap's "..." after a
 * word ("www..."), or a quote and the summary joining into a request. If
 * anything risky is left, only Ferni's own lines go, the safety line first
 * whenever the text carried it. The contact's name is the owner's words, not
 * the caller's, so it doesn't count: a call to "Chase Bank" still reports.
 */
function screened(text: string, contactName: string, prefix = ''): string {
  if (!isRiskyCallerText(text.split(contactName).join(' '))) return text;
  const safety = text.includes(crisisCallerLine(contactName));
  return [prefix, safety ? crisisCallerLine(contactName) : '', riskyCallerLine(contactName)]
    .filter(Boolean)
    .join(' ');
}

/**
 * The text. With a message: that they were reached and what they asked to pass
 * on, quoted. Without one: the call's own outcome line.
 */
export function callResultText(contactName: string, outcome: CallOutcome): string {
  const passOn = passOnLine(contactName, outcome, `${contactName} asked me to tell you:`);
  const reached = `It's Ferni. I talked to ${contactName}.`;
  if (outcome.status !== 'completed' || !passOn) {
    const lead = outcome.status === 'completed' ? reached : "It's Ferni.";
    return screened(capped(`It's Ferni. ${outcome.outcome.trim()}`), contactName, lead);
  }
  return screened(capped(`${reached} ${passOn}`), contactName, reached);
}

/** The While You Were Away details: what they asked to pass on first, then the summary. */
export function callResultDetails(contactName: string, outcome: CallOutcome): string | undefined {
  const passOn = passOnLine(contactName, outcome, `${contactName} asked to pass on:`);
  const details = [passOn, outcome.transcriptSummary].filter(Boolean).join(' ');
  return details ? screened(details, contactName) : undefined;
}

export type CallResultTold = 'live' | 'quiet-hours' | 'no-time-zone' | 'texted' | 'not-sent';

export interface CallResultTextDeps {
  now: () => Date;
  sendText: (t: {
    userId: string;
    body: string;
    kind: 'call-result';
    refId: string;
    minGapMs: number;
  }) => Promise<{ sent: boolean; reason?: string }>;
  /** Marks this call's While You Were Away result delivered, so the opener skips it. */
  markDelivered: (userId: string, callId: string) => Promise<void>;
}

function defaultDeps(): CallResultTextDeps {
  return {
    now: () => new Date(),
    sendText: async (t) => (await import('./guarded-text.js')).sendGuardedText(t),
    markDelivered: async (userId, callId) => {
      const { getPendingResults, markResultsDelivered } =
        await import('../background-agents/unified-result-capture.js');
      const pending = await getPendingResults(userId, { types: ['on_behalf_call'] });
      const ids = pending.filter((r) => r.relatedTaskId === callId).map((r) => r.id);
      await markResultsDelivered(userId, ids, 'sms');
      // The call-only opener (pending-call-results.ts) reads the call record's own flag.
      const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
      await getFirestoreDb()
        ?.collection('bogle_users')
        .doc(userId)
        .collection('on_behalf_calls')
        .doc(callId)
        .set({ delivered: true, deliveredAt: new Date().toISOString() }, { merge: true });
    },
  };
}

/** Tell the owner, once. Never throws: a failure leaves it to the next opener. */
export async function tellOwnerAboutCall(
  call: { request: OnBehalfCallRequest; outcome: CallOutcome; callId: string; live: boolean },
  deps: CallResultTextDeps = defaultDeps()
): Promise<CallResultTold> {
  const { request, outcome, callId } = call;
  const told = await (async (): Promise<CallResultTold> => {
    if (call.live) return 'live';
    const zone = request.userTimezone;
    if (!isValidTimeZone(zone)) return 'no-time-zone';
    if (isQuietHour(deps.now(), zone)) return 'quiet-hours';
    if (await isSavedQuietNow(request.userId, deps.now())) return 'quiet-hours';
    const contactName = request.resolvedContact?.name || request.contactQuery;
    const sent = await deps.sendText({
      userId: request.userId,
      body: callResultText(contactName, outcome),
      kind: 'call-result',
      refId: callId,
      minGapMs: CALL_RESULT_GAP_MS,
    });
    if (!sent.sent) return 'not-sent';
    await deps.markDelivered(request.userId, callId).catch((error: unknown) => {
      log.warn({ callId, error: String(error) }, 'Texted, but the next opener may repeat it');
    });
    return 'texted';
  })().catch((error: unknown) => {
    log.warn({ callId, error: String(error) }, 'Could not tell the owner; the next opener will');
    return 'not-sent' as const;
  });
  log.info({ callId, told }, 'Owner told about call');
  return told;
}

/** tellOwnerAboutCall when CALL_RESULT_TEXT is on; null (nothing done) when it's off. */
export async function tellOwnerIfOn(
  call: Parameters<typeof tellOwnerAboutCall>[0]
): Promise<CallResultTold | null> {
  return callResultTextOn() ? tellOwnerAboutCall(call) : null;
}
