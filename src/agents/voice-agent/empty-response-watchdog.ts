/**
 * Empty-response watchdog: notices when a user turn gets no reply.
 *
 * The clock starts when the user stops speaking and fires `onTimeout` if the
 * agent hasn't spoken within `timeoutMs`. A tool call is progress, not
 * silence: when the LLM asks for a tool the clock is held (up to
 * `toolHoldMs`, in case a tool hangs), and when the results come back it
 * restarts so the reply pass gets a full `timeoutMs` of its own. Without
 * this, every weather lookup (first LLM pass + fetch + second pass, first
 * audio at 3.5-6 s) tripped the 3 s deadline on a healthy turn (2026-10-04).
 *
 * The tool-call signal comes from the persona agent's llmNode stream
 * (turn-request.ts tapToolCalls): LiveKit has no public "tool started" event,
 * only `function_tools_executed` once they finish.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'EmptyResponseWatchdog' });

export interface EmptyResponseWatchdog {
  /** The user finished a turn: start the clock (held if a tool is still running). */
  arm: () => void;
  /** The LLM asked for a tool: hold the clock until its results are back. */
  toolsStarted: () => void;
  /** Tool results are back: give the reply pass a fresh clock. */
  toolsExecuted: () => void;
  /** The user spoke again: stop the clock, but remember a tool still running. */
  cancel: () => void;
  /** The agent spoke or the session ended: stop the clock and forget any tool. */
  reset: () => void;
  /** True while a turn is waiting on a reply. */
  readonly armed: boolean;
}

export function createEmptyResponseWatchdog(options: {
  timeoutMs: number;
  toolHoldMs: number;
  onTimeout: () => void;
}): EmptyResponseWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let armed = false;
  // A tool is requested and its results aren't back. Kept apart from `armed`
  // because the tool call can land before the user-stopped event (preemptive
  // replies) and outlive a short "mm-hm" mid-lookup, which re-arms the clock.
  let toolPending = false;

  const start = (ms: number): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      armed = false;
      toolPending = false;
      options.onTimeout();
    }, ms);
  };
  const cancel = (): void => {
    armed = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return {
    arm() {
      armed = true;
      start(toolPending ? options.toolHoldMs : options.timeoutMs);
    },
    toolsStarted() {
      toolPending = true;
      if (armed) start(options.toolHoldMs);
    },
    toolsExecuted() {
      toolPending = false;
      if (armed) start(options.timeoutMs);
    },
    cancel,
    reset() {
      cancel();
      toolPending = false;
    },
    get armed() {
      return armed;
    },
  };
}

// ── Per-session "the LLM asked for a tool" signal ──────────────────────────
// Keyed by the AgentSession object, like barge-in-fastpath: the persona agent
// (which sees the LLM stream) and the session-state handler (which owns the
// watchdog) both hold the session, not each other.

const toolCallListeners = new WeakMap<object, Set<() => void>>();

/** Subscribe to tool calls the LLM requests in this session. Returns an unsubscribe. */
export function onToolCallRequested(session: object, listener: () => void): () => void {
  let listeners = toolCallListeners.get(session);
  if (!listeners) {
    listeners = new Set();
    toolCallListeners.set(session, listeners);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Report that the LLM's reply in this session contains a tool call. Runs inside
 * the reply stream, so a failing listener is logged, never thrown into the reply.
 */
export function signalToolCallRequested(session: object): void {
  toolCallListeners.get(session)?.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      log.error({ error: String(error) }, 'Tool-call listener failed');
    }
  });
}
