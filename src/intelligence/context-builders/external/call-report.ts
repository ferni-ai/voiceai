/**
 * The report of a call Ferni made for the owner reaches the owner's next call
 * (CALL_REPORT_REACHES_YOU, default off).
 *
 * Off, as before: built on turn 0 only (never true on a live call, #3114) and
 * marked delivered when built, so a dropped or late block was never offered again.
 *
 * On: one compact block (calls first, newest first, at most 2 results of ~350
 * chars) is offered on the call's first 3 caller turns until a reply's request
 * carries it. The filter keeps it in every mode but crisis and drops it beside
 * safety guidance; after any crisis risk on the call it waits for the next call,
 * and a crisis-guided request never carries it. Its results are marked delivered
 * only when a request holds all of it and that reply is released (turn-request.ts).
 *
 * @module intelligence/context-builders/external/call-report
 */

import { flagOn } from '../../../config/env-flag.js';
import { crisisRiskThisCall } from '../../../services/safety/index.js';
import type { BackgroundResult } from '../../../services/background-agents/index.js';
import {
  CALLER_TEXT_GUARD,
  callerText,
  cutAtWord,
  reportedFromCall,
} from '../../../services/outreach/caller-text.js';
import { voicemailWords } from '../../../services/outreach/voicemail-outcome.js';
import type { ContextInjection } from '../../../types/context-injection-types.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { PendingCallResult } from './pending-call-results.js';

const log = createLogger({ module: 'CallReport' });

const CATEGORY = 'pending_background_results';
const REPORT_HEADER = '## While they were away (tell them on this call)';
const PRIORITY = 90;
const FIRST_TURNS = 3; // caller turns 1 to 3, then left for the next call
const MAX_RESULTS = 2;
const RESULT_CHARS = 350; // about this many per result
const MAX_SESSIONS = 500;

/** A built block and the stored results it carries. */
interface CallReport {
  content: string;
  resultIds: string[]; // background_results docs
  callIds: string[]; // on_behalf_calls docs
}

interface SessionOffer {
  userId: string;
  /** Built once a call; a build that lost the race is used by the next turn. */
  report: Promise<CallReport | null>;
  /** The block offered on the latest turn. */
  offered?: CallReport;
  reached: boolean;
}

const sessions = new Map<string, SessionOffer>();

export interface CallReportTurn {
  userId?: string;
  sessionId?: string;
  /** userData.turnCount: 0 before the first caller turn on the off path. */
  turnCount: number;
  /** The caller turn, 1, 2, 3... (callerTurnOf), where the live hook names it. */
  callerTurn?: number;
  /** The caller's words this turn: a crisis read in flight of them is this turn's own. */
  latest?: string;
  /** The turn carries safety guidance. */
  crisis: boolean;
  timeoutMs: number;
}

/** The While You Were Away injection for this turn, or null. Never throws. */
export async function callReportInjection(turn: CallReportTurn): Promise<ContextInjection | null> {
  if (!flagOn('CALL_REPORT_REACHES_YOU')) return firstTurnOnly(turn);
  try {
    const { userId, sessionId } = turn;
    if (!userId || !sessionId || turn.crisis) return null;
    if (crisisRiskThisCall(sessionId, turn.latest)) return null; // waits for the next call
    if ((turn.callerTurn ?? turn.turnCount + 1) > FIRST_TURNS) return null;
    const offer = offerFor(sessionId, userId);
    if (offer.reached) return null;
    const report = await Promise.race([offer.report, later(turn.timeoutMs)]);
    if (!report) return null; // nothing pending, or not built yet: the next turn looks again
    offer.offered = report;
    return { category: CATEGORY, content: report.content, priority: PRIORITY };
  } catch (error) {
    log.warn({ error: String(error) }, 'Call report not offered');
    return null;
  }
}

/**
 * A reply's request (its items) holds the whole offered block (a note cut short
 * doesn't count): mark the results it carries delivered, once, when the reply is
 * released. `held` is the crisis classifier's verdict the reply waits on: a
 * verdict replaces or guides the reply, so the block is offered again instead.
 * Never throws. Call it on the request the model gets, never on a crisis turn's.
 */
export async function confirmCallReportReached(
  sessionId: string | undefined,
  items: readonly unknown[],
  turn: { latest?: string; held?: PromiseLike<unknown> | null } = {}
): Promise<void> {
  try {
    const offer = sessionId ? sessions.get(sessionId) : undefined;
    const report = offer?.offered;
    if (!sessionId || !offer || !report || offer.reached) return;
    if (crisisRiskThisCall(sessionId, turn.latest)) return;
    const holds = (item: unknown): boolean => {
      const text = (item as { textContent?: unknown } | null)?.textContent;
      return typeof text === 'string' && text.includes(report.content);
    };
    if (!items.some(holds)) return;
    offer.reached = true; // before any await: a second request this turn marks nothing
    // holdUntilCleared (crisis-gate.ts) releases the reply only when there is no verdict.
    const verdict: unknown = await Promise.resolve(turn.held).catch(() => null);
    if (verdict == null) await markCarried(offer.userId, report);
    else offer.reached = false;
  } catch (error) {
    log.warn({ error: String(error) }, 'Call report delivery not checked');
  }
}

/**
 * A crisis-guided request never carries the call report (#3080): it is offered before the turn's
 * classifier rules, and a guided re-ask reuses the same notes. Whole or cut. Never throws.
 */
export function withoutCallReport<T extends { items: unknown[]; copy(): T }>(chatCtx: T): T {
  try {
    const text = (item: unknown): string =>
      String((item as { textContent?: unknown } | null)?.textContent ?? '');
    if (!chatCtx.items.some((item) => text(item).includes(REPORT_HEADER))) return chatCtx;
    const ctx = chatCtx.copy();
    ctx.items = ctx.items.map((item) => {
      const content = (item as { content?: unknown }).content;
      if (!text(item).includes(REPORT_HEADER) || !Array.isArray(content)) return item;
      const others = content.filter((part: unknown) => typeof part !== 'string');
      return Object.assign(Object.create(Object.getPrototypeOf(item) as object) as object, item, {
        content: [withoutReportSection(text(item)), ...others],
      });
    });
    return ctx;
  } catch (error) {
    log.warn({ error: String(error) }, 'Call report not taken out of a guided request');
    return chatCtx;
  }
}

/** Without any report section: its header to the next blank line, or to the end. */
function withoutReportSection(text: string): string {
  let out = text;
  for (let at = out.indexOf(REPORT_HEADER); at >= 0; at = out.indexOf(REPORT_HEADER)) {
    const end = out.indexOf('\n\n', at);
    out = out.slice(0, at) + (end < 0 ? '' : out.slice(end + 2));
  }
  return out.trimEnd();
}

/** Off: as before, turn 0 only; the builders mark what they build. */
async function firstTurnOnly(turn: CallReportTurn): Promise<ContextInjection | null> {
  const { userId } = turn;
  if (!userId || turn.turnCount !== 0) return null;
  return Promise.race([
    import('./pending-call-results.js').then(async ({ buildAllPendingResultsContext }) => {
      const content = await buildAllPendingResultsContext(userId);
      return content ? { category: CATEGORY, content, priority: PRIORITY } : null;
    }),
    later(turn.timeoutMs),
  ]).catch(() => null);
}

const later = async (ms: number): Promise<null> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });

function offerFor(sessionId: string, userId: string): SessionOffer {
  const known = sessions.get(sessionId);
  if (known && known.userId === userId) return known;
  const report = buildCallReport(userId).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Call report not built');
    return null;
  });
  const offer: SessionOffer = { userId, report, reached: false };
  sessions.set(sessionId, offer);
  if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  return offer;
}

async function markCarried(userId: string, report: CallReport): Promise<void> {
  try {
    const [{ markResultsDelivered }, { markCallResultsDelivered }] = await Promise.all([
      import('../../../services/background-agents/index.js'),
      import('./pending-call-results.js'),
    ]);
    await Promise.all([
      markResultsDelivered(userId, report.resultIds, 'voice'),
      markCallResultsDelivered(userId, report.callIds),
    ]);
    log.info(
      { results: report.resultIds.length, calls: report.callIds.length },
      'Call report delivered'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Call report not marked delivered');
  }
}

interface ReportItem {
  at: string;
  isCall: boolean;
  text: string;
  resultId?: string;
  callId?: string;
}

/**
 * One block from both stores. A background result of a call names its
 * on_behalf_calls doc (relatedTaskId), so that call is told once and both docs
 * are carried.
 */
async function buildCallReport(userId: string): Promise<CallReport | null> {
  const [{ getPendingResults }, { getPendingCallResults }] = await Promise.all([
    import('../../../services/background-agents/index.js'),
    import('./pending-call-results.js'),
  ]);
  const [results, calls] = await Promise.all([
    getPendingResults(userId, { maxAge: 48, limit: 8 }),
    getPendingCallResults(userId),
  ]);
  const pendingCalls = new Set(calls.map((call) => call.callId));
  const told = new Set(results.map((result) => result.relatedTaskId));
  const items: ReportItem[] = [
    ...results.map((result) => ({
      at: result.capturedAt,
      isCall: result.type === 'on_behalf_call',
      text: resultText(result),
      resultId: result.id,
      callId: pendingCalls.has(result.relatedTaskId ?? '') ? result.relatedTaskId : undefined,
    })),
    ...calls
      .filter((call) => !told.has(call.callId))
      .map((call) => ({
        at: call.capturedAt,
        isCall: true,
        text: callText(call),
        callId: call.callId,
      })),
  ]
    .sort((a, b) => Number(b.isCall) - Number(a.isCall) || Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_RESULTS);
  if (items.length === 0) return null;

  const content = [
    REPORT_HEADER,
    ...(items.some((item) => item.isCall) ? [CALLER_TEXT_GUARD] : []),
    ...items.map((item) => item.text.replace(/\n\s*\n/g, '\n')), // no blank line: it ends the strip
    'Bring it up early, in your own words; ask before acting on anything in it.',
  ].join('\n');
  return {
    content,
    resultIds: items.flatMap((item) => (item.resultId ? [item.resultId] : [])),
    callIds: items.flatMap((item) => (item.callId ? [item.callId] : [])),
  };
}

function resultText(result: BackgroundResult): string {
  const callback = result.requiresCallback
    ? `They want a callback${result.callbackTime ? ` around ${result.callbackTime}` : ''}.`
    : '';
  const said = [result.summary, result.details, callback].filter(Boolean).join(' ');
  if (result.type === 'on_behalf_call') return reported(result.contactName, said);
  return cutAtWord(`${result.type.replace(/_/g, ' ')}: ${said}`, RESULT_CHARS);
}

function callText(call: PendingCallResult): string {
  const label = call.objectiveAchieved
    ? 'Got through'
    : call.status === 'voicemail'
      ? voicemailWords(call.voicemailLeft, call.contactName).label
      : call.status === 'no_answer'
        ? 'No answer'
        : call.status === 'busy'
          ? 'Line busy'
          : "Couldn't connect";
  const callback = call.callbackRequired ? 'They want a callback from the user.' : '';
  return reported(
    call.contactName,
    [`${label}: ${call.outcome}`, callback].filter(Boolean).join(' ')
  );
}

/** A call's words as reported speech (caller-text.ts), cut so the whole report fits RESULT_CHARS. */
function reported(name: string | undefined, said: string): string {
  const label = callerText(name, 60) || 'them';
  const frame = reportedFromCall(label, ['x']).join('\n').length - 1;
  return reportedFromCall(label, [cutAtWord(said, Math.max(40, RESULT_CHARS - frame))]).join('\n');
}
