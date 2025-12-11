/**
 * Human Listening Pipeline Session Management
 *
 * Session-scoped instance management for the pipeline.
 */

import { HumanListeningPipeline } from './pipeline.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const instances = new Map<string, HumanListeningPipeline>();

/**
 * Get or create a Human Listening Pipeline for a session
 */
export function getHumanListeningPipeline(sessionId: string): HumanListeningPipeline {
  if (!instances.has(sessionId)) {
    instances.set(sessionId, new HumanListeningPipeline(sessionId));
  }
  return instances.get(sessionId)!;
}

/**
 * Reset pipeline for a specific session
 */
export function resetHumanListeningPipeline(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.reset();
    instances.delete(sessionId);
  }
}

/**
 * Reset all pipeline instances
 */
export function resetAllHumanListeningPipelines(): void {
  instances.forEach((instance) => {
    instance.reset();
  });
  instances.clear();
}

/**
 * Get count of active pipelines
 */
export function getActivePipelineCount(): number {
  return instances.size;
}

/**
 * Get all active session IDs
 */
export function getActivePipelineSessions(): string[] {
  return [...instances.keys()];
}
