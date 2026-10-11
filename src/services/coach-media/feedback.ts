/**
 * Their answer to "did it help?", caught even when the model doesn't record it.
 *
 * The follow-up for a sent pick is a trust-systems commitment (pick-delivery.ts).
 * The generic answer reader (commitment-follow-through.ts) knows "I did it" and
 * "not yet" but not "it helped" or "that was great", so a coaching follow-up's
 * answer stayed unread until the window closed. classifyHelpfulness reads those;
 * the follow-up builder then stores the answer as a coaching_media preference.
 *
 * @module services/coach-media/feedback
 */

import { storeUserPreferences } from '../user-preferences-store.js';

/** Ids of the commitments pick-delivery.ts saves. */
export const COACH_MEDIA_COMMITMENT_PREFIX = 'coach-media-';

export type Helpfulness = 'yes' | 'somewhat' | 'no';

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

/**
 * Stores the answer to a coaching follow-up as a coaching_media preference.
 * `outcome` is the generic reader's verdict, used when the words say nothing
 * about helpfulness ("I did it" → yes).
 */
export async function recordFollowUpAnswer(
  userId: string,
  answer: { id: string; content: string; outcome: string },
  userText: string
): Promise<Helpfulness | null> {
  if (!answer.id.startsWith(COACH_MEDIA_COMMITMENT_PREFIX)) return null;
  const helped =
    classifyHelpfulness(userText) ??
    (answer.outcome === 'done' ? 'yes' : answer.outcome === 'not_done' ? 'no' : null);
  if (!helped) return null;
  const value = subjectOf(answer.content);
  await storeUserPreferences(userId, [
    {
      category: 'coaching_media',
      value,
      confidence: helped === 'somewhat' ? 0.6 : 0.9,
      isNegative: helped === 'no',
      rawText: value,
    },
  ]);
  return helped;
}
