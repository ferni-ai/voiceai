/**
 * Empty-reading snapshot, served only as a development stub (see
 * utils/dev-stub.ts). Never returned in production.
 */
import type { BiometricPlatform, BiometricSnapshot } from './types.js';

export function createMockSnapshot(userId: string, platform: BiometricPlatform): BiometricSnapshot {
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
