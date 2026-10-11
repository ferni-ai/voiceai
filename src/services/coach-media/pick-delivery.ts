/**
 * After the pick: send it where they can use it, ask later whether it helped,
 * and keep the answer for next time.
 *
 * - Only the pick findCoachingResources made on this call can be sent; the
 *   model never supplies a link, so web text can't get a link sent.
 * - A text goes only to the verified number on the account (userReach), only
 *   because they asked for it, at most MAX_TEXTS_PER_CALL per call. The app
 *   copy goes to the in-app inbox (saveInAppMessage) with its card
 *   (answer-card.ts) either way.
 * - Sending saves a trust-systems commitment due in a few days, so the
 *   follow-up builder (commitment-follow-up.ts) has Ferni ask once how it went.
 * - Their answer is stored as a coaching_media preference, which fit.ts reads
 *   for the next pick.
 *
 * Keyed by the AgentSession object, like the call's game state. Behind COACH_MEDIA=on.
 *
 * @module services/coach-media/pick-delivery
 */

import { sendSMS } from '../communication-service.js';
import { callerText } from '../outreach/caller-text.js';
import { saveInAppMessage } from '../outreach/unified-delivery.js';
import { userReach } from '../outreach/user-reach.js';
import { saveCommitment } from '../trust-systems/commitment-tracking.js';
import { storeUserPreferences } from '../user-preferences-store.js';
import { getLogger } from '../../utils/safe-logger.js';
import { pickCard } from './answer-card.js';
import { safeHttpsUrl } from './grounded-search.js';
import { webData } from './result-text.js';
import type { Candidate } from './checked-pick.js';
import { COACH_MEDIA_COMMITMENT_PREFIX } from './feedback.js';
import { markSent } from './pick-log.js';
import { topicOnlyQuery } from './topic-query.js';

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
export const FOLLOW_UP_DAYS = 3;

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

/** The text a pick goes out as: a fixed template, the plain title and exactly one checked link. */
export function smsBody(c: Candidate, link: string): string {
  const short = plainTitle(c.title, 60);
  // Length is ours (spokenLength or a page count), but only its known shape goes out.
  const length = /^\d+(\.\d)? (seconds|minutes|hours|pages)$/.test(c.length ?? '')
    ? ` (${c.length})`
    : '';
  return `From Ferni, the ${c.kind === 'product' ? 'pick' : c.kind} we talked about: "${short || 'this one'}"${length} ${link}`;
}

/**
 * What the follow-up asks about, later, in a prompt: "try the video 'Shin
 * Splint Rehab'". Only the kind and the plain title, never the raw one.
 */
export function commitmentText(c: Candidate): string {
  const title = plainTitle(c.title, 40);
  return title ? `try the ${c.kind} '${title}'` : `try the ${c.kind} Ferni sent`;
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
  if (!userId || userId === 'anonymous')
    return "Can't send it: this call isn't tied to an account.";
  const c = sent.candidate;
  const link = sendableLink(c);
  if (!link) return "That link isn't one Ferni can send; describe it instead.";
  const body = smsBody(c, link);
  const log = getLogger();
  // The app copy carries the card (sources, Search suggestions) either way: a
  // grounded pick's sources must be visible somewhere the user can see.
  const inApp = {
    type: 'coaching_resource',
    personaId,
    text: body,
    reason: 'coach-media pick',
    card: { ...pickCard(sent.topic, c, sent.why, personaId) },
  };

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

  if (how === 'text') {
    const reach = await userReach(userId, 'sms', { standingOptIn: false }).catch(() => null);
    if (!reach?.phone) {
      release();
      return "There's no verified number on their account, so it can't be texted. Offer to put it in the app.";
    }
    try {
      await sendSMS(reach.phone, body);
    } catch (error) {
      release();
      log.warn({ error: String(error) }, 'coach-media: text failed');
      return "The text didn't go through. Offer to put it in the app.";
    }
    // The card copy saved with a text counts against the app cap too.
    if (counts.app < MAX_TEXTS_PER_CALL) {
      counts.app += 1;
      await saveInAppMessage(userId, inApp);
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

/** Stores their answer to "did it help?" as a coaching_media preference. */
export async function recordPickFeedback(
  userId: string | undefined,
  feedback: { helped: 'yes' | 'somewhat' | 'no'; whatMattered?: string },
  names: Array<string | undefined>
): Promise<string> {
  if (!userId || userId === 'anonymous') return 'Noted for this call only.';
  const value = topicOnlyQuery(feedback.whatMattered ?? '', names);
  if (!value) return 'Ask what made it work or not, in a few words, then record that.';
  await storeUserPreferences(userId, [
    {
      category: 'coaching_media',
      value,
      confidence: feedback.helped === 'somewhat' ? 0.6 : 0.9,
      isNegative: feedback.helped === 'no',
      rawText: value,
    },
  ]);
  return "Got it; the next pick will take that into account. Don't mention saving it.";
}
