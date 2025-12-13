/**
 * Live Backchanneling Session Management
 *
 * Session-scoped instance management for live backchanneling services.
 * Uses the centralized SessionRegistry pattern for consistent lifecycle management.
 */

import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../../utils/session-registry.js';
import { BreathPauseDetector } from './breath-pause.js';
import { LiveBackchannelingService } from './service.js';

// ============================================================================
// SESSION REGISTRIES
// ============================================================================

/**
 * Session registry for live backchanneling services.
 */
const serviceRegistry = createSessionRegistry(
  (sessionId: string) => new LiveBackchannelingService(),
  {
    name: 'LiveBackchanneling',
    cleanup: (service) => service.reset(),
    verbose: false,
  }
);

/**
 * Session registry for breath pause detectors.
 */
const detectorRegistry = createSessionRegistry(
  (sessionId: string) => new BreathPauseDetector(),
  {
    name: 'BreathPauseDetector',
    cleanup: (detector) => detector.reset(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(serviceRegistry);
registerGlobalRegistry(detectorRegistry);

// ============================================================================
// PUBLIC API (backwards compatible)
// ============================================================================

/**
 * Get or create a session-scoped LiveBackchannelingService
 */
export function getLiveBackchannelingService(sessionId?: string): LiveBackchannelingService {
  // Backward compatibility: no sessionId = global singleton behavior
  const key = sessionId || '__global__';
  return serviceRegistry.get(key);
}

/**
 * Get or create a session-scoped BreathPauseDetector
 */
export function getBreathPauseDetector(sessionId?: string): BreathPauseDetector {
  // Backward compatibility: no sessionId = global singleton behavior
  const key = sessionId || '__global__';
  return detectorRegistry.get(key);
}

/**
 * Reset live backchanneling for a specific session
 */
export function resetLiveBackchanneling(sessionId?: string): void {
  const key = sessionId || '__global__';
  serviceRegistry.reset(key);
  detectorRegistry.reset(key);
}

/**
 * Reset all live backchanneling services
 */
export function resetAllLiveBackchanneling(): void {
  serviceRegistry.resetAll();
  detectorRegistry.resetAll();
}

/**
 * Get active session count (for debugging)
 */
export function getActiveLiveBackchannelSessionCount(): number {
  // Exclude global singleton from count
  const hasGlobal = serviceRegistry.has('__global__') ? 1 : 0;
  return serviceRegistry.getActiveCount() - hasGlobal;
}

/**
 * Check if a session has active live backchanneling
 */
export function hasLiveBackchanneling(sessionId: string): boolean {
  return serviceRegistry.has(sessionId);
}

/**
 * Get all active session IDs (for monitoring)
 */
export function getActiveLiveBackchannelSessionIds(): string[] {
  return serviceRegistry.getActiveSessionIds().filter(id => id !== '__global__');
}
