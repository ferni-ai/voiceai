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
  /**
   * Enrollment scores and audit-logs liveness but is not refused on it; anti-
   * spoofing still gates it, and verification still enforces liveness.
   * Measured 2026-10-05 on the web's upload (first 3 s, 16 kHz mono): without
   * a challenge, which no route issues, checkLiveness passed 0 of 40 real
   * human utterances (LibriSpeech dev-clean, 8 speakers) and 0 of 40 macOS
   * `say` clips. Its timing and background-noise checks score under 0.01 on
   * any of that audio, so the score tops out near 0.4 against a 0.7 bar: it
   * refused every person and never told a person from TTS. Enrollment is
   * signed in and records the caller's own voice.
   */
  enrollmentLivenessBlocks: false,
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
