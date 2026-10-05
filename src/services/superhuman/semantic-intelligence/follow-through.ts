/**
 * Ferni's replies, read for follow-through.
 *
 * Every reply Ferni speaks passes through here (tts-wrapper → integration.ts
 * trackFerniCommitments). Before looking for new promises in it, we check
 * whether it delivers on old ones:
 * - one of Ferni's own open promises ("I'll check in about the interview")
 *   is kept when a later reply actually asks about it ("How did the interview go?");
 * - a follow-up on the user's own commitment that the builder offered this turn
 *   is marked asked, so the user's next words become its answer.
 *
 * Reminder promises are not kept by talk: only the reminder going out keeps them.
 *
 * @module services/superhuman/semantic-intelligence/follow-through
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  fulfillCommitment,
  getPendingCommitments,
  trackCommitmentsInResponse,
  type FerniCommitment,
} from './ferni-commitments.js';
import {
  meaningfulWords,
  noteAskedFollowUps,
} from '../../trust-systems/commitment-follow-through.js';

const log = createLogger({ module: 'promise-follow-through' });

/** A promise made in this very reply (or the one before it streaming) isn't followed up yet. */
const MIN_PROMISE_AGE_MS = 60 * 1000;

/** Words that make up the promise itself, not what it was about. */
const PROMISE_WORDS = meaningfulWords(
  "i'll check in let's revisit come back talk more next time let me know how it goes keep me " +
    'posted updated would love hear celebrate wait think look into remember'
);

/** What a promise was about: its topic, person, and the words around it. */
function subjectOf(c: FerniCommitment): Set<string> {
  const words = meaningfulWords(
    [c.relatedTopic, c.relatedPerson, c.context, c.commitment].filter(Boolean).join(' '),
    4
  );
  return new Set([...words].filter((w) => !PROMISE_WORDS.has(w)));
}

/**
 * Whether `reply` delivers on promise `c`: a question that names what it was
 * about, or for "I'll look into that", saying what was found (two subject words).
 */
export function deliversOn(c: FerniCommitment, reply: string): boolean {
  const said = meaningfulWords(reply, 4);
  const overlap = [...subjectOf(c)].filter((w) => said.has(w)).length;
  if (c.type === 'research') return overlap >= 2;
  return overlap >= 1 && reply.includes('?');
}

/**
 * Mark the promises this reply follows through on. Returns the ids kept
 * (Ferni's promises) and asked (follow-ups on the user's commitments).
 */
export async function recognizeFollowThrough(
  userId: string,
  reply: string,
  now: Date = new Date()
): Promise<{ kept: string[]; asked: string[] }> {
  const kept: string[] = [];
  for (const c of await getPendingCommitments(userId)) {
    if (c.type === 'remind') continue;
    if (now.getTime() - new Date(c.madeAt).getTime() < MIN_PROMISE_AGE_MS) continue;
    if (!deliversOn(c, reply)) continue;
    await fulfillCommitment(userId, c.id, `followed up in conversation: "${reply.slice(0, 120)}"`);
    kept.push(c.id);
    log.info({ userId, commitmentId: c.id, type: c.type }, 'Ferni kept a promise in conversation');
  }
  const asked = await noteAskedFollowUps(userId, reply, now.getTime());
  return { kept, asked };
}

/** Everything a spoken reply means for promises: old ones delivered, new ones made. */
export async function trackResponsePromises(
  userId: string,
  reply: string,
  context: { topic?: string; person?: string; userMessage?: string }
): Promise<void> {
  await recognizeFollowThrough(userId, reply);
  await trackCommitmentsInResponse(userId, reply, context);
}
