/**
 * Handoff Handler
 *
 * Extracted from voice-agent.ts to improve modularity.
 * Handles all voice switch events when transitioning between personas.
 *
 * Flow:
 * 1. Normalize persona from legacy or new format
 * 2. Calculate transition direction
 * 3. Send handoff_started to frontend
 * 4. Wait for transition animation
 * 5. Switch voice
 * 6. Send handoff_complete to frontend
 * 7. Speak greeting in new voice
 * 8. Update persona & LLM instructions
 * 9. Reload bundle runtime
 * 10. Validate handoff consistency
 */

import { log, voice } from '@livekit/agents';
import type { JobContext } from '@livekit/agents';
import { diag } from '../../services/diagnostic-logger.js';
import { getCurrentAgent } from '../../tools/handoff/index.js';
import { HANDOFF_DELAYS } from './constants.js';
import type { UserData } from './types.js';
import type { SessionServices } from '../../services/types.js';

const getLogger = () => log();

// ============================================================================
// FIX BUG #50 & #51: Cached imports to reduce handoff latency
// These are lazily loaded once and then reused for subsequent handoffs
// ============================================================================

type CachedModules = {
  PersonaRegistry: typeof import('../../personas/PersonaRegistry.js').PersonaRegistry | null;
  getVoiceManager: typeof import('../../speech/voice-manager.js').getVoiceManager | null;
  getMusicPlayer: typeof import('../../audio/index.js').getMusicPlayer | null;
  getPersonaAsync: typeof import('../../personas/index.js').getPersonaAsync | null;
  loadBundleById: typeof import('../../personas/bundles/index.js').loadBundleById | null;
  createBundleRuntime: typeof import('../../personas/bundles/runtime.js').createBundleRuntime | null;
};

const cachedModules: CachedModules = {
  PersonaRegistry: null,
  getVoiceManager: null,
  getMusicPlayer: null,
  getPersonaAsync: null,
  loadBundleById: null,
  createBundleRuntime: null,
};

/**
 * Get PersonaRegistry with caching
 */
async function getPersonaRegistryCached() {
  if (!cachedModules.PersonaRegistry) {
    const mod = await import('../../personas/PersonaRegistry.js');
    cachedModules.PersonaRegistry = mod.PersonaRegistry;
  }
  return cachedModules.PersonaRegistry;
}

/**
 * Get VoiceManager with caching
 */
async function getVoiceManagerCached() {
  if (!cachedModules.getVoiceManager) {
    const mod = await import('../../speech/voice-manager.js');
    cachedModules.getVoiceManager = mod.getVoiceManager;
  }
  return cachedModules.getVoiceManager();
}

/**
 * Get MusicPlayer with caching - returns null if music is disabled
 */
async function getMusicPlayerCached() {
  // Check if music is enabled first
  const { isMusicEnabled } = await import('../../config/environment.js');
  if (!isMusicEnabled()) {
    return null;
  }
  
  if (!cachedModules.getMusicPlayer) {
    const mod = await import('../../audio/index.js');
    cachedModules.getMusicPlayer = mod.getMusicPlayer;
  }
  return cachedModules.getMusicPlayer();
}

/**
 * Get getPersonaAsync with caching
 */
async function getPersonaAsyncCached(personaId: string) {
  if (!cachedModules.getPersonaAsync) {
    const mod = await import('../../personas/index.js');
    cachedModules.getPersonaAsync = mod.getPersonaAsync;
  }
  return cachedModules.getPersonaAsync(personaId);
}

/**
 * Get bundle loading functions with caching
 */
async function getBundleFunctionsCached() {
  if (!cachedModules.loadBundleById) {
    const bundleMod = await import('../../personas/bundles/index.js');
    cachedModules.loadBundleById = bundleMod.loadBundleById;
  }
  if (!cachedModules.createBundleRuntime) {
    const runtimeMod = await import('../../personas/bundles/runtime.js');
    cachedModules.createBundleRuntime = runtimeMod.createBundleRuntime;
  }
  return {
    loadBundleById: cachedModules.loadBundleById,
    createBundleRuntime: cachedModules.createBundleRuntime,
  };
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Persona type for handoff events
 */
export interface HandoffPersona {
  id: string;
  name: string;
  voiceId: string;
  role: 'coach' | 'team';
  isCoach: boolean;
  handoffTool: string;
  aliases: readonly string[];
}

/**
 * Legacy handoff data format (old format with newAgent + voiceId)
 * FIX BUG #81: Added discriminant field 'format' for type narrowing
 */
export interface LegacyHandoffData {
  readonly format?: 'legacy';
  newAgent: string;
  voiceId: string;
  greeting?: string;
  playSound?: string;
  previousAgent?: string;
}

/**
 * New handoff data format (clean format with persona object)
 * FIX BUG #81: Added discriminant field 'format' for type narrowing
 */
export interface NewHandoffData {
  readonly format: 'new';
  persona: HandoffPersona;
  greeting?: string;
  playSound?: string;
  previousAgentId?: string;
  /** FIX BUG #25: Explicit flag instead of parsing greeting string */
  isUserInitiated?: boolean;
}

export type HandoffEventPayload = NewHandoffData | LegacyHandoffData;

/**
 * Type guard to check if handoff data is in new format
 * FIX BUG #81: Provides type-safe way to narrow HandoffEventPayload
 */
export function isNewHandoffData(data: HandoffEventPayload): data is NewHandoffData {
  return data.format === 'new' || 'persona' in data;
}

/**
 * Type guard to check if handoff data is in legacy format
 * FIX BUG #81: Provides type-safe way to narrow HandoffEventPayload
 */
export function isLegacyHandoffData(data: HandoffEventPayload): data is LegacyHandoffData {
  return !('persona' in data) && 'newAgent' in data;
}

/**
 * Voice agent reference interface (minimal subset needed for handoffs)
 */
export interface VoiceAgentRef {
  setPersona(persona: unknown): void;
  getPersona(): { id: string } | undefined;
  setBundleRuntime(runtime: unknown): void;
  getBundleRuntime(): { getState(): { personaId?: string } } | undefined;
  instructions?: string;
}

/**
 * Handoff handler configuration
 */
export interface HandoffHandlerConfig {
  ctx: JobContext;
  session: voice.AgentSession<UserData>;
  tts: { switchVoice?: (name: string, id: string) => void };
  services: SessionServices;
  userData: UserData;
  getVoiceAgentRef: () => VoiceAgentRef | null;
}

// ============================================================================
// DIRECTION CALCULATION
// ============================================================================

/**
 * Determine handoff direction based on persona roles
 */
function determineDirection(from: HandoffPersona, to: HandoffPersona): string {
  // Peter John specific transitions (most dramatic)
  if (to.id === 'peter-john') return 'team-to-peter';
  if (from.id === 'peter-john' && to.id === 'nayan-patel') return 'peter-to-nayan';

  // Coach to team
  if (from.isCoach && !to.isCoach) return 'coach-to-team';

  // Team to coach
  if (!from.isCoach && to.isCoach) return 'team-to-coach';

  // Team to team
  return 'coach-to-team';
}

/**
 * Calculate transition delay based on handoff context
 * FIX BUG #25: Now accepts explicit isUserInitiated flag instead of parsing greeting string
 */
function calculateTransitionDelay(
  fromPersona: HandoffPersona,
  toPersona: HandoffPersona,
  isUserInitiated: boolean
): number {
  const isFirstMeeting = fromPersona.isCoach;
  const isReturningToCoach = toPersona.isCoach;

  if (isUserInitiated) {
    return HANDOFF_DELAYS.USER_INITIATED;
  } else if (isFirstMeeting && !isReturningToCoach) {
    return HANDOFF_DELAYS.FIRST_MEETING;
  } else if (isReturningToCoach) {
    return HANDOFF_DELAYS.RETURNING_TO_COACH;
  }
  return HANDOFF_DELAYS.STANDARD;
}

// ============================================================================
// HANDOFF HANDLER
// ============================================================================

/**
 * Create a handoff event handler for voice switch events
 *
 * @param config - Configuration including context, session, services, etc.
 * @returns Handler function for voiceSwitch events
 */
export function createHandoffHandler(config: HandoffHandlerConfig) {
  const { ctx, session, tts, services, userData, getVoiceAgentRef } = config;
  const logger = getLogger();

  return async (data: HandoffEventPayload) => {
    // FIX BUG #50: Use cached PersonaRegistry to avoid redundant lookups
    const PersonaRegistry = await getPersonaRegistryCached();

    // ============================================================
    // NORMALIZE: Convert any format to Persona object
    // ============================================================
    let persona: HandoffPersona;
    let greeting: string | undefined;
    let playSound: string | undefined;
    let previousAgentId: string | undefined;

    if ('persona' in data && data.persona) {
      // New clean format - use directly
      persona = data.persona;
      greeting = data.greeting;
      playSound = data.playSound;
      previousAgentId = (data as NewHandoffData).previousAgentId;
    } else {
      // Legacy format - resolve via PersonaRegistry
      const legacy = data as LegacyHandoffData;
      persona = PersonaRegistry.get(legacy.newAgent);
      greeting = legacy.greeting;
      playSound = legacy.playSound;
      previousAgentId = legacy.previousAgent;
    }

    // Get previous persona for logging
    const prevId = previousAgentId || getCurrentAgent();
    const prevPersona: HandoffPersona = PersonaRegistry.get(prevId);

    diag.entry(`🔄 HANDOFF: ${prevPersona.name} → ${persona.name}`);

    logger.info(
      {
        from: { id: prevPersona.id, name: prevPersona.name, role: prevPersona.role },
        to: { id: persona.id, name: persona.name, role: persona.role },
        hasGreeting: !!greeting,
        playSound,
      },
      'Agent handoff triggered'
    );

    const direction = determineDirection(prevPersona, persona);

    // ============================================================
    // DELIGHTFUL HANDOFF FLOW
    // ============================================================
    try {
      // STEP 1: Send handoff_started - frontend begins visual transition
      const startMessage = JSON.stringify({
        type: 'handoff_started',
        newAgent: persona.id,
        previousAgent: prevPersona.id,
        direction,
        playSound,
        timestamp: Date.now(),
      });

      await ctx.room.localParticipant?.publishData(new TextEncoder().encode(startMessage), {
        reliable: true,
      });

      diag.entry(`Handoff started: ${prevPersona.name} → ${persona.name}`);

      // STEP 2: Calculate and wait for transition
      // FIX BUG #25: Use explicit flag if available, fall back to string parsing for legacy data
      const isUserInitiated = 'isUserInitiated' in data 
        ? (data as NewHandoffData).isUserInitiated ?? false 
        : greeting?.includes('User requested') ?? false;
      const transitionDelayMs = calculateTransitionDelay(prevPersona, persona, isUserInitiated);

      diag.entry(
        `Transition delay: ${transitionDelayMs}ms (userInitiated: ${isUserInitiated}, firstMeeting: ${prevPersona.isCoach})`
      );

      // FIX BUG #28 & #51: Use cached music player (only if music is enabled)
      let musicWasPlaying = false;
      let musicPlayerRef: { isPlaying(): boolean; resume(): Promise<void> } | null = null;
      try {
        musicPlayerRef = await getMusicPlayerCached();
        if (musicPlayerRef) {
          musicWasPlaying = musicPlayerRef.isPlaying();
          if (musicWasPlaying) {
            diag.state(`Music is playing during handoff - preserving playback`);
          }
        }
      } catch {
        // Music player not available - ignore
      }

      await new Promise((resolve) => setTimeout(resolve, transitionDelayMs));

      // STEP 3: Switch the voice with retry logic
      // FIX BUG #47: Added retry mechanism for failed voice switches
      const MAX_VOICE_SWITCH_RETRIES = 2;
      let voiceSwitchSuccess = false;
      
      for (let attempt = 0; attempt <= MAX_VOICE_SWITCH_RETRIES && !voiceSwitchSuccess; attempt++) {
        try {
          // FIX BUG #51: Use cached voice manager
          const voiceManager = await getVoiceManagerCached();
          voiceManager.switchVoice(persona.id);

          // Also switch the session's TTS if it supports voice switching
          if (tts && 'switchVoice' in tts) {
            (tts as { switchVoice: (name: string, id: string) => void }).switchVoice(
              persona.id,
              persona.voiceId
            );
          }

          voiceSwitchSuccess = true;
          diag.entry(`Voice switched to ${persona.name}, ready to speak${attempt > 0 ? ` (retry ${attempt})` : ''}`);
        } catch (voiceSwitchErr) {
          if (attempt < MAX_VOICE_SWITCH_RETRIES) {
            diag.warn(`Voice switch failed (attempt ${attempt + 1}), retrying in 100ms...`);
            await new Promise((resolve) => setTimeout(resolve, 100));
          } else {
            diag.error(`Voice switch failed after ${MAX_VOICE_SWITCH_RETRIES + 1} attempts`);
            throw voiceSwitchErr;
          }
        }
      }

        // FIX BUG #6: State sync removed - setCurrentAgent is already called in the handoff tool
        // before emitting the event. Calling it twice caused race conditions where the
        // state would indicate "new agent" before the voice actually switched.
        // The handoff tool (handoff.ts) calls setCurrentAgent() BEFORE emitting voiceSwitch,
        // so the handler should NOT call it again.

        // FIX BUG #24: STEP 4 was missing - music resume
        // FIX BUG #28: Use cached musicPlayerRef instead of re-importing
        // STEP 4: Resume music if it was playing
        if (musicWasPlaying && musicPlayerRef) {
          try {
            if (!musicPlayerRef.isPlaying()) {
              diag.warn('Music stopped during handoff - attempting to resume');
              await musicPlayerRef.resume();
            }
          } catch {
            // Non-critical - music may have naturally ended
          }
        }

        // STEP 5: Send handoff_complete
        const completeMessage = JSON.stringify({
          type: 'handoff_complete',
          newAgent: persona.id,
          previousAgent: prevPersona.id,
          greeting,
          timestamp: Date.now(),
        });

        await ctx.room.localParticipant?.publishData(new TextEncoder().encode(completeMessage), {
          reliable: true,
        });

        diag.entry(`Handoff complete: ${persona.name} ready to speak`);

        // STEP 6: Speak greeting programmatically (no delay - voice already switched!)
        if (greeting) {
          try {
            // NOTE: Removed 150ms delay - voice is already switched, speak immediately!
            session.say(greeting, { allowInterruptions: true });
            diag.entry(`🎤 ${persona.name} greeting spoken: "${greeting.slice(0, 50)}..."`);
          } catch (greetingErr) {
            logger.warn({ error: String(greetingErr) }, 'Failed to speak handoff greeting');
          }
        }

        // STEP 7: Update persona & LLM instructions
        try {
          // FIX BUG #51: Use cached persona lookup
          const loadedPersona = await getPersonaAsyncCached(persona.id);
          const voiceAgentRef = getVoiceAgentRef();

          if (loadedPersona && voiceAgentRef) {
            voiceAgentRef.setPersona(loadedPersona);
            diag.entry(`🎭 Persona & LLM instructions updated to ${persona.name}`);
          }
        } catch (personaErr) {
          // FIX BUG #49: Graceful degradation - handoff proceeds but with basic instructions
          logger.warn({ 
            personaId: persona.id, 
            error: String(personaErr) 
          }, '⚠️ Persona update failed - handoff continues with existing configuration');
          diag.warn(`Persona async load failed for ${persona.name}, using cached version`);
        }

        // STEP 8: Reload bundle runtime
        // FIX BUG #51, #63, #64, #66: Use cached bundle functions with proper state preservation
        try {
          const { loadBundleById, createBundleRuntime } = await getBundleFunctionsCached();
          const newBundle = await loadBundleById(persona.id);

          if (newBundle) {
            // FIX BUG #66: Get old runtime state before cleanup
            const voiceAgentRef = getVoiceAgentRef();
            const oldRuntime = voiceAgentRef?.getBundleRuntime?.();
            // Type the old state to access BundleRuntimeState properties
            const oldState = oldRuntime?.getState?.() as {
              relationshipTurns?: number;
              storiesToldThisSession?: string[];
              currentMode?: string;
            } | undefined;
            
            // FIX BUG #63: Preserve important state from old runtime
            const preservedState = {
              relationshipTurns: oldState?.relationshipTurns || userData?.bundleRuntimeState?.relationshipTurns || 0,
              storiesToldThisSession: oldState?.storiesToldThisSession || [],
              currentMode: oldState?.currentMode || 'discovery',
            };
            
            const newRuntime = await createBundleRuntime(newBundle);

            // FIX BUG #64 & #65: Validate and merge preserved state with fresh data
            newRuntime.updateState({
              ...preservedState,
              sessionCount: services?.userProfile?.totalConversations || 0,
              userName: userData?.name || services?.userProfile?.name,
              personaId: persona.id, // Ensure personaId is always set
            });

            if (voiceAgentRef) {
              voiceAgentRef.setBundleRuntime(newRuntime);
              diag.entry(`📦 Bundle runtime updated on voiceAgent for ${persona.name} (preserved: ${preservedState.relationshipTurns} turns)`);
            } else {
              diag.warn('voiceAgentRef not yet initialized - bundle runtime not assigned');
            }

            diag.entry(`📦 Bundle runtime reloaded for ${persona.name}`);
          }
        } catch (bundleErr) {
          // FIX BUG #49: Graceful degradation when bundle loading fails
          // The handoff still proceeds - persona basics work, but advanced behaviors may be limited
          logger.warn({ 
            personaId: persona.id,
            error: String(bundleErr) 
          }, '⚠️ Bundle runtime reload failed - handoff continues with basic persona capabilities');
          diag.warn(`Bundle not loaded for ${persona.name} - using basic configuration`);
        }

        // STEP 9: Validate handoff consistency
        // FIX BUG #26 & #94: Run validation in production too (with logging instead of error)
        const voiceAgentRef = getVoiceAgentRef();
        const validation = {
          expectedAgent: persona.id,
          expectedName: persona.name,
          currentAgentTracker: getCurrentAgent(),
          voiceAgentPersona: voiceAgentRef?.getPersona()?.id,
          llmInstructionsSet: !!voiceAgentRef?.instructions,
          bundlePersona: voiceAgentRef?.getBundleRuntime()?.getState().personaId,
        };

        const isConsistent =
          validation.currentAgentTracker === persona.id &&
          validation.voiceAgentPersona === persona.id &&
          validation.llmInstructionsSet;

        if (!isConsistent) {
          // Always log mismatches - critical for debugging production issues
          logger.warn(validation, '⚠️ HANDOFF IDENTITY MISMATCH - Components may be out of sync');
          diag.warn('Handoff validation warning', validation);
          
          // In development, also log as error for visibility
          if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_HANDOFF === 'true') {
            logger.error(validation, '🚨 HANDOFF IDENTITY MISMATCH - Components out of sync!');
            diag.error('Handoff validation failed', validation);
          }
        } else {
          diag.entry(`✅ Handoff validated: all components now ${persona.name}`);
        }
      } catch (voiceSwitchErr) {
        // ============================================================
        // HANDOFF FAILURE RECOVERY
        // ============================================================
        logger.error({ error: String(voiceSwitchErr) }, 'Voice switch FAILED');

        try {
          const failureMessage = JSON.stringify({
            type: 'handoff_failed',
            newAgent: persona.id,
            previousAgent: prevPersona.id,
            error: String(voiceSwitchErr),
            timestamp: Date.now(),
          });

          await ctx.room.localParticipant?.publishData(new TextEncoder().encode(failureMessage), {
            reliable: true,
          });
        } catch {
          // Last resort - just log it
        }
      }
  };
}

