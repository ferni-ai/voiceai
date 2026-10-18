/**
 * The call_events row (bq-events.ts) for a finished call, from the call-quality monitor's
 * session plus what only the call's own process knows (its turn count).
 *
 * @module services/analytics/bq-call-events
 */
import type { Env } from '../../config/env-flag.js';
import { FLAG_MANIFEST, type FlagName } from '../../config/flag-manifest.js';
import { flagModeOf } from '../../config/env-flag.js';
import { emitEvent } from './bq-events.js';
import type { CallSession } from './call-quality-monitor.js';

/** Sent with endCall from the call's process, where conversation state lives. */
export type CallSummary = { turns?: number };

/** Names of experiment flags that are on (or in shadow) here; never their values. */
export function onExperimentFlags(env: Env = process.env): string[] {
  return (Object.keys(FLAG_MANIFEST) as FlagName[]).filter(
    (name) => FLAG_MANIFEST[name].kind === 'experiment' && flagModeOf(name, env) !== 'off'
  );
}

/** This call's turn count, read before cleanup ends its conversation state. */
export async function callSummary(sessionId: string): Promise<CallSummary> {
  try {
    const cs = await import('../conversation-state.js');
    if (!cs.hasConversationState(sessionId)) return {};
    return { turns: cs.getConversationState(sessionId).getFlowContext().turnCount };
  } catch {
    return {};
  }
}

export function emitCallEnd(
  session: CallSession,
  summary?: CallSummary,
  env: Env = process.env
): boolean {
  return emitEvent(
    'call_events',
    {
      event_type: 'call_end',
      agent_version: env.BUILD_SHA?.trim().slice(0, 12) || null,
      persona: session.personaId ?? null,
      model: env.CASCADE_LLM_MODEL?.trim() || 'default',
      duration_ms: session.totalDurationMs ?? null,
      end_reason: session.endReason ?? null,
      turns: typeof summary?.turns === 'number' ? summary.turns : null,
      first_response_ms: session.firstResponseTimeMs ?? null,
      interruptions: session.interruptionCount,
      flags: onExperimentFlags(env),
    },
    { userId: session.userId, sessionId: session.callId },
    env
  );
}
