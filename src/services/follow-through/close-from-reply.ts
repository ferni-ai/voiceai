/**
 * What the caller's reply says about a follow-up Ferni just raised: done, not
 * yet (replan), let it go (release), or unclear.
 *
 * Asked "did you call your mom?", "yeah I did" closes it, "not yet, maybe
 * tomorrow" keeps it open for later, and "forget it" lets it go for good.
 * Whole words only, and a negation outranks a "done" word: "I haven't done it"
 * contains "done" and means the opposite. Unsure means unclear: closing a
 * follow-up that isn't done is worse than asking again next call. Unclear replies change nothing; the
 * follow-up stays raised and the policy decides what's next.
 *
 * @module services/follow-through/close-from-reply
 */

export type ReplyVerdict = 'done' | 'replan' | 'release' | null;

const RELEASE =
  /\b(forget (it|about it)|never ?mind|drop it|let it go|not doing (it|that)|don'?t need to( anymore)?|no longer (need|want)|skip it)\b/i;
/** "I haven't done it": outranks a done word. A bare "no" doesn't ("yep, did it, no problem"). */
const NEGATED = /\b(not|haven'?t|hasn'?t|didn'?t|never|couldn'?t|wasn'?t)\b/i;
const DONE =
  /\b(done|did it|i did|already did|finished|took care of (it|that)|handled it|sorted it|called (her|him|them)|got it done)\b/i;
const LATER =
  /\b(not yet|later|tomorrow|tonight|next week|this weekend|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday|yet|soon|push it|move it|remind me)\b/i;

export function closeFromReply(reply: string): ReplyVerdict {
  const said = reply.trim();
  if (!said) return null;
  if (RELEASE.test(said)) return 'release';
  if (NEGATED.test(said)) return LATER.test(said) ? 'replan' : null;
  if (DONE.test(said)) return 'done';
  if (LATER.test(said)) return 'replan';
  return null;
}
