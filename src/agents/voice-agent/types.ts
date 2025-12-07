/**
 * Voice Agent Types
 * 
 * Type definitions specific to the voice agent.
 */

import type { PersonaConfig } from '../../personas/types.js';

/**
 * User data stored on the job process and agent session
 */
export interface UserData {
  vadLoaded?: boolean;
  userId?: string;
  userName?: string;
  subscriptionTier?: string;
  isReturningUser?: boolean;
}

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

/**
 * Room reference for data publishing
 */
export interface RoomReference {
  localParticipant?: {
    publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
  };
}

/**
 * Startup diagnostic logging
 */
export interface DiagnosticLogger {
  section(message: string): void;
  prewarm(message: string, data?: Record<string, unknown>): void;
  session(message: string, data?: Record<string, unknown>): void;
  entry(message: string, data?: Record<string, unknown>): void;
  user(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  services: {
    name: string;
    status: 'ok' | 'error';
    latency?: number;
  }[];
  uptime: number;
  version: string;
}

