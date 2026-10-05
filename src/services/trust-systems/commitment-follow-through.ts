/**
 * One warm follow-up on what the user said they'd do, and the answer they give.
 *
 * The commitment-follow-up context builder offers a due commitment to the LLM
 * ("You were going to call your mom. How did it go?"). Whether Ferni actually
 * asked is read from what she said (the response hook in
 * semantic-intelligence/follow-through.ts). Once asked, the commitment is never
 * offered again, and the user's next reply is recorded as the outcome:
 * done, not done, or a deflection (which drops it for good).
 *
 * "Offered" is turn-to-turn state in this process (the builder and the response
 * hook run in the same voice call), kept for minutes. "Asked" lives on the
 * commitment doc (awaitingAnswer, shouldFollowUp off), so nothing is ever asked
 * twice; a reply after the answer window just leaves the outcome unrecorded.
 *
 * @module services/trust-systems/commitment-follow-through
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CommitmentFollowThrough' });

/** An offer only counts if Ferni asks within this long. */
const OFFER_TTL_MS = 10 * 60 * 1000;
/** A reply this long after the question is no longer an answer to it. */
export const ANSWER_WINDOW_MS = 30 * 60 * 1000;

export type FollowUpOutcome = 'done' | 'not_done' | 'deflected' | 'unanswered';

const offered = new Map<string, Map<string, { content: string; at: number }>>();

const STOP = new Set(
  (
    'the and for you your yours that this with what how did does going gonna was were are ' +
    "have has had just been about when they them there their its it's get got out " +
    'some any all can could would should will shall like really very also still yet back ' +
    'into onto from then than but not too our ours his her him she who why where'
  ).split(' ')
);

/** The words in `text` that carry meaning (lowercase, `minLength`+ letters, no stopwords). */
export function meaningfulWords(text: string, minLength = 3): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/’/g, "'")
      .split(/[^a-zÀ-ɏ']+/)
      .map((w) => w.replace(/^'+|'+$/g, ''))
      .filter((w) => w.length >= minLength && !STOP.has(w))
  );
}

/** Ferni's reply asks about this commitment: a question that names what it was. */
export function asksAbout(response: string, content: string): boolean {
  if (!response.includes('?')) return false;
  const said = meaningfulWords(response);
  return [...meaningfulWords(content)].some((w) => said.has(w));
}

const DEFLECT =
  /\b(don'?t (?:want|wanna) (?:to )?(?:talk|get into)|rather not|let'?s not|not now|drop it|leave it|change the subject|none of your business|can we not|moving on)\b/i;
const NOT_DONE =
  /\b(no|nope|nah|not yet|didn'?t|did not|haven'?t|have not|couldn'?t|wasn'?t able|forgot|never got|skipped|bailed|chickened out|postponed|put it off|ran out of time)\b/i;
const DONE =
  /\b(yes|yeah|yep|yup|i did|did it|done|finished|went (?:well|great|good|fine|ok|okay)|it was (?:great|good|nice|fine|lovely|wonderful|okay|ok)|we talked|i called|called (?:her|him|them)|made it|nailed it|actually did)\b/i;

/** What the user's reply says about how it went, or null when it doesn't say. */
export function classifyFollowUpAnswer(
  text: string
): Exclude<FollowUpOutcome, 'unanswered'> | null {
  if (DEFLECT.test(text)) return 'deflected';
  if (NOT_DONE.test(text)) return 'not_done';
  if (DONE.test(text)) return 'done';
  return null;
}

async function commitmentDoc(
  userId: string,
  commitmentId: string
): Promise<FirebaseFirestore.DocumentReference> {
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore()
    .collection('bogle_users')
    .doc(userId)
    .collection('commitments')
    .doc(commitmentId);
}

/** The builder put this commitment's follow-up in front of the LLM this turn. */
export function noteFollowUpOffered(
  userId: string,
  commitment: { id: string; content: string },
  now = Date.now()
): void {
  const mine = offered.get(userId) ?? new Map<string, { content: string; at: number }>();
  mine.set(commitment.id, { content: commitment.content, at: now });
  offered.set(userId, mine);
}

/**
 * Called with each reply Ferni speaks. A follow-up offered in the last few
 * minutes that this reply asks about is marked asked: it won't be offered
 * again, and the user's next words are its answer. Returns the ids asked.
 */
export async function noteAskedFollowUps(
  userId: string,
  response: string,
  now = Date.now()
): Promise<string[]> {
  const mine = offered.get(userId);
  if (!mine) return [];
  const askedNow: string[] = [];
  for (const [id, offer] of mine) {
    if (now - offer.at > OFFER_TTL_MS) {
      mine.delete(id);
      continue;
    }
    if (!asksAbout(response, offer.content)) continue;
    mine.delete(id);
    const at = new Date(now).toISOString();
    await (
      await commitmentDoc(userId, id)
    ).update({
      awaitingAnswer: true,
      shouldFollowUp: false,
      followUpAskedAt: at,
      followUpCount: 1,
      lastMentioned: at,
    });
    askedNow.push(id);
    log.info({ userId, commitmentId: id }, 'Asked how a commitment went');
  }
  return askedNow;
}

const RECEPTION: Record<FollowUpOutcome, string> = {
  done: 'positive',
  not_done: 'neutral',
  deflected: 'avoidant',
  unanswered: 'unknown',
};

/** A commitment as the follow-through needs it (the commitment-tracking shape). */
export interface AwaitingCommitment {
  id: string;
  content: string;
  awaitingAnswer?: boolean;
  followUpAskedAt?: string | Date;
}

export interface FollowUpAnswer {
  id: string;
  content: string;
  outcome: FollowUpOutcome;
}

/**
 * Called with each user turn and the user's active commitments. Records the
 * answer to a follow-up Ferni asked: done → completed; not done or a
 * deflection → paused (we stop tracking it; no nagging). Past the answer
 * window it is closed as unanswered.
 */
export async function settleAwaitingAnswers(
  userId: string,
  userText: string,
  active: readonly AwaitingCommitment[],
  now = Date.now()
): Promise<FollowUpAnswer[]> {
  const settled: FollowUpAnswer[] = [];
  for (const c of active) {
    if (!c.awaitingAnswer) continue;
    const askedAt = c.followUpAskedAt ? new Date(c.followUpAskedAt).getTime() : 0;
    const outcome: FollowUpOutcome | null =
      now - askedAt > ANSWER_WINDOW_MS ? 'unanswered' : classifyFollowUpAnswer(userText);
    if (outcome === null) continue; // not an answer yet; the window decides
    const at = new Date(now).toISOString();
    await (
      await commitmentDoc(userId, c.id)
    ).update({
      awaitingAnswer: false,
      followUpOutcome: outcome,
      followUpAnsweredAt: at,
      ...(outcome === 'unanswered' ? {} : { followUpAnswer: userText.slice(0, 200) }),
      followUpReception: RECEPTION[outcome],
      status: outcome === 'done' ? 'completed' : 'paused',
      lastMentioned: at,
    });
    settled.push({ id: c.id, content: c.content, outcome });
    log.info({ userId, commitmentId: c.id, outcome }, 'Recorded how a commitment went');
  }
  return settled;
}

/** Test seam: forget this process's offered follow-ups. */
export function resetFollowThroughState(): void {
  offered.clear();
}
