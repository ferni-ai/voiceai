/**
 * Outbound Call Tracker
 *
 * In-memory tracking of pending outbound on-behalf calls.
 * Maps external call identifiers (e.g. Twilio CallSid, LiveKit SIP participant ID)
 * to internal call context so that webhook handlers and orchestrators can
 * correlate status updates back to the originating request.
 *
 * This module lives in the services layer (Level 60) so it can be imported by
 * both services/outreach/ and servers/api/routes/ without architecture violations.
 *
 * @module services/outreach/outbound-call-tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CallObjective, CallType } from '../../tools/domains/telephony/types.js';

const log = createLogger({ module: 'outbound-call-tracker' });

// ============================================================================
// TYPES
// ============================================================================

export interface PendingCall {
  callId: string;
  userId: string;
  contactName: string;
  purpose: string;
  objective: CallObjective;
  callType: CallType;
  originalSessionId: string;
  startedAt: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const pendingCalls = new Map<string, PendingCall>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Track a new outbound call.
 * Called by the orchestrator when initiating a call.
 */
export function trackOutboundCall(externalCallId: string, context: PendingCall): void {
  pendingCalls.set(externalCallId, context);
  log.info(
    { externalCallId, callId: context.callId, contactName: context.contactName },
    'Tracking outbound on-behalf call'
  );
}

/**
 * Get pending call context by external call ID.
 */
export function getPendingCall(externalCallId: string): PendingCall | undefined {
  return pendingCalls.get(externalCallId);
}

/**
 * Remove a completed call from tracking.
 */
export function removePendingCall(externalCallId: string): void {
  pendingCalls.delete(externalCallId);
}
