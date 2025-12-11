/**
 * Voice Humanization Session Management
 *
 * Session-scoped instance management for the voice humanization service.
 */

import { VoiceHumanizationService } from './service.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const sessionInstances = new Map<string, VoiceHumanizationService>();

/**
 * Get or create voice humanization service for a session
 */
export function getVoiceHumanizationService(sessionId: string): VoiceHumanizationService {
  if (!sessionInstances.has(sessionId)) {
    sessionInstances.set(sessionId, new VoiceHumanizationService(sessionId));
  }
  return sessionInstances.get(sessionId)!;
}

/**
 * Reset voice humanization service for a session
 */
export function resetVoiceHumanization(sessionId: string): void {
  const instance = sessionInstances.get(sessionId);
  if (instance) {
    instance.reset();
    sessionInstances.delete(sessionId);
  }
}

/**
 * Reset all instances
 */
export function resetAllVoiceHumanization(): void {
  sessionInstances.clear();
}

/**
 * Get count of active sessions
 */
export function getActiveVoiceHumanizationCount(): number {
  return sessionInstances.size;
}
