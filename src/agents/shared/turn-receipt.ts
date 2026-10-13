/**
 * One TURN_RECEIPT line per caller turn: what the model was given, what it did
 * and how long each step took, so "why did Ferni say that?" and "did this make
 * turns slower?" are answered from one line instead of a dozen grepped ones.
 *
 * Counts, ids, enums and timings only. Text is measured where it passes and
 * never kept: no transcript, reply, tool arguments, notes, names or numbers.
 *
 * A turn opens when the caller's turn is committed (end-of-utterance metric or
 * their message added) and is emitted when Ferni goes back to listening after
 * replying, when the next commit comes first ('superseded'), or at the end of
 * the call. Agent-initiated speech (greeting, check-ins) opens no turn.
 *
 * `tokens` carries the model's own counts for the turn's first request.
 *
 * @module agents/shared/turn-receipt
 */
import { onGatewayFirstAudio } from '../../speech/tts-gateway/first-audio-observer.js';
import { createLogger } from '../../utils/safe-logger.js';
import { callerTurn, fastLaneEnabled, laneReason } from '../model-provider/fast-lane.js';
import { toolRetrievalMode } from '../../tools/retrieval/turn-tool-retrieval.js';
import { llmReady, type EouMetric, type LlmMetric } from './turn-metrics.js';

export const TURN_RECEIPT_VERSION = 1;
export type UserKind = 'owner' | 'eval' | 'other';

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

/** A chat item as far as the receipt reads it (llm.ChatItem). */
interface ItemView {
  type?: string;
  role?: string;
  textContent?: string;
}

const isHandoffTool = (name: string): boolean => /^handoffto/i.test(name); // handoff-factory.ts

interface OpenTurn {
  user: boolean;
  personaAtStart: string | null;
  eou?: EouMetric;
  llm?: LlmMetric;
  ttsTtfbMs?: number;
  ttsPushMs?: number;
  ttsCancelled: boolean;
  thinkingAt?: number;
  speakingAt?: number;
  /** Ferni spoke, a tool ran or a reply was added: the reply is under way. */
  replied: boolean;
  requests: number;
  lane: { lane: 'fast' | 'main'; reason: string } | null;
  toolsOffered: number | null;
  called: string[];
  toolErrors: number;
  reply: { messages: number; chars: number; sentences: number; interrupted: boolean };
}

export interface TurnReceiptOptions {
  sessionId: string;
  userId: string | undefined;
  /** The persona on the call now (follows handoffs). */
  persona: () => string | null | undefined;
  emit?: (receipt: TurnReceipt) => void;
  now?: () => number;
  env?: Record<string, string | undefined>;
}

export type TurnReceipt = ReturnType<TurnReceiptRecorder['build']>;
export type EndedBy = 'listening' | 'superseded' | 'session_end';

const log = createLogger({ module: 'TurnReceipt' });
const ms = (n: number | undefined | null): number | null =>
  n === undefined || n === null || !Number.isFinite(n) ? null : Math.round(n);

export class TurnReceiptRecorder {
  private turn: OpenTurn | null = null;
  private count = 0;
  private readonly userKind: UserKind;
  private readonly now: () => number;

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
      lane: null,
      toolsOffered: null,
      called: [],
      toolErrors: 0,
      reply: { messages: 0, chars: 0, sentences: 0, interrupted: false },
    };
    return this.turn;
  }

  /** The caller's turn was committed. A second commit after a reply has begun starts a new turn. */
  onCommit(): void {
    if (this.turn?.user && this.turn.replied) this.finish('superseded');
    const turn = this.open();
    if (!turn.user) turn.personaAtStart = this.opts.persona() ?? null;
    turn.user = true;
  }

  onMetric(metric: { type?: string } & Record<string, unknown>): void {
    if (metric.type === 'eou_metrics') {
      this.onCommit();
      this.open().eou = metric as unknown as EouMetric;
    } else if (metric.type === 'llm_metrics') {
      const turn = this.open();
      turn.llm ??= metric as unknown as LlmMetric;
    } else if (metric.type === 'tts_metrics' && this.turn) {
      this.turn.ttsTtfbMs ??= metric.ttfbMs as number;
      if (metric.cancelled) this.turn.ttsCancelled = true;
    }
  }

  /** A request about to go to the model (preemptive, final or after tools): the last one counts. */
  onRequest(items: readonly ItemView[], toolsOffered: number): void {
    const turn = this.open();
    turn.requests += 1;
    turn.toolsOffered = toolsOffered;
    if (fastLaneEnabled(this.opts.env)) {
      const reason = laneReason(callerTurn(items as never));
      turn.lane = { lane: reason === 'chat' ? 'fast' : 'main', reason };
    }
  }

  /**
   * The TTS gateway's first audio for this reply (first-audio-observer.ts). Prod speaks through
   * the gateway, which never emits the SDK's tts_metrics, so ttsTtfbMs was null in every receipt.
   */
  onGatewayAudio(ttfbMs: number, pushMs?: number): void {
    if (!this.turn) return;
    this.turn.ttsTtfbMs ??= ttfbMs;
    if (pushMs !== undefined) this.turn.ttsPushMs ??= pushMs;
  }

  onItem(item: { role?: string; interrupted?: boolean; textContent?: string } | undefined): void {
    if (item?.role === 'user') return this.onCommit();
    if (item?.role !== 'assistant' || !this.turn) return;
    const text = item.textContent ?? '';
    const reply = this.turn.reply;
    reply.messages += 1;
    reply.chars += text.length;
    reply.sentences += sentenceCount(text);
    if (item.interrupted) reply.interrupted = true;
    this.turn.replied = true;
  }

  onToolsExecuted(ev: {
    functionCalls?: Array<{ name?: string }>;
    functionCallOutputs?: Array<{ isError?: boolean } | undefined>;
  }): void {
    const turn = this.open();
    turn.called.push(...(ev.functionCalls ?? []).map((c) => c.name ?? '?'));
    turn.toolErrors += (ev.functionCallOutputs ?? []).filter((o) => o?.isError).length;
    turn.replied = true;
  }

  onAgentState(state: string | undefined): void {
    if (state === 'thinking') this.open().thinkingAt ??= this.now();
    if (state === 'speaking') {
      const turn = this.open();
      turn.speakingAt ??= this.now();
      turn.replied = true;
    }
    if (state !== 'listening' || !this.turn?.replied) return;
    if (this.turn.user) this.finish('listening');
    else this.turn = null; // Ferni spoke unprompted: no caller turn to account for
  }

  /** The call is over: emit a caller turn still open. */
  flush(): void {
    if (this.turn?.user) this.finish('session_end');
    this.turn = null;
  }

  private finish(endedBy: EndedBy): void {
    const turn = this.turn;
    this.turn = null;
    if (!turn) return;
    this.count += 1;
    const receipt = this.build(turn, endedBy);
    // Prod 2026-10-12: after a cut-off, LiveKit stopped adding Ferni's replies to the
    // history, and the model re-answered questions it had already answered.
    if (receipt.reply.unrecorded) {
      log.warn({ sessionId: this.opts.sessionId, turn: this.count }, 'REPLY_NOT_RECORDED');
    }
    try {
      (this.opts.emit ?? ((r) => log.info(r, 'TURN_RECEIPT')))(receipt);
    } catch (error) {
      log.warn({ error: String(error) }, 'turn receipt not emitted');
    }
  }

  private timing(turn: OpenTurn, endedBy: EndedBy): Record<string, number | null> {
    const { eou, llm, thinkingAt, speakingAt } = turn;
    const stoppedAt = eou?.lastSpeakingTimeMs ?? 0;
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
      firstAudioMs: since(stoppedAt, speakingAt),
      /** End of the caller's speech to the end of the reply. */
      replyDoneMs: endedBy === 'listening' ? since(stoppedAt, this.now()) : null,
    };
  }

  build(turn: OpenTurn, endedBy: EndedBy) {
    const { llm } = turn;
    const personaId = this.opts.persona() ?? null;
    const handoffTool = turn.called.find(isHandoffTool) ?? null;
    return {
      event: 'TURN_RECEIPT' as const,
      v: TURN_RECEIPT_VERSION,
      sessionId: this.opts.sessionId,
      turn: this.count,
      personaId,
      userKind: this.userKind,
      endedBy,
      timing: this.timing(turn, endedBy),
      tokens: llm
        ? {
            prompt: llm.promptTokens,
            promptCached: llm.promptCachedTokens ?? 0,
            completion: llm.completionTokens,
          }
        : null,
      prompt: {
        requests: turn.requests,
        lane: turn.lane,
      },
      tools: {
        offered: turn.toolsOffered,
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
        unrecorded:
          endedBy === 'listening' && turn.speakingAt !== undefined && turn.reply.messages === 0,
      },
    };
  }
}

// One recorder per AgentSession, so llmNode can find it.
const recorders = new WeakMap<object, TurnReceiptRecorder>();

/** llmNode: the request as it goes to the model, with the tools it carries. */
export function noteRequest(
  session: object,
  request: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> }
): void {
  recorders
    .get(session)
    ?.onRequest(request.items as ItemView[], Object.keys(tools.functionTools ?? {}).length);
}

interface EventSource {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
}

/**
 * Record a TURN_RECEIPT per caller turn on this session. Returns a detach that
 * emits a turn still open and stops listening.
 */
export function attachTurnReceipts(session: EventSource, opts: TurnReceiptOptions): () => void {
  const rec = new TurnReceiptRecorder(opts);
  recorders.set(session, rec);
  const handlers: Array<[string, (ev: unknown) => void]> = [
    [
      'metrics_collected',
      (ev) => {
        const m = (ev as { metrics?: { type?: string } } | undefined)?.metrics;
        if (m) rec.onMetric(m as never);
      },
    ],
    ['conversation_item_added', (ev) => rec.onItem((ev as { item?: never } | undefined)?.item)],
    ['function_tools_executed', (ev) => rec.onToolsExecuted((ev ?? {}) as never)],
    [
      'agent_state_changed',
      (ev) => rec.onAgentState((ev as { newState?: string } | undefined)?.newState),
    ],
    ['close', () => rec.flush()],
  ];
  for (const [event, handler] of handlers) session.on(event, handler);
  const offAudio = onGatewayFirstAudio((sessionId, ttfbMs, pushMs) => {
    if (sessionId === opts.sessionId) rec.onGatewayAudio(ttfbMs, pushMs);
  });
  return () => {
    offAudio();
    rec.flush();
    for (const [event, handler] of handlers) session.off(event, handler);
    recorders.delete(session);
  };
}
