/**
 * Voice Authentication Helpers
 *
 * Shared utilities for voice auth routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { EnrollmentSession } from '../../services/voice/voice-enrollment.js';
import type { ContinuousAuthenticator } from '../../services/voice/voice-enrollment.js';
import { detectSpoofing } from '../../services/voice/voice-antispoofing.js';
import { logLivenessFail, logSpoofDetected } from '../../services/voice/voice-audit-log.js';
import { checkLiveness } from '../../services/voice/voice-liveness.js';
import { checkRateLimit } from '../../services/voice/voice-rate-limit.js';
import { getRedisCache } from '../../memory/redis-cache.js';
import { parseBody as parseBodyHelper } from '../helpers.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  SECURITY_CONFIG,
  DEFAULT_SAMPLE_RATE,
  ENROLLMENT_SESSION_TTL,
  AUTH_SESSION_TTL,
  type DeviceInfo,
  type SecurityCheckResult,
} from './types.js';

const log = getLogger().child({ module: 'VoiceAuthHelpers' });

// ============================================================================
// In-memory fallback storage (used when Redis unavailable)
// ============================================================================

export const enrollmentSessionsMemory = new Map<string, EnrollmentSession>();
export const continuousAuthenticatorsMemory = new Map<string, ContinuousAuthenticator>();

// ============================================================================
// Session Storage (Redis with in-memory fallback)
// ============================================================================

/**
 * Get enrollment session from Redis or memory
 */
export async function getEnrollmentSession(sessionId: string): Promise<EnrollmentSession | null> {
  const redis = getRedisCache();

  if (redis) {
    try {
      const data = await redis.get<EnrollmentSession>(`enrollment:${sessionId}`);
      if (data) return data;
    } catch (error) {
      log.warn({ error, sessionId }, 'Redis enrollment session fetch failed, using memory');
    }
  }

  return enrollmentSessionsMemory.get(sessionId) ?? null;
}

/**
 * Store enrollment session in Redis and memory
 */
export async function setEnrollmentSession(
  sessionId: string,
  session: EnrollmentSession
): Promise<void> {
  enrollmentSessionsMemory.set(sessionId, session);

  const redis = getRedisCache();
  if (redis) {
    try {
      await redis.set(`enrollment:${sessionId}`, session, ENROLLMENT_SESSION_TTL);
    } catch (error) {
      log.warn({ error, sessionId }, 'Redis enrollment session store failed');
    }
  }
}

/**
 * Delete enrollment session from Redis and memory
 */
export async function deleteEnrollmentSession(sessionId: string): Promise<void> {
  enrollmentSessionsMemory.delete(sessionId);

  const redis = getRedisCache();
  if (redis) {
    try {
      await redis.delete(`enrollment:${sessionId}`);
    } catch (error) {
      log.warn({ error, sessionId }, 'Redis enrollment session delete failed');
    }
  }
}

/**
 * Get continuous authenticator from Redis or memory
 */
export async function getContinuousAuthenticator(
  userId: string
): Promise<ContinuousAuthenticator | null> {
  const memoryAuth = continuousAuthenticatorsMemory.get(userId);
  if (memoryAuth) {
    return memoryAuth;
  }

  const redis = getRedisCache();
  if (redis) {
    try {
      const data = await redis.get<{ userId: string; startedAt: string }>(`auth:${userId}`);
      if (data) {
        log.debug({ userId }, 'Auth session exists in Redis but not in memory');
      }
    } catch (error) {
      log.warn({ error, userId }, 'Redis auth session fetch failed');
    }
  }

  return null;
}

/**
 * Store continuous authenticator in Redis and memory
 */
export async function setContinuousAuthenticator(
  userId: string,
  authenticator: ContinuousAuthenticator
): Promise<void> {
  continuousAuthenticatorsMemory.set(userId, authenticator);

  const redis = getRedisCache();
  if (redis) {
    try {
      await redis.set(
        `auth:${userId}`,
        { userId, startedAt: new Date().toISOString() },
        AUTH_SESSION_TTL
      );
    } catch (error) {
      log.warn({ error, userId }, 'Redis auth session store failed');
    }
  }
}

/**
 * Delete continuous authenticator from Redis and memory
 */
export async function deleteContinuousAuthenticator(userId: string): Promise<void> {
  continuousAuthenticatorsMemory.delete(userId);

  const redis = getRedisCache();
  if (redis) {
    try {
      await redis.delete(`auth:${userId}`);
    } catch (error) {
      log.warn({ error, userId }, 'Redis auth session delete failed');
    }
  }
}

// Legacy compatibility aliases
export const enrollmentSessions = {
  get: (id: string) => enrollmentSessionsMemory.get(id),
  set: (id: string, session: EnrollmentSession) => {
    void setEnrollmentSession(id, session);
    enrollmentSessionsMemory.set(id, session);
  },
  delete: (id: string) => {
    void deleteEnrollmentSession(id);
    enrollmentSessionsMemory.delete(id);
  },
  has: (id: string) => enrollmentSessionsMemory.has(id),
};

export const continuousAuthenticators = {
  get: (id: string) => continuousAuthenticatorsMemory.get(id),
  set: (id: string, auth: ContinuousAuthenticator) => {
    void setContinuousAuthenticator(id, auth);
    continuousAuthenticatorsMemory.set(id, auth);
  },
  delete: (id: string) => {
    void deleteContinuousAuthenticator(id);
    continuousAuthenticatorsMemory.delete(id);
  },
  has: (id: string) => continuousAuthenticatorsMemory.has(id),
};

// ============================================================================
// Request/Response Helpers
// ============================================================================

/**
 * Parse JSON body from request.
 */
export async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    return await parseBodyHelper<Record<string, unknown>>(req);
  } catch {
    return {};
  }
}

/**
 * Send JSON response with CORS headers for voice auth endpoints.
 */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID',
  });
  res.end(JSON.stringify(data));
}

/**
 * Get user ID from request headers.
 */
export function getUserId(req: IncomingMessage): string | null {
  const firebaseUid = req.headers['x-firebase-uid'] as string;
  if (firebaseUid) {
    return firebaseUid;
  }
  return (req.headers['x-user-id'] as string) || null;
}

/**
 * SECURITY: Get authenticated user ID with validation.
 */
export function getVerifiedUserId(req: IncomingMessage): {
  userId: string | null;
  verified: boolean;
} {
  const firebaseUid = req.headers['x-firebase-uid'] as string;
  const xUserId = req.headers['x-user-id'] as string;

  if (firebaseUid) {
    if (xUserId && xUserId !== firebaseUid) {
      log.warn(
        { firebaseUid, xUserId },
        'SECURITY: X-User-Id does not match Firebase UID - using Firebase UID'
      );
    }
    return { userId: firebaseUid, verified: true };
  }

  if (xUserId) {
    return { userId: xUserId, verified: false };
  }

  return { userId: null, verified: false };
}

/**
 * Get client IP from request.
 */
export function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return typeof realIP === 'string' ? realIP : realIP[0];
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Get device info from request.
 */
export function getDeviceInfo(req: IncomingMessage): DeviceInfo {
  return {
    userAgent: req.headers['user-agent'] as string,
    platform: req.headers['x-platform'] as string,
    deviceId: req.headers['x-device-id'] as string,
  };
}

/**
 * Check rate limit and send error if exceeded.
 */
export function checkAndEnforceRateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  endpoint: 'verify' | 'identify' | 'enroll' | 'profile' | 'status'
): boolean {
  if (!SECURITY_CONFIG.enableRateLimiting) return true;

  const ipAddress = getClientIP(req);
  const result = checkRateLimit(userId, endpoint, ipAddress);

  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt.getTime() / 1000)));

  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((result.retryAfterMs || 0) / 1000)));
    sendJson(res, 429, {
      error: 'Too many requests',
      message: result.blocked
        ? 'You have been temporarily blocked due to too many requests'
        : 'Rate limit exceeded. Please slow down.',
      retryAfterMs: result.retryAfterMs,
    });
    return false;
  }

  return true;
}

/**
 * Run security checks on audio (liveness + anti-spoofing).
 */
export async function runSecurityChecks(
  audio: Float32Array,
  userId: string,
  deviceInfo: DeviceInfo
): Promise<SecurityCheckResult> {
  const warnings: string[] = [];
  let livenessScore: number | undefined;
  let spoofScore: number | undefined;

  // Liveness check
  if (SECURITY_CONFIG.enableLivenessCheck) {
    const livenessResult = await checkLiveness(audio, DEFAULT_SAMPLE_RATE);
    livenessScore = livenessResult.confidence;

    if (
      !livenessResult.isLive ||
      livenessResult.confidence < SECURITY_CONFIG.livenessMinConfidence
    ) {
      warnings.push(...livenessResult.warnings);

      if (SECURITY_CONFIG.enableAuditLogging) {
        await logLivenessFail(
          userId,
          livenessResult.confidence,
          livenessResult.warnings,
          deviceInfo
        );
      }

      if (!livenessResult.isLive) {
        return { passed: false, warnings, livenessScore };
      }
    }
  }

  // Anti-spoofing check
  if (SECURITY_CONFIG.enableAntiSpoofing) {
    const spoofResult = detectSpoofing(audio, DEFAULT_SAMPLE_RATE);
    spoofScore = spoofResult.confidence;

    if (
      !spoofResult.isAuthentic ||
      spoofResult.confidence < SECURITY_CONFIG.antiSpoofMinConfidence
    ) {
      warnings.push(...spoofResult.warnings);

      if (SECURITY_CONFIG.enableAuditLogging && spoofResult.spoofType) {
        await logSpoofDetected(
          userId,
          spoofResult.spoofType,
          spoofResult.confidence,
          spoofResult.warnings,
          deviceInfo
        );
      }

      if (!spoofResult.isAuthentic) {
        return { passed: false, warnings, livenessScore, spoofScore };
      }
    }
  }

  return { passed: true, warnings, livenessScore, spoofScore };
}

/**
 * Parse audio from body.
 */
export function parseAudio(body: Record<string, unknown>): Float32Array | null {
  const { audio, samples } = body;

  if (samples && Array.isArray(samples)) {
    return new Float32Array(samples as number[]);
  }

  if (audio && typeof audio === 'string') {
    try {
      const buffer = Buffer.from(audio, 'base64');
      return new Float32Array(buffer.buffer);
    } catch {
      return null;
    }
  }

  return null;
}
