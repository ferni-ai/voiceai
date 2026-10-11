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
import type { Candidate } from './checked-pick.js';
import { COACH_MEDIA_COMMITMENT_PREFIX } from './feedback.js';
import { topicOnlyQuery } from './topic-query.js';

export interface SentPick {
  topic: string;
  candidate: Candidate;
  /** The check's one sentence on why it suits them. */
  why?: string;
}

export const MAX_TEXTS_PER_CALL = 2;
export const FOLLOW_UP_DAYS = 3;

const lastPicks = new WeakMap<object, SentPick>();
const textsSent = new WeakMap<object, number>();

export function rememberPick(session: object | undefined, pick: SentPick): void {
  if (session) lastPicks.set(session, pick);
}

/** Hosts a sent link may point to, besides the pick's own grounded sources. */
export const SMS_LINK_HOSTS = ['youtube.com', 'youtu.be', 'books.google.com'];
const hostOf = (url: string): string => new URL(url).hostname.replace(/^(www|m)\./, '');

/** The pick's link if it is https on an allowed host or one of its grounded sources, else null. */
export function sendableLink(c: Candidate): string | null {
  const url = safeHttpsUrl(c.url);
  if (!url) return null;
  const grounded = (c.grounding?.sources ?? []).flatMap((s) => {
    const u = safeHttpsUrl(s.url);
    return u ? [hostOf(u)] : [];
  });
  return [...SMS_LINK_HOSTS, ...grounded].includes(hostOf(url)) ? url : null;
}

/**
 * The text a pick goes out as: a fixed template, the title as plain words
 * (no links, domains or phone-like numbers, one line, 60 chars) and exactly one
 * checked link. Titles come from YouTube or the web; nothing else of theirs is sent.
 */
export function smsBody(c: Candidate, link: string): string {
  const title = callerText(c.title, 300)
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, ' ')
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi, ' ')
    .replace(/\+?\d(?:[\s().-]*\d){2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const short = title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title;
  // Length is ours (spokenLength or a page count), but only its known shape goes out.
  const length = /^\d+(\.\d)? (seconds|minutes|hours|pages)$/.test(c.length ?? '')
    ? ` (${c.length})`
    : '';
  return `From Ferni, the ${c.kind === 'product' ? 'pick' : c.kind} we talked about: "${short || 'this one'}"${length} ${link}`;
}

/** What the follow-up asks about: "try the video 'Shin Splint Rehab'". */
export function commitmentText(c: Candidate): string {
  return `try the ${c.kind} '${callerText(c.title, 80)}'`;
}

async function followUpLater(userId: string, sent: SentPick): Promise<void> {
  const now = new Date();
  await saveCommitment({
    id: `${COACH_MEDIA_COMMITMENT_PREFIX}${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    content: commitmentText(sent.candidate),
    type: 'task',
    status: 'active',
    createdAt: now,
    lastMentioned: now,
    followUpDate: new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000),
    followUpType: 'specific',
    originalQuote: callerText(sent.topic, 120),
    motivation: 'Ferni sent this to help; ask whether it helped.',
    progressNotes: [],
    followUpCount: 0,
    followUpReception: 'unknown',
    importance: 'low',
    shouldFollowUp: true,
  });
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

  if (how === 'text') {
    // Take a slot before the first await: parallel send_text calls in one model
    // step would otherwise all pass the check. Given back if nothing is sent.
    const count = textsSent.get(session!) ?? 0;
    if (count >= MAX_TEXTS_PER_CALL)
      return 'Already texted them twice this call; offer the app instead.';
    textsSent.set(session!, count + 1);
    const release = (): void => void textsSent.set(session!, (textsSent.get(session!) ?? 1) - 1);
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
    await saveInAppMessage(userId, inApp);
  } else {
    const saved = await saveInAppMessage(userId, inApp);
    if (!saved.success) return "Couldn't save it to the app just now.";
  }

  await followUpLater(userId, sent).catch((error: unknown) =>
    log.warn({ error: String(error) }, 'coach-media: follow-up not saved')
  );
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
