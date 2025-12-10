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
 * @module services/biometrics
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getStore } from '../../memory/store-factory.js';

const log = createLogger({ module: 'Biometrics' });

// ============================================================================
// TOKEN PERSISTENCE TYPES
// ============================================================================

interface PersistedBiometricTokens {
  platform: BiometricPlatform;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string; // ISO date string
  lastSync: string; // ISO date string
}

// ============================================================================
// TYPES
// ============================================================================

// Note: 'terra' aggregates HealthKit, Fitbit, and 300+ other wearables via web OAuth
// Recommended for web apps that need Apple Health data without a native iOS app
export type BiometricPlatform = 'healthkit' | 'googlefit' | 'oura' | 'whoop' | 'fitbit' | 'terra';

export type StressLevel = 'low' | 'moderate' | 'high' | 'elevated';

export interface SleepData {
  /** Total sleep duration in hours */
  duration: number;
  /** Deep sleep percentage */
  deepSleepPercent: number;
  /** REM sleep percentage */
  remSleepPercent: number;
  /** Number of wake-ups during night */
  disturbances: number;
  /** Sleep quality score 0-100 */
  qualityScore: number;
  /** Sleep start time */
  bedtime: Date;
  /** Wake time */
  wakeTime: Date;
}

export interface HRVData {
  /** Current HRV in milliseconds */
  current: number;
  /** 7-day average HRV */
  baseline: number;
  /** Percent deviation from baseline */
  deviationPercent: number;
  /** Timestamp of measurement */
  timestamp: Date;
}

export interface ActivityData {
  /** Steps today */
  steps: number;
  /** Active minutes today */
  activeMinutes: number;
  /** Calories burned */
  caloriesBurned: number;
  /** Hours since last activity */
  hoursSinceActivity: number;
  /** Standing hours (for sedentary detection) */
  standingHours: number;
}

export interface RecoveryData {
  /** Recovery score 0-100 */
  score: number;
  /** Readiness for physical activity */
  readiness: 'low' | 'moderate' | 'high' | 'peak';
  /** Factors affecting recovery */
  factors: {
    sleep: number;
    hrv: number;
    restingHR: number;
    activity: number;
  };
}

export interface BiometricSnapshot {
  userId: string;
  platform: BiometricPlatform;
  timestamp: Date;
  hrv: HRVData | null;
  sleep: SleepData | null;
  activity: ActivityData | null;
  recovery: RecoveryData | null;
  stressLevel: StressLevel;
  /** Raw data for debugging */
  raw?: Record<string, unknown>;
}

export interface BiometricEvent {
  type: 'hrv_spike' | 'poor_sleep' | 'sedentary' | 'recovery_low' | 'stress_elevated';
  severity: 'info' | 'warning' | 'alert';
  message: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface BiometricInsight {
  type: 'sleep' | 'stress' | 'activity' | 'recovery';
  insight: string;
  suggestion?: string;
  confidence: number;
}

// ============================================================================
// STATE
// ============================================================================

interface UserBiometrics {
  platform: BiometricPlatform;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  lastSync: Date;
  snapshot: BiometricSnapshot | null;
  history: BiometricSnapshot[];
  eventCallbacks: Set<(event: BiometricEvent) => void>;
}

const userBiometrics = new Map<string, UserBiometrics>();

// ============================================================================
// TOKEN PERSISTENCE
// ============================================================================

/**
 * Save biometric tokens to persistent storage (user profile)
 */
async function persistTokens(userId: string, data: UserBiometrics): Promise<void> {
  try {
    const store = await getStore();
    const profile = await store.getOrCreateProfile(userId);

    const tokensToSave: PersistedBiometricTokens = {
      platform: data.platform,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiry: data.tokenExpiry.toISOString(),
      lastSync: data.lastSync.toISOString(),
    };

    // Store tokens in user profile (extends profile with biometricTokens field)
    const updatedProfile = {
      ...profile,
      biometricTokens: tokensToSave,
    } as typeof profile & { biometricTokens: PersistedBiometricTokens };

    await store.saveProfile(updatedProfile);
    log.debug({ userId, platform: data.platform }, 'Biometric tokens persisted');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist biometric tokens');
  }
}

/**
 * Load biometric tokens from persistent storage
 */
async function loadTokens(userId: string): Promise<UserBiometrics | null> {
  try {
    const store = await getStore();
    const profile = await store.getProfile(userId);

    if (!profile) return null;

    // Type assertion to access biometricTokens field
    const tokens = (profile as { biometricTokens?: PersistedBiometricTokens }).biometricTokens;

    if (!tokens) return null;

    // Reconstruct UserBiometrics from persisted data
    const userBio: UserBiometrics = {
      platform: tokens.platform,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: new Date(tokens.tokenExpiry),
      lastSync: new Date(tokens.lastSync),
      snapshot: null,
      history: [],
      eventCallbacks: new Set(),
    };

    log.debug({ userId, platform: tokens.platform }, 'Biometric tokens loaded from storage');
    return userBio;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load biometric tokens');
    return null;
  }
}

/**
 * Clear persisted tokens for a user
 */
async function clearPersistedTokens(userId: string): Promise<void> {
  try {
    const store = await getStore();
    const profile = await store.getProfile(userId);

    if (profile) {
      // Remove biometricTokens field
      const updatedProfile = { ...profile } as typeof profile & { biometricTokens?: PersistedBiometricTokens };
      delete updatedProfile.biometricTokens;
      await store.saveProfile(updatedProfile);
      log.debug({ userId }, 'Biometric tokens cleared from storage');
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to clear biometric tokens');
  }
}

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
      if (!config.terra.devId) {
        throw new Error('Terra API not configured. Set TERRA_DEV_ID and TERRA_API_KEY env vars.');
      }
      // Generate a session via Terra API first, then redirect to widget
      // For now, return a placeholder - full implementation requires server-side session generation
      return `https://widget.tryterra.co/session/${config.terra.devId}?state=${state}&reference_id=${userId}`;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
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

      default:
        log.warn({ platform }, 'Token exchange not implemented');
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
  const recoveryResponse = await fetch('https://api.prod.whoop.com/developer/v1/recovery?limit=1', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

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
          deepSleepPercent: ((d.sleep_data.deep_sleep_duration_hours || 0) / (d.sleep_data.sleep_duration_in_hours || 1)) * 100,
          remSleepPercent: ((d.sleep_data.rem_sleep_duration_hours || 0) / (d.sleep_data.sleep_duration_in_hours || 1)) * 100,
          disturbances: 0,
          bedtime: new Date(),
          wakeTime: new Date(),
        };
      }

      if (d.activity_data) {
        activityData = {
          steps: d.activity_data.steps || 0,
          activeMinutes: Math.round((d.activity_data.active_durations_data?.activity_seconds || 0) / 60),
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
// CONTEXT BUILDER HELPERS
// ============================================================================

/**
 * Generate insight for context injection
 * "Better than Human" - notice what humans wouldn't
 */
export function generateBiometricInsight(userId: string): BiometricInsight | null {
  const snapshot = getCurrentBiometrics(userId);
  if (!snapshot) return null;

  // Priority: stress > sleep > recovery > activity
  if (snapshot.stressLevel === 'elevated' || snapshot.stressLevel === 'high') {
    const hrvDrop = snapshot.hrv?.deviationPercent
      ? `HRV dropped ${Math.abs(snapshot.hrv.deviationPercent)}%`
      : 'elevated stress markers';

    return {
      type: 'stress',
      insight: `User's biometrics show ${snapshot.stressLevel} stress (${hrvDrop}). Approach gently.`,
      suggestion:
        'Consider offering a grounding exercise or acknowledging they might be having a rough day.',
      confidence: 0.8,
    };
  }

  if (snapshot.sleep && snapshot.sleep.qualityScore < 60) {
    return {
      type: 'sleep',
      insight: `User had poor sleep (${snapshot.sleep.qualityScore}% quality, ${snapshot.sleep.duration.toFixed(1)}h). They may be tired.`,
      suggestion: 'Be understanding if they seem off. Might mention sleep or ask how they slept.',
      confidence: 0.85,
    };
  }

  if (snapshot.recovery && snapshot.recovery.score < 50) {
    return {
      type: 'recovery',
      insight: `User's recovery score is low (${snapshot.recovery.score}%). Their body is still recovering.`,
      suggestion: "Encourage rest and self-care. Don't push hard goals today.",
      confidence: 0.75,
    };
  }

  if (snapshot.activity && snapshot.activity.hoursSinceActivity > 4) {
    return {
      type: 'activity',
      insight: `User has been sedentary for ${snapshot.activity.hoursSinceActivity} hours.`,
      suggestion: 'Consider suggesting a stretch break or short walk.',
      confidence: 0.7,
    };
  }

  return null;
}

/**
 * Generate superhuman moment - something no human friend would notice
 */
export function generateSuperhumanMoment(userId: string): string | null {
  const snapshot = getCurrentBiometrics(userId);
  if (!snapshot) return null;

  const moments: string[] = [];

  // HRV correlation with stress
  if (snapshot.hrv && snapshot.hrv.deviationPercent <= -20) {
    moments.push(
      `Your HRV dropped ${Math.abs(snapshot.hrv.deviationPercent)}% - rough day? Let's take it easy.`
    );
  }

  // Sleep affecting mood
  if (snapshot.sleep && snapshot.sleep.qualityScore < 50) {
    moments.push(`Your sleep has been off - that might be affecting how you're feeling today.`);
  }

  // Sedentary during stress
  if (
    snapshot.activity &&
    snapshot.activity.hoursSinceActivity > 3 &&
    (snapshot.stressLevel === 'high' || snapshot.stressLevel === 'elevated')
  ) {
    moments.push(
      `You've been sitting for ${snapshot.activity.hoursSinceActivity} hours during a stressful time - want a 2-minute stretch?`
    );
  }

  // Low recovery
  if (snapshot.recovery && snapshot.recovery.score < 40) {
    moments.push(`Your body's still recovering - let's be gentle with ourselves today.`);
  }

  return moments.length > 0 ? moments[Math.floor(Math.random() * moments.length)] : null;
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
