/**
 * The TURN_RECEIPT's `crisis` field: what the crisis engines decided on the turn and
 * what the reply carried, so crisis turns and 988/911 offers are counted per call and
 * per turn. No words: enums and booleans only. The reply text is read where it passes
 * (names988 / names911, crisis-line-speech.ts) and never kept.
 *
 * - `engine`: which engine read risk on the turn (gate: the reply gate, crisis-gate.ts;
 *   pipeline: the turn pipeline, turn-crisis.ts), `both` or `none`.
 * - `tier`: the higher of the two reads, as the engines map their decisions (block:
 *   the script replaces the reply; crisis: guided or checked; none).
 * - `reply`: the class of the gate decision that shaped the reply (crisis-turn-note.ts).
 *   The pipeline only adds to the request, so it never sets one.
 * - `kind`: a replaced reply's type and severity (crisis-event-record.ts), else null.
 * - `said988`, `said911`: the reply as added to the history names the line. A cut
 *   reply's history holds what was heard.
 * - `delivered`: for a crisis reply, full, cut (the caller barged in) or none reached
 *   the history; null on an ordinary reply.
 *
 * Notes arrive by session id (noteCrisisTurn) with the turn they were made on; a note
 * for another turn (a read that settled after the caller's next commit) is dropped.
 *
 * @module agents/shared/turn-receipt-crisis
 */
import { names911, names988, type PatternOutcome } from '../../services/safety/index.js';
import type { CrisisEventKind } from '../safety/crisis-event-record.js';

type CrisisEngine = 'gate' | 'pipeline';
export type CrisisReplyClass =
  | 'ordinary'
  | 'softCheck'
  | 'directCheck'
  | 'gentleOffer'
  | 'checkin'
  | 'guidance'
  | 'script988'
  | 'script911';

/** One engine's decision on a turn. */
export interface CrisisTurnNote {
  engine: CrisisEngine;
  tier: PatternOutcome;
  reply?: CrisisReplyClass;
  kind?: CrisisEventKind;
}

type CrisisListener = (sessionId: string, turn: number | null, note: CrisisTurnNote) => void;
const listeners = new Set<CrisisListener>();

/** Hear each call's crisis notes (turn-receipt-session.ts). Returns an unsubscribe. */
export function onCrisisTurn(listener: CrisisListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** A crisis decision on `turn` (callTurnOf) of this call. Never throws. */
export function noteCrisisTurn(
  sessionId: string | undefined,
  turn: number | null,
  note: CrisisTurnNote
): void {
  if (!sessionId) return;
  for (const listener of listeners) {
    try {
      listener(sessionId, turn, note);
    } catch {
      // Observability only: never in the way of the reply.
    }
  }
}

/** The open turn's crisis notes and reply flags. */
export interface TurnCrisisNotes {
  gate: PatternOutcome;
  pipeline: PatternOutcome;
  reply: CrisisReplyClass;
  kind: CrisisEventKind | null;
  said988: boolean;
  said911: boolean;
}

export const newTurnCrisisNotes = (): TurnCrisisNotes => ({
  gate: 'none',
  pipeline: 'none',
  reply: 'ordinary',
  kind: null,
  said988: false,
  said911: false,
});

const TIER_RANK: Record<PatternOutcome, number> = { none: 0, crisis: 1, block: 2 };
const REPLY_RANK: Record<CrisisReplyClass, number> = {
  ordinary: 0,
  softCheck: 1,
  directCheck: 1,
  gentleOffer: 1,
  checkin: 1,
  guidance: 2,
  script988: 3,
  script911: 3,
};

/** A turn can be gated more than once (a preemptive request, an escalation): the strongest counts. */
export function addCrisisNote(turn: TurnCrisisNotes, note: CrisisTurnNote): void {
  if (TIER_RANK[note.tier] > TIER_RANK[turn[note.engine]]) turn[note.engine] = note.tier;
  if (note.reply && REPLY_RANK[note.reply] >= REPLY_RANK[turn.reply]) turn.reply = note.reply;
  if (note.kind) turn.kind = note.kind;
}

/** A reply added to the history: whether it names either line. */
export function addReplyText(turn: TurnCrisisNotes, text: string): void {
  if (!text) return;
  turn.said988 ||= names988(text);
  turn.said911 ||= names911(text);
}

export interface CrisisReceiptField {
  engine: CrisisEngine | 'both' | 'none';
  tier: PatternOutcome;
  reply: CrisisReplyClass;
  kind: CrisisEventKind | null;
  said988: boolean;
  said911: boolean;
  delivered: 'full' | 'cut' | 'none' | null;
}

export function crisisField(
  turn: TurnCrisisNotes,
  reply: { messages: number; interrupted: boolean }
): CrisisReceiptField {
  const gate = turn.gate !== 'none';
  const pipeline = turn.pipeline !== 'none';
  const crisisReply = turn.reply !== 'ordinary';
  return {
    engine: gate && pipeline ? 'both' : gate ? 'gate' : pipeline ? 'pipeline' : 'none',
    tier: TIER_RANK[turn.gate] >= TIER_RANK[turn.pipeline] ? turn.gate : turn.pipeline,
    reply: turn.reply,
    kind: turn.kind,
    said988: turn.said988,
    said911: turn.said911,
    delivered: !crisisReply
      ? null
      : reply.messages === 0
        ? 'none'
        : reply.interrupted
          ? 'cut'
          : 'full',
  };
}
