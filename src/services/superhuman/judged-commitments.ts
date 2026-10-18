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
import { JUDGED_SOURCE } from './commitment-single-writer.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'JudgedCommitments' });

/** The judge's own confidence a line is a commitment; below this nothing is stored. */
export const MIN_JUDGED_CONFIDENCE = 0.7;
const MAX_PER_CALL = 3;
const DAY_MS = 86_400_000;
const UNDATED_FOLLOW_UP_MS = 3 * DAY_MS;
const FOLLOW_UP_HOUR = 17;
/** An object pronoun the statement never names: "call her tomorrow" can't be said back. */
const UNNAMED = /\b(him|her|them|'em)\b/i;

/** One candidate as the judge returned it; statement follows "you said you'd", due is YYYY-MM-DD. */
export interface JudgedCommitment {
  statement: string;
  person?: string;
  due?: string;
  isCommitment: boolean;
  confidence: number;
  quote?: string;
}

/** Whether a judged candidate is kept: a sure commitment Ferni can say back as written. */
export function keepJudged(j: JudgedCommitment): boolean {
  if (!j.isCommitment || j.confidence < MIN_JUDGED_CONFIDENCE) return false;
  // A "person" that is itself a pronoun ("them") names no one.
  const person = j.person && !UNNAMED.test(j.person) ? j.person.toLowerCase() : undefined;
  const named = person !== undefined && j.statement.toLowerCase().includes(person);
  return named || !UNNAMED.test(j.statement);
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
    docs.push({
      userId: ctx.userId,
      statement: j.statement,
      summary: j.statement,
      text: j.statement,
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
      ...(j.person && { person: j.person, personInvolved: j.person }),
      ...(due && { due }),
      ...(j.quote && { quote: j.quote }),
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
      if (isForgotten(`${statement} ${String(doc.quote ?? '')}`, forgotten)) continue;
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
