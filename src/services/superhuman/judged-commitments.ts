/**
 * The after-call writer under COMMITMENT_SINGLE_WRITER. Prod's open
 * commitments were "catch you later" and "call her tomorrow", from the
 * turn-path regex, which sees one turn and never who "her" is. With the flag
 * on, a model judges the whole call (world-model/extraction/commitment-judge.ts)
 * and only its sure commitments are kept, as Ferni will say them back ("call
 * Mindy tomorrow"). The flag and the readers' side: commitment-single-writer.ts.
 *
 * @module services/superhuman/judged-commitments
 */

import { forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  firestoreCommitmentSink,
  isCommitmentCaptureOn,
  localDate,
  localTimeMs,
  sameCommitment,
  type CaptureContext,
} from './after-call-commitments.js';
import { judgedRowText, JUDGED_SOURCE } from './commitment-single-writer.js';
import { isDirective, NEEDS_PERSON, redactSecrets } from './commitment-guard.js';
export { isDirective, redactSecrets, screenJudged, type DropCounts } from './commitment-guard.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'JudgedCommitments' });

/** The judge's own confidence a line is a commitment; below this nothing is stored. */
export const MIN_JUDGED_CONFIDENCE = 0.7;
const MAX_PER_CALL = 3;
const DAY_MS = 86_400_000;
const UNDATED_FOLLOW_UP_MS = 3 * DAY_MS;
const FOLLOW_UP_HOUR = 17;
/** A "person" that is itself a pronoun names no one. */
const PRONOUN = /(?<![\p{L}'])(?:him|her|them|'?em|it)(?![\p{L}])/iu;
/** "do it", "handle it": with nothing saying what "it" is, fewer words than this can't be said back. */
const MIN_IT_WORDS = 5;

/** One candidate as the judge returned it: statement is the caller's own words, due is YYYY-MM-DD. */
export interface JudgedCommitment {
  statement: string;
  person?: string;
  due?: string;
  isCommitment: boolean;
  /** The judge's own call that it involves money or a credential, in any language. */
  sensitive?: boolean;
  confidence: number;
  quote?: string;
}

/** Whether a judged candidate is kept: a sure commitment Ferni can say back as written. */
export function keepJudged(j: JudgedCommitment): boolean {
  if (!j.isCommitment || j.confidence < MIN_JUDGED_CONFIDENCE) return false;
  // Words aimed at the judge, not a plan (commitment-guard.ts); judgeCallCommitments also checks.
  if (isDirective(`${j.statement} ${j.quote ?? ''}`)) return false;
  // The statement keeps the caller's pronouns, so "call her tomorrow" is kept only with who
  // "her" is: a person the caller named (screenJudged checks it is their word). A "person"
  // that is itself a pronoun ("them", "it") names no one.
  const named = Boolean(j.person?.trim()) && !PRONOUN.test(j.person ?? '');
  if (named) return true;
  const s = j.statement;
  if (NEEDS_PERSON.test(s) || /\bthem\b/i.test(s)) return false;
  // An "it" nobody named is kept when the rest says what the plan is ("taking it in for
  // an oil change on Wednesday", after Ferni asked about the car), not "handle it".
  return !/\bit\b/i.test(s) || s.trim().split(/\s+/).length >= MIN_IT_WORDS;
}

/** The evening of the day they named (the next day once it has passed), else in three days. */
function followUp(
  due: string | undefined,
  ctx: CaptureContext
): { at: number; targetDate?: number } {
  const evening = due ? localTimeMs(due, FOLLOW_UP_HOUR, ctx.timezone ?? 'UTC') : undefined;
  if (evening === undefined) return { at: ctx.now + UNDATED_FOLLOW_UP_MS };
  const targetDate = evening > ctx.now ? evening : ctx.now + DAY_MS;
  return { at: targetDate, targetDate };
}

/** The documents a call's judged candidates hold, before dedupe against the store. */
export function judgedCommitmentDocs(
  judged: readonly JudgedCommitment[],
  ctx: CaptureContext
): Array<Record<string, unknown>> {
  const today = localDate(ctx.now, ctx.timezone ?? 'UTC');
  const docs: Array<Record<string, unknown>> = [];
  for (const j of judged) {
    if (!keepJudged(j) || docs.some((d) => sameCommitment(String(d.statement), j.statement)))
      continue;
    const due = j.due && j.due >= today ? j.due : undefined;
    const { at, targetDate } = followUp(due, ctx);
    // No account, card or routing number, PIN or code is ever stored, in any field or language;
    // a money or credential item is only raised on a call, never in a text, brief or push.
    const statement = redactSecrets(j.statement);
    const quote = j.quote && redactSecrets(j.quote);
    const person = j.person && redactSecrets(j.person);
    docs.push({
      userId: ctx.userId,
      statement,
      summary: statement,
      text: statement,
      type: 'intention',
      source: JUDGED_SOURCE,
      confidence: j.confidence,
      sessionId: ctx.sessionId,
      emotionalWeight: 0.5,
      status: 'active',
      createdAt: ctx.now,
      lastMentioned: ctx.now,
      followUpAfter: at,
      followUpCount: 0,
      ...(person && { person, personInvolved: person }),
      ...(due && { due }),
      ...(quote && { quote }),
      // Raised only on a call: the span guard never calls an item safe to send (#2128).
      sensitive: true,
      ...(targetDate !== undefined && { targetDate }),
    });
    if (docs.length >= MAX_PER_CALL) break;
  }
  return docs;
}

/** The store this needs; injected so tests touch no database. */
export interface JudgedSink {
  /** Statements of the caller's open judged commitments (legacy rows never block a new one). */
  openJudged: (userId: string) => Promise<string[]>;
  add: (userId: string, doc: Record<string, unknown>) => Promise<void>;
}

export const firestoreJudgedSink: JudgedSink = {
  async openJudged(userId) {
    const col = getFirestoreDb()?.collection('bogle_users').doc(userId).collection('commitments');
    const open = col?.where('status', '==', 'active').where('source', '==', JUDGED_SOURCE);
    const snap = await open?.limit(100).get();
    return (snap?.docs ?? []).map((d) => String(d.data().statement ?? ''));
  },
  add: async (userId, doc) => firestoreCommitmentSink.add(userId, doc),
};

export interface JudgedDeps {
  sink?: JudgedSink;
  forgotten?: (userId: string) => Promise<string[] | null>;
  env?: Record<string, string | undefined>;
}

/** Writes the call's judged commitments. Returns how many. Never throws. */
export async function recordJudgedCommitments(
  judged: readonly JudgedCommitment[],
  ctx: CaptureContext,
  deps: JudgedDeps = {}
): Promise<number> {
  if (!isCommitmentCaptureOn(deps.env) || !ctx.userId) return 0;
  const candidates = judgedCommitmentDocs(judged, ctx);
  if (candidates.length === 0) return 0;
  const sink = deps.sink ?? firestoreJudgedSink;
  try {
    // Unreadable forgotten topics: write nothing rather than risk one (fails closed).
    const forgotten = await (deps.forgotten ?? forgottenTopicsOrNull)(ctx.userId);
    if (forgotten === null) return 0;
    const open = await sink.openJudged(ctx.userId);
    let written = 0;
    for (const doc of candidates) {
      const statement = String(doc.statement);
      if (isForgotten(judgedRowText(doc), forgotten)) continue;
      if (open.some((o) => sameCommitment(o, statement))) continue;
      await sink.add(ctx.userId, doc);
      written++;
    }
    log.info(
      { userId: ctx.userId, sessionId: ctx.sessionId, judged: judged.length, written },
      'JUDGED_COMMITMENTS'
    );
    return written;
  } catch (error) {
    log.warn({ userId: ctx.userId, error: String(error) }, 'Judged commitments not recorded');
    return 0;
  }
}
