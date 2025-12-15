/**
 * Pronunciation Memory Session Management
 *
 * @module speech/pronunciation-memory/session
 */

import { createSessionRegistry, registerGlobalRegistry } from '../../utils/session-registry.js';
import { PronunciationMemoryService } from './service.js';

// ============================================================================
// SESSION REGISTRY MANAGEMENT
// ============================================================================

/**
 * Session registry for pronunciation memory services.
 * Provides automatic cleanup and lifecycle management.
 */
const pronunciationMemoryRegistry = createSessionRegistry(
  (sessionId: string) => new PronunciationMemoryService(sessionId),
  {
    name: 'PronunciationMemory',
    cleanup: (service) => service.reset(),
    verbose: false,
  }
);

// Register globally for coordinated session cleanup
registerGlobalRegistry(pronunciationMemoryRegistry);

/**
 * Get or create pronunciation memory for a session
 */
export function getPronunciationMemory(sessionId: string): PronunciationMemoryService {
  return pronunciationMemoryRegistry.get(sessionId);
}

/**
 * Reset pronunciation memory for a session
 */
export function resetPronunciationMemory(sessionId: string): void {
  pronunciationMemoryRegistry.reset(sessionId);
}

/**
 * Reset all pronunciation memories
 */
export function resetAllPronunciationMemory(): void {
  pronunciationMemoryRegistry.resetAll();
}

/**
 * Check if pronunciation memory exists for a session
 */
export function hasPronunciationMemory(sessionId: string): boolean {
  return pronunciationMemoryRegistry.has(sessionId);
}

/**
 * Get count of active pronunciation memories
 */
export function getActivePronunciationMemoryCount(): number {
  return pronunciationMemoryRegistry.getActiveCount();
}

