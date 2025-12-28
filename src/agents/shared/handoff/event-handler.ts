/**
 * Handoff Event Handler
 *
 * Listens for voiceSwitch events and delegates to the CoordinatorAdapter.
 * This replaces the old createHandoffHandler for event-driven handoffs.
 *
 * Event flow:
 *   LLM tool call → executeHandoff() → emits 'voiceSwitch' → this handler → CoordinatorAdapter
 *
 * @module agents/shared/handoff/event-handler
 */

import type { JobContext, voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import type { SessionServices } from '../../../services/types.js';
import type { UserData } from '../types.js';
import { handoffEvents } from '../../../tools/handoff/state.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { diag } from '../../../services/diagnostic-logger.js';

// Coordinator adapter
import {
  getSessionAdapter,
  createCoordinatorAdapter,
  type CoordinatorAdapterConfig,
} from './coordinator-adapter.js';

// Types from handoff system
import type { HandoffEventPayload, NewHandoffData, LegacyHandoffData } from './types.js';
import { getNextMessageSeqSync } from './session-state.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the event handler.
 */
export interface EventHandlerConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** Voice session */
  session: voice.AgentSession<UserData>;
  /** TTS instance */
  tts: { switchVoice?: (name: string, id: string) => void };
  /** Session services */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Voice agent reference for persona updates */
  getVoiceAgentRef: () => {
    setPersona: (personaId: string, instructions: string) => void;
  } | null;
  /** Session ID - MUST match the ID used by data-channel-handler */
  sessionId?: string;
  /** CRITICAL: Initial agent for the session. Must match sessionPersona.id from voice-agent-entry! */
  initialAgent?: string;
}

/**
 * Result of creating the event handler.
 */
export interface EventHandlerResult {
  /** Handler function bound to voiceSwitch events */
  handler: (data: HandoffEventPayload) => Promise<void>;
  /** Cleanup function to unregister the handler */
  cleanup: () => void;
}

// ============================================================================
// EVENT HANDLER FACTORY
// ============================================================================

/**
 * Create an event handler for voiceSwitch events.
 *
 * This handler:
 * 1. Receives voiceSwitch events from executeHandoff()
 * 2. Extracts persona info from the event
 * 3. Delegates to CoordinatorAdapter for the actual handoff
 * 4. Emits handoffHandlerComplete when done
 *
 * @param config - Handler configuration
 * @returns Handler function and cleanup
 */
export function createEventHandler(config: EventHandlerConfig): EventHandlerResult {
  const {
    ctx,
    session,
    tts,
    services,
    userData,
    getVoiceAgentRef,
    sessionId: configSessionId,
    initialAgent,
  } = config;
  // Use passed sessionId if available, otherwise fall back to room name
  // CRITICAL: This MUST match the sessionId used by data-channel-handler
  const sessionId = configSessionId || ctx.room?.name || `event-handler-${Date.now()}`;

  log.info({ sessionId, initialAgent }, '📡 Creating voiceSwitch event handler');

  // Ensure coordinator adapter exists for this session
  // CRITICAL: Always pass initialAgent so the state manager knows the starting persona!
  // CRITICAL: Pass tts so the actual voice can be changed!
  const adapterConfig: CoordinatorAdapterConfig = {
    ctx,
    session,
    services,
    room: ctx.room,
    getVoiceAgentRef,
    initialAgent: initialAgent || 'ferni', // Default to ferni if not provided
    tts, // CRITICAL: Without this, LLM-initiated handoffs won't switch voice!
  };

  // Get or create the adapter
  let adapter = getSessionAdapter(sessionId);
  if (!adapter) {
    adapter = getSessionAdapter(sessionId, adapterConfig);
  }

  /**
   * Handle voiceSwitch events.
   */
  const handleVoiceSwitch = async (data: HandoffEventPayload): Promise<void> => {
    const startTime = Date.now();
    let targetPersonaId = 'unknown';

    try {
      log.info(
        {
          sessionId,
          eventType: 'voiceSwitch',
          dataPreview: JSON.stringify(data).slice(0, 300),
          hasPersona: 'persona' in data && !!data.persona,
          hasNewAgent: 'newAgent' in data,
        },
        '📥 [EVENT-HANDLER] voiceSwitch event RECEIVED'
      );

      // CRITICAL: Check if session is closing before attempting handoff
      // This prevents "AgentSession is closing" errors and timeouts
      const { isSessionClosing } = await import('../session-closing-tracker.js');
      if (isSessionClosing(sessionId)) {
        log.warn({ sessionId }, '⚠️ [EVENT-HANDLER] Aborting handoff - session is closing');
        throw new Error('Session is closing - handoff aborted');
      }

      // Extract target persona ID from event data
      if ('persona' in data && data.persona) {
        // New format
        targetPersonaId = data.persona.id;
      } else if ('newAgent' in data) {
        // Legacy format
        targetPersonaId = (data as LegacyHandoffData).newAgent;
      }

      if (!targetPersonaId || targetPersonaId === 'unknown') {
        throw new Error('No target persona in voiceSwitch event');
      }

      log.info({ sessionId, targetPersonaId }, '🎯 [EVENT-HANDLER] Target persona extracted');

      diag.entry(`🔄 voiceSwitch: Switching to ${targetPersonaId}`);

      // Get adapter (should exist from above)
      const currentAdapter = getSessionAdapter(sessionId);
      if (!currentAdapter) {
        log.error({ sessionId }, '❌ [EVENT-HANDLER] CoordinatorAdapter not found!');
        throw new Error('CoordinatorAdapter not available');
      }

      // Extract reason/greeting from event
      const greeting = 'greeting' in data ? data.greeting : undefined;
      const reason = greeting || 'LLM requested handoff';

      log.info(
        { sessionId, targetPersonaId, reason, fastMode: false, source: 'llm' },
        '🔄 [EVENT-HANDLER] Calling adapter.executeHandoff()...'
      );

      // LLM-initiated = FULL BANTER (not fast mode)
      // The LLM is making a conversational transfer, so allow natural goodbye/hello
      const adapterStart = Date.now();
      const result = await currentAdapter.executeHandoff(targetPersonaId, reason, {
        userProfile: services.userProfile,
        subscriptionTier:
          (services.userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free',
        fastMode: false, // 🎭 Full banter for LLM-initiated transfers
        source: 'llm',
      });

      log.info(
        {
          sessionId,
          targetPersonaId,
          success: result.success,
          error: result.error,
          traceId: result.traceId,
          adapterDurationMs: Date.now() - adapterStart,
        },
        '🔄 [EVENT-HANDLER] adapter.executeHandoff() returned'
      );

      if (!result.success) {
        throw new Error(result.error || 'Handoff failed');
      }

      const duration = Date.now() - startTime;
      log.info(
        { targetPersonaId, durationMs: duration, traceId: result.traceId },
        '✅ [EVENT-HANDLER] voiceSwitch COMPLETE'
      );

      // Emit completion event (for executor.ts to know we're done)
      // CRITICAL: Field names MUST match what executor.ts expects
      log.info(
        { targetPersonaId, duration },
        '📤 [EVENT-HANDLER] Emitting handoffHandlerComplete event'
      );
      handoffEvents.emit('handoffHandlerComplete', {
        targetId: targetPersonaId, // executor.ts expects 'targetId', not 'targetPersonaId'
        success: true,
        greetingSpoken: true,
        instructionsUpdated: true,
        durationMs: duration,
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      log.error(
        { targetPersonaId, error: errorMsg, durationMs: duration },
        '❌ voiceSwitch failed'
      );

      // Send failure to frontend
      try {
        const failureMessage = JSON.stringify({
          type: 'handoff_failed',
          newAgent: targetPersonaId,
          previousAgent: adapter?.getCurrentAgent() || 'ferni',
          rollbackTo: adapter?.getCurrentAgent() || 'ferni',
          error: errorMsg,
          seq: getNextMessageSeqSync(sessionId),
          timestamp: Date.now(),
        });

        await ctx.room.localParticipant?.publishData(new TextEncoder().encode(failureMessage), {
          reliable: true,
        });
      } catch (sendErr) {
        log.warn({ error: String(sendErr) }, 'Failed to send failure to frontend');
      }

      // Emit failure event
      // CRITICAL: Field names MUST match what executor.ts expects
      handoffEvents.emit('handoffHandlerComplete', {
        targetId: targetPersonaId, // executor.ts expects 'targetId', not 'targetPersonaId'
        success: false,
        greetingSpoken: false,
        instructionsUpdated: false,
        error: errorMsg,
        durationMs: duration,
      });
    }
  };

  // Register the handler
  handoffEvents.on('voiceSwitch', handleVoiceSwitch);
  log.info({ sessionId }, '✅ voiceSwitch handler registered');

  // Return handler and cleanup
  return {
    handler: handleVoiceSwitch,
    cleanup: () => {
      handoffEvents.off('voiceSwitch', handleVoiceSwitch);
      log.info({ sessionId }, '🗑️ voiceSwitch handler unregistered');
    },
  };
}

// ============================================================================
// BACKWARD COMPATIBILITY WRAPPER
// ============================================================================

/**
 * Create a handoff handler (backward compatible with old createHandoffHandler).
 *
 * This is a drop-in replacement for the old createHandoffHandler function.
 */
export function createHandoffEventHandler(config: EventHandlerConfig) {
  const result = createEventHandler(config);

  // Return just the handler function for backward compatibility
  // (old code just registered the returned function directly)
  return result.handler;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createEventHandler;
