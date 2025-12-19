/**
 * Voice Authentication API Handler
 *
 * Integrates voice authentication routes with the ui-server pattern.
 *
 * Core Endpoints:
 * - POST /api/voice/enroll/start     - Start enrollment session
 * - POST /api/voice/enroll/sample    - Add enrollment sample
 * - POST /api/voice/enroll/complete  - Complete enrollment
 * - POST /api/voice/enroll/cancel    - Cancel enrollment
 * - POST /api/voice/verify           - Verify speaker (with emotion analysis)
 * - POST /api/voice/identify         - Identify speaker (1:N matching)
 * - POST /api/voice/auth/start       - Start continuous auth session
 * - POST /api/voice/auth/check       - Check auth status (with security)
 * - POST /api/voice/auth/stop        - Stop continuous auth session
 * - GET  /api/voice/profile          - Get profile status
 * - DELETE /api/voice/profile        - Delete voice profile
 * - GET  /api/voice/status           - System status
 *
 * Household Endpoints:
 * - GET  /api/voice/household              - Get household for device
 * - POST /api/voice/household              - Create household
 * - POST /api/voice/household/members      - Add member to household
 * - DELETE /api/voice/household/members/:id - Remove member
 * - POST /api/voice/household/identify     - Identify speaker from household
 *
 * Memory Endpoints:
 * - GET  /api/voice/memory                 - Get user's conversation memory
 * - GET  /api/voice/memory/context         - Get context for new conversation
 * - GET  /api/voice/memory/conversations   - Get recent conversations
 *
 * Security Features:
 * - Liveness detection (replay attack prevention)
 * - Anti-spoofing (deepfake/TTS detection)
 * - Rate limiting (brute-force prevention)
 * - Audit logging (compliance/monitoring)
 * - Emotion correlation (explains verification failures)
 *
 * @module VoiceAuthHandler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../utils/safe-logger.js';
import { handleEnrollmentRoutes } from './enrollment-routes.js';
import { handleVerificationRoutes } from './verification-routes.js';
import { handleHouseholdRoutes } from './household-routes.js';
import { handleMemoryRoutes } from './memory-routes.js';
import { sendJson } from './helpers.js';

const log = getLogger().child({ module: 'VoiceAuthHandler' });

/**
 * Handle voice authentication API routes.
 *
 * @returns true if the route was handled, false otherwise
 */
export async function handleVoiceAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/voice/* routes
  if (!pathname.startsWith('/api/voice')) {
    return false;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID',
    });
    res.end();
    return true;
  }

  const route = pathname.replace('/api/voice', '');

  try {
    // Enrollment routes (enroll/start, enroll/sample, etc.)
    if (route.startsWith('/enroll')) {
      return handleEnrollmentRoutes(req, res, route);
    }

    // Verification routes (verify, identify, auth/*, profile, status)
    if (
      route === '/status' ||
      route === '/verify' ||
      route === '/identify' ||
      route.startsWith('/auth') ||
      route === '/profile'
    ) {
      return handleVerificationRoutes(req, res, route);
    }

    // Household routes
    if (route.startsWith('/household')) {
      return handleHouseholdRoutes(req, res, route);
    }

    // Memory routes
    if (route.startsWith('/memory')) {
      return handleMemoryRoutes(req, res, route);
    }

    // Route not found under /api/voice
    return false;
  } catch (error) {
    log.error({ error, route }, 'Voice auth route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// Re-export types and helpers for external use
export * from './types.js';
export {
  enrollmentSessions,
  continuousAuthenticators,
  getUserId,
  getVerifiedUserId,
  getClientIP,
  getDeviceInfo,
} from './helpers.js';

