/**
 * Biometrics Service
 *
 * Manages OAuth connections to health/biometrics platforms:
 * - Apple Health (via iOS native only)
 * - Google Fit (not supported yet: no backend OAuth flow)
 * - Fitbit
 * - Oura Ring
 * - WHOOP
 * - Eight Sleep
 * - Garmin
 *
 * Philosophy: Give Ferni "superhuman awareness" by connecting to
 * health data that helps her understand your physical state.
 */

import { createLogger } from '../utils/logger.js';
import { apiDelete, apiGet, apiPost, getUserId } from '../utils/api.js';
import { Capacitor } from '../stubs/capacitor-stub.js';

const log = createLogger('BiometricsService');

/** Backend routes live in src/api/v1/integrations/handler.ts */
const BIOMETRICS_API = '/api/v1/integrations/biometrics';

/** Backend platform ids (src/services/biometrics/types.ts) → client ids */
const BACKEND_PLATFORM_MAP: Record<string, BiometricsPlatform> = {
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

interface PlatformConfig {
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

const PLATFORM_CONFIGS: Record<BiometricsPlatform, PlatformConfig> = {
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
// STATE
// ============================================================================

let currentStatus: BiometricsStatus = {
  platform: null,
  connected: false,
  lastSync: null,
  scopes: [],
};

const statusListeners: Set<(status: BiometricsStatus) => void> = new Set();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize biometrics service and check current connection status
 */
export async function initBiometrics(): Promise<BiometricsStatus> {
  try {
    const response = await apiGet<{
      connected: boolean;
      platform: string | null;
      lastSync: string | null;
    }>(`${BIOMETRICS_API}/status`);
    if (response.ok && response.data) {
      const platform = response.data.platform
        ? (BACKEND_PLATFORM_MAP[response.data.platform] ?? null)
        : null;
      currentStatus = {
        platform,
        connected: response.data.connected,
        lastSync: response.data.lastSync,
        scopes: platform ? PLATFORM_CONFIGS[platform].scopes : [],
      };
      notifyListeners();
    }
  } catch (error) {
    log.debug('Failed to fetch biometrics status:', String(error));
  }

  return currentStatus;
}

/**
 * Get current biometrics connection status
 */
export function getBiometricsStatus(): BiometricsStatus {
  return { ...currentStatus };
}

/**
 * Connect to a biometrics platform via OAuth
 */
export async function connectBiometrics(
  platform: BiometricsPlatform,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const config = PLATFORM_CONFIGS[platform];

  if (!config) {
    return { success: false, error: 'Unknown platform' };
  }

  // Apple Health requires native app
  if (platform === 'apple_health') {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
      return {
        success: false,
        error: 'Apple Health is only available on iOS devices',
      };
    }

    // Request HealthKit permissions via native bridge
    return requestAppleHealthPermissions();
  }

  // Check if platform supports web OAuth
  if (!config.supportsWeb || !config.authUrl) {
    return {
      success: false,
      error: `${config.name} isn't supported yet`,
    };
  }

  // Eight Sleep: the backend builds the OAuth URL for the authenticated user
  if (platform === 'eight_sleep') {
    const response = await apiGet<{ url: string }>(config.authUrl);
    if (!response.ok || !response.data?.url) {
      return { success: false, error: "Couldn't connect to Eight Sleep. Try again?" };
    }
    window.location.href = response.data.url;
    return { success: true };
  }

  // Wearables: /wearables/{provider}/login redirects to the provider's consent page.
  // Prefer the Firebase UID so tokens are stored under the same id the API reads.
  const uid = getUserId() ?? userId;
  const params = new URLSearchParams({ user_id: uid, return_url: window.location.pathname });
  const authUrl = `${config.authUrl}?${params}`;
  log.info('Initiating OAuth flow', { platform });

  window.location.href = authUrl;

  return { success: true };
}

/**
 * Disconnect from biometrics platform
 */
export async function disconnectBiometrics(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiDelete<{ success: boolean }>(`${BIOMETRICS_API}/disconnect`);

    if (response.ok) {
      currentStatus = {
        platform: null,
        connected: false,
        lastSync: null,
        scopes: [],
      };
      notifyListeners();
      return { success: true };
    }

    return { success: false, error: 'Failed to disconnect' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Fetch latest biometrics data
 */
export async function fetchBiometricsData(): Promise<BiometricsData | null> {
  if (!currentStatus.connected) {
    return null;
  }

  try {
    const response = await apiGet<BackendSnapshot>(`${BIOMETRICS_API}/data`);
    if (response.ok && response.data) {
      return mapSnapshot(response.data);
    }
  } catch (error) {
    log.error('Failed to fetch biometrics data:', String(error));
  }

  return null;
}

/**
 * Trigger a sync of biometrics data
 */
export async function syncBiometrics(): Promise<{ success: boolean; error?: string }> {
  if (!currentStatus.connected) {
    return { success: false, error: 'Not connected to any platform' };
  }

  try {
    const response = await apiPost<{ success: boolean; timestamp: string }>(
      `${BIOMETRICS_API}/sync`,
      {}
    );

    if (response.ok && response.data?.success) {
      currentStatus.lastSync = response.data.timestamp;
      notifyListeners();
      return { success: true };
    }

    return { success: false, error: 'Sync failed' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Subscribe to biometrics status changes
 */
export function onBiometricsStatusChange(
  callback: (status: BiometricsStatus) => void
): () => void {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

/**
 * Check if a platform is available on current device
 */
export function isPlatformAvailable(platform: BiometricsPlatform): boolean {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) return false;

  // Check native support
  if (Capacitor.isNativePlatform()) {
    if (platform === 'apple_health' && Capacitor.getPlatform() === 'ios') {
      return true;
    }
    return config.supportsNative;
  }

  // Web support
  return config.supportsWeb;
}

/**
 * Get configuration for a platform
 */
export function getPlatformConfig(
  platform: BiometricsPlatform
): PlatformConfig | undefined {
  return PLATFORM_CONFIGS[platform];
}

/**
 * Get all available platforms for current device
 */
export function getAvailablePlatforms(): BiometricsPlatform[] {
  return (Object.keys(PLATFORM_CONFIGS) as BiometricsPlatform[]).filter(
    isPlatformAvailable
  );
}

// ============================================================================
// PLATFORM-SPECIFIC IMPLEMENTATIONS
// ============================================================================

/**
 * Request Apple Health permissions via HealthKit (iOS only)
 */
async function requestAppleHealthPermissions(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // This would call into the native iOS HealthKit bridge
    // The actual implementation depends on the Capacitor plugin
    const HealthKit = await import('../stubs/capacitor-stub.js').then(
      (m) => m.HealthKit
    );

    const result = await HealthKit.requestAuthorization({
      read: [
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKCategoryTypeIdentifierSleepAnalysis',
      ],
      write: [],
    });

    if (result.authorized) {
      currentStatus = {
        platform: 'apple_health',
        connected: true,
        lastSync: new Date().toISOString(),
        scopes: ['heart_rate', 'hrv', 'steps', 'calories', 'sleep'],
      };
      notifyListeners();
      return { success: true };
    }

    return { success: false, error: 'Permission denied' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Handle OAuth callback from biometrics platforms
 */
export function handleBiometricsCallback(params: URLSearchParams): void {
  const platform = params.get('platform') as BiometricsPlatform | null;
  const success = params.get('success') === 'true';
  const error = params.get('error');

  if (success && platform) {
    currentStatus = {
      platform,
      connected: true,
      lastSync: new Date().toISOString(),
      scopes: PLATFORM_CONFIGS[platform]?.scopes ?? [],
    };
  } else {
    currentStatus.error = error ?? 'Connection failed';
  }

  notifyListeners();
}

// ============================================================================
// HELPERS
// ============================================================================

/** Shape of GET /api/v1/integrations/biometrics/data (BiometricSnapshot) */
interface BackendSnapshot {
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

function mapSnapshot(snapshot: BackendSnapshot): BiometricsData {
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

function notifyListeners(): void {
  for (const listener of statusListeners) {
    try {
      listener({ ...currentStatus });
    } catch (error) {
      log.error('Status listener error:', String(error));
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const biometricsService = {
  init: initBiometrics,
  getStatus: getBiometricsStatus,
  connect: connectBiometrics,
  disconnect: disconnectBiometrics,
  fetchData: fetchBiometricsData,
  sync: syncBiometrics,
  onStatusChange: onBiometricsStatusChange,
  isPlatformAvailable,
  getPlatformConfig,
  getAvailablePlatforms,
  handleCallback: handleBiometricsCallback,
};

export default biometricsService;
