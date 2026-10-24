/**
 * A TURN_RECEIPT's timings (turn-receipt.ts): the turn's steps, the holds that
 * kept its first words back on purpose, and when the caller first heard Ferni.
 *
 * `holds` (ms; null: that layer didn't run): measured where each happens and
 * reported through turn-timing.ts; openerClipMs and pauseHoldMs come with the
 * reply's first audio (first-audio-observer.ts), from the reply ttsTtfbMs is
 * from. A hold after Ferni was heard did not delay him and is not counted.
 *
 * `audio`: firstAnyAudioMs counts an opening clip ("Mm") from when it reaches
 * the wire; firstReplyAudioMs is the reply's own (= timing.firstAudioMs).
 * providerTtfbMs is the TTS provider's own wait: ttsTtfbMs less ttsPushMs (the
 * model and every hold before TTS) and the opening-clip and pause holds after.
 *
 * @module agents/shared/turn-receipt-timing
 */
import type { GatewayHolds } from '../../speech/tts-gateway/first-audio-observer.js';
import type { TurnHoldKind, TurnTimingKind } from '../../speech/output-control/turn-timing.js';
import { llmReady, type EouMetric, type LlmMetric } from './turn-metrics.js';

export interface TurnAttribution {
  holds: Partial<Record<TurnHoldKind, number>>;
  /** An unfinished-sounding turn waited this long for its commit (unfinished-turn.ts). */
  unfinishedTurnMs?: number;
  /** When an opening clip reached the wire. */
  openerAudioAt?: number;
  /** The holds inside the gateway's first audio, from the reply ttsTtfbMs is from. */
  gateway?: GatewayHolds;
}

/** The parts of an open turn its timings are read from (turn-receipt.ts OpenTurn). */
export interface TimedTurn {
  eou?: EouMetric;
  llm?: LlmMetric;
  ttsTtfbMs?: number;
  ttsPushMs?: number;
  thinkingAt?: number;
  speakingAt?: number;
  att: TurnAttribution;
}

export const newAttribution = (): TurnAttribution => ({ holds: {} });

/** A hold or an opening clip on the open turn; holds after Ferni was heard don't count. */
export function noteTiming(
  turn: TimedTurn,
  kind: Exclude<TurnTimingKind, 'unfinishedTurn'>,
  heldMs: number,
  now: number
): void {
  if (kind === 'openerAudio') turn.att.openerAudioAt ??= now + Math.max(0, heldMs);
  else if (turn.speakingAt === undefined) turn.att.holds[kind] = Math.max(0, heldMs);
}

/**
 * An unfinished turn's hold (unfinished-turn.ts) is decided before its commit, so the
 * commit that follows claims it: the wait is from the decision to that commit. A later
 * decision not to hold (the caller went on and finished) clears it.
 */
export class PendingUnfinished {
  private heldAt: number | null = null;
  constructor(private readonly now: () => number) {}
  note(holdMs: number): void {
    this.heldAt = holdMs > 0 ? this.now() : null;
  }
  claim(turn: TimedTurn): void {
    if (this.heldAt !== null) turn.att.unfinishedTurnMs ??= this.now() - this.heldAt;
    this.heldAt = null;
  }
}

const ms = (n: number | undefined | null): number | null =>
  n === undefined || n === null || !Number.isFinite(n) ? null : Math.round(n);

const sinceStop = (turn: TimedTurn, to: number | undefined): number | null => {
  const from = turn.eou?.lastSpeakingTimeMs ?? 0;
  return from > 0 && to !== undefined ? ms(to - from) : null;
};

/** The turn's steps. `replyDone`: when the reply ended, if the turn ended on it. */
export function timingField(turn: TimedTurn, replyDone?: number): Record<string, number | null> {
  const { eou, llm, thinkingAt, speakingAt } = turn;
  const since = (from: number, to: number | undefined): number | null =>
    from > 0 && to !== undefined ? ms(to - from) : null;
  return {
    eouDelayMs: ms(eou?.endOfUtteranceDelayMs),
    transcriptionDelayMs: ms(eou?.transcriptionDelayMs),
    llmTtftMs: ms(llm?.ttftMs),
    /** End of the caller's speech to the model's first token (turn-metrics.ts). */
    llmReadyMs: eou && llm ? ms(llmReady(eou, llm)) : null,
    llmDurationMs: ms(llm?.durationMs),
    ttsTtfbMs: ms(turn.ttsTtfbMs),
    /** Gateway: first text sent to the provider, from the start of the TTS node. */
    ttsPushMs: ms(turn.ttsPushMs),
    /** Commit (thinking) to Ferni's first audio, as REPLY_GAP measures it. */
    commitToAudioMs: since(thinkingAt ?? 0, speakingAt),
    /** End of the caller's speech to Ferni's first audio. */
    firstAudioMs: sinceStop(turn, speakingAt),
    /** End of the caller's speech to the end of the reply. */
    replyDoneMs: sinceStop(turn, replyDone),
  };
}

/** The TTS provider's own wait for the first audio, or null when the push wasn't timed. */
function providerTtfb(turn: TimedTurn): number | null {
  const { ttsTtfbMs, ttsPushMs, att } = turn;
  if (ttsTtfbMs === undefined || ttsPushMs === undefined) return null;
  const held = (att.gateway?.openerClipMs ?? 0) + (att.gateway?.pauseHoldMs ?? 0);
  return ms(ttsTtfbMs - ttsPushMs - held);
}

/** The receipt's `holds` and `audio` (see the module doc). */
export function attributionFields(turn: TimedTurn) {
  const { att, speakingAt } = turn;
  const firstAny = [att.openerAudioAt, speakingAt].filter((t): t is number => t !== undefined);
  return {
    holds: {
      actionClaimHoldMs: ms(att.holds.actionClaim),
      openerGateMs: ms(att.holds.openerGate),
      crisisHoldMs: ms(att.holds.crisis),
      unfinishedTurnMs: ms(att.unfinishedTurnMs),
      openerClipMs: ms(att.gateway?.openerClipMs),
      pauseHoldMs: ms(att.gateway?.pauseHoldMs),
    },
    audio: {
      firstAnyAudioMs: sinceStop(turn, firstAny.length ? Math.min(...firstAny) : undefined),
      firstReplyAudioMs: sinceStop(turn, speakingAt),
      providerTtfbMs: providerTtfb(turn),
    },
  };
}
