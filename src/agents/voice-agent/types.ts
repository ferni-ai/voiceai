/**
 * Voice Agent Types
 *
 * Type definitions specific to the voice agent.
 *
 * NOTE: UserData is exported from shared/types.ts - this file contains
 * additional types specific to voice agent operations.
 */

import type { PersonaConfig } from '../../personas/types.js';

// Re-export UserData from the canonical source
export type { UserData } from '../shared/types.js';

/**
 * Persona switch request from frontend
 */
export interface PersonaSwitchRequest {
  personaId: string;
  reason?: string;
  preserveContext?: boolean;
}

/**
 * Session context passed between handlers
 */
export interface SessionContext {
  sessionId: string;
  userId?: string;
  userName?: string;
  persona: PersonaConfig;
  subscriptionTier: string;
  isReturningUser: boolean;
  sessionStartTime: number;
}

/**
 * Speech event data from TTS
 */
export interface SpeechEvent {
  text: string;
  isFinal?: boolean;
  transcriptionId?: string;
}

/**
 * Data message sent to frontend
 */
export interface DataMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// Re-export RoomRef from frontend-publisher (canonical source)
export type { RoomRef as RoomReference } from '../realtime/frontend-publisher.js';

// Re-export DiagnosticLogger from diagnostic-logger (canonical source)
export type { DiagnosticLogger } from '../../services/observability/diagnostic-logger.js';

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  services: Array<{
    name: string;
    status: 'ok' | 'error';
    latency?: number;
  }>;
  uptime: number;
  version: string;
}
