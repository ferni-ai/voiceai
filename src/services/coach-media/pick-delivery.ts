/**
 * After the pick: send it where they can use it, ask later whether it helped,
 * and keep the answer for next time.
 *
 * - Only the pick findCoachingResources made on this call can be sent; the
 *   model never supplies a link, so web text can't get a link sent.
 * - A text goes only to the verified number on the account (userReach), only
 *   because they asked for it, at most MAX_TEXTS_PER_CALL per call and
 *   TEXTS_PER_USER_PER_DAY a day (the tool also turns away test accounts and a
 *   speaker who isn't the owner, as the outbound confirm gate does). It goes
 *   through the guarded sender (guarded-text.ts, kind 'coach-media'), so a STOP
 *   or texts turned off in settings stop it and it is recorded like every other
 *   Ferni text. The app copy goes to the in-app inbox (saveInAppMessage) either way.
 * - Every send links the pick's answer card (answer-card.ts), the page at
 *   /a/:id that shows its sources and Google's search suggestions, which the
 *   grounding terms ask be shown. Without a saved card nothing is sent.
 * - Sending saves a trust-systems commitment due in a few days, so the
 *   follow-up builder (commitment-follow-up.ts) has Ferni ask once how it went.
 * - Their answer is stored once per pick (feedback.ts recordHelped) as a
 *   coaching_media preference, which fit.ts reads for the next pick.
 *
 * Keyed by the AgentSession object, like the call's game state. Behind COACH_MEDIA=on.
 *
 * @module services/coach-media/pick-delivery
 */

import { createAnswerCard } from '../approvals/answer-cards.js';
import { isApprovalsPageEnabled } from '../approvals/flag.js';
import { callerText } from '../outreach/caller-text.js';
import { sendGuardedText, type TextSkip } from '../outreach/guarded-text.js';
import { saveInAppMessage } from '../outreach/unified-delivery.js';
import { userReach } from '../outreach/user-reach.js';
import { saveCommitment } from '../trust-systems/commitment-tracking.js';
import { storeUserPreferences } from '../user-preferences-store.js';
import { getLogger } from '../../utils/safe-logger.js';
import { pickCard } from './answer-card.js';
import { safeHttpsUrl } from './grounded-search.js';
import { webData } from './result-text.js';
import type { Candidate } from './checked-pick.js';
import { COACH_MEDIA_COMMITMENT_PREFIX, recordHelped } from './feedback.js';
import { markSent, recentPicks } from './pick-log.js';
import { takeDailyBudget } from './quota.js';
import { topicOnlyQuery } from './topic-query.js';
import { isMemberIdentity } from '../identity/member-identity.js';

export interface SentPick {
  topic: string;
  candidate: Candidate;
  /** The check's one sentence on why it suits them. */
  why?: string;
  /** Its pick-log id (pick-log.ts); the follow-up commitment carries it. */
  pickId?: string;
}

/** Sends per call, per channel (text, app). */
export const MAX_TEXTS_PER_CALL = 2;
/** Texts per user per day, across calls. */
export const TEXTS_PER_USER_PER_DAY = 3;
export const FOLLOW_UP_DAYS = 3;
/**
 * The guarded sender's gap between two pick texts to one person or phone: long
 * enough to stop a double send, shorter than finding and agreeing to a second pick.
 */
export const PICK_TEXT_GAP_MS = 30_000;

/** What to tell the model when the guarded sender didn't send the pick. */
const NOT_TEXTED: Record<TextSkip, string> = {
  'opted-out':
    "They've turned Ferni's texts off (STOP), so it can't be texted. Offer the app instead.",
  'sms-off':
    "They've turned texts off in their settings, so it can't be texted. Offer the app instead.",
  'no-verified-phone':
    "There's no verified number on their account, so it can't be texted. Offer to put it in the app.",
  'recently-sent': 'A pick was just texted to them; offer the app for this one.',
  'consent-unknown':
    "Couldn't check their text settings just now, so it wasn't texted. Offer the app instead.",
  paused:
    'They recently sounded like they might want fewer texts, so it was not texted. Offer the app.',
  'no-hash-secret': "The text didn't go through. Offer to put it in the app.",
  'send-failed': "The text didn't go through. Offer to put it in the app.",
};

const lastPicks = new WeakMap<object, SentPick>();
const sends = new WeakMap<object, Record<'text' | 'app', number>>();

export function rememberPick(session: object | undefined, pick: SentPick): void {
  if (session) lastPicks.set(session, pick);
}

/** Whether this call already had a pick. */
export function hasPick(session: object | undefined): boolean {
  return session ? lastPicks.has(session) : false;
}

/** Hosts a sent link may point to: where checked videos and books come from. */
export const SMS_LINK_HOSTS = ['youtube.com', 'youtu.be', 'books.google.com'];
const hostOf = (url: string): string => new URL(url).hostname.replace(/^(www|m)\./, '');

/** The pick's link if it is https on an allowed host, else null. */
export function sendableLink(c: Candidate): string | null {
  const url = safeHttpsUrl(c.url);
  return url && SMS_LINK_HOSTS.includes(hostOf(url)) ? url : null;
}

/**
 * A web title as plain words: no links, domains or phone-like numbers, no
 * sentence that gives an order or speaks to an assistant, one line, `max`
 * chars. Titles come from YouTube or the web; this is all of them that goes
 * into a text or a later prompt.
 */
export function plainTitle(title: string, max: number): string {
  const words = webData(title, 300)
    .text.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, ' ')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, ' ')
    .replace(/\+?\d(?:[\s().-]*\d){2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words.length > max ? `${words.slice(0, max - 1).trimEnd()}…` : words;
}

/**
 * The text a pick goes out as: a fixed template, the plain title, the one
 * checked link and, in a text, the link to its card (our own /a/:id page).
 */
export function smsBody(c: Candidate, link: string, cardUrl?: string): string {
  const short = plainTitle(c.title, 60);
  // Length is ours (spokenLength or a page count), but only its known shape goes out.
  const length = /^\d+(\.\d)? (seconds|minutes|hours|pages)$/.test(c.length ?? '')
    ? ` (${c.length})`
    : '';
  const card = cardUrl ? ` Why I picked it: ${cardUrl}` : '';
  return `From Ferni, the ${c.kind} we talked about: "${short || 'this one'}"${length} ${link}${card}`;
}

/**
 * What the follow-up asks about, later, in a prompt: "try the video 'Shin
 * Splint Rehab'". Only the kind and the plain title, never the raw one.
 */
export function commitmentText(c: Candidate): string {
  const title = plainTitle(c.title, 40);
  return title ? `try the ${c.kind} '${title}'` : `try the ${c.kind} Ferni sent`;
}

/** The pick's card, saved for its page; null when the save fails. */
async function saveCard(
  userId: string,
  sent: SentPick,
  personaId: string
): Promise<{ id: string; url: string } | null> {
  return createAnswerCard(userId, pickCard(sent.topic, sent.candidate, sent.why, personaId)).catch(
    (error: unknown) => {
      getLogger().warn({ error: String(error) }, 'coach-media: answer card not saved');
      return null;
    }
  );
}

async function followUpLater(userId: string, sent: SentPick): Promise<Date> {
  const now = new Date();
  const due = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000);
  await saveCommitment({
    id: `${COACH_MEDIA_COMMITMENT_PREFIX}${sent.pickId ?? `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`}`,
    userId,
    content: commitmentText(sent.candidate),
    type: 'task',
    status: 'active',
    createdAt: now,
    lastMentioned: now,
    followUpDate: due,
    followUpType: 'specific',
    originalQuote: callerText(sent.topic, 120),
    motivation: 'Ferni sent this to help; ask whether it helped.',
    progressNotes: [],
    followUpCount: 0,
    followUpReception: 'unknown',
    importance: 'low',
    shouldFollowUp: true,
  });
  return due;
}

/**
 * Sends this call's pick by text or to the app and schedules the follow-up.
 * Returns what to tell the model.
 */
export async function deliverPick(
  session: object | undefined,
  userId: string | undefined,
  how: 'text' | 'app',
  personaId: string
): Promise<string> {
  const sent = session ? lastPicks.get(session) : undefined;
  if (!sent) return 'There is no checked pick on this call to send. Find one first.';
  if (!isMemberIdentity(userId)) return "Can't send it: this call isn't tied to an account.";
  const c = sent.candidate;
  const link = sendableLink(c);
  if (!link) return "That link isn't one Ferni can send; describe it instead.";
  const log = getLogger();
  // Every send links its card page (/a/:id). That page is the UI server's
  // APPROVALS_PAGE, so this agent needs the same flag (and APP_URL) as the
  // UI server; with it off, refuse before any slot or daily text is used.
  if (!isApprovalsPageEnabled())
    return "Ferni can't send picks yet. Describe it instead, and don't offer to send it again.";

  // Take a slot before the first await: parallel calls in one model step would
  // otherwise all pass the check. Given back if nothing is sent.
  const counts = sends.get(session!) ?? { text: 0, app: 0 };
  if (counts[how] >= MAX_TEXTS_PER_CALL) {
    return how === 'text'
      ? 'Already texted them twice this call; offer the app instead.'
      : 'Already put it in their app messages twice this call.';
  }
  counts[how] += 1;
  sends.set(session!, counts);
  const release = (): void => void (counts[how] -= 1);
  // Shared by every worker; a failed send still uses it, so the cap fails closed.
  if (how === 'text' && !(await takeDailyBudget(`texts:${userId}`, TEXTS_PER_USER_PER_DAY))) {
    release();
    return "That's as many texts as Ferni sends someone in a day; offer the app instead.";
  }

  const phone =
    how === 'text'
      ? (await userReach(userId, 'sms', { standingOptIn: false }).catch(() => null))?.phone
      : undefined;
  if (how === 'text' && !phone) {
    release();
    return "There's no verified number on their account, so it can't be texted. Offer to put it in the app.";
  }
  // A grounded pick's sources and Search suggestions must be visible where
  // they read it: the card page. No card, no send.
  const card = await saveCard(userId, sent, personaId);
  if (!card) {
    release();
    return "Couldn't send it just now. Describe it instead.";
  }
  // The inbox shows the card as a link of its own (proactive-messages.ui.ts).
  const inApp = {
    type: 'coaching_resource',
    personaId,
    text: smsBody(c, link),
    reason: 'coach-media pick',
    answerCardId: card.id,
  };

  if (phone) {
    const texted = await sendGuardedText({
      userId,
      body: smsBody(c, link, card.url),
      kind: 'coach-media',
      refId: sent.pickId ?? card.id,
      minGapMs: PICK_TEXT_GAP_MS,
    }).catch((error: unknown) => {
      log.warn({ error: String(error) }, 'coach-media: text failed');
      return { sent: false as const, reason: 'send-failed' as const };
    });
    if (!texted.sent) {
      release();
      return NOT_TEXTED[texted.reason];
    }
    // The card copy saved with a text counts against the app cap too.
    if (counts.app < MAX_TEXTS_PER_CALL) {
      counts.app += 1;
      const saved = await saveInAppMessage(userId, inApp);
      if (!saved.success) counts.app -= 1;
    }
  } else {
    const saved = await saveInAppMessage(userId, inApp);
    if (!saved.success) {
      release();
      return "Couldn't save it to the app just now.";
    }
  }

  const due = await followUpLater(userId, sent).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'coach-media: follow-up not saved');
    return null;
  });
  if (sent.pickId && due) await markSent(userId, sent.pickId, how, due);
  log.info({ how, kind: c.kind }, 'coach-media: pick sent');
  return how === 'text'
    ? 'Texted it to them. In a few days, ask once whether it helped.'
    : "It's in their app messages. In a few days, ask once whether it helped.";
}

/**
 * Their answer to "did it help?" from the coachingPick feedback action, for
 * their latest sent pick that doesn't say yet. Recorded once per pick: the
 * follow-up reader may hear the same answer (feedback.ts recordHelped). With
 * no such pick in the log nothing is stored.
 */
export async function recordPickFeedback(
  userId: string | undefined,
  feedback: { helped: 'yes' | 'somewhat' | 'no'; whatMattered?: string },
  names: Array<string | undefined>
): Promise<string> {
  if (!isMemberIdentity(userId)) return 'Noted for this call only.';
  const value = topicOnlyQuery(feedback.whatMattered ?? '', names);
  if (!value) return 'Ask what made it work or not, in a few words, then record that.';
  const pick = (await recentPicks(userId)).find((p) => p.sentVia && !p.helped);
  const stored =
    pick &&
    (await recordHelped(userId, pick.id, { outcome: 'done', helped: feedback.helped }, value));
  return stored
    ? "Got it; the next pick will take that into account. Don't mention saving it."
    : "That's already noted (or there's no sent pick to attach it to). Don't mention it.";
}
