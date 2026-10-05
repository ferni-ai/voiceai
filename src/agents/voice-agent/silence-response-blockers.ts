/**
 * Conditions that hold back a meaningful-silence response
 * (session-state-handler.ts, LONG SILENCE).
 *
 * @module voice-agent/silence-response-blockers
 */

import { shouldSkipGenerateReply } from '../../handoff/unified-state.js';
import { diag } from '../../services/diagnostic-logger.js';
import { getStateMetrics } from '../../speech/coordination/sanitizer-integration.js';
import { canTriggerProactive } from '../shared/response-orchestrator.js';

/**
 * True when a silence response must not be generated right now. Every blocker
 * is evaluated and logged, not just the first that applies.
 */
export function silenceResponseBlocked(
  sessionId: string,
  room: { remoteParticipants?: Map<string, unknown> } | undefined,
  silenceDurationSec: number
): boolean {
  // FIX: Skip silence response if tools are actively executing (e.g., music search)
  // This prevents gateway timeouts when LLM is busy processing tool calls
  const silenceStateMetrics = getStateMetrics(sessionId);
  const toolsActive = silenceStateMetrics && silenceStateMetrics.activeToolCount > 0;

  // FIX: Skip silence response if a handoff is in progress or session is draining
  // After handoff, the old agent's session is draining - trying to call generateReply
  // causes "Cannot call waitForPlayout from inside function tool" errors
  // shouldSkipGenerateReply checks both: (1) handoff in progress, (2) 3s draining window
  const handoffOrDraining = shouldSkipGenerateReply(sessionId);

  // FIX (Jan 2026): Skip silence response if no participant has joined yet
  // This prevents speaking to an empty room when participant wait times out
  // but session continues anyway. The silence handler would generate audio
  // that nobody can hear, causing "no response from Ferni" issues.
  const hasParticipants = room?.remoteParticipants?.size ? room.remoteParticipants.size > 0 : true;
  const noParticipants = room && !hasParticipants;

  if (toolsActive) {
    diag.state('🤫 [SILENCE] Skipped - tool execution in progress', {
      activeToolCount: silenceStateMetrics?.activeToolCount,
      silenceSec: Math.round(silenceDurationSec),
    });
  }

  if (handoffOrDraining) {
    diag.state('🤫 [SILENCE] Skipped - handoff in progress or session draining', {
      silenceSec: Math.round(silenceDurationSec),
    });
  }

  if (noParticipants) {
    diag.state('🤫 [SILENCE] Skipped - no participant in room yet', {
      silenceSec: Math.round(silenceDurationSec),
      hasRoom: !!room,
      participantCount: room?.remoteParticipants?.size ?? 'unknown',
    });
  }

  // ResponseOrchestrator check: Only trigger if SDK is not currently handling a response
  // This is the key integration point for the clean architecture
  const sdkIdle = canTriggerProactive(sessionId);
  if (!sdkIdle) {
    diag.state('🤫 [SILENCE] Skipped - SDK is handling response (orchestrator)', {
      silenceSec: Math.round(silenceDurationSec),
    });
  }

  return Boolean(toolsActive || handoffOrDraining || noParticipants || !sdkIdle);
}
