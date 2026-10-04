/**
 * Empty-reading snapshot: the development stub (see utils/dev-stub.ts), and
 * the base a Terra webhook fills in before its real fields are applied.
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
