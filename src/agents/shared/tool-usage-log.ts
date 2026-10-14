/**
 * One TOOL_USAGE log line per call, when it ends: each tool the model called
 * and how often, how many of those calls failed, and how many tools the agent
 * held. Tool names and counts only, never arguments, results or user words.
 *
 * The persisted analytics (Firestore tool_usage_stats, written by
 * services/analytics/tool-usage-analytics.ts) have had no write since
 * 2026-02-07, and the cloud-agents logs keep ~a week of the per-call
 * "Tool execution tracked" lines, so nothing could re-derive the tool set a
 * call should carry (TOOL_CORE_STATIC) from more than one week of calls.
 *
 * @module agents/shared/tool-usage-log
 */

import { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ToolUsage' });

interface ToolsExecuted {
  functionCalls?: Array<{ name?: string }>;
  functionCallOutputs?: Array<{ name?: string; isError?: boolean }>;
}

interface UsageSession {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
}

/** Count this call's tool calls; the returned function logs them and detaches. */
export function trackToolUsage(
  session: UsageSession,
  sessionId: string,
  toolsHeld: () => number
): () => void {
  const calls: Record<string, number> = {};
  let errors = 0;
  const onExecuted = (ev: unknown): void => {
    const executed = ev as ToolsExecuted;
    for (const call of executed.functionCalls ?? []) {
      if (call.name) calls[call.name] = (calls[call.name] ?? 0) + 1;
    }
    errors += (executed.functionCallOutputs ?? []).filter((o) => o.isError).length;
  };
  session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, onExecuted);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    session.off(voice.AgentSessionEventTypes.FunctionToolsExecuted, onExecuted);
    const total = Object.values(calls).reduce((sum, n) => sum + n, 0);
    let held: number | null = null;
    try {
      held = toolsHeld();
    } catch {
      // the agent is gone at teardown; the counts still matter
    }
    log.info(
      { sessionId, calls, total, distinct: Object.keys(calls).length, errors, toolsHeld: held },
      'TOOL_USAGE'
    );
  };
}
