/**
 * Whether a call's AgentSession records itself to LiveKit Cloud.
 *
 * With no `record` argument, AgentSession.start follows the LiveKit project's
 * Agent Observability setting (ctx.job.enableRecording) and, when that is on,
 * uploads the call's audio, transcript, traces and logs to LiveKit Cloud. Our
 * privacy policy says we don't record calls, so every session start passes this
 * explicitly and a dashboard toggle can't change it.
 *
 * LK_SESSION_RECORDING=on turns recording back on for debugging, outside
 * production only: with NODE_ENV=production it is always off.
 *
 * @module agents/shared/session-recording
 */
import { flagOn } from '../../config/env-flag.js';
import type { Env } from '../../config/env-flag.js';

/** The `record` value for AgentSession.start: false unless debugging outside production. */
export function sessionRecording(env: Env = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return flagOn('LK_SESSION_RECORDING', env);
}
