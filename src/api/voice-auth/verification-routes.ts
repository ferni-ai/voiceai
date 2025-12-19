/**
 * Voice Verification Routes
 *
 * Handles voice verification and identification:
 * - POST /api/voice/verify           - Verify speaker
 * - POST /api/voice/identify         - Identify speaker (1:N)
 * - POST /api/voice/auth/start       - Start continuous auth
 * - POST /api/voice/auth/check       - Check auth status
 * - POST /api/voice/auth/stop        - Stop continuous auth
 * - GET  /api/voice/profile          - Get profile status
 * - DELETE /api/voice/profile        - Delete profile
 * - GET  /api/voice/status           - System status
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  ContinuousAuthenticator,
  identifySpeaker,
  verifyUser,
  type VoiceProfile,
} from '../../services/voice-enrollment.js';
import { isNeuralEmbeddingAvailable } from '../../services/voice-memory-enhanced.js';
import {
  deleteVoiceProfile,
  getVoiceProfileStats,
  loadVoiceProfile,
  loadVoiceProfileIndex,
  removeFromVoiceProfileIndex,
} from '../../services/voice-profile-store.js';
import {
  checkSuspiciousActivity,
  logIdentification,
  logProfileDelete,
  logVerification,
} from '../../services/voice-audit-log.js';
import { analyzeAuthEmotionContext } from '../../services/voice-emotion-correlation.js';
import { getLogger } from '../../utils/safe-logger.js';
import { SECURITY_CONFIG } from './types.js';
import {
  continuousAuthenticators,
  parseBody,
  sendJson,
  getUserId,
  getVerifiedUserId,
  getClientIP,
  getDeviceInfo,
  checkAndEnforceRateLimit,
  runSecurityChecks,
  parseAudio,
} from './helpers.js';

const log = getLogger().child({ module: 'VoiceVerificationRoutes' });

/**
 * Handle voice verification routes.
 * @returns true if route was handled
 */
export async function handleVerificationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string
): Promise<boolean> {
  // GET /api/voice/status
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

  // POST /api/voice/verify
  if (route === '/verify' && req.method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    if (!checkAndEnforceRateLimit(req, res, userId, 'verify')) {
      return true;
    }

    if (SECURITY_CONFIG.enableAuditLogging) {
      const suspicious = await checkSuspiciousActivity(userId);
      if (suspicious.isSuspicious && suspicious.riskScore > 0.7) {
        log.warn({ userId, reasons: suspicious.reasons }, 'Suspicious activity detected');
        sendJson(res, 403, {
          error: 'Access temporarily restricted',
          message: 'Too many failed attempts. Please try again later.',
        });
        return true;
      }
    }

    const body = await parseBody(req);
    const audio = parseAudio(body);

    if (!audio) {
      sendJson(res, 400, { error: 'Invalid audio data' });
      return true;
    }

    const deviceInfo = getDeviceInfo(req);

    const securityResult = await runSecurityChecks(audio, userId, deviceInfo);
    if (!securityResult.passed) {
      sendJson(res, 403, {
        error: 'Security check failed',
        message: 'Audio did not pass security verification',
        warnings: securityResult.warnings,
      });
      return true;
    }

    const profile = await loadVoiceProfile(userId);
    if (!profile) {
      sendJson(res, 404, { error: 'Not enrolled' });
      return true;
    }

    const result = await verifyUser(audio, profile);

    const emotionContext = analyzeAuthEmotionContext(audio, profile.threshold, result.confidence);

    if (SECURITY_CONFIG.enableAuditLogging) {
      await logVerification(userId, result.verified, result.confidence, deviceInfo, {
        processingTimeMs: result.processingTimeMs,
        livenessScore: securityResult.livenessScore,
        spoofScore: securityResult.spoofScore,
        emotion: emotionContext.emotion.primary,
      });
    }

    log.info({ userId, verified: result.verified }, 'Verification attempt');

    const shouldSuggestRetry = !result.verified && emotionContext.shouldRetry;

    sendJson(res, 200, {
      verified: result.verified,
      confidence: result.confidence,
      processingTimeMs: result.processingTimeMs,
      details: result.details,
      security: {
        livenessScore: securityResult.livenessScore,
        spoofScore: securityResult.spoofScore,
        warnings: securityResult.warnings.length > 0 ? securityResult.warnings : undefined,
      },
      emotion: {
        detected: emotionContext.emotion.primary,
        confidence: emotionContext.emotion.confidence,
        impact: emotionContext.shouldRetry ? 'may_affect_verification' : 'normal',
      },
      suggestion: shouldSuggestRetry
        ? {
            action: 'retry',
            message:
              emotionContext.userMessage || 'Your voice sounds a bit different. Try again?',
            adjustedThreshold: emotionContext.adjustedThreshold,
          }
        : undefined,
    });
    return true;
  }

  // POST /api/voice/identify
  if (route === '/identify' && req.method === 'POST') {
    const userId = getUserId(req) || 'anonymous';
    if (!checkAndEnforceRateLimit(req, res, userId, 'identify')) {
      return true;
    }

    const body = await parseBody(req);
    const audio = parseAudio(body);
    const deviceInfo = getDeviceInfo(req);

    if (!audio) {
      sendJson(res, 400, { error: 'Invalid audio data' });
      return true;
    }

    const securityResult = await runSecurityChecks(audio, userId, deviceInfo);
    if (!securityResult.passed) {
      sendJson(res, 403, {
        error: 'Security check failed',
        message: 'Audio did not pass security verification',
        warnings: securityResult.warnings,
      });
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
      minThreshold: body.minThreshold as number | undefined,
    });

    if (SECURITY_CONFIG.enableAuditLogging) {
      await logIdentification(
        result.userId || null,
        result.identified,
        result.confidence,
        result.candidates.length,
        deviceInfo
      );
    }

    log.info({ identified: result.identified, userId: result.userId }, 'Identification attempt');

    sendJson(res, 200, {
      identified: result.identified,
      userId: result.userId,
      confidence: result.confidence,
      candidates: result.candidates.slice(0, 5),
      processingTimeMs: result.processingTimeMs,
      security: {
        livenessScore: securityResult.livenessScore,
        spoofScore: securityResult.spoofScore,
      },
    });
    return true;
  }

  // POST /api/voice/auth/start
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

    const crypto = await import('crypto');
    const sessionId = `auth_${userId}_${crypto.randomBytes(16).toString('hex')}`;
    const clientIp = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    const authenticator = new ContinuousAuthenticator(profile);
    (authenticator as ContinuousAuthenticator & { _sessionMeta?: object })._sessionMeta = {
      userId,
      clientIp,
      userAgent,
      createdAt: Date.now(),
    };
    continuousAuthenticators.set(sessionId, authenticator);

    sendJson(res, 200, {
      success: true,
      sessionId,
      message: 'Continuous authentication started',
    });
    return true;
  }

  // POST /api/voice/auth/check
  if (route === '/auth/check' && req.method === 'POST') {
    const requestUserId = getUserId(req);
    if (!requestUserId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const body = await parseBody(req);
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId || typeof sessionId !== 'string') {
      sendJson(res, 400, { error: 'sessionId is required' });
      return true;
    }

    const authenticator = continuousAuthenticators.get(sessionId);
    if (!authenticator) {
      sendJson(res, 400, { error: 'No auth session' });
      return true;
    }

    const sessionMeta = (
      authenticator as ContinuousAuthenticator & {
        _sessionMeta?: { userId: string; clientIp: string };
      }
    )._sessionMeta;
    if (sessionMeta && sessionMeta.userId !== requestUserId) {
      log.warn(
        { requestUserId, sessionUserId: sessionMeta.userId, sessionId },
        'SECURITY: Session hijacking attempt - userId mismatch'
      );
      sendJson(res, 403, { error: 'Session access denied' });
      return true;
    }

    const audio = parseAudio(body);
    if (!audio) {
      sendJson(res, 400, { error: 'Invalid audio data' });
      return true;
    }

    const deviceInfo = getDeviceInfo(req);
    const userId = requestUserId;

    const securityResult = await runSecurityChecks(audio, userId, deviceInfo);
    if (!securityResult.passed) {
      if (SECURITY_CONFIG.enableAuditLogging) {
        await logVerification(userId, false, 0, deviceInfo, {
          reason: 'continuous_auth_security_fail',
          warnings: securityResult.warnings,
        });
      }
      sendJson(res, 403, {
        error: 'Security check failed',
        message: 'Audio did not pass security verification',
        warnings: securityResult.warnings,
      });
      return true;
    }

    const status = await authenticator.processAudioChunk(audio);

    sendJson(res, 200, {
      ...status,
      security: {
        livenessScore: securityResult.livenessScore,
        spoofScore: securityResult.spoofScore,
      },
    });
    return true;
  }

  // POST /api/voice/auth/stop
  if (route === '/auth/stop' && req.method === 'POST') {
    const body = await parseBody(req);
    continuousAuthenticators.delete(body.sessionId as string);
    sendJson(res, 200, { success: true, message: 'Authentication stopped' });
    return true;
  }

  // GET /api/voice/profile
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

  // DELETE /api/voice/profile
  if (route === '/profile' && req.method === 'DELETE') {
    const { userId, verified } = getVerifiedUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    if (!verified) {
      const clientIp = getClientIP(req);
      log.warn(
        { userId, clientIp },
        'SECURITY: Profile deletion with unverified X-User-Id - recommend Firebase auth'
      );
    }

    if (!checkAndEnforceRateLimit(req, res, userId, 'profile')) {
      return true;
    }

    const deviceInfo = getDeviceInfo(req);

    await deleteVoiceProfile(userId);
    await removeFromVoiceProfileIndex(userId);

    await logProfileDelete(userId, deviceInfo);

    log.info({ userId, verified }, 'Voice profile deleted');

    sendJson(res, 200, { success: true, message: 'Profile deleted' });
    return true;
  }

  return false;
}

