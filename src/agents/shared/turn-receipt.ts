/**
 * One TURN_RECEIPT line per caller turn: what the model was given, what it did
 * and how long each step took, so "why did Ferni say that?" and "did this make
 * turns slower?" are answered from one line instead of a dozen grepped ones.
 *
 * Counts, ids, enums and timings only. Text is measured where it passes and
 * never kept: no transcript, reply, tool arguments, notes, names or numbers
 * (only a SHA-256 digest of the last reply, to spot a cut reply repeating it).
 *
 * A turn opens when the caller's turn is committed (end-of-utterance metric or
 * their message added) and is emitted when Ferni goes back to listening after
 * replying, when the next commit comes first ('superseded'), or at the end of
 * the call. Agent-initiated speech (greeting, check-ins) opens no turn.
 *
 * LiveKit also says "listening" when it pauses a reply for the caller's voice
 * (interruptByAudioActivity). That is not the end of the reply: it resumes
 * ("speaking", then "listening") or is cut, and a cut reply's item can land
 * just after the caller's next commit. The turn stays open through the pause,
 * and a cut turn waits for that item before it is emitted.
 *
 * Prompt tokens per section are estimates (chars/4, labelled), over the chat
 * context only; `tokens` carries the model's own counts, tool schemas included.
 *
 * Per-turn decisions logged elsewhere are joined here, so a latency experiment
 * can be credited turn by turn: `preemptive` (PREEMPTIVE_DECISION, our LiveKit
 * patch), `pauseHoldMs` (PAUSE_HOLD_RELEASED, pause-hold.ts), `bargeInSource`
 * (BARGE_IN_FASTPATH / BARGE_IN_DECISION, live-call-behaviors.ts; 'vad' when
 * LiveKit paused Ferni for the caller's voice, 'other' for any other cut-off),
 * and the turn detection and interruption mode LiveKit resolved for the turn.
 * `holds` and `audio` say which deliberate hold kept the first words back and
 * when the caller first heard anything (turn-receipt-timing.ts); `flags` and
 * `commit` say which arm of an A/B the turn ran in (turn-receipt-flags.ts).
 *
 * @module agents/shared/turn-receipt
 */
import { createHash } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { callerTurn, fastLaneEnabled, laneReason } from '../model-provider/fast-lane.js';
import { toolRetrievalMode } from '../../tools/retrieval/turn-tool-retrieval.js';
import type { EouMetric, LlmMetric } from './turn-metrics.js';
import { eotReceiptField, PendingEot, type EotCall } from './turn-receipt-eot.js';
import { keepLlm, replyRequest, tokensField, type RequestView } from './turn-receipt-llm.js';
import { receiptBuild } from './turn-receipt-flags.js';
import { PendingPreemptive, type PreemptiveCause } from './preemptive-cause.js';
import { latencyArmFor } from '../../services/platform/latency-arm.js';
import * as timed from './turn-receipt-timing.js';
import * as steps from './turn-receipt-tool-timing.js';
import type { GatewayHolds } from '../../speech/tts-gateway/first-audio-observer.js';
import type { TurnTimingKind } from '../../speech/output-control/turn-timing.js';
import {
  promptSections,
  type ItemView,
  type PromptSection,
  type ReminderNote,
} from './prompt-sections.js';

export const TURN_RECEIPT_VERSION = 1;
export type UserKind = 'owner' | 'eval' | 'other';
/** Whether LiveKit kept the reply it generated before the commit. */
export type Preemptive = 'reused' | 'dropped' | 'none';
/** What stopped Ferni for the caller (see the module doc). */
export type BargeInSource = 'fastpath' | 'adaptive' | 'vad';

/** owner (TURN_RECEIPT_OWNER_UIDS), eval (voice-eval users) or other. Never the uid itself. */
export function userKindOf(
  userId: string | undefined,
  env: Record<string, string | undefined> = process.env
): UserKind {
  if (!userId) return 'other';
  if (userId.startsWith('voice-eval-')) return 'eval';
  const owners = (env.TURN_RECEIPT_OWNER_UIDS ?? '').split(',').map((s) => s.trim());
  return owners.includes(userId) ? 'owner' : 'other';
}

/** Sentences in a reply, counted and forgotten. */
export function sentenceCount(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) ?? []).length);
}

const isHandoffTool = (name: string): boolean => /^handoffto/i.test(name); // handoff-factory.ts

interface OpenTurn {
  user: boolean;
  personaAtStart: string | null;
  eou?: EouMetric;
  llm?: LlmMetric;
  /** The request `llm` measures: its prompt, tools, director and lane (turn-receipt-llm.ts). */
  llmRequest?: RequestView;
  ttsTtfbMs?: number;
  ttsPushMs?: number;
  ttsCancelled: boolean;
  thinkingAt?: number;
  speakingAt?: number;
  /** Ferni spoke, a tool ran or a reply was added: the reply is under way. */
  replied: boolean;
  requests: number;
  sections: PromptSection[] | null;
  lane: { lane: 'fast' | 'main'; reason: string } | null;
  director: Omit<ReminderNote, 'reminder' | 'directorNotes'> & { kept: number };
  toolsOffered: number | null;
  toolSchemaChars?: number;
  called: string[];
  toolErrors: number;
  reply: {
    messages: number;
    chars: number;
    sentences: number;
    interrupted: boolean;
    /** A cut reply was committed with the previous reply's exact text (livekit/agents-js#2566). */
    repeatsPrevious: boolean;
  };
  /** When LiveKit paused the reply for the caller's voice and said "listening". */
  pausedAt?: number;
  eot: EotCall | null;
  preemptive: Preemptive;
  preemptiveCause?: PreemptiveCause;
  pauseHoldMs: number;
  bargeInSource: BargeInSource | null;
  handling: TurnHandling | null;
  att: timed.TurnAttribution; // holds and first audio (turn-receipt-timing.ts)
  steps: steps.ToolSteps; // requests, tool runs, answer audio (turn-receipt-tool-timing.ts)
}

/** How turns end and how barge-in works on the session, read at the commit. */
export interface TurnHandling {
  turnDetection: string;
  interruptionMode: string;
}

export interface TurnReceiptOptions {
  sessionId: string;
  userId: string | undefined;
  /** The persona on the call now (follows handoffs). */
  persona: () => string | null | undefined;
  /** A phone (SIP) caller; undefined when the call path is not known. */
  phoneCaller?: boolean;
  /** The session's turn handling now (attachTurnReceipts reads LiveKit's activity). */
  handling?: () => TurnHandling;
  emit?: (receipt: TurnReceipt) => void;
  now?: () => number;
  env?: Record<string, string | undefined>;
}

export type TurnReceipt = ReturnType<TurnReceiptRecorder['build']>;
export type EndedBy = 'listening' | 'superseded' | 'session_end';

const log = createLogger({ module: 'TurnReceipt' });
export const logReceipt = (receipt: TurnReceipt): void => log.info(receipt, 'TURN_RECEIPT');
/** Audio before a pause after which a cut reply must have words to commit. */
const HEARD_MS = 1000;

export class TurnReceiptRecorder {
  private turn: OpenTurn | null = null;
  private count = 0;
  private reminder: ReminderNote | null = null;
  /** The latest end-of-turn prediction (eot_prediction); its commit claims it. */
  private readonly pendingEot = new PendingEot(() => this.now());
  private readonly pendingHold = new timed.PendingUnfinished(() => this.now());
  /** LiveKit's preemptive decision, made just before the commit it belongs to. */
  private readonly pendingPreemptive = new PendingPreemptive();
  private readonly userKind: UserKind;
  private readonly now: () => number;
  /** A handoff turn whose swap hadn't landed when it ended: emitted once the outcome is known. */
  private heldHandoff: { receipt: TurnReceipt; from: string | null } | null = null;
  /** A paused reply cut by the caller's next commit, waiting for its interrupted item. */
  private heldCut: { turn: OpenTurn; n: number } | null = null;
  /** Digest of the last reply text added, to spot a cut reply committed with it again. */
  private lastReplyDigest: string | null = null;

  constructor(private readonly opts: TurnReceiptOptions) {
    this.userKind = userKindOf(opts.userId, opts.env);
    this.now = opts.now ?? Date.now;
  }

  private open(): OpenTurn {
    this.turn ??= {
      user: false,
      personaAtStart: null,
      ttsCancelled: false,
      replied: false,
      requests: 0,
      sections: null,
      lane: null,
      director: { offered: 0, kept: 0, droppedIdx: [] },
      toolsOffered: null,
      called: [],
      toolErrors: 0,
      reply: { messages: 0, chars: 0, sentences: 0, interrupted: false, repeatsPrevious: false },
      eot: null,
      preemptive: 'none',
      pauseHoldMs: 0,
      bargeInSource: null,
      handling: null,
      att: timed.newAttribution(),
      steps: steps.newToolSteps(),
    };
    return this.turn;
  }

  /** The caller's turn was committed. A second commit after a reply has begun starts a new turn. */
  onCommit(): void {
    this.releaseHandoff();
    this.releaseCut();
    if (this.turn?.user && this.turn.replied) this.finish('superseded');
    const turn = this.open();
    if (!turn.user) turn.personaAtStart = this.opts.persona() ?? null;
    turn.user = true;
    turn.handling ??= this.opts.handling?.() ?? null;
    this.pendingEot.claim(turn);
    this.pendingHold.claim(turn);
    this.pendingPreemptive.claim(turn);
  }

  /** LiveKit's end-of-turn model judged the caller's pause (turn-receipt-eot.ts). */
  readonly onEot = (call: EotCall | null): void => this.pendingEot.note(call);

  /** LiveKit decided whether to keep its preemptive reply (PREEMPTIVE_DECISION); the commit follows. */
  readonly onPreemptive = (used: boolean, cause?: PreemptiveCause): void =>
    this.pendingPreemptive.note(used, cause);

  /** The reply's first audio waited this long for the caller's pause (pause-hold.ts). */
  onPauseHold(heldMs: number): void {
    if (this.turn) this.turn.pauseHoldMs = Math.max(this.turn.pauseHoldMs, Math.round(heldMs));
  }

  /** A hold or opening clip this turn (turn-timing.ts); an unfinished turn's is claimed at its commit. */
  onTiming(kind: TurnTimingKind, heldMs: number): void {
    if (kind === 'unfinishedTurn') this.pendingHold.note(heldMs);
    else if (steps.isStepKind(kind)) steps.noteStep(this.open().steps, kind, heldMs, this.now);
    else timed.noteTiming(this.open(), kind, heldMs, this.now());
  }

  /** Ferni was stopped for the caller; the first decision that did it counts. */
  onBargeIn(source: BargeInSource): void {
    if (this.turn) this.turn.bargeInSource ??= source;
  }

  onMetric(metric: { type?: string } & Record<string, unknown>): void {
    if (metric.type === 'eou_metrics') {
      this.onCommit();
      this.open().eou = metric as unknown as EouMetric;
    } else if (metric.type === 'llm_metrics') {
      keepLlm(this.open(), metric as unknown as LlmMetric);
      steps.noteRequestMetric(this.open().steps, metric as never);
    } else if (metric.type === 'tts_metrics' && this.turn) {
      this.turn.ttsTtfbMs ??= metric.ttfbMs as number;
      if (metric.cancelled) this.turn.ttsCancelled = true;
    }
  }

  onReminder(note: ReminderNote): void {
    this.reminder = note;
  }

  /** A request to the model (preemptive, final or after tools): the last one's prompt counts. */
  onRequest(items: readonly ItemView[], toolsOffered: number, schemaChars?: number): void {
    const turn = this.open();
    const note = this.reminder;
    this.reminder = null;
    turn.requests += 1;
    steps.noteRequestSent(turn.steps, this.now);
    turn.sections = promptSections(items, note ?? undefined);
    turn.toolsOffered = toolsOffered;
    turn.toolSchemaChars = schemaChars;
    turn.director = note
      ? {
          offered: note.offered,
          kept: note.offered - note.droppedIdx.length,
          droppedIdx: note.droppedIdx,
        }
      : { offered: 0, kept: 0, droppedIdx: [] };
    if (fastLaneEnabled(this.opts.env)) {
      const reason = laneReason(callerTurn(items as never));
      turn.lane = { lane: reason === 'chat' ? 'fast' : 'main', reason };
    }
  }

  /**
   * The TTS gateway's first audio for this reply (first-audio-observer.ts). Prod speaks through
   * the gateway, which never emits the SDK's tts_metrics, so ttsTtfbMs was null in every receipt.
   */
  onGatewayAudio(ttfbMs: number, pushMs?: number, holds?: GatewayHolds): void {
    if (!this.turn) return;
    if (this.turn.ttsTtfbMs === undefined) this.turn.att.gateway = holds;
    this.turn.ttsTtfbMs ??= ttfbMs;
    if (pushMs !== undefined) this.turn.ttsPushMs ??= pushMs;
  }

  onItem(item: { role?: string; interrupted?: boolean; textContent?: string } | undefined): void {
    if (item?.role === 'user') return this.onCommit();
    if (item?.role !== 'assistant') return;
    const text = item.textContent ?? '';
    const interrupted = item.interrupted === true;
    const repeats = this.repeatsLastReply(text, interrupted);
    const owner = this.replyOwner(interrupted);
    if (!owner) return;
    const { reply } = owner;
    reply.messages += 1;
    reply.chars += text.length;
    reply.sentences += sentenceCount(text);
    reply.interrupted ||= interrupted;
    reply.repeatsPrevious ||= repeats;
    owner.replied = true;
    if (owner === this.heldCut?.turn) this.releaseCut();
  }

  /** A cut reply committed with the text of the reply added before it. */
  private repeatsLastReply(text: string, interrupted: boolean): boolean {
    if (!text) return false;
    const digest = createHash('sha256').update(text).digest('base64url');
    const repeats = interrupted && digest === this.lastReplyDigest;
    this.lastReplyDigest = digest;
    return repeats;
  }

  /** A cut reply's item, after the commit that cut it and before this turn's own audio. */
  private replyOwner(interrupted: boolean): OpenTurn | null {
    const cut = this.heldCut;
    if (interrupted && cut && this.turn?.speakingAt === undefined) return cut.turn;
    return this.turn;
  }

  /** A tool started running (`name` given) or returned (turn-receipt-tool-timing.ts). */
  readonly onToolRun = (callId: string, name?: string): void =>
    steps.noteToolRun(this.open().steps, callId, name, this.now);
  onToolsExecuted(ev: steps.ToolsExecutedView): void {
    const turn = this.open();
    turn.called.push(...(ev.functionCalls ?? []).map((c) => c.name ?? '?'));
    turn.toolErrors += (ev.functionCallOutputs ?? []).filter((o) => o?.isError).length;
    steps.endToolRuns(turn.steps, this.now, ev);
    turn.replied = true;
  }

  /** `pausedForCaller`: this "listening" is LiveKit pausing the reply for the caller's voice. */
  onAgentState(state: string | undefined, pausedForCaller = false): void {
    if (state === 'thinking') this.open().thinkingAt ??= this.now();
    if (state === 'speaking') {
      if (this.turn?.speakingAt === undefined) this.releaseCut(); // this turn's own audio
      const turn = this.open();
      turn.speakingAt ??= this.now();
      steps.noteSpeaking(turn.steps, this.now);
      turn.replied = true;
    }
    if (state !== 'listening' || !this.turn?.replied) return;
    // Prod 2026-10-14..17: 9 of 12 REPLY_NOT_RECORDED fired at this pause, and in each
    // the reply's item was added once it resumed or was cut.
    if (pausedForCaller) {
      this.turn.pausedAt ??= this.now();
      return;
    }
    if (this.turn.user) this.finish('listening');
    else this.turn = null; // Ferni spoke unprompted: no caller turn to account for
  }

  /** The call is over: emit a caller turn still open. */
  flush(): void {
    this.releaseHandoff();
    this.releaseCut();
    if (this.turn?.user) this.finish('session_end');
    this.turn = null;
  }

  /**
   * The held handoff turn, with the persona on the call now. The swap lands after the
   * outgoing persona's goodbye, so the turn's own end still saw the old persona: prod
   * receipts said "stayed" for handoffs that worked (4 of 6, week of 2026-10-12). By the
   * caller's next turn, or the call's end, the swap has landed or failed.
   */
  private releaseHandoff(): void {
    const held = this.heldHandoff;
    this.heldHandoff = null;
    if (!held) return;
    const personaId = this.opts.persona() ?? null;
    const result = personaId !== held.from ? 'switched' : 'stayed';
    const { receipt } = held;
    this.emit({
      ...receipt,
      personaId,
      tools: { ...receipt.tools, handoff: { ...receipt.tools.handoff, result } },
    });
  }

  /** The cut turn, with whatever its interrupted item brought (or nothing: cut before a word). */
  private releaseCut(): void {
    const cut = this.heldCut;
    this.heldCut = null;
    if (cut) this.report(this.build(cut.turn, 'superseded', cut.n));
  }

  private emit(receipt: TurnReceipt): void {
    try {
      (this.opts.emit ?? logReceipt)(receipt);
    } catch (error) {
      log.warn({ error: String(error) }, 'turn receipt not emitted');
    }
  }

  private finish(endedBy: EndedBy): void {
    const turn = this.turn;
    this.turn = null;
    if (!turn) return;
    this.count += 1;
    if (endedBy === 'superseded' && turn.pausedAt !== undefined && turn.reply.messages === 0) {
      this.heldCut = { turn, n: this.count };
      return;
    }
    const receipt = this.build(turn, endedBy);
    if (receipt.tools.handoff.result === 'stayed' && endedBy === 'listening') {
      this.warn(receipt);
      this.heldHandoff = { receipt, from: turn.personaAtStart };
      return;
    }
    this.report(receipt);
  }

  private warn(receipt: TurnReceipt): void {
    const at = { sessionId: this.opts.sessionId, turn: receipt.turn };
    // Prod 2026-10-12: after a cut-off, LiveKit stopped adding Ferni's replies to the
    // history, and the model re-answered questions it had already answered.
    if (receipt.reply.unrecorded) log.warn(at, 'REPLY_NOT_RECORDED');
    // Prod 2026-10-16: a cut reply was committed with the previous reply's text, so the
    // history lost what Ferni had begun to say (ROTATED_SEGMENT_FIX, #1585).
    if (receipt.reply.repeatsPrevious) log.warn(at, 'REPLY_TEXT_REPEATED');
  }

  private report(receipt: TurnReceipt): void {
    this.warn(receipt);
    this.emit(receipt);
  }

  /**
   * No reply reached the history after Ferni spoke: at the end of the reply, or after a
   * reply paused a second or more in, then cut. By then the synchronizer has paced out
   * words, so a cut that commits nothing lost them.
   */
  private unrecorded(turn: OpenTurn, endedBy: EndedBy): boolean {
    const { speakingAt, pausedAt } = turn;
    if (turn.reply.messages > 0 || speakingAt === undefined) return false;
    if (endedBy === 'listening') return true;
    return endedBy === 'superseded' && pausedAt !== undefined && pausedAt - speakingAt >= HEARD_MS;
  }

  build(turn: OpenTurn, endedBy: EndedBy, n = this.count) {
    const { llm } = turn;
    const personaId = this.opts.persona() ?? null;
    const handoffTool = turn.called.find(isHandoffTool) ?? null;
    const req = replyRequest(turn); // the request the tokens are from
    const sections = req.sections ?? [];
    return steps.withToolTiming(turn, {
      event: 'TURN_RECEIPT' as const,
      v: TURN_RECEIPT_VERSION,
      sessionId: this.opts.sessionId,
      turn: n,
      personaId,
      userKind: this.userKind,
      endedBy,
      timing: timed.timingField(turn, endedBy === 'listening' ? this.now() : undefined),
      tokens: tokensField(llm),
      prompt: {
        requests: turn.requests,
        estimate: 'chars/4' as const,
        totalTokensEst: sections.reduce((n, s) => n + s.tokensEst, 0),
        sections,
        lane: req.lane,
      },
      director: req.director,
      tools: {
        offered: req.toolsOffered,
        schemaChars: req.toolSchemaChars ?? null, // TURN_TOKEN_RECEIPT=on (turn-input-tokens.ts)
        retrieval: toolRetrievalMode(),
        called: turn.called,
        errors: turn.toolErrors,
        handoff: {
          attempted: handoffTool !== null,
          tool: handoffTool,
          result: handoffTool ? (personaId !== turn.personaAtStart ? 'switched' : 'stayed') : null,
        },
      },
      reply: {
        ...turn.reply,
        ttsCancelled: turn.ttsCancelled,
        /** Ferni spoke and the caller's turn ended, but no reply reached the chat history. */
        unrecorded: this.unrecorded(turn, endedBy),
      },
      preemptive: turn.preemptive,
      preemptiveCause: turn.preemptiveCause ?? null, // why (preemptive-cause.ts)
      latencyArm: latencyArmFor(this.opts.sessionId), // LATENCY_ARM_PERCENT (latency-arm.ts)
      pauseHoldMs: turn.pauseHoldMs,
      callerPath:
        this.opts.phoneCaller === undefined ? 'unknown' : this.opts.phoneCaller ? 'phone' : 'web',
      turnDetection: turn.handling?.turnDetection ?? 'unknown',
      interruptionMode: turn.handling?.interruptionMode ?? 'unknown',
      bargeInSource: turn.bargeInSource ?? (turn.reply.interrupted ? 'other' : null),
      ...eotReceiptField(turn.eot),
      ...timed.attributionFields(turn),
      ...receiptBuild(this.opts.env),
    });
  }
}
