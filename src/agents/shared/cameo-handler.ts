/**
 * Cameo Handler
 *
 * Handles voice switch events for team member "pop-in" cameos.
 * Similar to handoff-handler.ts but lighter weight since cameos
 * are temporary and always return to the host persona (Ferni).
 *
 * Flow:
 * 1. cameo_starting → Frontend starts visual transition + sound
 * 2. cameo_started → Voice switch happens + LLM instructions temporarily updated
 * 3. Persona speaks their insight
 * 4. cameo_ending → About to return
 * 5. cameo_complete → Voice switches back + LLM instructions restored
 *
 * FIX BUG: Now also updates LLM instructions during cameo to prevent
 * identity confusion (e.g., Maya's voice speaking with Ferni's personality).
 */

import type { JobContext, voice } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import { getPersonaDisplayName, getVoiceId } from '../../personas/voice-registry.js';
import { CAMEO_TIMING } from '../../services/cameo/cameo-timing.js';
import type { CameoDataMessage, CameoEvent } from '../../services/cameo/types.js';
import { diag } from '../../services/diagnostic-logger.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { UserData } from './types.js';
// Speech coordination for centralized speech management
import { coordinatedSay } from '../../speech/coordination/index.js';
// VOICE ID FIX: Use resolver for single source of truth
import { resolveVoiceId } from '../../tools/handoff/voice-id-resolver.js';

const logger = getLogger();

// ============================================================================
// CACHED IMPORTS (for performance)
// ============================================================================

interface CachedModules {
  // FIX ISSUE #1: Use session-scoped voice manager instead of global
  // This prevents cameo voice switches from affecting wrong session in multi-session environments
  getSessionVoiceManager:
    | typeof import('../../speech/voice-manager.js').getSessionVoiceManager
    | null;
  getPersonaAsync: typeof import('../../personas/index.js').getPersonaAsync | null;
}

const cachedModules: CachedModules = {
  getSessionVoiceManager: null,
  getPersonaAsync: null,
};

/**
 * FIX ISSUE #1: Use session-scoped voice manager (not global)
 * This ensures cameo voice switches only affect the correct session
 */
async function getVoiceManagerCached(sessionId: string) {
  if (!cachedModules.getSessionVoiceManager) {
    const mod = await import('../../speech/voice-manager.js');
    cachedModules.getSessionVoiceManager = mod.getSessionVoiceManager;
  }
  return cachedModules.getSessionVoiceManager(sessionId);
}

/**
 * FIX BUG: Add cached persona lookup for cameo LLM instruction updates
 */
async function getPersonaAsyncCached(personaId: string) {
  if (!cachedModules.getPersonaAsync) {
    const mod = await import('../../personas/index.js');
    cachedModules.getPersonaAsync = mod.getPersonaAsync;
  }
  return cachedModules.getPersonaAsync(personaId);
}

// ============================================================================
// SESSION STATE: Store original instructions during cameo
// ============================================================================

interface CameoSessionState {
  originalInstructions: string | null;
  originalPersonaId: string | null;
}

const cameoSessionStates = new Map<string, CameoSessionState>();

function getCameoSessionState(sessionId: string): CameoSessionState {
  const existing = cameoSessionStates.get(sessionId);
  if (existing) {
    return existing;
  }
  const newState: CameoSessionState = {
    originalInstructions: null,
    originalPersonaId: null,
  };
  cameoSessionStates.set(sessionId, newState);
  return newState;
}

function clearCameoSessionState(sessionId: string): void {
  cameoSessionStates.delete(sessionId);
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice agent reference interface (minimal subset needed for cameos)
 * FIX BUG: Added to enable LLM instruction updates during cameos
 * FIX ISSUE #3: Use `instructions` (not `_instructions`) to match handoff handler interface
 */
export interface CameoVoiceAgentRef {
  setPersona: (persona: PersonaConfig) => void;
  getPersona: () => PersonaConfig | undefined;
  /** Get current instructions to verify they were updated */
  instructions?: string;
}

/**
 * Configuration for cameo handler
 */
export interface CameoHandlerConfig {
  ctx: JobContext;
  session: voice.AgentSession<UserData>;
  tts: { switchVoice?: (name: string, id: string) => void };
  hostPersonaId: string;
  hostVoiceId: string;
  /** FIX BUG: Added voice agent ref to update LLM instructions during cameo */
  getVoiceAgentRef?: () => CameoVoiceAgentRef | null;
  /** FIX BUG: Store host persona for restoring after cameo */
  hostPersona?: PersonaConfig;
  /**
   * CRITICAL: Session ID for speech coordination.
   * Must match the sessionId used in initializeSpeechCoordination().
   */
  sessionId?: string;
}

/**
 * Cameo handler result
 */
export interface CameoHandlerResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// CAMEO EVENT HANDLERS
// ============================================================================

/**
 * Create handlers for cameo lifecycle events
 */
export function createCameoHandlers(config: CameoHandlerConfig) {
  const { ctx, session, tts, hostPersonaId, hostVoiceId, getVoiceAgentRef, hostPersona, sessionId: configSessionId } = config;

  // Use passed sessionId if available, to match speech coordination
  // CRITICAL: Must match the sessionId used in initializeSpeechCoordination()
  const sessionId = configSessionId || ctx.room?.name || `cameo-${Date.now()}`;

  /**
   * Handle cameo_started - switch voice AND LLM instructions to cameo persona
   * FIX BUG: Now updates LLM instructions to prevent identity confusion
   */
  const handleCameoStarted = async (event: CameoEvent): Promise<CameoHandlerResult> => {
    try {
      const { personaId, voiceId, greeting, cameoId } = event;

      diag.entry(`🎬 CAMEO STARTED: ${personaId} popping in`);
      logger.info(
        {
          cameoId,
          personaId,
          voiceId,
          hasGreeting: !!greeting,
          hasVoiceAgentRef: !!getVoiceAgentRef?.(),
        },
        'Cameo started - switching voice and instructions'
      );

      // FIX BUG: Store original instructions before switching
      const voiceAgentRef = getVoiceAgentRef?.();
      const sessionState = getCameoSessionState(sessionId);

      if (voiceAgentRef) {
        const currentPersona = voiceAgentRef.getPersona?.();
        sessionState.originalPersonaId = currentPersona?.id || hostPersonaId;
        // FIX ISSUE #3: Use `instructions` (not `_instructions`) - matches handoff handler interface
        sessionState.originalInstructions = voiceAgentRef.instructions || null;

        diag.entry(`🎬 Stored original persona: ${sessionState.originalPersonaId}`);

        // FIX BUG: Load cameo persona and update LLM instructions
        try {
          const cameoPersona = await getPersonaAsyncCached(personaId);
          if (cameoPersona) {
            voiceAgentRef.setPersona(cameoPersona);
            diag.entry(`🎬 LLM instructions updated to ${cameoPersona.name} for cameo`);
          } else {
            logger.warn({ personaId }, 'Could not load cameo persona for LLM update');
          }
        } catch (personaErr) {
          logger.warn(
            { error: String(personaErr), personaId },
            'Failed to update LLM instructions for cameo'
          );
          // Continue with voice switch even if persona update fails
        }
      } else {
        logger.warn('No voiceAgentRef available for cameo LLM instruction update');
      }

      // Switch voice to cameo persona with retry logic
      // FIX ISSUE #1: Pass sessionId to use session-scoped voice manager
      // FIX BUG: Add retry logic matching handoff-handler.ts for reliability
      const MAX_VOICE_SWITCH_RETRIES = 2;
      let voiceSwitchSuccess = false;

      for (let attempt = 0; attempt <= MAX_VOICE_SWITCH_RETRIES && !voiceSwitchSuccess; attempt++) {
        try {
          const voiceManager = await getVoiceManagerCached(sessionId);
          voiceManager.switchVoice(personaId);

          // VOICE ID FIX: Use resolver as single source of truth for Cartesia voice ID
          const voiceIdResult = resolveVoiceId(
            { voiceId, personaId },
            { logLevel: 'debug' }
          );
          const resolvedVoiceId = voiceIdResult.success
            ? voiceIdResult.voiceId
            : getVoiceId(personaId); // Fallback

          if (tts.switchVoice && resolvedVoiceId) {
            tts.switchVoice(getPersonaDisplayName(personaId), resolvedVoiceId);
            logger.info(
              { personaId, voiceId: resolvedVoiceId, source: voiceIdResult.success ? voiceIdResult.source : 'fallback' },
              '🎤 Cameo TTS voice switched via resolver'
            );
          }

          voiceSwitchSuccess = true;
          diag.entry(
            `🎤 Voice switched to ${personaId} for cameo${attempt > 0 ? ` (retry ${attempt})` : ''}`
          );
        } catch (voiceErr) {
          if (attempt < MAX_VOICE_SWITCH_RETRIES) {
            logger.warn(
              { error: String(voiceErr), attempt: attempt + 1 },
              'Cameo voice switch failed, retrying in 100ms...'
            );
            await sleep(100);
          } else {
            logger.error(
              { error: String(voiceErr), attempts: MAX_VOICE_SWITCH_RETRIES + 1 },
              'Cameo voice switch failed after all retries'
            );
            return { success: false, error: `Voice switch failed: ${voiceErr}` };
          }
        }
      }

      // Send cameo_started data message to frontend
      const dataMessage: CameoDataMessage = {
        type: 'cameo_start',
        personaId: event.personaId,
        personaName: getPersonaDisplayName(event.personaId),
        personaColor: '', // Will be filled by frontend from config
        greeting: event.greeting,
        voiceId: event.voiceId,
        cameoId: event.cameoId,
      };

      try {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify(dataMessage)),
          { reliable: true }
        );
      } catch (pubErr) {
        logger.warn({ error: String(pubErr) }, 'Failed to publish cameo_start data');
      }

      // Speak greeting if provided
      let greetingSpoken = false;
      const instructionsUpdated = !!voiceAgentRef; // We updated instructions above if ref exists

      if (greeting) {
        try {
          // Small delay for voice switch to complete
          await sleep(CAMEO_TIMING.VOICE_SWITCH_BUFFER);
          // Use coordinated speech for cameo greetings
          coordinatedSay(sessionId, greeting, { allowInterruptions: true });
          greetingSpoken = true;
          diag.entry(`🎬 Cameo greeting spoken: "${greeting.slice(0, 50)}..."`);
        } catch (sayErr) {
          logger.warn({ error: String(sayErr) }, 'Failed to speak cameo greeting');
        }
      } else {
        // FIX BUG: Generate a fallback greeting if none provided
        const fallbackGreeting = `Hey! ${getPersonaDisplayName(personaId)} here with a quick thought.`;
        logger.warn({ personaId }, 'No greeting provided for cameo, using fallback');
        try {
          await sleep(CAMEO_TIMING.VOICE_SWITCH_BUFFER);
          // Use coordinated speech for fallback greeting
          coordinatedSay(sessionId, fallbackGreeting, { allowInterruptions: true });
          greetingSpoken = true;
          diag.entry(`🎬 Cameo fallback greeting spoken`);
        } catch (sayErr) {
          logger.warn({ error: String(sayErr) }, 'Failed to speak cameo fallback greeting');
        }
      }

      // FIX: Emit completion event so orchestrator knows handler is done
      // This allows the tool to return AFTER greeting is spoken
      const { cameoEvents } = await import('../../services/cameo/index.js');
      cameoEvents.emit('cameoHandlerComplete', {
        cameoId,
        success: true,
        greetingSpoken,
        instructionsUpdated,
      });
      diag.entry(`✅ Cameo handler complete for ${personaId}`);

      return { success: true };
    } catch (err) {
      logger.error({ error: String(err) }, 'Cameo started handler error');

      // FIX: Emit completion event even on failure so orchestrator doesn't hang
      try {
        const { cameoEvents } = await import('../../services/cameo/index.js');
        cameoEvents.emit('cameoHandlerComplete', {
          cameoId: event.cameoId,
          success: false,
          greetingSpoken: false,
          instructionsUpdated: false,
          error: String(err),
        });
      } catch (importErr) {
        // FIX BUG: Log import errors for debugging
        logger.debug({ error: String(importErr) }, 'Cannot import cameoEvents during failure path');
      }

      return { success: false, error: String(err) };
    }
  };

  /**
   * Handle cameo_complete - switch voice AND LLM instructions back to host
   * FIX BUG: Now restores LLM instructions to prevent identity confusion
   */
  const handleCameoComplete = async (event: CameoEvent): Promise<CameoHandlerResult> => {
    try {
      const { personaId, cameoId, duration } = event;

      diag.entry(`🎬 CAMEO COMPLETE: ${personaId} returning to ${hostPersonaId}`);
      logger.info(
        {
          cameoId,
          personaId,
          duration,
          returnTo: hostPersonaId,
          hasVoiceAgentRef: !!getVoiceAgentRef?.(),
        },
        'Cameo complete - switching voice and instructions back'
      );

      // FIX BUG: Restore original LLM instructions
      const voiceAgentRef = getVoiceAgentRef?.();
      const sessionState = getCameoSessionState(sessionId);

      if (voiceAgentRef) {
        // Try to restore the original persona
        const restorePersonaId = sessionState.originalPersonaId || hostPersonaId;

        try {
          // If we have hostPersona in config, use it directly
          if (hostPersona) {
            voiceAgentRef.setPersona(hostPersona);
            diag.entry(`🎬 LLM instructions restored to ${hostPersona.name}`);
          } else {
            // Otherwise load the persona fresh
            const originalPersona = await getPersonaAsyncCached(restorePersonaId);
            if (originalPersona) {
              voiceAgentRef.setPersona(originalPersona);
              diag.entry(`🎬 LLM instructions restored to ${originalPersona.name}`);
            } else {
              logger.warn({ restorePersonaId }, 'Could not load host persona for LLM restore');
            }
          }
        } catch (personaErr) {
          logger.error(
            { error: String(personaErr), restorePersonaId },
            'Failed to restore LLM instructions after cameo'
          );
          // This is a critical failure - log as error
        }
      } else {
        logger.warn('No voiceAgentRef available for cameo LLM instruction restore');
      }

      // Switch voice back to host
      // FIX ISSUE #1: Pass sessionId to use session-scoped voice manager
      // VOICE ID FIX: Validate via resolver even for host
      try {
        const voiceManager = await getVoiceManagerCached(sessionId);
        voiceManager.switchVoice(hostPersonaId);

        // Verify voice ID via resolver (hostVoiceId should match)
        const voiceIdResult = resolveVoiceId(
          { voiceId: hostVoiceId, personaId: hostPersonaId },
          { logLevel: 'debug' }
        );
        const resolvedHostVoiceId = voiceIdResult.success
          ? voiceIdResult.voiceId
          : hostVoiceId; // Use passed value as fallback

        // Also switch session TTS
        if (tts.switchVoice) {
          tts.switchVoice(getPersonaDisplayName(hostPersonaId), resolvedHostVoiceId);
        }

        diag.entry(`🎤 Voice returned to ${hostPersonaId}`);
      } catch (voiceErr) {
        logger.error({ error: String(voiceErr) }, 'Failed to switch voice back after cameo');
        return { success: false, error: `Voice switch back failed: ${voiceErr}` };
      }

      // Send cameo_complete data message to frontend
      const dataMessage: CameoDataMessage = {
        type: 'cameo_complete',
        personaId,
        personaName: getPersonaDisplayName(personaId),
        personaColor: '',
        cameoId,
      };

      try {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify(dataMessage)),
          { reliable: true }
        );
      } catch (pubErr) {
        logger.warn({ error: String(pubErr) }, 'Failed to publish cameo_complete data');
      }

      // Clear session state
      clearCameoSessionState(sessionId);

      // FIX BUG: Validate identity was correctly restored after cameo
      const voiceAgentRefAfter = getVoiceAgentRef?.();
      if (voiceAgentRefAfter) {
        const currentPersona = voiceAgentRefAfter.getPersona?.();
        const expectedId = hostPersona?.id || hostPersonaId;
        if (currentPersona?.id !== expectedId) {
          logger.warn(
            {
              expected: expectedId,
              actual: currentPersona?.id,
              cameoId,
            },
            'Identity mismatch after cameo complete - LLM instructions may be inconsistent'
          );
          diag.entry(
            `⚠️ Identity mismatch after cameo: expected ${expectedId}, got ${currentPersona?.id}`
          );
        } else {
          logger.debug({ personaId: currentPersona?.id }, 'Identity validation passed after cameo');
        }
      }

      return { success: true };
    } catch (err) {
      logger.error({ error: String(err) }, 'Cameo complete handler error');
      // Try to clear state even on error
      clearCameoSessionState(sessionId);
      return { success: false, error: String(err) };
    }
  };

  /**
   * Handle cameo_cancelled - ensure voice AND LLM instructions are back to host
   * FIX BUG: Now restores LLM instructions on cancellation
   */
  const handleCameoCancelled = async (event: CameoEvent): Promise<CameoHandlerResult> => {
    try {
      const { personaId, cameoId, error } = event;

      diag.entry(`🎬 CAMEO CANCELLED: ${personaId} (reason: ${error || 'unknown'})`);
      logger.info(
        {
          cameoId,
          personaId,
          reason: error,
          hasVoiceAgentRef: !!getVoiceAgentRef?.(),
        },
        'Cameo cancelled - ensuring voice and instructions are reset'
      );

      // FIX BUG: Restore original LLM instructions
      const voiceAgentRef = getVoiceAgentRef?.();
      const sessionState = getCameoSessionState(sessionId);

      if (voiceAgentRef) {
        const restorePersonaId = sessionState.originalPersonaId || hostPersonaId;

        try {
          if (hostPersona) {
            voiceAgentRef.setPersona(hostPersona);
            diag.entry(`🎬 LLM instructions restored to ${hostPersona.name} after cancellation`);
          } else {
            const originalPersona = await getPersonaAsyncCached(restorePersonaId);
            if (originalPersona) {
              voiceAgentRef.setPersona(originalPersona);
              diag.entry(
                `🎬 LLM instructions restored to ${originalPersona.name} after cancellation`
              );
            }
          }
        } catch (personaErr) {
          logger.warn(
            { error: String(personaErr) },
            'Failed to restore LLM instructions after cameo cancel'
          );
        }
      }

      // Ensure voice is back to host
      // FIX ISSUE #1: Pass sessionId to use session-scoped voice manager
      // VOICE ID FIX: Validate via resolver
      try {
        const voiceManager = await getVoiceManagerCached(sessionId);
        voiceManager.switchVoice(hostPersonaId);

        // Verify voice ID via resolver
        const voiceIdResult = resolveVoiceId(
          { voiceId: hostVoiceId, personaId: hostPersonaId },
          { logLevel: 'debug' }
        );
        const resolvedHostVoiceId = voiceIdResult.success
          ? voiceIdResult.voiceId
          : hostVoiceId;

        if (tts && 'switchVoice' in tts) {
          (tts as { switchVoice: (name: string, id: string) => void }).switchVoice(
            getPersonaDisplayName(hostPersonaId),
            resolvedHostVoiceId
          );
        }
      } catch (voiceErr) {
        logger.warn({ error: String(voiceErr) }, 'Failed to reset voice after cameo cancel');
      }

      // Send cameo_cancelled data message to frontend
      const dataMessage: CameoDataMessage = {
        type: 'cameo_cancelled',
        personaId,
        personaName: getPersonaDisplayName(personaId),
        personaColor: '',
        cameoId,
        error,
      };

      try {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify(dataMessage)),
          { reliable: true }
        );
      } catch (pubErr) {
        logger.warn({ error: String(pubErr) }, 'Failed to publish cameo_cancelled data');
      }

      // Clear session state
      clearCameoSessionState(sessionId);

      return { success: true };
    } catch (err) {
      logger.error({ error: String(err) }, 'Cameo cancelled handler error');
      clearCameoSessionState(sessionId);
      return { success: false, error: String(err) };
    }
  };

  /**
   * Handle cameo_starting - prepare for cameo arrival (frontend coordination)
   * FIX GAP 8: Added handler for visual coordination with frontend
   */
  const handleCameoStarting = async (event: CameoEvent): Promise<CameoHandlerResult> => {
    try {
      const { personaId, cameoId } = event;

      diag.entry(`🎬 CAMEO STARTING: ${personaId} arriving soon`);
      logger.info(
        {
          cameoId,
          personaId,
        },
        'Cameo starting - frontend should begin visual transition'
      );

      // Send cameo_starting data message to frontend for visual prep
      const dataMessage: CameoDataMessage = {
        type: 'cameo_starting',
        personaId: event.personaId,
        personaName: getPersonaDisplayName(event.personaId),
        personaColor: '',
        cameoId: event.cameoId,
      };

      try {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify(dataMessage)),
          { reliable: true }
        );
      } catch (pubErr) {
        logger.warn({ error: String(pubErr) }, 'Failed to publish cameo_starting data');
      }

      return { success: true };
    } catch (err) {
      logger.error({ error: String(err) }, 'Cameo starting handler error');
      return { success: false, error: String(err) };
    }
  };

  /**
   * Handle cameo_ending - prepare to return to host (between insight and return)
   * FIX GAP 2: Added handler for cameo_ending event
   */
  const handleCameoEnding = async (event: CameoEvent): Promise<CameoHandlerResult> => {
    try {
      const { personaId, cameoId, duration } = event;

      diag.entry(`🎬 CAMEO ENDING: ${personaId} wrapping up (duration: ${duration}ms)`);
      logger.info(
        {
          cameoId,
          personaId,
          duration,
        },
        'Cameo ending - about to return to host'
      );

      // Send cameo_ending data message to frontend for visual prep
      const dataMessage: CameoDataMessage = {
        type: 'cameo_ending',
        personaId: event.personaId,
        personaName: getPersonaDisplayName(event.personaId),
        personaColor: '',
        cameoId: event.cameoId,
        duration,
      };

      try {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify(dataMessage)),
          { reliable: true }
        );
      } catch (pubErr) {
        logger.warn({ error: String(pubErr) }, 'Failed to publish cameo_ending data');
      }

      return { success: true };
    } catch (err) {
      logger.error({ error: String(err) }, 'Cameo ending handler error');
      return { success: false, error: String(err) };
    }
  };

  return {
    handleCameoStarting,
    handleCameoStarted,
    handleCameoEnding,
    handleCameoComplete,
    handleCameoCancelled,
  };
}

// ============================================================================
// UTILITY
// ============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// INTEGRATION HELPER
// ============================================================================

/**
 * Register cameo event handlers with the cameo orchestrator
 *
 * Call this during voice agent setup to enable cameo support
 */
export async function registerCameoHandlers(config: CameoHandlerConfig): Promise<() => void> {
  const { cameoEvents } = await import('../../services/cameo/index.js');
  const handlers = createCameoHandlers(config);

  // Wrap handlers to catch errors
  // FIX GAP 8: Added cameo_starting handler
  const wrappedStarting = (event: CameoEvent) => {
    void handlers.handleCameoStarting(event).catch((err) => {
      logger.error({ error: String(err) }, 'Cameo starting handler crashed');
    });
  };

  const wrappedStarted = (event: CameoEvent) => {
    void handlers.handleCameoStarted(event).catch((err) => {
      logger.error({ error: String(err) }, 'Cameo started handler crashed');
    });
  };

  // FIX GAP 2: Added cameo_ending handler
  const wrappedEnding = (event: CameoEvent) => {
    void handlers.handleCameoEnding(event).catch((err) => {
      logger.error({ error: String(err) }, 'Cameo ending handler crashed');
    });
  };

  const wrappedComplete = (event: CameoEvent) => {
    void handlers.handleCameoComplete(event).catch((err) => {
      logger.error({ error: String(err) }, 'Cameo complete handler crashed');
    });
  };

  const wrappedCancelled = (event: CameoEvent) => {
    void handlers.handleCameoCancelled(event).catch((err) => {
      logger.error({ error: String(err) }, 'Cameo cancelled handler crashed');
    });
  };

  // Register event listeners for ALL cameo lifecycle events
  cameoEvents.on('cameo_starting', wrappedStarting);
  cameoEvents.on('cameo_started', wrappedStarted);
  cameoEvents.on('cameo_ending', wrappedEnding);
  cameoEvents.on('cameo_complete', wrappedComplete);
  cameoEvents.on('cameo_cancelled', wrappedCancelled);

  logger.info('Cameo handlers registered (starting, started, ending, complete, cancelled)');

  // Return cleanup function
  return () => {
    cameoEvents.off('cameo_starting', wrappedStarting);
    cameoEvents.off('cameo_started', wrappedStarted);
    cameoEvents.off('cameo_ending', wrappedEnding);
    cameoEvents.off('cameo_complete', wrappedComplete);
    cameoEvents.off('cameo_cancelled', wrappedCancelled);
    logger.info('Cameo handlers unregistered');
  };
}

export default {
  createCameoHandlers,
  registerCameoHandlers,
};
