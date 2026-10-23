/**
 * LAUGH_CAP (on by default; =off is the kill switch): one per-call ledger every
 * laugh path asks before it laughs and tells when it did. On prod after
 * FERNI_PLAYFUL, 13.5% of replies opened with a model-written [laughter], 128
 * of 151 laughs had no cue from the caller and one call had 37
 * (sounds-audit-2026-10-22).
 *
 * A laugh (reply text, laugh-along or "Ha" clip, the Director's lever) needs
 * all of: under MAX_CALL_LAUGHS this call; LAUGH_GAP replies since the last;
 * a cue in the caller's words (callerLaughed, callerBright, a happy surprise);
 * nothing heavy, venting or crisis (crisis risk stays set for the call) in
 * this turn or the HEAVY_QUIET before it; no opening clip on this reply.
 * A reply is counted when its text first reaches the voice
 * (heavy-laughter-guard.ts, through laughGateFor).
 *
 * @module agents/personas/laugh-ledger
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import type { LaughGate } from '../../speech/tts-gateway/director/types.js';
import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { classifyBackchannelContext } from '../integrations/backchannel-context.js';
import { callerBright, callerLaughed, callerVenting, regexSignals } from './turn-extras.js';
import type { TurnSignals } from './turn-extras.js';
import { callerMove } from './turn-shape.js';

export const MAX_CALL_LAUGHS = 4;
/** Ferni replies with no laugh between two laughs, at least. */
export const LAUGH_GAP = 2;
/** Replies after a heavy, venting or crisis turn with no laugh. */
export const HEAVY_QUIET = 3;
/** An opening clip this recent opens the reply now starting. */
const EDGE_MS = 15_000;
const MAX_CALLS = 500;

interface Ledger {
  /** Replies counted; the reply now spoken is number `reply`, answering `key`. */
  reply: number;
  key?: string;
  said?: string;
  laughs: number;
  lastLaugh: number;
  lastHard: number;
  /** When an opening clip last played, until a reply takes it. */
  edgeAt: number;
  mayLaugh: boolean;
}

const ledgers = new Map<string, Ledger>();

export function laughCapOn(env: Env = process.env): boolean {
  return flagOn('LAUGH_CAP', env);
}

function ledgerOf(sessionId: string): Ledger {
  let l = ledgers.get(sessionId);
  if (!l) {
    if (ledgers.size >= MAX_CALLS) ledgers.delete(ledgers.keys().next().value as string);
    l = {
      reply: 0,
      laughs: 0,
      lastLaugh: -Infinity,
      lastHard: -Infinity,
      edgeAt: 0,
      mayLaugh: true,
    };
    ledgers.set(sessionId, l);
  }
  return l;
}

/** The caller laughed, joked, or told good news or a happy surprise. */
function callerCue(said: string): boolean {
  return (
    callerLaughed(said) || callerBright(said) || classifyBackchannelContext(said) === 'surprise'
  );
}

/** A turn that holds laughs off for itself and the HEAVY_QUIET replies after it. */
function hardTurn(sessionId: string, said: string): boolean {
  return isHeavyMoment([said]) || callerVenting(said) || crisisRiskThisCall(sessionId, said);
}

function verdict(l: Ledger, at: number, said: string, edge: boolean): boolean {
  return (
    at - l.lastHard > HEAVY_QUIET &&
    at - l.lastLaugh > LAUGH_GAP &&
    l.laughs < MAX_CALL_LAUGHS &&
    !edge &&
    callerCue(said)
  );
}

/** A reply to `said` starts (`key` tells turns apart): counted once a turn, its laugh decided. */
function beginReply(sessionId: string, said: string | undefined, key: string): boolean {
  const l = ledgerOf(sessionId);
  if (key !== l.key) {
    l.reply++;
    l.key = key;
    l.said = said;
  }
  if (said && hardTurn(sessionId, said)) l.lastHard = l.reply;
  l.mayLaugh = !!said && verdict(l, l.reply, said, Date.now() - l.edgeAt < EDGE_MS);
  l.edgeAt = 0;
  return l.mayLaugh;
}

/**
 * Whether the next reply, to `said`, may laugh (the turn reminder's laugh lines,
 * clips while the caller talks). `heavy`: the turn already reads hard or careful.
 */
export function nextReplyMayLaugh(sessionId: string, said: string, heavy: boolean): boolean {
  const l = ledgerOf(sessionId);
  if (heavy || hardTurn(sessionId, said)) return false;
  const at = said === l.said ? l.reply : l.reply + 1;
  return verdict(l, at, said, Date.now() - l.edgeAt < EDGE_MS);
}

/**
 * The turn's signals with nothing that asks for a laugh (LAUGH_ALONG's line, the
 * spontaneous laugh, a laugh burst) when the next reply may not laugh: the line
 * is never written, rather than its laugh stripped afterwards.
 */
export function withLaughCap(
  session: object,
  said: string,
  signals: TurnSignals | undefined,
  env: Env = process.env
): TurnSignals | undefined {
  const call = (session as { userData?: { services?: { sessionId?: string } } }).userData?.services
    ?.sessionId;
  if (!call || !laughCapOn(env)) return signals;
  const sig = signals ?? regexSignals(said, callerMove(said));
  const hard = sig.heavy === true || sig.careful || sig.crisisRisk === true;
  return nextReplyMayLaugh(call, said, hard)
    ? signals
    : { ...sig, laughed: false, laughFits: false };
}

/** A laugh was heard: in the reply now spoken, or (`beforeReply`) a clip before the next one. */
export function recordLaugh(sessionId: string, beforeReply = false): void {
  const l = ledgerOf(sessionId);
  const at = beforeReply ? l.reply + 1 : l.reply;
  if (l.lastLaugh === at) return;
  l.lastLaugh = at;
  l.laughs++;
}

/** An opening clip played: the reply it opens must not open with a laugh too. */
export function noteTurnOpened(sessionId: string): void {
  ledgerOf(sessionId).edgeAt = Date.now();
}

/** The call's ledger as the Director's text guard and laughter lever take it; none when off. */
export function laughGateFor(
  sessionId: string | undefined,
  env = process.env
): LaughGate | undefined {
  if (!sessionId || !laughCapOn(env)) return undefined;
  return {
    beginReply: (said, key) => beginReply(sessionId, said, key),
    mayLaugh: () => ledgerOf(sessionId).mayLaugh,
    laughed: () => recordLaugh(sessionId),
  };
}

export function forgetLaughs(sessionId: string): void {
  ledgers.delete(sessionId);
}
