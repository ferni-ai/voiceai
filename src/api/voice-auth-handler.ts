/**
 * Voice Authentication API Handler
 *
 * Integrates voice authentication routes with the ui-server pattern.
 * This handler wraps the voice-auth-routes for compatibility with
 * the existing http.IncomingMessage/OutgoingMessage pattern.
 *
 * Endpoints:
 * - POST /api/voice/enroll/start     - Start enrollment session
 * - POST /api/voice/enroll/sample    - Add enrollment sample
 * - POST /api/voice/enroll/complete  - Complete enrollment
 * - POST /api/voice/enroll/cancel    - Cancel enrollment
 * - POST /api/voice/verify           - Verify speaker
 * - POST /api/voice/identify         - Identify speaker
 * - POST /api/voice/auth/start       - Start continuous auth
 * - POST /api/voice/auth/check       - Check auth status
 * - POST /api/voice/auth/stop        - Stop continuous auth
 * - GET  /api/voice/profile          - Get profile status
 * - DELETE /api/voice/profile        - Delete voice profile
 * - GET  /api/voice/status           - System status
 *
 * @module VoiceAuthHandler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  addEnrollmentSample,
  completeEnrollment,
  ContinuousAuthenticator,
  identifySpeaker,
  startEnrollmentSession,
  verifyUser,
  type EnrollmentSession,
  type VoiceProfile,
} from '../services/voice-enrollment.js';
import { isNeuralEmbeddingAvailable } from '../services/voice-memory-enhanced.js';
import {
  deleteVoiceProfile,
  getVoiceProfileStats,
  hasVoiceProfile,
  loadVoiceProfile,
  loadVoiceProfileIndex,
  removeFromVoiceProfileIndex,
  saveVoiceProfile,
  updateVoiceProfileIndex,
} from '../services/voice-profile-store.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'VoiceAuthHandler' });

// In-memory session storage (use Redis in production)
const enrollmentSessions = new Map<string, EnrollmentSession>();
const continuousAuthenticators = new Map<string, ContinuousAuthenticator>();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse JSON body from request.
 */
async function parseBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response.
 */
function sendJson(res: ServerResponse, status: number, data: any): void {
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
function getUserId(req: IncomingMessage): string | null {
  return (req.headers['x-user-id'] as string) || null;
}

/**
 * Parse audio from body.
 * Expects base64-encoded Float32Array or raw samples.
 */
function parseAudio(body: Record<string, any>): Float32Array | null {
  const { audio, samples } = body;

  if (samples && Array.isArray(samples)) {
    return new Float32Array(samples);
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

// ============================================================================
// Route Handler
// ============================================================================

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
    // ========================================================================
    // GET /api/voice/status
    // ========================================================================
    if (route === '/status' && req.method === 'GET') {
      const neuralAvailable = await isNeuralEmbeddingAvailable();

      sendJson(res, 200, {
        status: 'ok',
        neuralEmbedding: neuralAvailable,
        method: neuralAvailable ? 'neural' : 'dsp',
        features: {
          enrollment: true,
          verification: true,
          identification: true,
          continuousAuth: true,
        },
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/enroll/start
    // ========================================================================
    if (route === '/enroll/start' && req.method === 'POST') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      const body = await parseBody(req);

      // Check if already enrolled
      const existing = await hasVoiceProfile(userId);
      if (existing) {
        sendJson(res, 400, {
          error: 'Already enrolled',
          message: 'Delete existing profile first to re-enroll.',
        });
        return true;
      }

      const session = startEnrollmentSession(userId, {
        requiredSamples: body.requiredSamples,
      });
      enrollmentSessions.set(userId, session);

      log.info({ userId }, 'Enrollment session started');

      sendJson(res, 200, {
        success: true,
        sessionId: userId,
        requiredSamples: session.requiredSamples,
        message: `Please provide ${session.requiredSamples} voice samples.`,
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/enroll/sample
    // ========================================================================
    if (route === '/enroll/sample' && req.method === 'POST') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      const session = enrollmentSessions.get(userId);
      if (!session) {
        sendJson(res, 400, { error: 'No enrollment session' });
        return true;
      }

      const body = await parseBody(req);
      const audio = parseAudio(body);

      if (!audio) {
        sendJson(res, 400, { error: 'Invalid audio data' });
        return true;
      }

      const result = await addEnrollmentSample(session, audio, {
        deviceType: body.deviceType,
        environment: body.environment,
      });

      enrollmentSessions.set(userId, result.session);

      sendJson(res, result.success ? 200 : 400, {
        success: result.success,
        message: result.feedback,
        progress: {
          collected: result.session.samples.length,
          required: result.session.requiredSamples,
          quality: result.session.currentQuality,
          status: result.session.status,
        },
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/enroll/complete
    // ========================================================================
    if (route === '/enroll/complete' && req.method === 'POST') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      const session = enrollmentSessions.get(userId);
      if (!session) {
        sendJson(res, 400, { error: 'No enrollment session' });
        return true;
      }

      const body = await parseBody(req);
      const result = await completeEnrollment(session);

      if (!result.success || !result.profile) {
        sendJson(res, 400, { error: result.error });
        return true;
      }

      if (body.displayName) {
        result.profile.displayName = body.displayName;
      }

      await saveVoiceProfile(result.profile);
      await updateVoiceProfileIndex(result.profile);
      enrollmentSessions.delete(userId);

      log.info({ userId, quality: result.profile.qualityScore }, 'Enrollment completed');

      sendJson(res, 200, {
        success: true,
        message: 'Voice enrollment complete!',
        profile: {
          userId: result.profile.userId,
          displayName: result.profile.displayName,
          qualityScore: result.profile.qualityScore,
          threshold: result.profile.threshold,
          sampleCount: result.profile.embeddings.length,
        },
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/enroll/cancel
    // ========================================================================
    if (route === '/enroll/cancel' && req.method === 'POST') {
      const userId = getUserId(req);
      if (userId) {
        enrollmentSessions.delete(userId);
      }
      sendJson(res, 200, { success: true, message: 'Enrollment cancelled' });
      return true;
    }

    // ========================================================================
    // POST /api/voice/verify
    // ========================================================================
    if (route === '/verify' && req.method === 'POST') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      const body = await parseBody(req);
      const audio = parseAudio(body);

      if (!audio) {
        sendJson(res, 400, { error: 'Invalid audio data' });
        return true;
      }

      const profile = await loadVoiceProfile(userId);
      if (!profile) {
        sendJson(res, 404, { error: 'Not enrolled' });
        return true;
      }

      const result = await verifyUser(audio, profile);

      log.info({ userId, verified: result.verified }, 'Verification attempt');

      sendJson(res, 200, {
        verified: result.verified,
        confidence: result.confidence,
        processingTimeMs: result.processingTimeMs,
        details: result.details,
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/identify
    // ========================================================================
    if (route === '/identify' && req.method === 'POST') {
      const body = await parseBody(req);
      const audio = parseAudio(body);

      if (!audio) {
        sendJson(res, 400, { error: 'Invalid audio data' });
        return true;
      }

      const index = await loadVoiceProfileIndex();

      if (index.length === 0) {
        sendJson(res, 200, {
          identified: false,
          message: 'No enrolled users',
          candidates: [],
        });
        return true;
      }

      const profiles: VoiceProfile[] = index.map((entry) => ({
        userId: entry.userId,
        embeddings: [],
        centroid: entry.centroid,
        threshold: entry.threshold,
        qualityScore: 1,
        verificationCount: 0,
        enrolledAt: new Date(),
        updatedAt: new Date(),
        metadata: { deviceTypes: [], enrollmentDurationMs: 0, sampleCount: 0 },
      }));

      const result = await identifySpeaker(audio, profiles, {
        minThreshold: body.minThreshold,
      });

      log.info({ identified: result.identified, userId: result.userId }, 'Identification attempt');

      sendJson(res, 200, {
        identified: result.identified,
        userId: result.userId,
        confidence: result.confidence,
        candidates: result.candidates.slice(0, 5),
        processingTimeMs: result.processingTimeMs,
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/auth/start
    // ========================================================================
    if (route === '/auth/start' && req.method === 'POST') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      const profile = await loadVoiceProfile(userId);
      if (!profile) {
        sendJson(res, 404, { error: 'Not enrolled' });
        return true;
      }

      const body = await parseBody(req);
      const sessionId = body.sessionId || userId;

      const authenticator = new ContinuousAuthenticator(profile);
      continuousAuthenticators.set(sessionId, authenticator);

      sendJson(res, 200, {
        success: true,
        sessionId,
        message: 'Continuous authentication started',
      });
      return true;
    }

    // ========================================================================
    // POST /api/voice/auth/check
    // ========================================================================
    if (route === '/auth/check' && req.method === 'POST') {
      const body = await parseBody(req);
      const { sessionId } = body;

      const authenticator = continuousAuthenticators.get(sessionId);
      if (!authenticator) {
        sendJson(res, 400, { error: 'No auth session' });
        return true;
      }

      const audio = parseAudio(body);
      if (!audio) {
        sendJson(res, 400, { error: 'Invalid audio data' });
        return true;
      }

      const status = await authenticator.processAudioChunk(audio);
      sendJson(res, 200, status);
      return true;
    }

    // ========================================================================
    // POST /api/voice/auth/stop
    // ========================================================================
    if (route === '/auth/stop' && req.method === 'POST') {
      const body = await parseBody(req);
      continuousAuthenticators.delete(body.sessionId);
      sendJson(res, 200, { success: true, message: 'Authentication stopped' });
      return true;
    }

    // ========================================================================
    // GET /api/voice/profile
    // ========================================================================
    if (route === '/profile' && req.method === 'GET') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      const stats = await getVoiceProfileStats(userId);

      if (!stats || !stats.exists) {
        sendJson(res, 200, { enrolled: false });
        return true;
      }

      sendJson(res, 200, {
        enrolled: true,
        enrolledAt: stats.enrolledAt,
        qualityScore: stats.qualityScore,
        verificationCount: stats.verificationCount,
        sampleCount: stats.sampleCount,
        needsReEnrollment: stats.needsReEnrollment,
      });
      return true;
    }

    // ========================================================================
    // DELETE /api/voice/profile
    // ========================================================================
    if (route === '/profile' && req.method === 'DELETE') {
      const userId = getUserId(req);
      if (!userId) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      await deleteVoiceProfile(userId);
      await removeFromVoiceProfileIndex(userId);

      log.info({ userId }, 'Voice profile deleted');

      sendJson(res, 200, { success: true, message: 'Profile deleted' });
      return true;
    }

    // Route not found under /api/voice
    return false;
  } catch (error) {
    log.error({ error, route }, 'Voice auth route error');
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}
