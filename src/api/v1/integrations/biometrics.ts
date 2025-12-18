/**
 * Biometrics Integration API Routes
 *
 * OAuth flows and management for wearable health platforms.
 * Supports: Apple HealthKit, Google Fit, Oura Ring, Whoop, Fitbit
 *
 * @module api/v1/integrations/biometrics
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';

// SECURITY: Schema for validating OAuth state parameter
const OAuthStateSchema = z.object({
  userId: z.string().min(1),
});
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  syncBiometrics,
  getCurrentBiometrics,
  hasBiometricsConnected,
  getConnectedPlatform,
  disconnectBiometrics,
  type BiometricPlatform,
} from '../../../services/biometrics/index.js';

const log = createLogger({ module: 'api:biometrics' });
const router = Router();

// ============================================================================
// GET /api/v1/integrations/biometrics/status
// Check if user has biometrics connected
// ============================================================================
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const connected = hasBiometricsConnected(userId);
    const platform = getConnectedPlatform(userId);
    const snapshot = connected ? getCurrentBiometrics(userId) : null;

    return res.json({
      connected,
      platform,
      lastSync: snapshot?.timestamp || null,
      stressLevel: snapshot?.stressLevel || null,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get biometrics status');
    return res.status(500).json({ error: 'Failed to get status' });
  }
});

// ============================================================================
// GET /api/v1/integrations/biometrics/connect/:platform
// Get OAuth authorization URL for a platform
// ============================================================================
router.get('/connect/:platform', async (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as BiometricPlatform;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const validPlatforms: BiometricPlatform[] = [
      'healthkit',
      'googlefit',
      'oura',
      'whoop',
      'fitbit',
    ];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
      });
    }

    const authUrl = getAuthorizationUrl(platform, userId);

    log.info({ userId, platform }, 'Generated biometrics auth URL');
    return res.json({ authUrl, platform });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate auth URL');
    return res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// ============================================================================
// GET /api/v1/integrations/biometrics/callback/:platform
// OAuth callback handler
// ============================================================================
router.get('/callback/:platform', async (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as BiometricPlatform;
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      log.warn({ platform, error }, 'OAuth error from provider');
      return res.redirect(`/settings/integrations?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }

    // SECURITY: Decode and validate state parameter with Zod schema
    let userId: string;
    try {
      const rawDecoded = JSON.parse(Buffer.from(state, 'base64').toString());
      const parsed = OAuthStateSchema.safeParse(rawDecoded);
      if (!parsed.success) {
        log.warn({ issues: parsed.error.issues }, 'Invalid OAuth state structure');
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
      userId = parsed.data.userId;
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Exchange code for tokens
    const success = await exchangeCodeForTokens(platform, code, userId);

    if (success) {
      // Trigger initial sync
      void syncBiometrics(userId);

      log.info({ userId, platform }, 'Biometrics connected successfully');
      return res.redirect(`/settings/integrations?success=biometrics&platform=${platform}`);
    } else {
      return res.redirect('/settings/integrations?error=token_exchange_failed');
    }
  } catch (error) {
    log.error({ error: String(error) }, 'OAuth callback failed');
    return res.redirect('/settings/integrations?error=callback_failed');
  }
});

// ============================================================================
// POST /api/v1/integrations/biometrics/sync
// Manually trigger a sync
// ============================================================================
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId: string };

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!hasBiometricsConnected(userId)) {
      return res.status(400).json({ error: 'No biometrics connected' });
    }

    const snapshot = await syncBiometrics(userId);

    if (snapshot) {
      return res.json({
        success: true,
        snapshot: {
          platform: snapshot.platform,
          timestamp: snapshot.timestamp,
          stressLevel: snapshot.stressLevel,
          sleep: snapshot.sleep,
          recovery: snapshot.recovery,
        },
      });
    } else {
      return res.status(500).json({ error: 'Sync failed' });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Biometrics sync failed');
    return res.status(500).json({ error: 'Sync failed' });
  }
});

// ============================================================================
// GET /api/v1/integrations/biometrics/data
// Get current biometric data
// ============================================================================
router.get('/data', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const snapshot = getCurrentBiometrics(userId);

    if (!snapshot) {
      return res.status(404).json({ error: 'No biometric data available' });
    }

    return res.json({
      platform: snapshot.platform,
      timestamp: snapshot.timestamp,
      stressLevel: snapshot.stressLevel,
      hrv: snapshot.hrv,
      sleep: snapshot.sleep,
      activity: snapshot.activity,
      recovery: snapshot.recovery,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get biometric data');
    return res.status(500).json({ error: 'Failed to get data' });
  }
});

// ============================================================================
// DELETE /api/v1/integrations/biometrics/disconnect
// Disconnect biometrics
// ============================================================================
router.delete('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const platform = getConnectedPlatform(userId);
    disconnectBiometrics(userId);

    log.info({ userId, platform }, 'Biometrics disconnected');
    return res.json({ success: true, disconnectedPlatform: platform });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to disconnect biometrics');
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;
