/**
 * Biometrics Service
 *
 * Connects Ferni to health/biometrics platforms:
 * - Apple Health: only the native iOS app (apps/ios-native) can read HealthKit
 * - Oura, WHOOP, Fitbit, Garmin (web OAuth via the UI server's /wearables routes)
 *
 * Every path here is one the UI server actually serves:
 * - /wearables/status, /wearables/<provider>/login, /wearables/<provider>/unlink
 *   (src/servers/api/routes/wearables.ts)
 * - /api/v1/integrations/biometrics/{status,disconnect} (src/api/v1/integrations/handler.ts)
 *
 * A wearable is only connectable when the server reports it `configured`
 * (its OAuth client id/secret are set). Unconfigured providers return 503 from
 * /login, so we never send users there.
 *
 * Philosophy: Give Ferni "superhuman awareness" by connecting to
 * health data that helps her understand your physical state.
 */

import { createLogger } from '../utils/logger.js';
import { apiDelete, apiGet, apiPost } from '../utils/api.js';
import type { OperationResult } from '../types/results.js';
import { startOAuthConnect } from './oauth-connect.service.js';

const log = createLogger('BiometricsService');

// ============================================================================
// TYPES
// ============================================================================

/** Web OAuth wearables the server has /wearables/<provider>/login routes for. */
export type WearableProvider = 'oura' | 'whoop' | 'fitbit' | 'garmin';

export type BiometricsPlatform = 'apple_health' | WearableProvider;

export const WEARABLE_PROVIDERS: readonly WearableProvider[] = [
  'oura',
  'whoop',
  'fitbit',
  'garmin',
];

/** One row of GET /wearables/status → { providers: WearableProviderStatus[] } */
export interface WearableProviderStatus {
  provider: BiometricsPlatform;
  configured: boolean;
  linked: boolean;
}

/** GET /api/v1/integrations/biometrics/status */
export interface BiometricsStatus {
  connected: boolean;
  platform: string | null;
  lastSync: string | null;
}

interface PlatformConfig {
  name: string;
  supportsWeb: boolean;
}

const PLATFORM_CONFIGS: Record<BiometricsPlatform, PlatformConfig> = {
  apple_health: { name: 'Apple Health', supportsWeb: false },
  oura: { name: 'Oura Ring', supportsWeb: true },
  whoop: { name: 'WHOOP', supportsWeb: true },
  fitbit: { name: 'Fitbit', supportsWeb: true },
  garmin: { name: 'Garmin', supportsWeb: true },
};

function isWearable(platform: string): platform is WearableProvider {
  return (WEARABLE_PROVIDERS as readonly string[]).includes(platform);
}

// ============================================================================
// SERVER STATUS
// ============================================================================

/**
 * Ask the server which wearables are configured and which are linked.
 * Returns null when the server couldn't be reached, so callers can tell
 * "nothing is available" apart from "we don't know".
 */
export async function fetchWearableProviders(): Promise<WearableProviderStatus[] | null> {
  const response = await apiGet<{ providers: WearableProviderStatus[] }>('/wearables/status');
  if (!response.ok || !response.data) {
    log.warn('Wearables status unavailable', { status: response.status });
    return null;
  }
  return response.data.providers.filter((p) => isWearable(p.provider));
}

/** Connection status of the biometrics service (Terra/HealthKit/direct OAuth). */
export async function fetchBiometricsStatus(): Promise<BiometricsStatus | null> {
  const response = await apiGet<BiometricsStatus>('/api/v1/integrations/biometrics/status');
  return response.ok && response.data ? response.data : null;
}

// ============================================================================
// CONNECT / DISCONNECT
// ============================================================================

/**
 * Connect to a biometrics platform.
 * Wearables go through POST /auth/oauth/start (bound to the signed-in user) and
 * then the server's login route, but only after the server confirms the
 * provider is configured.
 */
export async function connectBiometrics(platform: BiometricsPlatform): Promise<OperationResult> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    return { success: false, error: 'Unknown platform' };
  }

  if (platform === 'apple_health') {
    return { success: false, error: 'Apple Health is only available in the iPhone app' };
  }

  const providers = await fetchWearableProviders();
  if (!providers) {
    return { success: false, error: `Couldn't reach ${config.name}. Try again?` };
  }
  const status = providers.find((p) => p.provider === platform);
  if (!status?.configured) {
    return { success: false, error: `${config.name} isn't available yet` };
  }

  log.info('Initiating wearable OAuth', { platform });
  return startOAuthConnect(platform, '/');
}

/**
 * Disconnect whatever is connected: linked wearables are unlinked via
 * /wearables/<provider>/unlink, and the biometrics service connection is
 * removed via DELETE /api/v1/integrations/biometrics/disconnect.
 * Succeeds only when every server call succeeds.
 */
export async function disconnectBiometrics(
  linkedWearables: WearableProvider[]
): Promise<OperationResult> {
  const calls = [
    ...linkedWearables.map((provider) =>
      apiPost<{ success: boolean }>(`/wearables/${provider}/unlink`, {})
    ),
    apiDelete<{ success: boolean }>('/api/v1/integrations/biometrics/disconnect'),
  ];
  const results = await Promise.all(calls);
  if (results.every((r) => r.ok)) {
    return { success: true };
  }
  return { success: false, error: "Couldn't disconnect. Try again?" };
}

// ============================================================================
// PLATFORM INFO
// ============================================================================

/**
 * Check if a platform can be connected from the web app
 * (server configuration is checked separately via fetchWearableProviders).
 */
export function isPlatformAvailable(platform: BiometricsPlatform): boolean {
  return PLATFORM_CONFIGS[platform]?.supportsWeb ?? false;
}

export function getPlatformConfig(platform: BiometricsPlatform): PlatformConfig | undefined {
  return PLATFORM_CONFIGS[platform];
}

/**
 * Platforms to offer in settings. A wearable is `available` only when the
 * server reported it configured; when status is unknown (null) none are.
 */
export function getBiometricsPlatformList(
  wearables: WearableProviderStatus[] | null
): Array<{ id: BiometricsPlatform; name: string; available: boolean }> {
  return [
    { id: 'apple_health', name: PLATFORM_CONFIGS.apple_health.name, available: true },
    ...WEARABLE_PROVIDERS.map((id) => ({
      id,
      name: PLATFORM_CONFIGS[id].name,
      available: !!wearables?.some((w) => w.provider === id && w.configured),
    })),
  ];
}

/** Wearables the server says are linked for this user. */
export function getLinkedWearables(wearables: WearableProviderStatus[] | null): WearableProvider[] {
  return (wearables ?? [])
    .filter((w) => w.linked && isWearable(w.provider))
    .map((w) => w.provider as WearableProvider);
}
