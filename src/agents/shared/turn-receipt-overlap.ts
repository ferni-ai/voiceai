/**
 * Who was talking when: per-turn fields for TURN_RECEIPT (turn-receipt.ts) and one
 * CALL_END line per call. Built from the caller's voice state (LiveKit's
 * user_state_changed) and Ferni's (agent_state_changed) only: numbers and yes/no,
 * never what either side said.
 *
 * Per turn:
 * - `callerSpeakingAtFirstAudio`: the caller was still speaking when Ferni's reply
 *   audio began, so Ferni started while they talked. Null when Ferni never spoke.
 * - `callerResumedAfterCommitMs`: from the turn's first commit to the caller speaking
 *   again during the turn, i.e. they went on after their turn was judged over. Null
 *   when they didn't.
 * - `cutLatencyMs`: on a cut reply (interrupted, or stopped for the caller), from the
 *   caller's start of speech over Ferni (or Ferni's first audio, if they were already
 *   talking) to Ferni's audio stopping. Speech over Ferni that ends while he keeps
 *   talking (an "mm-hm") is not the start of a cut. Null on a reply that wasn't cut.
 * - `reply.heardMs`: the reply audio that played out, summed over its messages, from
 *   LiveKit's item metrics (startedSpeakingAt to stoppedSpeakingAt). Null when no item
 *   carried them.
 *
 * CALL_END `{sessionId, durationMs, callerSpeechMs, agentSpeechMs}`: from the recorder's
 * start (the session's) to the end of the call, and each side's total speaking time.
 *
 * @module agents/shared/turn-receipt-overlap
 */
import { createLogger } from '../../utils/safe-logger.js';

interface TurnVoice {
  committedAt?: number;
  callerAtFirstAudio?: boolean;
  resumedMs?: number;
  /** When the caller began speaking over Ferni's audio, until that overlap ends. */
  overAt?: number;
  cutMs?: number;
  heardMs?: number;
}

/** An item as conversation_item_added carries it (only what the receipt reads). */
export interface SpokenItem {
  role?: string;
  interrupted?: boolean;
  textContent?: string;
  /** Epoch seconds (LiveKit ChatMessage metrics). */
  metrics?: { startedSpeakingAt?: number; stoppedSpeakingAt?: number };
}

/** What a receipt says about who was talking when (see the module doc). */
export interface OverlapFields {
  callerSpeakingAtFirstAudio: boolean | null;
  callerResumedAfterCommitMs: number | null;
  cutLatencyMs: number | null;
}

export interface CallEnd {
  sessionId: string;
  durationMs: number;
  callerSpeechMs: number;
  agentSpeechMs: number;
}

const log = createLogger({ module: 'TurnReceipt' });
const logCallEnd = (line: CallEnd): void => log.info({ event: 'CALL_END', ...line }, 'CALL_END');

const ms = (n: number | undefined): number | null =>
  n === undefined || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));

/** One per recorder. A turn is the recorder's own open-turn object; its fields are kept here. */
export class CallVoice {
  private readonly turns = new WeakMap<object, TurnVoice>();
  private readonly startedAt: number;
  private callerSince?: number;
  private agentSince?: number;
  private callerMs = 0;
  private agentMs = 0;
  private ended = false;

  constructor(private readonly now: () => number) {
    this.startedAt = now();
  }

  private of(turn: object | null | undefined): TurnVoice | undefined {
    if (!turn) return undefined;
    let voice = this.turns.get(turn);
    if (!voice) this.turns.set(turn, (voice = {}));
    return voice;
  }

  /** The caller's turn was committed: a resume is timed from the first commit. */
  commit(turn: object): void {
    (this.of(turn) as TurnVoice).committedAt ??= this.now();
  }

  /** LiveKit's user state for the caller ('speaking', 'listening' or 'away'). */
  caller(state: string | undefined, open: object | null | undefined): void {
    const now = this.now();
    const turn = this.of(open);
    if (state === 'speaking') {
      if (this.callerSince !== undefined) return;
      this.callerSince = now;
      if (turn?.committedAt !== undefined) turn.resumedMs ??= now - turn.committedAt;
      if (turn && this.agentSince !== undefined) turn.overAt = now;
      return;
    }
    if (this.callerSince === undefined) return;
    this.callerMs += now - this.callerSince;
    this.callerSince = undefined;
    if (turn && this.agentSince !== undefined) turn.overAt = undefined; // Ferni talked on
  }

  /** Ferni's agent state, with the turn open after the recorder saw it. */
  agent(state: string | undefined, open: object | null | undefined): void {
    const now = this.now();
    const turn = this.of(open);
    if (state === 'speaking') {
      if (this.agentSince !== undefined) return;
      this.agentSince = now;
      if (!turn) return;
      turn.callerAtFirstAudio ??= this.callerSince !== undefined;
      if (this.callerSince !== undefined) turn.overAt = now;
      return;
    }
    if (this.agentSince === undefined) return;
    this.agentMs += now - this.agentSince;
    this.agentSince = undefined;
    if (turn?.overAt !== undefined) turn.cutMs ??= now - turn.overAt;
  }

  /** A reply message reached the history: add the audio of it that played. */
  heard(owner: object, item: SpokenItem): void {
    const { startedSpeakingAt: start, stoppedSpeakingAt: stop } = item.metrics ?? {};
    if (typeof start !== 'number' || typeof stop !== 'number' || stop < start) return;
    const turn = this.of(owner) as TurnVoice;
    turn.heardMs = (turn.heardMs ?? 0) + (stop - start) * 1000;
  }

  /** The reply audio that played out this turn, in ms. */
  heardMs(turn: object): number | null {
    return ms(this.turns.get(turn)?.heardMs);
  }

  /** The receipt's overlap fields; `cut`: the reply was interrupted or stopped for the caller. */
  fields(open: object, cut: boolean): OverlapFields {
    const turn = this.turns.get(open) ?? {};
    return {
      callerSpeakingAtFirstAudio: turn.callerAtFirstAudio ?? null,
      callerResumedAfterCommitMs: ms(turn.resumedMs),
      cutLatencyMs: cut ? ms(turn.cutMs) : null,
    };
  }

  /** The call is over: one CALL_END line, however many times the recorder is flushed. */
  end(sessionId: string, emit: (line: CallEnd) => void = logCallEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.caller('away', undefined);
    this.agent('listening', undefined);
    emit({
      sessionId,
      durationMs: Math.round(this.now() - this.startedAt),
      callerSpeechMs: Math.round(this.callerMs),
      agentSpeechMs: Math.round(this.agentMs),
    });
  }
}
