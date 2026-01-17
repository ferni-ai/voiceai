/**
 * On-Behalf Call Transcript Capture Integration
 *
 * Captures transcripts specifically for on-behalf calls to enable
 * "Better Than Human" superhuman summarization.
 *
 * This hooks into the voice agent to capture:
 * - Agent (Ferni) speech during on-behalf calls
 * - Recipient (the person being called) speech
 *
 * The captured transcript is then analyzed by call-transcript-intelligence.ts
 * to provide warm, human-like summaries like:
 * "Mom was so happy to hear from you! She mentioned..."
 *
 * @module agents/integrations/on-behalf-transcript-capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  addTranscriptTurn,
  hasActiveTranscript,
} from '../../services/outreach/call-transcript-intelligence.js';
import { getOutboundCallContext } from '../../intelligence/context-builders/external/outbound-call-context.js';

const log = createLogger({ module: 'on-behalf-transcript-capture' });

// ============================================================================
// SESSION TRACKING
// ============================================================================

// Map sessionId -> callId for active on-behalf calls
const sessionCallMap = new Map<string, string>();

/**
 * Check if a session is an on-behalf call and set up transcript capture
 */
export function initializeOnBehalfCapture(sessionId: string): boolean {
  // Check if this session has outbound call context
  const callContext = getOutboundCallContext(sessionId);

  if (!callContext) {
    return false;
  }

  // Store the mapping
  sessionCallMap.set(sessionId, callContext.callId);

  log.info(
    { sessionId, callId: callContext.callId, recipientName: callContext.recipientName },
    '📝 On-behalf transcript capture initialized'
  );

  return true;
}

/**
 * Capture an agent (Ferni) turn in an on-behalf call
 */
export function captureAgentTurn(sessionId: string, text: string): void {
  const callId = sessionCallMap.get(sessionId);

  if (!callId || !hasActiveTranscript(callId)) {
    return;
  }

  // Skip very short utterances (likely just acknowledgments)
  if (text.length < 5) {
    return;
  }

  addTranscriptTurn(callId, 'agent', text);
  log.debug({ callId, turnLength: text.length }, 'Captured agent turn');
}

/**
 * Capture a recipient turn in an on-behalf call
 */
export function captureRecipientTurn(sessionId: string, text: string): void {
  const callId = sessionCallMap.get(sessionId);

  if (!callId || !hasActiveTranscript(callId)) {
    return;
  }

  // Skip very short utterances (likely just acknowledgments)
  if (text.length < 3) {
    return;
  }

  addTranscriptTurn(callId, 'recipient', text);
  log.debug({ callId, turnLength: text.length }, 'Captured recipient turn');
}

/**
 * Clean up when an on-behalf call session ends
 */
export function cleanupOnBehalfCapture(sessionId: string): void {
  const callId = sessionCallMap.get(sessionId);

  if (callId) {
    sessionCallMap.delete(sessionId);
    log.debug({ sessionId, callId }, 'Cleaned up on-behalf capture');
  }
}

/**
 * Wrap a SessionServices instance to capture turns for on-behalf calls
 *
 * This wraps the addTurn function to also capture agent speech for
 * superhuman call analysis.
 */
export function wrapServicesForOnBehalfCapture<
  T extends { addTurn?: (role: string, text: string) => void },
>(sessionId: string, services: T): T {
  if (!isOnBehalfCall(sessionId) || !services.addTurn) {
    return services;
  }

  const originalAddTurn = services.addTurn.bind(services);

  services.addTurn = (role: string, text: string) => {
    // Call original
    originalAddTurn(role, text);

    // Also capture for on-behalf analysis
    if (role === 'assistant' && text) {
      captureAgentTurn(sessionId, text);
    }
  };

  log.debug({ sessionId }, 'Wrapped services.addTurn for on-behalf capture');
  return services;
}

/**
 * Check if a session is an active on-behalf call
 */
export function isOnBehalfCall(sessionId: string): boolean {
  return sessionCallMap.has(sessionId);
}

/**
 * Get the call ID for an on-behalf session
 */
export function getOnBehalfCallId(sessionId: string): string | undefined {
  return sessionCallMap.get(sessionId);
}
