/**
 * Human Listening Pipeline Session Management
 *
 * Session-scoped instance management for the pipeline.
 */

import { HumanListeningPipeline } from './pipeline.js';

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

import {
  createSessionRegistry,
  registerGlobalRegistry,
} from '../../utils/session-registry.js';

const humanListeningRegistry = createSessionRegistry(
  (sessionId: string) => new HumanListeningPipeline(sessionId),
  { name: 'HumanListening', cleanup: (pipeline) => pipeline.reset(), verbose: false }
);

registerGlobalRegistry(humanListeningRegistry);

/**
 * Get or create a Human Listening Pipeline for a session
 */
export function getHumanListeningPipeline(sessionId: string): HumanListeningPipeline {
  return humanListeningRegistry.get(sessionId);
}

/**
 * Reset pipeline for a specific session
 */
export function resetHumanListeningPipeline(sessionId: string): void {
  humanListeningRegistry.reset(sessionId);
}

/**
 * Reset all pipeline instances
 */
export function resetAllHumanListeningPipelines(): void {
  humanListeningRegistry.resetAll();
}

// Note: getActivePipelineCount and getActivePipelineSessions removed
// The session registry doesn't expose instance count/listing methods.
// Use humanListeningRegistry.has(sessionId) to check specific sessions.
