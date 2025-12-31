/**
 * Biometrics Service
 *
 * Integrates with wearable health platforms (Apple HealthKit, Google Fit, Oura, Whoop)
 * to provide superhuman awareness of user's physical state.
 *
 * "Better than Human" Capabilities:
 * - Real-time stress detection from HRV
 * - Sleep quality awareness affecting conversation tone
 * - Activity level correlation with mood
 * - Recovery score integration for gentle/energetic approach
 *
 * @see ./types.ts - Type definitions
 * @see ./token-persistence.ts - Token storage
 * @see ./insights.ts - Insight generation
 * @module services/biometrics
 */

import { getCircuitBreaker } from '../../utils/circuit-breaker.js';
import { createLogger } from '../../utils/safe-logger.js';

// Re-export extracted modules
export * from './token-persistence.js';
export {
  generateBiometricInsight as generateInsight,
  generateSuperhumanMoment as generateSuperhumanMomentFromSnapshot,
} from './insights.js';

// Import token persistence (used internally)
import { persistTokens, loadTokens, clearPersistedTokens } from './token-persistence.js';

// Import insight helpers (used internally in public API wrappers)
import {
  generateBiometricInsight as generateInsightFromSnapshot,
  generateSuperhumanMoment as generateSuperhumanMomentFromSnapshot,
} from './insights.js';

// Circuit breakers for biometric platform APIs
const terraCircuitBreaker = getCircuitBreaker('terra-biometrics', {
  failureThreshold: 5,
  resetTimeout: 120_000, // 2 minutes
  successThreshold: 2,
});

const whoopCircuitBreaker = getCircuitBreaker('whoop-api', {
  failureThreshold: 5,
  resetTimeout: 120_000, // 2 minutes
  successThreshold: 2,
});

// Import types from dedicated types module
export type {
  ActivityData,
  BiometricEvent,
  BiometricInsight,
  BiometricPlatform,
  BiometricSnapshot,
  ConversationAwareness,
  HRVData,
  RecoveryData,
  SleepData,
  StressLevel,
} from './types.js';

import type {
  ActivityData,
  BiometricEvent,
  BiometricInsight,
  BiometricPlatform,
  BiometricSnapshot,
  HRVData,
  PersistedBiometricTokens,
  RecoveryData,
  SleepData,
  StressLevel,
  UserBiometrics,
} from './types.js';

const log = createLogger({ module: 'Biometrics' });

// ============================================================================
// STATE
// ============================================================================

const userBiometrics = new Map<string, UserBiometrics>();

// Token persistence is in ./token-persistence.ts

/**
 * Ensure user biometrics are loaded (from memory cache or storage)
 */
async function ensureUserBiometrics(userId: string): Promise<UserBiometrics | null> {
  // Check memory cache first
  const cached = userBiometrics.get(userId);
  if (cached) return cached;

  // Try to load from persistent storage
  const loaded = await loadTokens(userId);
  if (loaded) {
    userBiometrics.set(userId, loaded);
    return loaded;
  }

  return null;
}

// Configuration
const config = {
  // HealthKit requires native iOS app - use Terra API for web integration
  // See: https://tryterra.co - aggregates Apple Health + 300 other wearables
  healthkit: {
    clientId: process.env.HEALTHKIT_CLIENT_ID || '',
    clientSecret: process.env.HEALTHKIT_CLIENT_SECRET || '',
    redirectUri: process.env.HEALTHKIT_REDIRECT_URI || '',
  },
  // Terra API - Recommended for HealthKit/Apple Health web integration
  terra: {
    apiKey: process.env.TERRA_API_KEY || '',
    devId: process.env.TERRA_DEV_ID || '',
    webhookSecret: process.env.TERRA_WEBHOOK_SECRET || '',
  },
  googlefit: {
    clientId: process.env.GOOGLE_FIT_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_FIT_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_FIT_REDIRECT_URI || '',
  },
  oura: {
    clientId: process.env.OURA_CLIENT_ID || '',
    clientSecret: process.env.OURA_CLIENT_SECRET || '',
    redirectUri: process.env.OURA_REDIRECT_URI || '',
  },
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID || '',
    clientSecret: process.env.WHOOP_CLIENT_SECRET || '',
    redirectUri: process.env.WHOOP_REDIRECT_URI || '',
  },
};

// ============================================================================
// OAUTH FLOWS
// ============================================================================

/**
 * Get OAuth authorization URL for a biometric platform
 */
export function getAuthorizationUrl(
  platform: BiometricPlatform,
  userId: string,
  scopes?: string[]
): string {
  const state = Buffer.from(JSON.stringify({ userId, platform })).toString('base64');

  switch (platform) {
    case 'healthkit':
      // HealthKit uses Apple Health via HealthKit JS or native app
      // This would redirect to your native app's deep link
      return `ferni://healthkit/auth?state=${state}`;

    case 'googlefit':
      const googleScopes =
        scopes?.join(' ') ||
        [
          'https://www.googleapis.com/auth/fitness.heart_rate.read',
          'https://www.googleapis.com/auth/fitness.sleep.read',
          'https://www.googleapis.com/auth/fitness.activity.read',
        ].join(' ');
      return (
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${config.googlefit.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.googlefit.redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(googleScopes)}&` +
        `state=${state}&` +
        `access_type=offline`
      );

    case 'oura':
      const ouraScopes = scopes?.join(' ') || 'daily sleep activity heartrate';
      return (
        `https://cloud.ouraring.com/oauth/authorize?` +
        `client_id=${config.oura.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.oura.redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(ouraScopes)}&` +
        `state=${state}`
      );

    case 'whoop':
      const whoopScopes =
        scopes?.join(' ') || 'read:recovery read:sleep read:workout read:body_measurement';
      return (
        `https://api.prod.whoop.com/oauth/oauth2/auth?` +
        `client_id=${config.whoop.clientId}&` +
        `redirect_uri=${encodeURIComponent(config.whoop.redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(whoopScopes)}&` +
        `state=${state}`
      );

    case 'terra':
      // Terra uses a widget-based authentication flow
      // The widget handles connection to 300+ wearables including Apple Health
      // See: https://docs.tryterra.co/docs/authenticate-widget
      if (!config.terra.devId || !config.terra.apiKey) {
        throw new Error('Terra API not configured. Set TERRA_DEV_ID and TERRA_API_KEY env vars.');
      }
      // For sync URL generation, we return a placeholder that the caller should replace
      // with the actual session URL from generateTerraSession()
      // This is because session generation is async and getAuthorizationUrl is sync
      return `TERRA_SESSION_REQUIRED:${state}:${userId}`;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// ============================================================================
// TERRA SESSION GENERATION
// ============================================================================

/**
 * Terra session response from their API
 */
interface TerraSessionResponse {
  status: string;
  session_id: string;
  url: string;
  expires_at: string;
}

/**
 * Generate a Terra authentication session.
 * This creates a widget session URL that allows users to connect 300+ wearables
 * including Apple Health, Fitbit, Garmin, Samsung Health, and more.
 *
 * @see https://docs.tryterra.co/reference/generate-authentication-url
 */
export async function generateTerraSession(
  userId: string,
  options?: {
    /** Specific providers to show (e.g., ['APPLE', 'FITBIT', 'GARMIN']) */
    providers?: string[];
    /** Language for widget (e.g., 'en', 'es', 'fr') */
    language?: string;
    /** Custom redirect URL after authentication */
    redirectUrl?: string;
  }
): Promise<
  | { success: true; url: string; sessionId: string; expiresAt: Date }
  | { success: false; error: string }
> {
  if (!config.terra.devId || !config.terra.apiKey) {
    return {
      success: false,
      error: 'Terra API not configured. Set TERRA_DEV_ID and TERRA_API_KEY env vars.',
    };
  }

  try {
    const redirectUrl =
      options?.redirectUrl ||
      `${process.env.APP_URL || 'https://app.ferni.ai'}/api/v1/integrations/biometrics/callback/terra`;

    const response = await terraCircuitBreaker.execute(() =>
      fetch('https://api.tryterra.co/v2/auth/generateWidgetSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'dev-id': config.terra.devId,
          'x-api-key': config.terra.apiKey,
        },
        body: JSON.stringify({
          reference_id: userId,
          providers: options?.providers?.join(',') || undefined,
          language: options?.language || 'en',
          auth_success_redirect_url: redirectUrl,
          auth_failure_redirect_url: `${redirectUrl}?error=auth_failed`,
        }),
        signal: AbortSignal.timeout(10000),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'Terra session generation failed');
      return { success: false, error: `Terra API error: ${response.status}` };
    }

    const data = (await response.json()) as TerraSessionResponse;

    if (data.status !== 'success' || !data.url) {
      log.error({ data }, 'Terra session generation returned unexpected response');
      return { success: false, error: 'Invalid Terra response' };
    }

    log.info({ userId, sessionId: data.session_id }, 'Terra session generated');

    return {
      success: true,
      url: data.url,
      sessionId: data.session_id,
      expiresAt: new Date(data.expires_at),
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Terra session generation error');
    return { success: false, error: String(error) };
  }
}

/**
 * Handle Terra webhook callback.
 * Terra sends user data via webhooks after successful authentication.
 *
 * @see https://docs.tryterra.co/reference/webhooks
 */
export async function handleTerraWebhook(
  webhookBody: unknown,
  signature?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  // Verify webhook signature if secret is configured
  if (config.terra.webhookSecret && signature) {
    // Terra uses HMAC-SHA256 for webhook verification
    const crypto = await import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', config.terra.webhookSecret)
      .update(JSON.stringify(webhookBody))
      .digest('hex');

    if (signature !== expectedSignature) {
      log.warn('Terra webhook signature mismatch');
      return { success: false, error: 'Invalid webhook signature' };
    }
  }

  const body = webhookBody as {
    type?: string;
    user?: { reference_id?: string; user_id?: string };
    data?: unknown[];
  };

  if (!body.type || !body.user?.reference_id) {
    log.warn({ body }, 'Invalid Terra webhook payload');
    return { success: false, error: 'Invalid webhook payload' };
  }

  const userId = body.user.reference_id;
  const terraUserId = body.user.user_id;

  log.info({ userId, terraUserId, type: body.type }, 'Terra webhook received');

  switch (body.type) {
    case 'auth':
      // User authenticated - store their Terra user ID
      if (terraUserId) {
        const userBio: UserBiometrics = {
          platform: 'terra',
          accessToken: terraUserId, // Terra uses user_id instead of OAuth tokens
          refreshToken: '',
          tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          lastSync: new Date(0),
          snapshot: null,
          history: [],
          eventCallbacks: new Set(),
        };
        userBiometrics.set(userId, userBio);
        await persistTokens(userId, userBio);
        log.info({ userId }, 'Terra user authenticated and stored');
      }
      break;

    case 'body':
    case 'activity':
    case 'daily':
    case 'sleep':
    case 'nutrition':
      // Data webhook - process and store
      if (body.data && Array.isArray(body.data)) {
        await processTerraDataWebhook(userId, body.type, body.data);
      }
      break;

    case 'deauth':
      // User disconnected
      userBiometrics.delete(userId);
      log.info({ userId }, 'Terra user deauthenticated');
      break;
  }

  return { success: true, userId };
}

/**
 * Process incoming Terra data webhook
 */
async function processTerraDataWebhook(
  userId: string,
  dataType: string,
  data: unknown[]
): Promise<void> {
  const user = await ensureUserBiometrics(userId);
  if (!user || user.platform !== 'terra') {
    log.warn({ userId, dataType }, 'Terra data webhook for unknown user');
    return;
  }

  // Convert Terra data format to our BiometricSnapshot
  // This is a simplified conversion - Terra has very rich data
  // Initialize snapshot if it doesn't exist
  if (!user.snapshot) {
    user.snapshot = createMockSnapshot(userId, 'terra');
  }

  const snapshot = user.snapshot;

  for (const entry of data) {
    const terraData = entry as Record<string, unknown>;

    if (dataType === 'sleep' && terraData.sleep_durations_data) {
      const sleepData = terraData.sleep_durations_data as Record<string, unknown>;
      const asleepData = sleepData.asleep as { duration_asleep_state_seconds?: number } | undefined;
      const durationHours = (asleepData?.duration_asleep_state_seconds || 0) / 3600;
      const qualityScore = (sleepData.sleep_efficiency as number) || 70;

      const existingSleep = snapshot.sleep;
      snapshot.sleep = {
        duration: durationHours,
        deepSleepPercent: existingSleep?.deepSleepPercent ?? 20,
        remSleepPercent: existingSleep?.remSleepPercent ?? 22,
        disturbances: existingSleep?.disturbances ?? 2,
        qualityScore,
        bedtime: existingSleep?.bedtime ?? new Date(),
        wakeTime: existingSleep?.wakeTime ?? new Date(),
      };
    }

    if (dataType === 'activity' && terraData.active_durations_data) {
      const activityData = terraData.active_durations_data as Record<string, number>;
      const existingActivity = snapshot.activity;
      snapshot.activity = {
        steps: activityData.steps || existingActivity?.steps || 0,
        activeMinutes:
          (activityData.activity_seconds || 0) / 60 || existingActivity?.activeMinutes || 0,
        caloriesBurned: activityData.calories || existingActivity?.caloriesBurned || 0,
        hoursSinceActivity: existingActivity?.hoursSinceActivity ?? 1,
        standingHours: existingActivity?.standingHours ?? 8,
      };
    }

    if (dataType === 'body' && terraData.heart_rate_data) {
      const hrvData = terraData.heart_rate_data as { hrv_samples_sdnn?: Array<{ hrv: number }> };
      if (hrvData.hrv_samples_sdnn?.[0]) {
        const currentHrv = hrvData.hrv_samples_sdnn[0].hrv;
        const baseline = snapshot.hrv?.baseline ?? 50;
        snapshot.hrv = {
          current: currentHrv,
          baseline,
          deviationPercent: ((currentHrv - baseline) / baseline) * 100,
          timestamp: new Date(),
        };
      }
    }
  }

  user.lastSync = new Date();
  log.debug({ userId, dataType, entriesCount: data.length }, 'Terra data processed');
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  platform: BiometricPlatform,
  code: string,
  userId: string
): Promise<boolean> {
  try {
    let tokenUrl: string;
    let body: URLSearchParams;
    const platformConfig = config[platform as keyof typeof config];

    if (!platformConfig || !('clientId' in platformConfig)) {
      log.error({ platform }, 'Platform not configured');
      return false;
    }

    switch (platform) {
      case 'googlefit':
        tokenUrl = 'https://oauth2.googleapis.com/token';
        body = new URLSearchParams({
          client_id: platformConfig.clientId,
          client_secret: platformConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: platformConfig.redirectUri,
        });
        break;

      case 'oura':
        tokenUrl = 'https://api.ouraring.com/oauth/token';
        body = new URLSearchParams({
          client_id: platformConfig.clientId,
          client_secret: platformConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: platformConfig.redirectUri,
        });
        break;

      case 'whoop':
        tokenUrl = 'https://api.prod.whoop.com/oauth/oauth2/token';
        body = new URLSearchParams({
          client_id: platformConfig.clientId,
          client_secret: platformConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: platformConfig.redirectUri,
        });
        break;

      case 'fitbit':
        tokenUrl = 'https://api.fitbit.com/oauth2/token';
        // Fitbit requires Basic auth header with client credentials
        body = new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: platformConfig.redirectUri,
        });
        // Special handling for Fitbit - needs auth header
        // We'll set headers differently below
        break;

      case 'terra':
        // Terra uses webhook-based authentication - no code exchange needed
        // The handleTerraWebhook function processes auth callbacks
        log.info({ userId }, 'Terra authentication handled via webhooks');
        return true;

      case 'healthkit':
        // HealthKit requires native iOS app - cannot exchange tokens server-side
        log.warn({ platform }, 'HealthKit requires native iOS app integration');
        return false;

      default:
        log.warn({ platform }, 'Unknown platform for token exchange');
        return false;
    }

    // Build headers - Fitbit requires Basic auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (platform === 'fitbit') {
      // Fitbit uses Basic auth with base64-encoded client_id:client_secret
      const credentials = Buffer.from(
        `${platformConfig.clientId}:${platformConfig.clientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      log.error({ platform, status: response.status }, 'Token exchange failed');
      return false;
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Store tokens in memory
    const userBio: UserBiometrics = {
      platform,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      lastSync: new Date(0),
      snapshot: null,
      history: [],
      eventCallbacks: new Set(),
    };
    userBiometrics.set(userId, userBio);

    // Persist tokens to storage (don't await - fire and forget for speed)
    void persistTokens(userId, userBio);

    log.info({ userId, platform }, 'Biometrics connected');
    return true;
  } catch (error) {
    log.error({ error: String(error), platform }, 'Token exchange error');
    return false;
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Sync latest biometric data from connected platform
 */
export async function syncBiometrics(userId: string): Promise<BiometricSnapshot | null> {
  // Load from persistence if not in memory
  const user = await ensureUserBiometrics(userId);
  if (!user) {
    log.debug({ userId }, 'No biometrics connected');
    return null;
  }

  // Check if token needs refresh
  if (user.tokenExpiry <= new Date()) {
    const refreshed = await refreshToken(userId);
    if (!refreshed) {
      log.warn({ userId }, 'Token refresh failed');
      return null;
    }
  }

  try {
    let snapshot: BiometricSnapshot;

    switch (user.platform) {
      case 'googlefit':
        snapshot = await fetchGoogleFitData(userId, user.accessToken);
        break;
      case 'oura':
        snapshot = await fetchOuraData(userId, user.accessToken);
        break;
      case 'whoop':
        snapshot = await fetchWhoopData(userId, user.accessToken);
        break;
      case 'terra':
        // Terra pushes data via webhooks - sync fetches latest cached data
        snapshot = await fetchTerraData(userId, user.accessToken);
        break;
      default:
        // HealthKit/Fitbit native - use mock for now (requires companion iOS app)
        snapshot = createMockSnapshot(userId, user.platform);
    }

    // Update state
    user.snapshot = snapshot;
    user.lastSync = new Date();
    user.history.push(snapshot);
    if (user.history.length > 168) {
      // Keep 1 week of hourly snapshots
      user.history.shift();
    }

    // Check for events
    checkForEvents(userId, snapshot);

    log.debug({ userId, platform: user.platform }, 'Biometrics synced');
    return snapshot;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Sync failed');
    return null;
  }
}

async function refreshToken(userId: string): Promise<boolean> {
  const user = userBiometrics.get(userId);
  if (!user) return false;

  log.debug({ userId, platform: user.platform }, 'Refreshing OAuth token');

  try {
    let tokenUrl: string;
    let body: URLSearchParams;
    const platformConfig = config[user.platform as keyof typeof config];

    if (!platformConfig || !('clientId' in platformConfig)) {
      log.error({ platform: user.platform }, 'Platform not configured for refresh');
      return false;
    }

    switch (user.platform) {
      case 'googlefit':
        tokenUrl = 'https://oauth2.googleapis.com/token';
        body = new URLSearchParams({
          client_id: platformConfig.clientId,
          client_secret: platformConfig.clientSecret,
          refresh_token: user.refreshToken,
          grant_type: 'refresh_token',
        });
        break;

      case 'oura':
        tokenUrl = 'https://api.ouraring.com/oauth/token';
        body = new URLSearchParams({
          client_id: platformConfig.clientId,
          client_secret: platformConfig.clientSecret,
          refresh_token: user.refreshToken,
          grant_type: 'refresh_token',
        });
        break;

      case 'whoop':
        tokenUrl = 'https://api.prod.whoop.com/oauth/oauth2/token';
        body = new URLSearchParams({
          client_id: platformConfig.clientId,
          client_secret: platformConfig.clientSecret,
          refresh_token: user.refreshToken,
          grant_type: 'refresh_token',
        });
        break;

      case 'fitbit':
        tokenUrl = 'https://api.fitbit.com/oauth2/token';
        body = new URLSearchParams({
          refresh_token: user.refreshToken,
          grant_type: 'refresh_token',
        });
        break;

      case 'terra':
        // Terra doesn't use traditional OAuth refresh - it uses webhook-based data push
        // The Terra user ID remains valid indefinitely once authenticated via widget
        log.debug({ platform: user.platform }, 'Terra uses persistent sessions, no refresh needed');
        return true;

      default:
        // HealthKit doesn't use OAuth refresh (native app handles it)
        log.warn({ platform: user.platform }, 'Token refresh not supported for platform');
        return false;
    }

    // Build headers - Fitbit requires Basic auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (user.platform === 'fitbit') {
      const credentials = Buffer.from(
        `${platformConfig.clientId}:${platformConfig.clientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      log.error({ platform: user.platform, status: response.status }, 'Token refresh failed');
      return false;
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Update tokens in memory
    user.accessToken = tokens.access_token;
    if (tokens.refresh_token) {
      user.refreshToken = tokens.refresh_token;
    }
    user.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    // Persist updated tokens
    void persistTokens(userId, user);

    log.info({ userId, platform: user.platform }, 'OAuth token refreshed');
    return true;
  } catch (error) {
    log.error({ error: String(error), userId, platform: user.platform }, 'Token refresh error');
    return false;
  }
}

async function fetchGoogleFitData(userId: string, accessToken: string): Promise<BiometricSnapshot> {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  // Fetch HRV data
  const hrvResponse = await fetch(
    `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
        bucketByTime: { durationMillis: 3600000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      }),
    }
  );

  // Parse and transform data (simplified)
  const stressLevel = calculateStressLevel(null);

  return {
    userId,
    platform: 'googlefit',
    timestamp: new Date(),
    hrv: null, // Would parse from response
    sleep: null,
    activity: null,
    recovery: null,
    stressLevel,
    raw: hrvResponse.ok ? ((await hrvResponse.json()) as Record<string, unknown>) : undefined,
  };
}

async function fetchOuraData(userId: string, accessToken: string): Promise<BiometricSnapshot> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch sleep data
  const sleepResponse = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${today}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // Fetch readiness (recovery) data
  const readinessResponse = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let sleepData: SleepData | null = null;
  let recoveryData: RecoveryData | null = null;

  if (sleepResponse.ok) {
    const sleep = (await sleepResponse.json()) as {
      data: Array<{
        total_sleep_duration: number;
        deep_sleep_duration: number;
        rem_sleep_duration: number;
        awake_time: number;
        score: number;
      }>;
    };
    if (sleep.data?.[0]) {
      const s = sleep.data[0];
      sleepData = {
        duration: s.total_sleep_duration / 3600,
        deepSleepPercent: (s.deep_sleep_duration / s.total_sleep_duration) * 100,
        remSleepPercent: (s.rem_sleep_duration / s.total_sleep_duration) * 100,
        disturbances: Math.round(s.awake_time / 300), // Rough estimate
        qualityScore: s.score,
        bedtime: new Date(), // Would parse from actual data
        wakeTime: new Date(),
      };
    }
  }

  if (readinessResponse.ok) {
    const readiness = (await readinessResponse.json()) as {
      data: Array<{
        score: number;
        contributors: {
          sleep_balance: number;
          hrv_balance: number;
          resting_heart_rate: number;
          activity_balance: number;
        };
      }>;
    };
    if (readiness.data?.[0]) {
      const r = readiness.data[0];
      recoveryData = {
        score: r.score,
        readiness:
          r.score >= 85 ? 'peak' : r.score >= 70 ? 'high' : r.score >= 50 ? 'moderate' : 'low',
        factors: {
          sleep: r.contributors.sleep_balance,
          hrv: r.contributors.hrv_balance,
          restingHR: r.contributors.resting_heart_rate,
          activity: r.contributors.activity_balance,
        },
      };
    }
  }

  const stressLevel = calculateStressFromOura(sleepData, recoveryData);

  return {
    userId,
    platform: 'oura',
    timestamp: new Date(),
    hrv: null,
    sleep: sleepData,
    activity: null,
    recovery: recoveryData,
    stressLevel,
  };
}

async function fetchWhoopData(userId: string, accessToken: string): Promise<BiometricSnapshot> {
  // Fetch recovery data
  const recoveryResponse = await whoopCircuitBreaker.execute(() =>
    fetch('https://api.prod.whoop.com/developer/v1/recovery?limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );

  let recoveryData: RecoveryData | null = null;
  let hrvData: HRVData | null = null;

  if (recoveryResponse.ok) {
    const recovery = (await recoveryResponse.json()) as {
      records: Array<{
        score: {
          recovery_score: number;
          hrv_rmssd_milli: number;
          resting_heart_rate: number;
        };
      }>;
    };
    if (recovery.records?.[0]) {
      const r = recovery.records[0].score;
      recoveryData = {
        score: r.recovery_score,
        readiness: r.recovery_score >= 67 ? 'peak' : r.recovery_score >= 34 ? 'moderate' : 'low',
        factors: {
          sleep: 0, // Would need separate call
          hrv: r.hrv_rmssd_milli,
          restingHR: r.resting_heart_rate,
          activity: 0,
        },
      };
      hrvData = {
        current: r.hrv_rmssd_milli,
        baseline: r.hrv_rmssd_milli, // Would need history
        deviationPercent: 0,
        timestamp: new Date(),
      };
    }
  }

  const stressLevel = calculateStressFromHRV(hrvData);

  return {
    userId,
    platform: 'whoop',
    timestamp: new Date(),
    hrv: hrvData,
    sleep: null,
    activity: null,
    recovery: recoveryData,
    stressLevel,
  };
}

/**
 * Fetch biometric data from Terra API
 * Terra aggregates data from 300+ wearables including Apple Health
 * Note: Terra primarily pushes data via webhooks; this fetches the latest cached data
 */
async function fetchTerraData(userId: string, terraUserId: string): Promise<BiometricSnapshot> {
  if (!config.terra.apiKey || !config.terra.devId) {
    log.warn('Terra API not configured');
    return createMockSnapshot(userId, 'terra');
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Fetch daily data from Terra
    const response = await fetch(
      `https://api.tryterra.co/v2/daily?user_id=${terraUserId}&start_date=${today}&end_date=${today}`,
      {
        headers: {
          'dev-id': config.terra.devId,
          'x-api-key': config.terra.apiKey,
        },
      }
    );

    if (!response.ok) {
      log.warn({ status: response.status }, 'Terra API request failed');
      return createMockSnapshot(userId, 'terra');
    }

    const data = (await response.json()) as {
      data?: Array<{
        sleep_data?: {
          sleep_duration_in_hours?: number;
          sleep_score?: number;
          deep_sleep_duration_hours?: number;
          rem_sleep_duration_hours?: number;
        };
        activity_data?: {
          steps?: number;
          active_durations_data?: { activity_seconds?: number };
          calories_data?: { total_burned_calories?: number };
        };
        heart_data?: {
          hrv_data?: { hrv?: { avg_hrv_sdnn?: number } };
        };
      }>;
    };

    let sleepData: SleepData | null = null;
    let activityData: ActivityData | null = null;
    let hrvData: HRVData | null = null;

    if (data.data?.[0]) {
      const d = data.data[0];

      if (d.sleep_data) {
        sleepData = {
          duration: d.sleep_data.sleep_duration_in_hours || 0,
          qualityScore: d.sleep_data.sleep_score || 50,
          deepSleepPercent:
            ((d.sleep_data.deep_sleep_duration_hours || 0) /
              (d.sleep_data.sleep_duration_in_hours || 1)) *
            100,
          remSleepPercent:
            ((d.sleep_data.rem_sleep_duration_hours || 0) /
              (d.sleep_data.sleep_duration_in_hours || 1)) *
            100,
          disturbances: 0,
          bedtime: new Date(),
          wakeTime: new Date(),
        };
      }

      if (d.activity_data) {
        activityData = {
          steps: d.activity_data.steps || 0,
          activeMinutes: Math.round(
            (d.activity_data.active_durations_data?.activity_seconds || 0) / 60
          ),
          caloriesBurned: d.activity_data.calories_data?.total_burned_calories || 0,
          hoursSinceActivity: 0,
          standingHours: 0,
        };
      }

      if (d.heart_data?.hrv_data?.hrv?.avg_hrv_sdnn) {
        hrvData = {
          current: d.heart_data.hrv_data.hrv.avg_hrv_sdnn,
          baseline: d.heart_data.hrv_data.hrv.avg_hrv_sdnn,
          deviationPercent: 0,
          timestamp: new Date(),
        };
      }
    }

    const stressLevel = calculateStressLevel(hrvData);

    return {
      userId,
      platform: 'terra',
      timestamp: new Date(),
      hrv: hrvData,
      sleep: sleepData,
      activity: activityData,
      recovery: null,
      stressLevel,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Terra data fetch error');
    return createMockSnapshot(userId, 'terra');
  }
}

function createMockSnapshot(userId: string, platform: BiometricPlatform): BiometricSnapshot {
  return {
    userId,
    platform,
    timestamp: new Date(),
    hrv: null,
    sleep: null,
    activity: null,
    recovery: null,
    stressLevel: 'moderate',
  };
}

// ============================================================================
// STRESS CALCULATION
// ============================================================================

function calculateStressLevel(hrv: HRVData | null): StressLevel {
  if (!hrv) return 'moderate';

  // HRV deviation from baseline indicates stress
  if (hrv.deviationPercent <= -30) return 'elevated';
  if (hrv.deviationPercent <= -20) return 'high';
  if (hrv.deviationPercent <= -10) return 'moderate';
  return 'low';
}

function calculateStressFromHRV(hrv: HRVData | null): StressLevel {
  return calculateStressLevel(hrv);
}

function calculateStressFromOura(
  sleep: SleepData | null,
  recovery: RecoveryData | null
): StressLevel {
  if (!sleep && !recovery) return 'moderate';

  let stressScore = 50; // Neutral

  if (sleep) {
    if (sleep.qualityScore < 50) stressScore += 20;
    else if (sleep.qualityScore < 70) stressScore += 10;
    if (sleep.duration < 6) stressScore += 15;
  }

  if (recovery) {
    if (recovery.score < 50) stressScore += 20;
    else if (recovery.score < 70) stressScore += 10;
  }

  if (stressScore >= 80) return 'elevated';
  if (stressScore >= 65) return 'high';
  if (stressScore >= 50) return 'moderate';
  return 'low';
}

// ============================================================================
// EVENT DETECTION
// ============================================================================

function checkForEvents(userId: string, snapshot: BiometricSnapshot): void {
  const user = userBiometrics.get(userId);
  if (!user || user.eventCallbacks.size === 0) return;

  const events: BiometricEvent[] = [];

  // Check HRV spike
  if (snapshot.hrv && snapshot.hrv.deviationPercent <= -25) {
    events.push({
      type: 'hrv_spike',
      severity: snapshot.hrv.deviationPercent <= -35 ? 'alert' : 'warning',
      message: `HRV dropped ${Math.abs(snapshot.hrv.deviationPercent)}% below baseline`,
      data: { hrv: snapshot.hrv },
      timestamp: new Date(),
    });
  }

  // Check poor sleep
  if (snapshot.sleep && snapshot.sleep.qualityScore < 60) {
    events.push({
      type: 'poor_sleep',
      severity: snapshot.sleep.qualityScore < 40 ? 'alert' : 'warning',
      message: `Sleep quality was ${snapshot.sleep.qualityScore}% (${snapshot.sleep.duration.toFixed(1)}h)`,
      data: { sleep: snapshot.sleep },
      timestamp: new Date(),
    });
  }

  // Check sedentary
  if (snapshot.activity && snapshot.activity.hoursSinceActivity > 3) {
    events.push({
      type: 'sedentary',
      severity: 'info',
      message: `${snapshot.activity.hoursSinceActivity} hours since last activity`,
      data: { activity: snapshot.activity },
      timestamp: new Date(),
    });
  }

  // Check recovery
  if (snapshot.recovery && snapshot.recovery.score < 50) {
    events.push({
      type: 'recovery_low',
      severity: snapshot.recovery.score < 30 ? 'alert' : 'warning',
      message: `Recovery score is ${snapshot.recovery.score}%`,
      data: { recovery: snapshot.recovery },
      timestamp: new Date(),
    });
  }

  // Check elevated stress
  if (snapshot.stressLevel === 'elevated') {
    events.push({
      type: 'stress_elevated',
      severity: 'warning',
      message: 'Elevated stress detected from biometrics',
      data: { stressLevel: snapshot.stressLevel },
      timestamp: new Date(),
    });
  }

  // Emit events
  for (const event of events) {
    for (const callback of user.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        log.error({ error: String(error) }, 'Event callback error');
      }
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current biometric snapshot for user
 */
export function getCurrentBiometrics(userId: string): BiometricSnapshot | null {
  return userBiometrics.get(userId)?.snapshot ?? null;
}

/**
 * Get current stress level
 */
export function getStressLevel(userId: string): StressLevel {
  return userBiometrics.get(userId)?.snapshot?.stressLevel ?? 'moderate';
}

/**
 * Get current HRV data
 */
export function getCurrentHRV(userId: string): HRVData | null {
  return userBiometrics.get(userId)?.snapshot?.hrv ?? null;
}

/**
 * Get today's sleep quality
 */
export function getSleepQuality(userId: string): SleepData | null {
  return userBiometrics.get(userId)?.snapshot?.sleep ?? null;
}

/**
 * Get current recovery status
 */
export function getRecoveryStatus(userId: string): RecoveryData | null {
  return userBiometrics.get(userId)?.snapshot?.recovery ?? null;
}

/**
 * Subscribe to real-time biometric events
 */
export function subscribeToEvents(
  userId: string,
  callback: (event: BiometricEvent) => void
): () => void {
  const user = userBiometrics.get(userId);
  if (!user) {
    log.warn({ userId }, 'Cannot subscribe - no biometrics connected');
    return () => {};
  }

  user.eventCallbacks.add(callback);
  return () => user.eventCallbacks.delete(callback);
}

/**
 * Check if user has biometrics connected
 */
export function hasBiometricsConnected(userId: string): boolean {
  return userBiometrics.has(userId);
}

/**
 * Check if user has biometrics connected (async - checks persistence)
 */
export async function hasBiometricsConnectedAsync(userId: string): Promise<boolean> {
  const user = await ensureUserBiometrics(userId);
  return user !== null;
}

/**
 * Get connected platform
 */
export function getConnectedPlatform(userId: string): BiometricPlatform | null {
  return userBiometrics.get(userId)?.platform ?? null;
}

/**
 * Get connected platform (async - checks persistence)
 */
export async function getConnectedPlatformAsync(userId: string): Promise<BiometricPlatform | null> {
  const user = await ensureUserBiometrics(userId);
  return user?.platform ?? null;
}

/**
 * Disconnect biometrics
 */
export function disconnectBiometrics(userId: string): void {
  userBiometrics.delete(userId);
  // Also clear persisted tokens (fire and forget)
  void clearPersistedTokens(userId);
  log.info({ userId }, 'Biometrics disconnected');
}

// ============================================================================
// CONTEXT BUILDER HELPERS (wrapper functions for userId-based API)
// Core insight logic is in ./insights.ts
// ============================================================================

/**
 * Generate insight for context injection
 * "Better than Human" - notice what humans wouldn't
 */
export function generateBiometricInsight(userId: string): BiometricInsight | null {
  const snapshot = getCurrentBiometrics(userId);
  return generateInsightFromSnapshot(snapshot);
}

/**
 * Generate superhuman moment - something no human friend would notice
 */
export function generateSuperhumanMoment(userId: string): string | null {
  const snapshot = getCurrentBiometrics(userId);
  return generateSuperhumanMomentFromSnapshot(snapshot);
}

export default {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  syncBiometrics,
  getCurrentBiometrics,
  getStressLevel,
  getCurrentHRV,
  getSleepQuality,
  getRecoveryStatus,
  subscribeToEvents,
  hasBiometricsConnected,
  hasBiometricsConnectedAsync,
  getConnectedPlatform,
  getConnectedPlatformAsync,
  disconnectBiometrics,
  generateBiometricInsight,
  generateSuperhumanMoment,
};
