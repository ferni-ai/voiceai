/**
 * Voice Authentication Types
 *
 * Shared types and interfaces for voice auth routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

/**
 * Security configuration for voice authentication.
 * SECURITY: All security checks are MANDATORY and cannot be disabled.
 */
export const SECURITY_CONFIG = {
  enableLivenessCheck: true,
  enableAntiSpoofing: true,
  enableRateLimiting: true,
  enableAuditLogging: true, // MANDATORY: Cannot be disabled for compliance
  livenessMinConfidence: 0.6,
  antiSpoofMinConfidence: 0.6,
} as const;

// Default sample rate for audio analysis
export const DEFAULT_SAMPLE_RATE = 16000;

// Session TTLs
export const ENROLLMENT_SESSION_TTL = 600; // 10 minutes
export const AUTH_SESSION_TTL = 3600; // 1 hour

// ============================================================================
// TYPES
// ============================================================================

export interface DeviceInfo {
  userAgent?: string;
  platform?: string;
  deviceId?: string;
}

export interface SecurityCheckResult {
  passed: boolean;
  warnings: string[];
  livenessScore?: number;
  spoofScore?: number;
}

/**
 * Voice auth route handler signature
 */
export type VoiceAuthRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  route: string
) => Promise<boolean>;

