/**
 * Voice Humanization Session Management
 *
 * Session-scoped instance management for the voice humanization service.
 * Uses the centralized SessionRegistry pattern for consistent lifecycle management.
 */

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
import { VoiceHumanizationService } from './service.js';

// ============================================================================
// SESSION REGISTRY
// ============================================================================

/**
 * Session registry for voice humanization services.
 * Provides automatic cleanup and lifecycle management.
 */
const voiceHumanizationRegistry = createSessionRegistry(
  (sessionId: string) => new VoiceHumanizationService(sessionId),
  {
    name: 'VoiceHumanization',
    cleanup: (service) => service.reset(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(voiceHumanizationRegistry);

// ============================================================================
// PUBLIC API (backwards compatible)
// ============================================================================

/**
 * Get or create voice humanization service for a session
 */
export function getVoiceHumanizationService(sessionId: string): VoiceHumanizationService {
  return voiceHumanizationRegistry.get(sessionId);
}

/**
 * Reset voice humanization service for a session
 */
export function resetVoiceHumanization(sessionId: string): void {
  voiceHumanizationRegistry.reset(sessionId);
}

/**
 * Reset all instances
 */
export function resetAllVoiceHumanization(): void {
  voiceHumanizationRegistry.resetAll();
}

/**
 * Get count of active sessions
 */
export function getActiveVoiceHumanizationCount(): number {
  return voiceHumanizationRegistry.getActiveCount();
}

/**
 * Check if a session has an active voice humanization service
 */
export function hasVoiceHumanization(sessionId: string): boolean {
  return voiceHumanizationRegistry.has(sessionId);
}

/**
 * Get all active session IDs (for monitoring/debugging)
 */
export function getActiveVoiceHumanizationSessionIds(): string[] {
  return voiceHumanizationRegistry.getActiveSessionIds();
}
