/**
 * Find a reported reply in the caller's own transcript, as realtime-memory
 * persistTurn writes it (bogle_users/{uid}/conversations/{id}/turns/{turnId}:
 * { role, content, timestamp }). Reports store this text, never the client's.
 * The web client has no turn ids, so most reports name a time: the reply is the
 * assistant turn nearest it, preferring one matching the on-screen words.
 *
 * @module api/reply-reports/reply-report-lookup
 */
import type {
  CollectionReference,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
} from '@google-cloud/firestore';

export interface ReportedReply {
  conversationId: string;
  turnId: string;
  /** Ferni's reply, exactly as the transcript stores it. */
  replyText: string;
  /** The person's turn just before it, if there is one. */
  userTurnText: string | null;
  personaId: string | null;
  replyAt: number | null;
  matchedBy: 'turn_id' | 'text_and_time' | 'time';
}

export interface ReplyLocator {
  sessionId: string;
  turnId?: string;
  messageAt: number | null;
  textHint?: string;
}

/** A stored turn can be written up to this long before the reply finished on screen. */
export const MATCH_BEFORE_MS = 120_000;
/** …or this long after (clock skew, slow persistence). */
export const MATCH_AFTER_MS = 60_000;
/** Share of on-screen words a turn must contain to count as the same reply. */
const HINT_MATCH_MIN = 0.6;

/** Firestore document ids we accept from a client: no slashes, nothing that walks the path. */
const DOC_ID = /^[A-Za-z0-9_-]{1,150}$/;

interface Turn {
  id: string;
  role: unknown;
  content: unknown;
  at: number | null;
}

function toMs(value: unknown): number | null {
  const date = (value as { toDate?: () => Date } | null)?.toDate?.() ?? value;
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date));
  return Number.isFinite(ms) ? ms : null;
}

function asTurn(doc: DocumentSnapshot): Turn {
  const data = doc.data() ?? {};
  return { id: doc.id, role: data.role, content: data.content, at: toMs(data.timestamp) };
}

function isReply(t: Turn): t is Turn & { content: string } {
  return t.role === 'assistant' && typeof t.content === 'string' && t.content.trim() !== '';
}

function words(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean);
}

/** Share of the hint's words that appear in the turn (0..1). */
export function hintOverlap(hint: string, content: string): number {
  const hintWords = words(hint);
  if (hintWords.length === 0) return 0;
  const have = new Set(words(content));
  return hintWords.filter((w) => have.has(w)).length / hintWords.length;
}

/** Calls that could hold the reply: the one named, else the latest ones started before it. */
async function candidateCalls(
  calls: CollectionReference,
  sessionId: string,
  messageAt: number | null
): Promise<DocumentSnapshot[]> {
  if (DOC_ID.test(sessionId)) {
    const named = await calls.doc(sessionId).get();
    if (named.exists) return [named];
  }
  if (messageAt === null) return [];
  const recent = await calls
    .where('startedAt', '<=', new Date(messageAt + MATCH_AFTER_MS))
    .orderBy('startedAt', 'desc')
    .limit(3)
    .get();
  return recent.docs;
}

async function replyById(call: DocumentReference, turnId: string): Promise<Turn | null> {
  if (!DOC_ID.test(turnId)) return null;
  const doc = await call.collection('turns').doc(turnId).get();
  if (!doc.exists) return null;
  const turn = asTurn(doc);
  return isReply(turn) ? turn : null;
}

async function replyNear(
  call: DocumentReference,
  at: number,
  hint: string | undefined
): Promise<{ turn: Turn; byText: boolean } | null> {
  const snap = await call
    .collection('turns')
    .where('timestamp', '>=', new Date(at - MATCH_BEFORE_MS))
    .where('timestamp', '<=', new Date(at + MATCH_AFTER_MS))
    .orderBy('timestamp', 'asc')
    .limit(100)
    .get();
  const replies = snap.docs.map(asTurn).filter(isReply);
  if (replies.length === 0) return null;
  const distance = (t: Turn): number => (t.at === null ? Infinity : Math.abs(t.at - at));
  const nearest = (ts: Turn[]): Turn => ts.reduce((a, b) => (distance(b) < distance(a) ? b : a));
  if (hint) {
    const scored = replies.map((t) => ({ t, score: hintOverlap(hint, t.content) }));
    const best = Math.max(...scored.map((s) => s.score));
    if (best >= HINT_MATCH_MIN) {
      return {
        turn: nearest(scored.filter((s) => s.score === best).map((s) => s.t)),
        byText: true,
      };
    }
  }
  return { turn: nearest(replies), byText: false };
}

async function userTurnBefore(
  call: DocumentReference,
  replyAt: number | null
): Promise<string | null> {
  if (replyAt === null) return null;
  const snap = await call
    .collection('turns')
    .where('timestamp', '<', new Date(replyAt))
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  const user = snap.docs
    .map(asTurn)
    .find((t) => t.role === 'user' && typeof t.content === 'string');
  return user ? (user.content as string) : null;
}

/** The reported reply inside one call, or null when the call doesn't hold it. */
async function findInCall(
  call: DocumentSnapshot,
  locator: ReplyLocator
): Promise<ReportedReply | null> {
  let turn: Turn | null = null;
  let matchedBy: ReportedReply['matchedBy'] = 'turn_id';
  if (locator.turnId !== undefined) {
    turn = await replyById(call.ref, locator.turnId);
  } else if (locator.messageAt !== null) {
    const near = await replyNear(call.ref, locator.messageAt, locator.textHint);
    turn = near?.turn ?? null;
    matchedBy = near?.byText === true ? 'text_and_time' : 'time';
  }
  if (!turn) return null;
  const personaId: unknown = call.get('personaId');
  return {
    conversationId: call.id,
    turnId: turn.id,
    replyText: turn.content as string,
    userTurnText: await userTurnBefore(call.ref, turn.at),
    personaId: typeof personaId === 'string' ? personaId : null,
    replyAt: turn.at,
    matchedBy,
  };
}

/** The reported reply from `uid`'s own transcript, or null when it can't be found. */
export async function findReportedReply(
  db: Firestore,
  uid: string,
  locator: ReplyLocator
): Promise<ReportedReply | null> {
  const calls = db.collection('bogle_users').doc(uid).collection('conversations');
  for (const call of await candidateCalls(calls, locator.sessionId, locator.messageAt)) {
    // One call at a time, newest first: stop at the first that holds the reply
    // eslint-disable-next-line no-await-in-loop
    const found = await findInCall(call, locator);
    if (found) return found;
  }
  return null;
}
