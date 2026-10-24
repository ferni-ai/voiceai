/**
 * Which of a turn's llm_metrics the TURN_RECEIPT reports.
 *
 * Every request on the agent's LLM reports to the session: the preemptive reply
 * LiveKit throws away when the caller's words change, a cache warm sent through
 * that LLM, the reply itself and the reply after a tool. The receipt used to keep
 * the first one. On prod (491 receipts, 10-21..10-23) 66 had 0 prompt tokens: a
 * cancelled stream's metric, with that stream's TTFT and no cache data, which
 * read as a cache miss ("43% misses" was 29% once they were left out; see
 * voiceai-evidence/latency-2026-10-23/llm-ttft-root-cause.md).
 *
 * So a metric is ranked: a request that ran to completion with usage beats one
 * that was cut but billed (the caller barged in), which beats one with no usage.
 * Among completed requests the first wins: on a tool turn that is the request the
 * caller waited on. Among cut ones the last wins: a dropped preemptive request
 * comes before the reply the caller cut. Metrics arrive when a stream ends, so
 * the request in flight at that moment is the one they measure. The receipt takes
 * its prompt, tools, director notes and lane from that same request (requestOf,
 * captured when the metric is kept), so one receipt never mixes two requests.
 *
 * @module agents/shared/turn-receipt-llm
 */
import type { LlmMetric } from './turn-metrics.js';
import type { PromptSection } from './prompt-sections.js';

/** 2: ran to completion with usage, 1: cut but billed, 0: no usage. */
function rank(m: LlmMetric): number {
  if (!(m.promptTokens > 0)) return 0;
  return m.cancelled === true ? 1 : 2;
}

/** The metric to keep for the turn once `next` arrives: `kept`, or `next`. */
export function replyMetric(kept: LlmMetric | undefined, next: LlmMetric): LlmMetric {
  if (kept === undefined) return next;
  const was = rank(kept);
  const now = rank(next);
  return now > was || (now === 1 && was === 1) ? next : kept;
}

/**
 * Keeps `next` as the turn's metric when it outranks the kept one, with the request
 * it measures (requestOf, taken now: the metric arrived when that request ended).
 */
export function keepLlm(
  turn: RequestView & { llm?: LlmMetric; llmRequest?: RequestView },
  next: LlmMetric
): void {
  if (replyMetric(turn.llm, next) !== next) return;
  turn.llm = next;
  turn.llmRequest = requestOf(turn);
}

/**
 * Thinking tokens: the plugin's reasoningTokens when it breaks them out, else
 * total − prompt − completion (Gemini's totalTokenCount includes thoughts). Null
 * when the metric carries no total.
 */
export function thoughtTokens(m: LlmMetric): number | null {
  if (m.reasoningTokens !== undefined && m.reasoningTokens > 0) return m.reasoningTokens;
  if (!(m.totalTokens !== undefined && m.totalTokens > 0)) return null;
  return Math.max(0, m.totalTokens - m.promptTokens - m.completionTokens);
}

/** What the receipt reports about one request: its prompt, tools, director notes and lane. */
export interface RequestView {
  sections: PromptSection[] | null;
  lane: { lane: 'fast' | 'main'; reason: string } | null;
  director: { offered: number; kept: number; droppedIdx: number[] };
  toolsOffered: number | null;
  toolSchemaChars?: number;
}

/** The request the turn's latest state describes. */
export const requestOf = (turn: RequestView): RequestView => ({
  sections: turn.sections,
  lane: turn.lane,
  director: turn.director,
  toolsOffered: turn.toolsOffered,
  toolSchemaChars: turn.toolSchemaChars,
});

/** The request the reported metric measures, else (none kept yet) the latest one. */
export function replyRequest(turn: RequestView & { llmRequest?: RequestView }): RequestView {
  return turn.llmRequest ?? requestOf(turn);
}

export interface TokensField {
  prompt: number;
  promptCached: number;
  completion: number;
  model: string | null;
  /** Added 2026-10-23: thinking tokens (null when unknown). */
  thought: number | null;
  /** Added 2026-10-23: the reported request was cut (barge-in); no completed request came. */
  cancelled: boolean;
}

/** The receipt's `tokens` field (names stable: dashboards and turn_metrics read them). */
export function tokensField(m: LlmMetric | undefined): TokensField | null {
  if (m === undefined) return null;
  return {
    prompt: m.promptTokens,
    promptCached: m.promptCachedTokens ?? 0,
    completion: m.completionTokens,
    model: m.metadata?.modelName ?? null,
    thought: thoughtTokens(m),
    cancelled: m.cancelled === true,
  };
}
