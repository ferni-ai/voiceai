/**
 * Breath Synchronization - Neural Mirroring
 *
 * When two people feel connected, their breathing naturally synchronizes.
 * This is called neural mirroring - it builds trust unconsciously.
 *
 * Ferni's breathing rhythm gradually syncs with the user's breath pattern
 * detected from voice cadence. We sync slightly slower for a calming effect.
 *
 * @module @ferni/eq/capabilities/breath-sync
 */

import { emotionState } from '../../emotion/emotion-state.js';
import { createLogger } from '../../utils/logger.js';
import type { BreathSyncState } from '../types.js';

const log = createLogger('BreathSync');

// ============================================================================
// STATE
// ============================================================================

const breathSync: BreathSyncState = {
  isEnabled: true,
  userBreathRate: 15, // Default breaths per minute
  syncStrength: 0.3, // How closely to match (0=ignore, 1=exact)
  lastSyncTime: 0,
};

let syncInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// BREATH DETECTION
// ============================================================================

/**
 * Detect user's breathing rate from voice patterns.
 * Pauses between phrases indicate breath points.
 */
export function detectUserBreathRate(pausePatterns: readonly number[]): number {
  if (pausePatterns.length < 3) return breathSync.userBreathRate;

  // Filter to likely breath pauses (200-800ms typical)
  const breathPauses = pausePatterns.filter((p) => p > 200 && p < 800);
  if (breathPauses.length < 2) return breathSync.userBreathRate;

  // Calculate average time between breaths
  const avgPauseDuration = breathPauses.reduce((a, b) => a + b, 0) / breathPauses.length;

  // Estimate breaths per minute
  // Average phrase is ~3-5 seconds, so if pauses are every 4s, that's 15 breaths/min
  const estimatedRate = 60000 / (avgPauseDuration * 5);

  // Clamp to reasonable range (8-24 breaths/min)
  const clampedRate = Math.max(8, Math.min(24, estimatedRate));

  // Smooth update
  breathSync.userBreathRate = breathSync.userBreathRate * 0.7 + clampedRate * 0.3;

  return breathSync.userBreathRate;
}

// ============================================================================
// SYNCHRONIZATION
// ============================================================================

/**
 * Sync Ferni's breathing to match user's rhythm.
 * Called periodically during conversation.
 */
export function syncBreathing(): void {
  if (!breathSync.isEnabled) return;

  const now = Date.now();
  if (now - breathSync.lastSyncTime < 5000) return; // Only sync every 5s
  breathSync.lastSyncTime = now;

  const currentState = emotionState.emotion;
  const currentRate = currentState.breathing.rate;

  // Calculate target rate (slightly slower than user for calming effect)
  const targetRate = breathSync.userBreathRate * 0.95;

  // Interpolate based on sync strength
  const newRate = currentRate + (targetRate - currentRate) * breathSync.syncStrength;

  // Update emotion state breathing
  const breathingUpdate = {
    rate: Math.round(newRate),
    depth: currentState.breathing.depth,
    rhythm: currentState.breathing.rhythm,
  };

  // Dispatch event for emotion state to pick up
  document.dispatchEvent(
    new CustomEvent('ferni:breath-sync', {
      detail: breathingUpdate,
    })
  );

  log.debug('Breath sync:', { userRate: breathSync.userBreathRate, ferniRate: newRate });
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Set breath synchronization strength.
 * Higher = more closely matches user breathing.
 */
export function setBreathSyncStrength(strength: number): void {
  breathSync.syncStrength = Math.max(0, Math.min(1, strength));
}

/**
 * Get current breath sync strength
 */
export function getBreathSyncStrength(): number {
  return breathSync.syncStrength;
}

/**
 * Enable/disable breath synchronization.
 */
export function setBreathSyncEnabled(enabled: boolean): void {
  breathSync.isEnabled = enabled;
  if (!enabled) {
    // Reset to default breathing
    breathSync.userBreathRate = 15;
  }

  // Telemetry: Track breath sync activation
  if (enabled) {
    document.dispatchEvent(
      new CustomEvent('ferni:telemetry', {
        detail: { type: 'breath_sync', action: 'enabled' },
      })
    );
  }
}

/**
 * Check if breath sync is enabled
 */
export function isBreathSyncEnabled(): boolean {
  return breathSync.isEnabled;
}

/**
 * Get current estimated user breath rate
 */
export function getUserBreathRate(): number {
  return breathSync.userBreathRate;
}

/**
 * Get full breath sync state
 */
export function getBreathSyncState(): Readonly<BreathSyncState> {
  return { ...breathSync };
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Start periodic breath synchronization
 */
export function startBreathSyncInterval(): void {
  if (syncInterval) return;
  
  syncInterval = setInterval(() => {
    if (breathSync.isEnabled) {
      syncBreathing();
    }
  }, 10000);
  
  log.debug('Breath sync interval started');
}

/**
 * Stop periodic breath synchronization
 */
export function stopBreathSyncInterval(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    log.debug('Breath sync interval stopped');
  }
}
