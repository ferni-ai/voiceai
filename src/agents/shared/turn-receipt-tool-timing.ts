/**
 * Tool-turn timings for a TURN_RECEIPT (turn-receipt.ts), so a tool turn's wait
 * can be split into its model requests, its tools and the answer's own audio
 * (voiceai-evidence latency-2026-10-25/tool-turns/DESIGN.md section 6). Ids and
 * numbers only. Every `...Ms` is from the end of the caller's speech, like
 * timing.firstAudioMs; null when that end is unknown.
 *
 * - `timing.requests[]`: one entry per llm_metrics on the turn, by start time.
 *   Each metric arrives when its request ends, so start = timestamp - durationMs.
 *   A dropped preemptive request is `cancelled`; it can start before the stop.
 * - `tools.runs[]` / `tools.execMs{}`: each tool from when the SDK starts running
 *   it to its result (the speech handle's function_call and function_call_output
 *   items, the pattern tool-hum.ts uses). A preemptive tool call never runs.
 * - `audio.answerAudioMs`: first audio of the reply to a request sent after a tool
 *   started. A lead-in ("Let me look.") plays before that request is sent (the SDK
 *   waits for its playout), so firstAudioMs is the lead-in and this is the answer.
 *   Null on a turn with no request after its tools (a handoff has none).
 * - `audio.ackClipMs`: an acknowledgement clip on the side track reached the wire
 *   (TOOL_ACK_CLIP reports it through turn-timing.ts); it counts as first audio.
 * - `timing.handoffSteps`: llm-handoff.ts's voiceSwitch event, lock and start
 *   messages, to split the handoff's wait between the tool and the goodbye.
 * - `tools.outcomes[]`: per executed tool, in the order of `tools.called`, what it came to
 *   (data, no_data, unconfigured, error, not_connected; tool-outcome.ts), or unknown when its
 *   output isn't in the event. The output is read where it passes and only the enum is kept.
 *
 * These hooks run inside the SDK's tool start (SpeechHandle._itemAdded loops its
 * callbacks with no catch), llmNode and the session's events, so none of them
 * may throw: each is guarded, clocks are read inside the guard, and the first
 * failure is logged once at debug. A receipt that can't be timed loses these
 * fields, never the turn.
 *
 * @module agents/shared/turn-receipt-tool-timing
 */
import type { TurnTimingKind } from '../../speech/output-control/turn-timing.js';
import { receiptToolOutcome, type ReceiptToolOutcome } from '../voice-agent/tool-outcome.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { EouMetric, LlmMetric } from './turn-metrics.js';

const log = createLogger({ module: 'TurnReceiptToolTiming' });
let failureLogged = false;

/** Receipt bookkeeping never throws into the agent (see the module doc). */
function safely(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (failureLogged) return;
    failureLogged = true;
    log.debug({ error: String(error) }, 'tool-turn receipt timing skipped');
  }
}

/** Kept per turn: room for preemptive + 5 requests, and a few tools. */
const MAX_ENTRIES = 8;

export type HandoffStep = 'handoffEvent' | 'handoffLock' | 'handoffPublished';
export type StepKind = 'ackClip' | HandoffStep;

interface RequestTimes {
  startAt: number;
  ttftMs: number | null;
  durationMs: number;
  cancelled: boolean;
}

export interface ToolSteps {
  requests: RequestTimes[];
  runs: Map<string, { name: string; startAt: number; endAt?: number }>;
  /** The first request sent after a tool started. */
  afterToolRequestAt?: number;
  answerAt?: number;
  ackClipAt?: number;
  handoff: Partial<Record<HandoffStep, number>>;
  outcomes: ReceiptToolOutcome[];
}

export const newToolSteps = (): ToolSteps => ({
  requests: [],
  runs: new Map(),
  handoff: {},
  outcomes: [],
});

/** function_tools_executed, as turn-receipt.ts reads it. */
export interface ToolsExecutedView {
  functionCalls?: Array<{ name?: string; callId?: string }>;
  functionCallOutputs?: Array<{ isError?: boolean; output?: unknown; callId?: string } | undefined>;
}

export const isStepKind = (kind: TurnTimingKind): kind is StepKind =>
  kind === 'ackClip' || kind.startsWith('handoff');

/** turn-timing.ts: an ack clip (`ms` until it reaches the wire) or a handoff step. */
export function noteStep(s: ToolSteps, kind: StepKind, ms: number, now: () => number): void {
  safely(() => {
    if (kind === 'ackClip') s.ackClipAt ??= now() + Math.max(0, ms);
    else s.handoff[kind] ??= now();
  });
}

/** An llm_metrics on the turn. */
export function noteRequestMetric(s: ToolSteps, m: LlmMetric): void {
  safely(() => {
    if (m.timestamp === undefined || s.requests.length >= MAX_ENTRIES) return;
    const durationMs = Math.max(0, m.durationMs ?? 0);
    s.requests.push({
      startAt: m.timestamp - durationMs,
      ttftMs: m.ttftMs >= 0 ? m.ttftMs : null, // -1: no token before the stream closed
      durationMs,
      cancelled: m.cancelled === true,
    });
  });
}

/** llmNode sent a request: the first after a tool started is the answer's. */
export function noteRequestSent(s: ToolSteps, now: () => number): void {
  safely(() => {
    if (s.runs.size > 0) s.afterToolRequestAt ??= now();
  });
}

/** A tool started (`name` given) or returned its result. */
export function noteToolRun(
  s: ToolSteps,
  callId: string,
  name: string | undefined,
  now: () => number
): void {
  safely(() => {
    const run = s.runs.get(callId);
    if (name === undefined) {
      if (run) run.endAt ??= now();
    } else if (!run && s.runs.size < MAX_ENTRIES) s.runs.set(callId, { name, startAt: now() });
  });
}

/** function_tools_executed: every tool on the step has returned, with what each came to. */
export function endToolRuns(s: ToolSteps, now: () => number, ev?: ToolsExecutedView): void {
  safely(() => {
    for (const run of s.runs.values()) run.endAt ??= now();
  });
  safely(() => {
    const outs = ev?.functionCallOutputs ?? [];
    const calls = ev?.functionCalls ?? [];
    // With call ids, only an id match counts: a missing output must not take its neighbour's.
    const byId = calls.some((c) => c.callId);
    calls.forEach((call, i) => {
      const out = byId ? outs.find((o) => o?.callId && o.callId === call.callId) : outs[i];
      if (s.outcomes.length < MAX_ENTRIES)
        s.outcomes.push(out ? receiptToolOutcome(out.output, out.isError === true) : 'unknown');
    });
  });
}

/** Ferni's audio started: after a request sent after the tools, that is the answer. */
export function noteSpeaking(s: ToolSteps, now: () => number): void {
  safely(() => {
    if (s.afterToolRequestAt !== undefined) s.answerAt ??= now();
  });
}

interface ItemLike {
  type?: string;
  callId?: string;
  name?: string;
}
interface SpeechLike {
  _addItemAddedCallback?: (cb: (item: ItemLike) => void) => void;
  _removeItemAddedCallback?: (cb: (item: ItemLike) => void) => void;
  addDoneCallback?: (cb: () => void) => void;
}

/** speech_created: report each tool the speech runs, as it starts and as it returns. */
export function watchToolRuns(
  handle: SpeechLike | undefined,
  onRun: (callId: string, name?: string) => void
): void {
  safely(() => {
    if (!handle?._addItemAddedCallback) return;
    const onItem = (item: ItemLike): void =>
      safely(() => {
        if (!item?.callId) return;
        if (item.type === 'function_call') onRun(item.callId, item.name ?? '?');
        else if (item.type === 'function_call_output') onRun(item.callId);
      });
    handle._addItemAddedCallback(onItem);
    handle.addDoneCallback?.(() => safely(() => handle._removeItemAddedCallback?.(onItem)));
  });
}

const round = (n: number): number => Math.round(n);

export interface RequestField {
  startMs: number | null;
  ttftMs: number | null;
  durationMs: number;
  cancelled?: true;
}
export interface ToolFields {
  requests: RequestField[];
  handoffSteps: {
    eventMs: number | null;
    lockMs: number | null;
    publishedMs: number | null;
  } | null;
  runs: Array<{ name: string; startMs: number | null; endMs: number | null }>;
  execMs: Record<string, number>;
  answerAudioMs: number | null;
  ackClipMs: number | null;
  outcomes: ReceiptToolOutcome[];
}

function toolFields(turn: { eou?: EouMetric; steps: ToolSteps }): ToolFields {
  const s = turn.steps;
  const stop = turn.eou?.lastSpeakingTimeMs ?? 0;
  const at = (t: number | undefined): number | null =>
    stop > 0 && t !== undefined && Number.isFinite(t) ? round(t - stop) : null;
  const runs = [...s.runs.values()];
  const execMs: Record<string, number> = {};
  for (const run of runs) {
    if (run.endAt !== undefined)
      execMs[run.name] = (execMs[run.name] ?? 0) + run.endAt - run.startAt;
  }
  return {
    requests: [...s.requests]
      .sort((a, b) => a.startAt - b.startAt)
      .map((q) => ({
        startMs: at(q.startAt),
        ttftMs: q.ttftMs === null ? null : round(q.ttftMs),
        durationMs: round(q.durationMs),
        ...(q.cancelled ? { cancelled: true as const } : {}),
      })),
    handoffSteps: Object.keys(s.handoff).length
      ? {
          eventMs: at(s.handoff.handoffEvent),
          lockMs: at(s.handoff.handoffLock),
          publishedMs: at(s.handoff.handoffPublished),
        }
      : null,
    runs: runs.map((run) => ({ name: run.name, startMs: at(run.startAt), endMs: at(run.endAt) })),
    execMs,
    answerAudioMs: at(s.answerAt),
    ackClipMs: at(s.ackClipAt),
    outcomes: [...s.outcomes],
  };
}

/** The receipt with its tool-turn fields (see the module doc); empty ones if they can't be built. */
export function withToolTiming<
  R extends { timing: object; tools: object; audio: { firstAnyAudioMs: number | null } },
>(turn: { eou?: EouMetric; steps: ToolSteps }, r: R) {
  let f: ToolFields = {
    requests: [],
    handoffSteps: null,
    runs: [],
    execMs: {},
    answerAudioMs: null,
    ackClipMs: null,
    outcomes: [],
  };
  safely(() => (f = toolFields(turn)));
  const firstAny = [r.audio.firstAnyAudioMs, f.ackClipMs].filter((n): n is number => n !== null);
  return {
    ...r,
    timing: { ...r.timing, requests: f.requests, handoffSteps: f.handoffSteps },
    tools: { ...r.tools, runs: f.runs, execMs: f.execMs, outcomes: f.outcomes },
    audio: {
      ...r.audio,
      firstAnyAudioMs: firstAny.length ? Math.min(...firstAny) : null,
      answerAudioMs: f.answerAudioMs,
      ackClipMs: f.ackClipMs,
    },
  };
}
