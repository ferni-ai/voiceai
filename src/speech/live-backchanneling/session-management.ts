/**
 * Live Backchanneling Session Management
 *
 * Session-scoped instance management for live backchanneling services.
 * Each voice session gets its own breath pause detector and backchanneling service.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { BreathPauseDetector } from './breath-pause.js';
import { LiveBackchannelingService } from './service.js';

const log = getLogger().child({ module: 'LiveBackchannelSession' });

// ============================================================================
// SESSION-SCOPED INSTANCES
// ============================================================================

const sessionServices = new Map<string, LiveBackchannelingService>();
const sessionDetectors = new Map<string, BreathPauseDetector>();

/**
 * Get or create a session-scoped LiveBackchannelingService
 */
export function getLiveBackchannelingService(sessionId?: string): LiveBackchannelingService {
  // Backward compatibility: no sessionId = global singleton behavior
  if (!sessionId) {
    const globalKey = '__global__';
    if (!sessionServices.has(globalKey)) {
      sessionServices.set(globalKey, new LiveBackchannelingService());
    }
    return sessionServices.get(globalKey)!;
  }

  if (!sessionServices.has(sessionId)) {
    sessionServices.set(sessionId, new LiveBackchannelingService());
    log.debug({ sessionId }, '🎤 Live backchanneling service created');
  }
  return sessionServices.get(sessionId)!;
}

/**
 * Get or create a session-scoped BreathPauseDetector
 */
export function getBreathPauseDetector(sessionId?: string): BreathPauseDetector {
  // Backward compatibility: no sessionId = global singleton behavior
  if (!sessionId) {
    const globalKey = '__global__';
    if (!sessionDetectors.has(globalKey)) {
      sessionDetectors.set(globalKey, new BreathPauseDetector());
    }
    return sessionDetectors.get(globalKey)!;
  }

  if (!sessionDetectors.has(sessionId)) {
    sessionDetectors.set(sessionId, new BreathPauseDetector());
    log.debug({ sessionId }, '🫁 Breath pause detector created');
  }
  return sessionDetectors.get(sessionId)!;
}

/**
 * Reset live backchanneling for a specific session
 */
export function resetLiveBackchanneling(sessionId?: string): void {
  if (!sessionId) {
    // Reset global singleton
    const globalService = sessionServices.get('__global__');
    const globalDetector = sessionDetectors.get('__global__');
    globalService?.reset();
    globalDetector?.reset();
    sessionServices.delete('__global__');
    sessionDetectors.delete('__global__');
    return;
  }

  const service = sessionServices.get(sessionId);
  const detector = sessionDetectors.get(sessionId);

  service?.reset();
  detector?.reset();

  sessionServices.delete(sessionId);
  sessionDetectors.delete(sessionId);

  log.debug({ sessionId }, '🧹 Live backchanneling reset');
}

/**
 * Reset all live backchanneling services
 */
export function resetAllLiveBackchanneling(): void {
  for (const [sessionId, service] of sessionServices) {
    service.reset();
    log.debug({ sessionId }, '🧹 Live backchanneling service reset');
  }
  for (const [sessionId, detector] of sessionDetectors) {
    detector.reset();
    log.debug({ sessionId }, '🧹 Breath pause detector reset');
  }
  sessionServices.clear();
  sessionDetectors.clear();
}

/**
 * Get active session count (for debugging)
 */
export function getActiveLiveBackchannelSessionCount(): number {
  // Exclude global singleton from count
  const hasGlobal = sessionServices.has('__global__') ? 1 : 0;
  return sessionServices.size - hasGlobal;
}
