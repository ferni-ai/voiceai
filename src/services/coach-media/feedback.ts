/**
 * Their answer to "did it help?", caught even when the model doesn't record it.
 *
 * The follow-up for a sent pick is a trust-systems commitment (pick-delivery.ts).
 * The generic answer reader (commitment-follow-through.ts) knows "I did it" and
 * "not yet" but not "it helped" or "that was great", so a coaching follow-up's
 * answer stayed unread until the window closed. classifyHelpfulness reads those;
 * the follow-up builder then stores the answer as a coaching_media preference.
 * Whether a pick helped is recorded once (recordHelped), whichever of this and
 * the coachingPick feedback action hears it first. While COACH_MEDIA is off,
 * coaching follow-ups are neither asked nor recorded.
 *
 * @module services/coach-media/feedback
 */

import { storeUserPreferences } from '../user-preferences-store.js';
import { claimAnswer, markAsked, type PickRecord } from './pick-log.js';
import { coachMediaEnabled } from './topic-query.js';

/** Ids of the commitments pick-delivery.ts saves. */
export const COACH_MEDIA_COMMITMENT_PREFIX = 'coach-media-';

export type Helpfulness = 'yes' | 'somewhat' | 'no';

/** Whether a commitment may be asked about and recorded: coaching ones only while COACH_MEDIA is on. */
export function followUpAllowed(commitmentId: string): boolean {
  return !commitmentId.startsWith(COACH_MEDIA_COMMITMENT_PREFIX) || coachMediaEnabled();
}

/** A coaching pick's follow-up, while COACH_MEDIA is on. */
export const isCoachingFollowUp = (id: string): boolean =>
  id.startsWith(COACH_MEDIA_COMMITMENT_PREFIX) && coachMediaEnabled();

const NOT_HELPFUL =
  /\b(didn'?t|did not|doesn'?t|does not|wasn'?t|was not|not)\s+(really\s+)?(help|helpful|useful|work|great|for me|my thing)\b|\b(useless|boring|waste of time|too (long|hard|advanced|basic))\b|\bnever (watched|read|got to) it\b/i;
const SOMEWHAT = /\b(kind of|kinda|sort of|a little|a bit|somewhat|partly|sometimes)\b/i;
const HELPFUL =
  /\b(helped|helpful|useful|worked|was (great|good|perfect|amazing|awesome)|loved it|liked it|really good|game changer)\b/i;

/** How their reply says it went, or null when it doesn't say. */
export function classifyHelpfulness(text: string): Helpfulness | null {
  if (NOT_HELPFUL.test(text)) return 'no';
  if (HELPFUL.test(text)) return SOMEWHAT.test(text) ? 'somewhat' : 'yes';
  return null;
}

/** What the commitment was about: "try the video 'X'" → "video 'X'". */
const subjectOf = (content: string): string => content.replace(/^try the /, '');

/** Stores whether a sent pick helped, once per pick (claimAnswer), as a coaching_media preference. */
export async function recordHelped(
  userId: string,
  pickId: string,
  answer: { outcome: PickRecord['outcome']; helped: Helpfulness | null },
  value: string
): Promise<boolean> {
  if (!(await claimAnswer(userId, pickId, answer)) || !answer.helped) return false;
  await storeUserPreferences(userId, [
    {
      category: 'coaching_media',
      value,
      confidence: answer.helped === 'somewhat' ? 0.6 : 0.9,
      isNegative: answer.helped === 'no',
      rawText: value,
    },
  ]);
  return true;
}

/**
 * Records the answer to a coaching follow-up. Only their words say whether it
 * helped: "I did it" means they tried it, not that it helped. A follow-up that
 * went unanswered still reaches the pick log, as a skip (taste.ts).
 */
export async function recordFollowUpAnswer(
  userId: string,
  answer: { id: string; content: string; outcome: string },
  userText: string
): Promise<Helpfulness | null> {
  if (!isCoachingFollowUp(answer.id)) return null;
  const helped = answer.outcome === 'unanswered' ? null : classifyHelpfulness(userText);
  const pickId = answer.id.slice(COACH_MEDIA_COMMITMENT_PREFIX.length);
  const outcome = answer.outcome as PickRecord['outcome'];
  const stored = await recordHelped(userId, pickId, { outcome, helped }, subjectOf(answer.content));
  return stored ? helped : null;
}

/** Notes in the pick log when Ferni asked a coaching follow-up. */
export async function recordFollowUpAsked(
  userId: string,
  commitmentId: string,
  at: string
): Promise<void> {
  if (!isCoachingFollowUp(commitmentId)) return;
  await markAsked(userId, commitmentId.slice(COACH_MEDIA_COMMITMENT_PREFIX.length), at);
}
