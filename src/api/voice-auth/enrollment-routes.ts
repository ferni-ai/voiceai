/**
 * Voice Enrollment Routes
 *
 * Handles voice enrollment operations:
 * - POST /api/voice/enroll/start     - Start enrollment session
 * - POST /api/voice/enroll/sample    - Add enrollment sample
 * - POST /api/voice/enroll/complete  - Complete enrollment
 * - POST /api/voice/enroll/cancel    - Cancel enrollment
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  addEnrollmentSample,
  completeEnrollment,
  startEnrollmentSession,
} from '../../services/voice-enrollment.js';
import { hasVoiceProfile, saveVoiceProfile, updateVoiceProfileIndex } from '../../services/voice-profile-store.js';
import {
  logEnrollmentComplete,
  logEnrollmentFail,
  logEnrollmentSample,
  logEnrollmentStart,
} from '../../services/voice-audit-log.js';
import { getLogger } from '../../utils/safe-logger.js';
import { SECURITY_CONFIG } from './types.js';
import {
  enrollmentSessions,
  parseBody,
  sendJson,
  getUserId,
  getDeviceInfo,
  checkAndEnforceRateLimit,
  runSecurityChecks,
  parseAudio,
} from './helpers.js';

const log = getLogger().child({ module: 'VoiceEnrollmentRoutes' });

/**
 * Handle voice enrollment routes.
 * @returns true if route was handled
 */
export async function handleEnrollmentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string
): Promise<boolean> {
  // POST /api/voice/enroll/start
  if (route === '/enroll/start' && req.method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    if (!checkAndEnforceRateLimit(req, res, userId, 'enroll')) {
      return true;
    }

    const body = await parseBody(req);
    const deviceInfo = getDeviceInfo(req);

    const existing = await hasVoiceProfile(userId);
    if (existing) {
      sendJson(res, 400, {
        error: 'Already enrolled',
        message: 'Delete existing profile first to re-enroll.',
      });
      return true;
    }

    const session = startEnrollmentSession(userId, {
      requiredSamples: body.requiredSamples as number | undefined,
    });
    enrollmentSessions.set(userId, session);

    if (SECURITY_CONFIG.enableAuditLogging) {
      await logEnrollmentStart(userId, deviceInfo, userId);
    }

    log.info({ userId }, 'Enrollment session started');

    sendJson(res, 200, {
      success: true,
      sessionId: userId,
      requiredSamples: session.requiredSamples,
      message: `Please provide ${session.requiredSamples} voice samples.`,
    });
    return true;
  }

  // POST /api/voice/enroll/sample
  if (route === '/enroll/sample' && req.method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    if (!checkAndEnforceRateLimit(req, res, userId, 'enroll')) {
      return true;
    }

    const session = enrollmentSessions.get(userId);
    if (!session) {
      sendJson(res, 400, { error: 'No enrollment session' });
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
      if (SECURITY_CONFIG.enableAuditLogging) {
        await logEnrollmentFail(userId, 'Security check failed', deviceInfo);
      }
      sendJson(res, 403, {
        error: 'Security check failed',
        message: 'Audio sample did not pass security verification',
        warnings: securityResult.warnings,
      });
      return true;
    }

    const result = await addEnrollmentSample(session, audio, {
      deviceType: body.deviceType as string | undefined,
      environment: body.environment as string | undefined,
    });

    enrollmentSessions.set(userId, result.session);

    if (SECURITY_CONFIG.enableAuditLogging) {
      await logEnrollmentSample(
        userId,
        result.session.samples.length,
        result.session.currentQuality,
        deviceInfo
      );
    }

    sendJson(res, result.success ? 200 : 400, {
      success: result.success,
      message: result.feedback,
      progress: {
        collected: result.session.samples.length,
        required: result.session.requiredSamples,
        quality: result.session.currentQuality,
        status: result.session.status,
      },
      security: {
        livenessScore: securityResult.livenessScore,
        spoofScore: securityResult.spoofScore,
      },
    });
    return true;
  }

  // POST /api/voice/enroll/complete
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
    const deviceInfo = getDeviceInfo(req);
    const result = await completeEnrollment(session);

    if (!result.success || !result.profile) {
      if (SECURITY_CONFIG.enableAuditLogging) {
        await logEnrollmentFail(userId, result.error || 'Unknown error', deviceInfo);
      }
      sendJson(res, 400, { error: result.error });
      return true;
    }

    if (body.displayName) {
      result.profile.displayName = body.displayName as string;
    }

    await saveVoiceProfile(result.profile);
    await updateVoiceProfileIndex(result.profile);
    enrollmentSessions.delete(userId);

    if (SECURITY_CONFIG.enableAuditLogging) {
      await logEnrollmentComplete(
        userId,
        result.profile.qualityScore,
        result.profile.embeddings.length,
        deviceInfo
      );
    }

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

  // POST /api/voice/enroll/cancel
  if (route === '/enroll/cancel' && req.method === 'POST') {
    const userId = getUserId(req);
    if (userId) {
      enrollmentSessions.delete(userId);
    }
    sendJson(res, 200, { success: true, message: 'Enrollment cancelled' });
    return true;
  }

  return false;
}

