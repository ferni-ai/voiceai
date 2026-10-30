/**
 * The hello leads with the news when Ferni made a call for the owner since they
 * last talked, the way a great assistant would: "Hey Sam. I talked to Rosa.
 * She'd like you to call her back." (CALL_NEWS_OPENER, default off.)
 *
 * Before this, the greeting never read call results: the While You Were Away
 * block reached the first turn, after the hello was spoken
 * (outreach-memory-audit 2026-10-29, B1 and E).
 *
 * - Only the account's owner, alone on their own line, with no crisis risk on
 *   the call. greeting-direction.ts adds the rest of the order: it yields to an
 *   unknown caller and to their own reason for calling, and outranks a letter,
 *   a win, a check-in, a pondered ask and welcome-back.
 * - One result, the newest undelivered one from the last 48 h. More waiting
 *   only adds "and a couple other things"; the turn context carries them.
 * - NEVER the callee's words, in the facts or the direction: lexical crisis
 *   screens miss most third-person crisis wording (#3084 verify: 17 of 18), so
 *   a quoted line could put "she's tired of living" in a cheerful hello. Only
 *   structured fields: who, how the call went, a callback ask (and a time, if it
 *   is only time words), and whether they left a message (never what it says).
 *   The message reaches the owner through the guarded call report (#3080).
 * - Tone from the status, with the crisis, risky and hard-news screens of their
 *   words as a backstop. Whenever the result holds any text from the callee
 *   (a message, an outcome or summary beyond a status line, details), the hello
 *   is calm and offers it, never playful, since screens can't vouch for it.
 *   Only a status-only result keeps the warm tone (reached) or is said plainly
 *   (not reached). Hard news gets "got a sec?"; any crisis or risky signal only
 *   "I need to tell you about your call".
 * - Never marked delivered here: the report still has to carry the message.
 *
 * @module agents/multi-agent/call-news-opener
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import {
  getPendingResults,
  type BackgroundResult,
} from '../../services/background-agents/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import {
  callerText,
  crisisRead,
  isRiskyCallerText,
  screenCallerParts,
} from '../../services/outreach/caller-text.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { calendarDaysSince, daysAgoInWords } from '../../utils/calendar-days.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'call-news-opener' });

/** The window and the one read: newest first from a few, never a scan. */
const MAX_AGE_HOURS = 48;
const READ_LIMIT = 5;

/** Worry the heavy-moment check doesn't list: illness, upset, an accident. */
const WORRY =
  /\b(?:sick|ill|unwell|upset|worried|worrying|scared|afraid|hospital|hospitali[sz]ed|accident|injured|bad news|not (?:doing |feeling )?(?:well|good|great))\b/i;

/**
 * A callback time is the callee's words (on-behalf-call-lifecycle.ts reads it off the call), so
 * it is kept only when every token is a time word or one clock time: at most one number, and
 * never 911 or 988, so "at 4471", "after 911" or "at 12 34 56" can't carry a code or a number.
 */
const TIME_WORD =
  /^(?:today|tonight|tomorrow|this|next|morning|afternoon|evening|night|weekend|after|before|around|by|at|on|in|the|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|later|soon|am|pm|a\.m\.|p\.m\.)$/i;
const CLOCK_TIME = /^(?:1[0-2]|0?[1-9])(?::[0-5]\d)?(?:am|pm|a\.m\.|p\.m\.)?$/i;
/** A reached call's outcome that says nothing but that it happened (pending-call-results.ts default). */
const STATUS_LINE = /^(?:call completed\.?)?$/i;
const EMERGENCY_NUMBER = /9\D{0,3}1\D{0,3}1|9\D{0,3}8\D{0,3}8/;

function callbackWhen(raw: string | undefined): string {
  const when = callerText(raw, 40);
  if (!when || EMERGENCY_NUMBER.test(when) || isRiskyCallerText(when)) return '';
  const tokens = when.split(/[\s,]+/).filter(Boolean);
  if (tokens.filter((t) => /\d/.test(t)).length > 1) return '';
  return tokens.every((t) => TIME_WORD.test(t) || CLOCK_TIME.test(t)) ? when : '';
}

export const CALL_NEWS_DIRECTION =
  ' You made a call for them since you last talked, and it comes first: say hello, then tell them in a few plain words how it went, from the call facts only. Never guess or make up what was said ("Hey Sam. I talked to Rosa. She\'d like you to call her back.").';
export const CALL_NEWS_CALM_DIRECTION =
  ' You made a call for them and have news from it: no playful hello, even and calm. Say hello, then that you talked to them (or tried, as the call facts say) and offer to tell them about it, naming who ("Hey Sam. I talked to Rosa; she left you a message. Want to hear it?" or "Hey Sam. I talked to Rosa earlier. Want to hear how it went?"). Never guess or hint at what was said.';
export const CALL_NEWS_PLAIN_DIRECTION =
  ' You tried a call for them and did not get through: say hello, then say so plainly, not cheerfully, naming who ("Hey Sam. I tried Rosa but it went to voicemail.").';
export const CALL_NEWS_MORE_DIRECTION =
  ' Other news is waiting too: you may add "and a couple other things", nothing more.';
export const CALL_NEWS_HEAVY_DIRECTION =
  ' You made a call for them and the news is hard: no cheerful hello, and not the news yet. Say hello quietly, then that you have news from the call and ask if they have a moment, naming who you called ("Hey Sam. I have news from your mom\'s call. Got a sec?").';
export const CALL_NEWS_GUARDED_DIRECTION =
  ' You made a call for them and something from it needs care: no cheerful hello. Say hello quietly, then only that you need to tell them about the call, naming who you called ("Hey Sam. I need to tell you about your call with your mom."). Nothing about what was said.';

type CallNewsTone = 'news' | 'calm' | 'plain' | 'heavy' | 'guarded';
type LineStatus = 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';

export interface CallNews {
  tone: CallNewsTone;
  /** Heavy, guarded or calm: no playful hello, no celebration alongside it. */
  careful: boolean;
  direction: string;
  facts: Record<string, string>;
}

/** The structured outcome of one call, from its on_behalf_calls record. Their words stay out. */
interface CallRecord {
  status?: LineStatus;
  relation?: string;
  callbackRequired: boolean;
  callbackTime?: string;
  hasMessage: boolean;
  /** Any text from the callee: a message, a summary, action items, a reached call's outcome. */
  calleeText: boolean;
  voicemailLeft: boolean;
  /** Their words, read only by the backstop screens, never passed on. */
  said: string[];
}

function callNewsOpenerOn(env: Env = process.env): boolean {
  return flagOn('CALL_NEWS_OPENER', env);
}

/**
 * The account's owner, alone on their own line: not a call Ferni placed, no guest on the mic
 * (speakerIsAccountOwner). Loaded on first use: its module pulls in every context builder,
 * which the hello's own imports never did (agent-setup.ts has it loaded long before any hello).
 */
async function ownerOnTheLine(sessionId: string): Promise<boolean> {
  const { speakerIsAccountOwner } = await import('./live-call-behaviors.js');
  return speakerIsAccountOwner(sessionId);
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** One point read of the call's own record (call-result-capture.ts writes it); undefined if none. */
async function callRecord(
  userId: string,
  callId: string | undefined
): Promise<CallRecord | undefined> {
  const db = getFirestoreDb();
  if (!db || !callId) return undefined;
  const doc = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('on_behalf_calls')
    .doc(callId)
    .get();
  const data = doc.exists ? (doc.data() as Record<string, unknown> | undefined) : undefined;
  if (!data) return undefined;
  const request = (data.request ?? {}) as Record<string, unknown>;
  const outcome = (data.outcome ?? {}) as Record<string, unknown>;
  const status = text(outcome.status) as LineStatus;
  const actions = Array.isArray(outcome.actionItems) ? outcome.actionItems.map(text) : [];
  return {
    status: ['completed', 'voicemail', 'no_answer', 'busy', 'failed'].includes(status)
      ? status
      : undefined,
    relation: text(request.contactQuery),
    callbackRequired: outcome.callbackRequired === true,
    callbackTime: text(outcome.callbackTime),
    hasMessage: text(outcome.message).trim() !== '',
    calleeText: [
      outcome.message,
      outcome.transcriptSummary,
      ...actions,
      // Not reached, the outcome is Ferni's own status line (voicemail-outcome.ts and the like).
      status === 'completed' && !STATUS_LINE.test(text(outcome.outcome).trim())
        ? outcome.outcome
        : '',
    ].some((t) => text(t).trim() !== ''),
    voicemailLeft: outcome.voicemailLeft === true,
    said: [outcome.outcome, outcome.message, outcome.transcriptSummary, ...actions].map(text),
  };
}

/**
 * The tone: guarded on any crisis or risky signal, heavy on hard news, then calm whenever the
 * result holds any text from the callee (screens miss most third-person crisis lines, so it is
 * never assumed light); only status-only results are warm (reached) or plain (not reached).
 * With no call record, or one whose status is unknown, any result that did not fail counts.
 */
function callNewsTone(r: BackgroundResult, rec: CallRecord | undefined, who: string): CallNewsTone {
  const words = [r.summary, r.details ?? '', ...(rec?.said ?? [])].filter((t) => t.trim());
  const all = words.join(' ');
  // screenCallerParts drops `safety` when their own words carry the crisis: read the raw text too.
  const screen = screenCallerParts(all, who, 10_000);
  if (crisisRead(all) || screen.safety || screen.risky) return 'guarded';
  if (isHeavyMoment(words) || words.some((w) => WORRY.test(w))) return 'heavy';
  const unknown = !rec?.status && r.status !== 'failed'; // a lost record write: assume they spoke
  if (Boolean(r.details?.trim()) || rec?.calleeText || unknown) return 'calm';
  const status = rec?.status ?? (r.status === 'failed' ? 'failed' : undefined);
  if (status && status !== 'completed') return 'plain';
  return 'news';
}

/** A label for the facts: the owner's own words or the contact's name, never a number or link. */
function label(value: string | undefined, max: number): string {
  const clean = callerText(value, max);
  return clean && !isRiskyCallerText(clean) && !/\d/.test(clean) ? clean : '';
}

const HOW_IT_WENT: Record<LineStatus, string> = {
  completed: 'you reached them and talked',
  voicemail: 'it went to voicemail',
  no_answer: 'nobody answered',
  busy: 'the line was busy',
  failed: 'the call did not go through',
};

function structuredFacts(rec: CallRecord | undefined, r: BackgroundResult): Record<string, string> {
  const facts: Record<string, string> = {};
  if (rec?.status) {
    facts['how the call went'] =
      rec.status === 'voicemail' && rec.voicemailLeft
        ? 'it went to voicemail, and you left a message'
        : HOW_IT_WENT[rec.status];
  } else if (r.status === 'success') facts['how the call went'] = HOW_IT_WENT.completed;
  if (rec?.callbackRequired || r.requiresCallback) {
    const when = callbackWhen(rec?.callbackTime ?? r.callbackTime);
    const timed = when ? ` (${when})` : '';
    facts['they asked for a call back'] = `yes${timed}`;
  }
  if (rec ? rec.hasMessage : Boolean(r.details?.trim()))
    facts['they left a message for them'] = 'yes; offer it, never guess what it says';
  return facts;
}

function callNewsOf(
  r: BackgroundResult,
  rec: CallRecord | undefined,
  more: boolean,
  now: Date,
  zone?: string
): CallNews {
  const who = label(r.contactName, 60) || 'the person you called';
  const tone = callNewsTone(r, rec, who);
  const facts: Record<string, string> = { 'who you called for them': who };
  const relation = label(rec?.relation, 40);
  if (relation && relation.toLowerCase() !== who.toLowerCase())
    facts['who they are to them'] = relation;
  const at = Date.parse(r.capturedAt);
  if (Number.isFinite(at))
    facts['when you called'] = daysAgoInWords(calendarDaysSince(at, now, zone));
  if (tone !== 'heavy' && tone !== 'guarded') Object.assign(facts, structuredFacts(rec, r));
  const direction = {
    news: CALL_NEWS_DIRECTION + (more ? CALL_NEWS_MORE_DIRECTION : ''),
    calm: CALL_NEWS_CALM_DIRECTION + (more ? CALL_NEWS_MORE_DIRECTION : ''),
    plain: CALL_NEWS_PLAIN_DIRECTION + (more ? CALL_NEWS_MORE_DIRECTION : ''),
    heavy: CALL_NEWS_HEAVY_DIRECTION,
    guarded: CALL_NEWS_GUARDED_DIRECTION,
  }[tone];
  const careful = tone === 'heavy' || tone === 'guarded' || tone === 'calm';
  return { tone, careful, direction, facts };
}

/**
 * The newest undelivered call Ferni made for the owner in the last 48 h, for
 * the hello, or undefined: flag off, not the owner alone on their own line,
 * crisis risk on this call, none waiting, or a read failed. Never rejects.
 */
export async function callNewsFor(
  caller: { userId?: string; sessionId: string; zone?: string },
  now: Date = new Date(),
  env: Env = process.env
): Promise<CallNews | undefined> {
  const { userId, sessionId, zone } = caller;
  if (!callNewsOpenerOn(env) || !isMemberIdentity(userId)) return undefined;
  try {
    if (crisisRiskThisCall(sessionId) || !(await ownerOnTheLine(sessionId))) return undefined;
    const pending = await getPendingResults(userId, {
      maxAge: MAX_AGE_HOURS,
      limit: READ_LIMIT,
      types: ['on_behalf_call'],
    });
    const newest = [...pending]
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      .at(0);
    if (!newest) return undefined;
    const rec = await callRecord(userId, newest.relatedTaskId);
    return callNewsOf(newest, rec, pending.length > 1, now, zone);
  } catch (error) {
    log.warn({ error: String(error) }, 'Call news not read for the hello');
    return undefined;
  }
}
