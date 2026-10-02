/**
 * Family Check-in Caller Types
 *
 * Result shapes for the family check-in job runner (family-checkin-caller.ts).
 */

import type { CheckinCallStatus } from './proactive-family-checkin.js';

// ============================================================================
// TYPES
// ============================================================================

export interface FamilyCheckinJobResult {
  success: boolean;
  totalDue: number;
  schedulesProcessed: number;
  callsInitiated: number;
  callsSucceeded: number;
  callsFailed: number;
  callsSkipped: number;
  errors: string[];
  durationMs: number;
}

export interface SingleCallResult {
  success: boolean;
  callId?: string;
  status?: CheckinCallStatus;
  error?: string;
}
