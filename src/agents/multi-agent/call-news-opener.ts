/**
 * The hello leads with the news when Ferni made a call for the owner since they
 * last talked, the way a great assistant would: "Hey Sam. I talked to your mom.
 * She wants you to call her back tonight." (CALL_NEWS_OPENER, default off.)
 *
 * Before this, the greeting never read call results: the While You Were Away
 * block reached the first turn, after the hello was spoken
 * (outreach-memory-audit 2026-10-29, B1 and E).
 *
 * - Only the account's proven owner, on a call Ferni didn't place, with no
 *   crisis risk on the call. greeting-direction.ts adds the rest of the order:
 *   it yields to an unknown caller and to their own reason for calling, and
 *   outranks a letter, a win, a check-in, a pondered ask and welcome-back.
 * - One result, the newest undelivered one from the last 48 h. More waiting
 *   only adds "and a couple other things"; the turn context carries them.
 * - The callee's words are data: screened, quoted as reported speech under
 *   CALLER_TEXT_GUARD, and only ever in the facts, never in the direction.
 * - Hard news gets a gentle "got a sec?" without the news. A result holding
 *   crisis or risky words (a number, money, credentials) gets only "I need to
 *   tell you about your call", with none of their words. In both cases the
 *   result stays undelivered, so the turn context, with its guards, tells it.
 * - Marked delivered (voice) only when the spoken hello told it and named who.
 *
 * @module agents/multi-agent/call-news-opener
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { markCallResultsDelivered } from '../../intelligence/context-builders/external/pending-call-results.js';
import {
  getPendingResults,
  markResultsDelivered,
  type BackgroundResult,
} from '../../services/background-agents/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import {
  CALLER_TEXT_GUARD,
  callerText,
  crisisRead,
  reportedFromCall,
  screenCallerParts,
  screenedCallerText,
} from '../../services/outreach/caller-text.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { calendarDaysSince, daysAgoInWords } from '../../utils/calendar-days.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'call-news-opener' });

/** The window and the one read: newest first from a few, never a scan. */
const MAX_AGE_HOURS = 48;
const READ_LIMIT = 5;

/** Worry the heavy-moment check doesn't list: illness, upset, an accident. */
const WORRY =
  /\b(?:sick|ill|unwell|upset|worried|worrying|scared|afraid|hospital|hospitali[sz]ed|accident|injured|bad news|not (?:doing |feeling )?(?:well|good|great))\b/i;

export const CALL_NEWS_DIRECTION =
  ' You made a call for them since you last talked, and its news comes first: say hello, then tell it in a few plain words, naming who you called ("Hey Sam. I talked to your mom. She wants you to call her back tonight."). Only what the call facts say, in your own words; never read out a number, link or amount.';
export const CALL_NEWS_MORE_DIRECTION =
  ' Other news is waiting too: you may add "and a couple other things", nothing more.';
export const CALL_NEWS_HEAVY_DIRECTION =
  ' You made a call for them and the news is hard: no cheerful hello, and not the news yet. Say hello quietly, then that you have news from the call and ask if they have a moment, naming who you called ("Hey Sam. I have news from your mom\'s call. Got a sec?").';
export const CALL_NEWS_GUARDED_DIRECTION =
  ' You made a call for them and something from it needs care: no cheerful hello. Say hello quietly, then only that you need to tell them about the call, naming who you called ("Hey Sam. I need to tell you about your call with your mom."). Nothing about what was said.';

type CallNewsTone = 'news' | 'heavy' | 'guarded';

export interface CallNews {
  tone: CallNewsTone;
  /** Heavy or guarded: no playful hello, no celebration alongside it. */
  careful: boolean;
  direction: string;
  facts: Record<string, string>;
  /** Marks it delivered (voice) when `spoken` told the news and named who; never rejects. */
  markIfSaid: (spoken: string) => boolean;
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

/** Their words about the call, screened: the summary, details and any callback ask. */
function callWords(r: BackgroundResult): string[] {
  const callback = r.requiresCallback
    ? `They asked for a call back${r.callbackTime ? ` around ${r.callbackTime}` : ''}.`
    : '';
  return [r.summary, r.details, callback].filter((t): t is string => Boolean(t?.trim()));
}

/** The tone: guarded on any crisis or risky words, heavy on a failed call or hard news. */
function callNewsTone(r: BackgroundResult, who: string): CallNewsTone {
  const words = callWords(r);
  const all = words.join(' ');
  // screenCallerParts drops `safety` when their own words carry the crisis: read the raw text too.
  const screen = screenCallerParts(all, who, 10_000);
  if (crisisRead(all) || screen.safety || screen.risky) return 'guarded';
  if (r.status === 'failed' || isHeavyMoment(words) || words.some((w) => WORRY.test(w)))
    return 'heavy';
  return 'news';
}

/** Whole words of the name worth matching ("my mom" → mom, "Linda Park" → linda, park). */
function nameWords(who: string): string[] {
  const skip = new Set(['my', 'the', 'and', 'them', 'his', 'her', 'their', 'our']);
  return who
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length >= 3 && !skip.has(w));
}

/** The spoken hello names who Ferni called. */
export function lineNamesContact(spoken: string, who: string): boolean {
  const said = new Set(spoken.toLowerCase().split(/[^\p{L}\p{N}']+/u));
  return nameWords(who).some((w) => said.has(w) || said.has(`${w}'s`));
}

function callNewsOf(
  userId: string,
  r: BackgroundResult,
  more: boolean,
  now: Date = new Date(),
  zone?: string
): CallNews {
  const who = callerText(r.contactName, 60) || 'them';
  const tone = callNewsTone(r, who);
  const facts: Record<string, string> = { 'who you called for them': who };
  const at = Date.parse(r.capturedAt);
  if (Number.isFinite(at))
    facts['when you called'] = daysAgoInWords(calendarDaysSince(at, now, zone));
  if (tone === 'news') {
    const lines = callWords(r).map((w) => screenedCallerText(w, who));
    facts['what came of the call'] = [CALLER_TEXT_GUARD, ...reportedFromCall(who, lines)].join(' ');
  }
  const direction = {
    news: CALL_NEWS_DIRECTION + (more ? CALL_NEWS_MORE_DIRECTION : ''),
    heavy: CALL_NEWS_HEAVY_DIRECTION,
    guarded: CALL_NEWS_GUARDED_DIRECTION,
  }[tone];
  return {
    tone,
    careful: tone !== 'news',
    direction,
    facts,
    markIfSaid: (spoken) => {
      if (tone !== 'news' || !lineNamesContact(spoken, who)) return false;
      const failed = (error: unknown): void =>
        log.warn({ error: String(error) }, 'Call news not marked delivered');
      markResultsDelivered(userId, [r.id], 'voice').catch(failed);
      if (r.relatedTaskId) markCallResultsDelivered(userId, [r.relatedTaskId]).catch(failed);
      return true;
    },
  };
}

/**
 * The newest undelivered call Ferni made for the owner in the last 48 h, for
 * the hello, or undefined: flag off, not the owner on their own line, crisis
 * risk on this call, none waiting, or the read failed. Never rejects.
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
    return newest ? callNewsOf(userId, newest, pending.length > 1, now, zone) : undefined;
  } catch (error) {
    log.warn({ error: String(error) }, 'Call news not read for the hello');
    return undefined;
  }
}
