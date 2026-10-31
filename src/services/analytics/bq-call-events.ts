/**
 * The call_events row (bq-events.ts) for a finished call, from the call-quality monitor's
 * session plus what only the call's own process knows: its turn count, and the flags as the
 * caller's cohort set them (in process-per-call mode the worker's env is not the caller's).
 * persona and model are raw here; bq-fields.ts maps them to known values or 'other'.
 *
 * @module services/analytics/bq-call-events
 */
import type { Env } from '../../config/env-flag.js';
import { FLAG_MANIFEST, type FlagName } from '../../config/flag-manifest.js';
import { flagModeOf, flagOn } from '../../config/env-flag.js';
import { emitEvent } from './bq-events.js';
import type { CallSession } from './call-quality-monitor.js';

/** Sent with endCall from the call's process, where conversation state lives. */
export type CallSummary = { turns?: number; flags?: string[]; bq?: boolean };

/** Names of experiment flags that are on (or in shadow) here; never their values. */
export function onExperimentFlags(env: Env = process.env): string[] {
  return (Object.keys(FLAG_MANIFEST) as FlagName[]).filter(
    (name) => FLAG_MANIFEST[name].kind === 'experiment' && flagModeOf(name, env) !== 'off'
  );
}

/** Read in the call's own process before cleanup: turns, and this caller's flags and gate. */
export async function callSummary(sessionId: string, env: Env = process.env): Promise<CallSummary> {
  const own = { flags: onExperimentFlags(env), bq: flagOn('BQ_EVENTS', env) };
  try {
    const cs = await import('../conversation-state.js');
    if (!cs.hasConversationState(sessionId)) return own;
    return { ...own, turns: cs.getConversationState(sessionId).getFlowContext().turnCount };
  } catch {
    return own;
  }
}

/**
 * BQ_CALL_USER_HASH: voice-agent-entry starts the call's clock before the caller is identified,
 * and session init's connection_success carries the id. A call with no user takes it, so its
 * call_events row gets a user_hash; a call that already has one keeps it.
 */
export function adoptCallerId(session: CallSession, userId?: string, env: Env = process.env): void {
  if (!session.userId && userId && flagOn('BQ_CALL_USER_HASH', env)) session.userId = userId;
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
      flags: Array.isArray(summary?.flags) ? summary.flags : onExperimentFlags(env),
    },
    { userId: session.userId, sessionId: session.callId },
    typeof summary?.bq === 'boolean' ? { ...env, BQ_EVENTS: summary.bq ? 'on' : 'off' } : env
  );
}
