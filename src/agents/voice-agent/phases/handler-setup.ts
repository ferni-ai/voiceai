/**
 * Handler Setup Phase
 *
 * Imports and initializes all voice agent handlers in parallel.
 * This includes music, data channel, transcript, session state,
 * tool tracking, handoff, cameo, greeting, and cleanup handlers.
 *
 * @module voice-agent/phases/handler-setup
 */

import type { Persona } from '../../../personas/types.js';
import type { SessionServices } from '../../../services/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface HandlerSetupConfig {
  /** Session ID for handler context */
  sessionId: string;
  /** Active persona for the session */
  sessionPersona: Persona;
  /** Session services container */
  services: SessionServices;
}

export interface HandlerModules {
  /** Music handler setup function */
  setupMusicHandler: typeof import('../music-handler.js').setupMusicHandler;
  /** Data channel handler setup function */
  setupDataChannelHandler: typeof import('../data-channel-handler.js').setupDataChannelHandler;
  /** Transcript handler creator */
  createTranscriptHandler: typeof import('../transcript-handler.js').createTranscriptHandler;
  /** Session state handlers setup */
  setupSessionStateHandlers: typeof import('../session-state-handler.js').setupSessionStateHandlers;
  /** Tool tracking handler setup */
  setupToolTrackingHandler: typeof import('../tool-tracking-handler.js').setupToolTrackingHandler;
  /** Event handler creator (coordinator-based handoff) */
  createEventHandler: typeof import('../../shared/handoff/event-handler.js').createEventHandler;
  /** Cameo handlers registration */
  registerCameoHandlers: typeof import('../../shared/cameo-handler.js').registerCameoHandlers;
  /** Greeting generation and speech */
  generateAndSpeakGreeting: typeof import('../greeting-handler.js').generateAndSpeakGreeting;
  /** Session cleanup handler */
  handleSessionCleanup: typeof import('../cleanup-handler.js').handleSessionCleanup;
}

export interface HandlerSetupResult {
  /** All imported handler modules */
  handlers: HandlerModules;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Imports all handler modules in parallel and initializes the conversation manager.
 *
 * This is a performance optimization - all handlers are imported simultaneously
 * rather than sequentially, reducing initialization time.
 *
 * @param config - Handler setup configuration
 * @returns Imported handler modules and conversation manager
 */
export async function setupHandlers(config: HandlerSetupConfig): Promise<HandlerSetupResult> {
  const { sessionPersona, services } = config;

  process.stderr.write(`[handler-setup] 🔌 Importing handlers in parallel...\n`);

  // Import all handlers in parallel for performance
  const [
    { setupMusicHandler },
    { setupDataChannelHandler },
    { createTranscriptHandler },
    { setupSessionStateHandlers },
    { setupToolTrackingHandler },
    { createEventHandler },
    { registerCameoHandlers },
    { generateAndSpeakGreeting },
    { handleSessionCleanup },
  ] = await Promise.all([
    import('../music-handler.js'),
    import('../data-channel-handler.js'),
    import('../transcript-handler.js'),
    import('../session-state-handler.js'),
    import('../tool-tracking-handler.js'),
    import('../../shared/handoff/event-handler.js'),
    import('../../shared/cameo-handler.js'),
    import('../greeting-handler.js'),
    import('../cleanup-handler.js'),
  ]);

  // TODO: Add conversation manager integration when API is available
  // The conversation module provides session-based APIs via createConversationSession()
  // See: src/conversation/unified-integration.ts

  process.stderr.write(`[handler-setup] ✅ All handlers imported\n`);

  return {
    handlers: {
      setupMusicHandler,
      setupDataChannelHandler,
      createTranscriptHandler,
      setupSessionStateHandlers,
      setupToolTrackingHandler,
      createEventHandler,
      registerCameoHandlers,
      generateAndSpeakGreeting,
      handleSessionCleanup,
    },
  };
}
