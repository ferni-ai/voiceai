/**
 * Biometrics platform catalogue and backend payload mapping
 * (types, per-platform OAuth config, snapshot → BiometricsData).
 * Re-exported by biometrics.service.ts.
 */

/** Backend platform ids (src/services/biometrics/types.ts) → client ids */
export const BACKEND_PLATFORM_MAP: Record<string, BiometricsPlatform> = {
  healthkit: 'apple_health',
  googlefit: 'google_fit',
  fitbit: 'fitbit',
  oura: 'oura',
  whoop: 'whoop',
};

// ============================================================================
// TYPES
// ============================================================================

export type BiometricsPlatform =
  | 'apple_health'
  | 'google_fit'
  | 'fitbit'
  | 'oura'
  | 'whoop'
  | 'eight_sleep'
  | 'garmin';

export interface BiometricsStatus {
  platform: BiometricsPlatform | null;
  connected: boolean;
  lastSync: string | null;
  scopes: string[];
  error?: string;
}

export interface BiometricsData {
  heartRate?: {
    current: number;
    restingAvg: number;
    variability: number;
  };
  sleep?: {
    lastNight: {
      duration: number;
      quality: 'poor' | 'fair' | 'good' | 'excellent';
      deepSleep: number;
      remSleep: number;
    };
    weekAvg?: number;
  };
  activity?: {
    steps: number;
    calories: number;
    activeMinutes: number;
  };
  readiness?: number; // 0-100 score from Oura/WHOOP
  stressLevel?: 'low' | 'moderate' | 'high' | 'elevated'; // Derived from HRV
}

// ============================================================================
// PLATFORM CONFIGURATIONS
// ============================================================================

export interface PlatformConfig {
  name: string;
  /**
   * OAuth start URL. Wearables use /wearables/{provider}/login
   * (src/servers/api/routes/wearables.ts); Eight Sleep fetches its URL from
   * /api/eight-sleep/auth/url. Empty means no web OAuth flow exists.
   */
  authUrl: string;
  scopes: string[];
  supportsNative: boolean;
  supportsWeb: boolean;
}

export const PLATFORM_CONFIGS: Record<BiometricsPlatform, PlatformConfig> = {
  apple_health: {
    name: 'Apple Health',
    authUrl: '', // Native only
    scopes: ['heart_rate', 'sleep', 'activity', 'hrv'],
    supportsNative: true,
    supportsWeb: false,
  },
  google_fit: {
    name: 'Google Fit',
    authUrl: '', // No backend OAuth flow yet
    scopes: ['heart_rate', 'sleep', 'activity'],
    supportsNative: false,
    supportsWeb: false,
  },
  fitbit: {
    name: 'Fitbit',
    authUrl: '/wearables/fitbit/login',
    scopes: ['heartrate', 'sleep', 'activity', 'profile'],
    supportsNative: false,
    supportsWeb: true,
  },
  oura: {
    name: 'Oura Ring',
    authUrl: '/wearables/oura/login',
    scopes: ['daily', 'heartrate', 'sleep', 'readiness', 'workout'],
    supportsNative: false,
    supportsWeb: true,
  },
  whoop: {
    name: 'WHOOP',
    authUrl: '/wearables/whoop/login',
    scopes: ['read:recovery', 'read:sleep', 'read:workout', 'read:cycles'],
    supportsNative: false,
    supportsWeb: true,
  },
  eight_sleep: {
    name: 'Eight Sleep',
    authUrl: '/api/eight-sleep/auth/url',
    scopes: ['sleep', 'health', 'device'],
    supportsNative: false,
    supportsWeb: true,
  },
  garmin: {
    name: 'Garmin',
    authUrl: '/wearables/garmin/login',
    scopes: ['activity', 'sleep', 'stress', 'heart_rate'],
    supportsNative: false,
    supportsWeb: true,
  },
};

// ============================================================================
// BACKEND SNAPSHOT MAPPING
// ============================================================================

/** Shape of GET /api/v1/integrations/biometrics/data (BiometricSnapshot) */
export interface BackendSnapshot {
  hrv: { current: number } | null;
  sleep: {
    duration: number;
    deepSleepPercent: number;
    remSleepPercent: number;
    qualityScore: number;
  } | null;
  activity: { steps: number; activeMinutes: number; caloriesBurned: number } | null;
  recovery: { score: number } | null;
  stressLevel: BiometricsData['stressLevel'] | null;
}

export function mapSnapshot(snapshot: BackendSnapshot): BiometricsData {
  const { sleep, activity, recovery } = snapshot;
  const quality = (score: number): 'poor' | 'fair' | 'good' | 'excellent' =>
    score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';

  return {
    sleep: sleep
      ? {
          lastNight: {
            duration: sleep.duration,
            quality: quality(sleep.qualityScore),
            deepSleep: (sleep.duration * sleep.deepSleepPercent) / 100,
            remSleep: (sleep.duration * sleep.remSleepPercent) / 100,
          },
        }
      : undefined,
    activity: activity
      ? {
          steps: activity.steps,
          calories: activity.caloriesBurned,
          activeMinutes: activity.activeMinutes,
        }
      : undefined,
    readiness: recovery?.score,
    stressLevel: snapshot.stressLevel ?? undefined,
  };
}
