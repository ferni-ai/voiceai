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

import type { JobContext, voice } from '@livekit/agents';
import { getTransitionDelay } from '../../config/handoff-timing.js';
import { AgentDirectory } from '../../personas/agent-directory.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/types.js';
import { getCurrentAgent } from '../../tools/handoff/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { UserData } from './types.js';
// Cross-persona banter for warm handoffs
import { getHandoffBanter, getArrivingBanter } from '../../services/team-engagement.js';
// 🎧 DJ Integration - Enhanced "Guest DJ" handoff experience
import { getDJIntegration } from '../dj-integration.js';

// ============================================================================
// FIX BUG #50 & #51: Cached imports to reduce handoff latency
// These are lazily loaded once and then reused for subsequent handoffs
// ============================================================================

interface CachedModules {
  getSessionVoiceManager:
    | typeof import('../../speech/voice-manager.js').getSessionVoiceManager
    | null;
  getMusicPlayer: typeof import('../../audio/index.js').getMusicPlayer | null;
  getPersonaAsync: typeof import('../../personas/index.js').getPersonaAsync | null;
  loadBundleById: typeof import('../../personas/bundles/index.js').loadBundleById | null;
  createBundleRuntime:
    | typeof import('../../personas/bundles/runtime.js').createBundleRuntime
    | null;
}

const cachedModules: CachedModules = {
  getSessionVoiceManager: null,
  getMusicPlayer: null,
  getPersonaAsync: null,
  loadBundleById: null,
  createBundleRuntime: null,
};

/**
 * Get VoiceManager with caching (session-scoped)
 */
async function getVoiceManagerCached(sessionId: string) {
  if (!cachedModules.getSessionVoiceManager) {
    const mod = await import('../../speech/voice-manager.js');
    cachedModules.getSessionVoiceManager = mod.getSessionVoiceManager;
  }
  return cachedModules.getSessionVoiceManager(sessionId);
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
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for BundleRuntimeState partial structure
 * Used when extracting state from previous runtime during handoffs
 */
interface PartialBundleState {
  relationshipTurns?: number;
  storiesToldThisSession?: string[];
  currentMode?: string;
}

/**
 * Type guard to safely extract bundle state properties
 */
function isPartialBundleState(value: unknown): value is PartialBundleState {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  // Check that if properties exist, they're the right type
  if ('relationshipTurns' in obj && typeof obj.relationshipTurns !== 'number') return false;
  if ('storiesToldThisSession' in obj && !Array.isArray(obj.storiesToldThisSession)) return false;
  if ('currentMode' in obj && typeof obj.currentMode !== 'string') return false;
  return true;
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
 * Convert PersonaConfig to HandoffPersona format
 * Adapts the new persona system to the handoff handler's expected format
 */
function toHandoffPersona(
  persona: import('../../personas/types.js').PersonaConfig
): HandoffPersona {
  const isCoach = persona.id === 'ferni';
  return {
    id: persona.id,
    name: persona.name,
    voiceId: persona.voice.voiceId,
    role: isCoach ? 'coach' : 'team',
    isCoach,
    handoffTool: `handoffTo${persona.name.split(' ')[0]}`,
    aliases: [persona.id],
  };
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
  setPersona: (persona: unknown) => void;
  getPersona: () => { id: string } | undefined;
  setBundleRuntime: (runtime: unknown) => void;
  getBundleRuntime: () => { getState: () => { personaId?: string } } | undefined;
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
 * Determine handoff direction based on persona roles.
 *
 * REFACTORED: Now uses role-based logic instead of hardcoded agent IDs.
 * Direction is derived from agent transition styles in AgentDirectory.
 */
async function determineDirection(from: HandoffPersona, to: HandoffPersona): Promise<string> {
  // Use AgentDirectory for role-based direction calculation
  try {
    const direction = await AgentDirectory.getHandoffDirection(from.id, to.id);
    return direction;
  } catch {
    // Fallback to simple role-based logic
    if (from.isCoach && !to.isCoach) return 'coach-to-team';
    if (!from.isCoach && to.isCoach) return 'team-to-coach';
    return 'team-to-team';
  }
}

/**
 * Calculate transition delay based on handoff context.
 *
 * REFACTORED: Now uses shared HANDOFF_TIMING constants and agent transition styles.
 * FIX BUG #25: Now accepts explicit isUserInitiated flag instead of parsing greeting string
 */
async function calculateTransitionDelay(
  fromPersona: HandoffPersona,
  toPersona: HandoffPersona,
  isUserInitiated: boolean
): Promise<number> {
  const isFirstMeeting = fromPersona.isCoach && !toPersona.isCoach;
  const isReturningToCoach = toPersona.isCoach;

  // Get transition style from AgentDirectory
  let transitionStyle: 'standard' | 'dramatic' | 'subtle' | 'warm' = 'standard';
  try {
    const entry = await AgentDirectory.getEntry(toPersona.id);
    if (entry) {
      transitionStyle = entry.transitionStyle;
    }
  } catch {
    // Use default style
  }

  // Use shared timing calculation
  return getTransitionDelay(transitionStyle, isUserInitiated, isFirstMeeting, isReturningToCoach);
}

// ============================================================================
// HANDOFF STATE MANAGEMENT - FIX GAP 5 & 6
// ============================================================================

/**
 * Per-session handoff state for queue and timeout management
 */
interface HandoffSessionState {
  /** Whether a handoff is currently in progress */
  isHandoffInProgress: boolean;
  /** Queue of pending handoff requests */
  pendingHandoffs: HandoffEventPayload[];
  /** Current handoff timeout timer */
  timeoutTimer: NodeJS.Timeout | null;
  /** Timestamp when current handoff started */
  handoffStartTime: number | null;
}

const handoffSessionStates = new Map<string, HandoffSessionState>();

/** Handoff timeout in milliseconds - FIX GAP 6 */
const HANDOFF_TIMEOUT_MS = 10000; // 10 seconds

function getHandoffSessionState(sessionId: string): HandoffSessionState {
  let state = handoffSessionStates.get(sessionId);
  if (!state) {
    state = {
      isHandoffInProgress: false,
      pendingHandoffs: [],
      timeoutTimer: null,
      handoffStartTime: null,
    };
    handoffSessionStates.set(sessionId, state);
  }
  return state;
}

/**
 * Clear handoff session state - call on session disconnect
 * FIX GAP 7: Cleanup timer on session disconnect
 */
export function clearHandoffSessionState(sessionId: string): void {
  const state = handoffSessionStates.get(sessionId);
  if (state?.timeoutTimer) {
    clearTimeout(state.timeoutTimer);
  }
  handoffSessionStates.delete(sessionId);
  getLogger().debug({ sessionId }, 'Handoff session state cleared');
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
  const sessionId = ctx.room?.name || `handoff-${Date.now()}`;

  // FIX GAP 5: Internal handler that does the actual handoff work
  const executeHandoff = async (data: HandoffEventPayload) => {
    // FIX BUG: Add top-level error handling to prevent silent failures
    // This ensures any error in the handoff flow is logged and notifies the frontend
    let targetPersonaId = 'unknown';

    try {
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
        targetPersonaId = persona.id;
      } else {
        // Legacy format - resolve via persona lookup
        const legacy = data as LegacyHandoffData;
        targetPersonaId = legacy.newAgent || 'unknown';
        const personaConfig = await getPersonaAsyncCached(legacy.newAgent);

        // FIX BUG: Check if persona was found
        if (!personaConfig) {
          throw new Error(`Persona not found for: ${legacy.newAgent}`);
        }
        persona = toHandoffPersona(personaConfig);

        greeting = legacy.greeting;
        playSound = legacy.playSound;
        previousAgentId = legacy.previousAgent;
      }

      // Get previous persona for logging
      const prevId = previousAgentId || getCurrentAgent();
      const prevPersonaConfig = await getPersonaAsyncCached(prevId);

      // FIX BUG: Check if previous persona was found
      if (!prevPersonaConfig) {
        throw new Error(`Persona not found for previous persona: ${prevId}`);
      }
      const prevPersona: HandoffPersona = toHandoffPersona(prevPersonaConfig);

      diag.entry(`🔄 HANDOFF: ${prevPersona.name} → ${persona.name}`);

      // FIX BUG: Enhanced logging for debugging handoff issues
      logger.info(
        {
          from: { id: prevPersona.id, name: prevPersona.name, role: prevPersona.role },
          to: { id: persona.id, name: persona.name, role: persona.role },
          hasGreeting: !!greeting,
          greetingPreview: greeting ? greeting.slice(0, 50) : '(none)',
          playSound,
          voiceAgentRefAvailable: !!getVoiceAgentRef(),
          currentAgentState: getCurrentAgent(),
        },
        '🔄 Agent handoff triggered - START'
      );

      // REFACTORED: Now uses AgentDirectory for role-based direction calculation
      const direction = await determineDirection(prevPersona, persona);

      // ============================================================
      // DELIGHTFUL HANDOFF FLOW
      // ============================================================
      try {
        // STEP 1: Send handoff_started - frontend shows "departing" state
        // FIX BUG: Ensure localParticipant exists and add retry logic
        // Include banter text so UI can display what's being spoken
        const softOpenBanter = getHandoffBanter(prevPersona.id, persona.id);
        const arrivingBanter = getArrivingBanter(persona.id, prevPersona.id);

        const startMessage = JSON.stringify({
          type: 'handoff_started',
          newAgent: persona.id,
          previousAgent: prevPersona.id,
          direction,
          playSound,
          // WARM HANDOFF: Include banter text for UI display
          softOpenBanter: softOpenBanter || undefined,
          arrivingBanter: arrivingBanter || undefined,
          timestamp: Date.now(),
        });

        if (!ctx.room.localParticipant) {
          logger.error('Cannot send handoff_started: localParticipant is null');
          throw new Error('Connection lost before handoff');
        }

        try {
          await ctx.room.localParticipant.publishData(new TextEncoder().encode(startMessage), {
            reliable: true,
          });
          diag.entry(`Handoff started: ${prevPersona.name} → ${persona.name}`);
        } catch (startErr) {
          logger.error({ error: String(startErr) }, 'Failed to send handoff_started');
          throw new Error(`Failed to send handoff_started: ${startErr}`);
        }

        // ============================================================================
        // WARM HANDOFF: Soft Open (departing persona's warm sendoff)
        // Spoken BEFORE voice switch in the CURRENT persona's voice
        // ============================================================================
        if (softOpenBanter && session) {
          try {
            diag.entry(`🎭 Soft open: ${prevPersona.name} introduces ${persona.name}`);
            session.say(softOpenBanter, { allowInterruptions: false });
            // Wait for soft open to finish before switching voice
            // Approximate duration based on SSML breaks + speech
            await new Promise<void>((resolve) => setTimeout(resolve, 1500));

            // Send soft_open_complete so UI knows to start visual transition
            const softOpenCompleteMsg = JSON.stringify({
              type: 'soft_open_complete',
              newAgent: persona.id,
              previousAgent: prevPersona.id,
              timestamp: Date.now(),
            });
            await ctx.room.localParticipant?.publishData(
              new TextEncoder().encode(softOpenCompleteMsg),
              { reliable: true }
            );

            diag.entry(`🎭 Soft open complete, switching voice...`);
          } catch (softOpenErr) {
            logger.warn(
              { error: String(softOpenErr), from: prevPersona.id, to: persona.id },
              'Soft open banter failed - continuing with handoff'
            );
          }
        }

        // STEP 2: Calculate and wait for transition
        // FIX BUG #25: Use explicit flag if available, fall back to string parsing for legacy data
        // REFACTORED: Now uses shared HANDOFF_TIMING constants
        const isUserInitiated =
          'isUserInitiated' in data
            ? ((data as NewHandoffData).isUserInitiated ?? false)
            : (greeting?.includes('User requested') ?? false);
        const transitionDelayMs = await calculateTransitionDelay(
          prevPersona,
          persona,
          isUserInitiated
        );

        diag.entry(
          `Transition delay: ${transitionDelayMs}ms (userInitiated: ${isUserInitiated}, firstMeeting: ${prevPersona.isCoach})`
        );

        // FIX BUG #28 & #51: Use cached music player (only if music is enabled)
        let musicWasPlaying = false;
        let musicPlayerRef: { isPlaying: () => boolean; resume: () => Promise<void> } | null = null;
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

        // 🎧 DJ BOOTH: Notify handoff for clean audio transition
        try {
          const { getDJBooth } = await import('../../audio/index.js');
          const booth = getDJBooth();
          if (booth) {
            booth.onHandoff(persona.id);
            diag.state('🎧 DJ Booth notified of handoff');
          }
        } catch {
          // DJ Booth not available - that's fine
        }

        await new Promise<void>((resolve) => {
          setTimeout(resolve, transitionDelayMs);
        });

        // FIX BUG: Send soft_open_complete even when no banter
        // This ensures frontend callbacks always fire for visual transition sync
        if (!softOpenBanter) {
          try {
            const softOpenCompleteMsg = JSON.stringify({
              type: 'soft_open_complete',
              newAgent: persona.id,
              previousAgent: prevPersona.id,
              timestamp: Date.now(),
            });
            await ctx.room.localParticipant?.publishData(
              new TextEncoder().encode(softOpenCompleteMsg),
              { reliable: true }
            );
            diag.entry('🎭 soft_open_complete sent (no banter path)');
          } catch (err) {
            logger.warn({ error: String(err) }, 'Failed to send soft_open_complete (no banter)');
          }
        }

        // STEP 3: Switch the voice with retry logic
        // FIX BUG #47: Added retry mechanism for failed voice switches
        const MAX_VOICE_SWITCH_RETRIES = 2;
        let voiceSwitchSuccess = false;

        for (
          let attempt = 0;
          attempt <= MAX_VOICE_SWITCH_RETRIES && !voiceSwitchSuccess;
          attempt++
        ) {
          try {
            // FIX BUG #51: Use cached voice manager (session-scoped)
            const voiceManager = await getVoiceManagerCached(sessionId);
            voiceManager.switchVoice(persona.id);

            // Also switch the session's TTS if it supports voice switching
            if (tts && 'switchVoice' in tts) {
              (tts as { switchVoice: (name: string, id: string) => void }).switchVoice(
                persona.id,
                persona.voiceId
              );
            }

            voiceSwitchSuccess = true;
            diag.entry(
              `Voice switched to ${persona.name}, ready to speak${attempt > 0 ? ` (retry ${attempt})` : ''}`
            );
          } catch (voiceSwitchErr) {
            if (attempt < MAX_VOICE_SWITCH_RETRIES) {
              diag.warn(`Voice switch failed (attempt ${attempt + 1}), retrying in 100ms...`);
              await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
              });
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
        // FIX BUG: Add error handling and retry logic for handoff_complete
        const completeMessage = JSON.stringify({
          type: 'handoff_complete',
          newAgent: persona.id,
          previousAgent: prevPersona.id,
          greeting,
          timestamp: Date.now(),
        });

        // Ensure localParticipant exists before sending
        if (!ctx.room.localParticipant) {
          logger.error('Cannot send handoff_complete: localParticipant is null');
          throw new Error('Connection lost during handoff');
        }

        // Send with retry logic
        let sendAttempts = 0;
        const maxSendAttempts = 3;
        while (sendAttempts < maxSendAttempts) {
          try {
            await ctx.room.localParticipant.publishData(new TextEncoder().encode(completeMessage), {
              reliable: true,
            });
            diag.entry(`Handoff complete: ${persona.name} ready to speak`);
            break;
          } catch (sendErr) {
            sendAttempts++;
            if (sendAttempts >= maxSendAttempts) {
              logger.error(
                { error: String(sendErr), attempts: sendAttempts },
                'Failed to send handoff_complete after retries'
              );
              throw new Error(`Failed to send handoff_complete: ${sendErr}`);
            }
            logger.warn(
              { error: String(sendErr), attempt: sendAttempts },
              'Retrying handoff_complete send...'
            );
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 100 * sendAttempts);
            });
          }
        }

        // FIX: STEP 6 (was 7): Update persona & LLM instructions BEFORE speaking greeting
        // This ensures the LLM has the correct identity when the tool returns
        // FIX BUG #3: Add retry logic for setPersona failure
        let instructionsUpdated = false;
        const MAX_PERSONA_RETRIES = 2;

        for (let attempt = 0; attempt <= MAX_PERSONA_RETRIES && !instructionsUpdated; attempt++) {
          try {
            // FIX BUG #51: Use cached persona lookup
            const loadedPersona = await getPersonaAsyncCached(persona.id);
            const voiceAgentRef = getVoiceAgentRef();

            if (loadedPersona && voiceAgentRef) {
              voiceAgentRef.setPersona(loadedPersona);
              instructionsUpdated = true;
              diag.entry(
                `🎭 Persona & LLM instructions updated to ${persona.name}${attempt > 0 ? ` (retry ${attempt})` : ''}`
              );
            } else if (!loadedPersona) {
              throw new Error(`Persona ${persona.id} not found`);
            } else if (!voiceAgentRef) {
              throw new Error('VoiceAgent ref not available');
            }
          } catch (personaErr) {
            if (attempt < MAX_PERSONA_RETRIES) {
              logger.warn(
                { personaId: persona.id, attempt: attempt + 1, error: String(personaErr) },
                `⚠️ Persona update failed (attempt ${attempt + 1}), retrying in 100ms...`
              );
              await new Promise<void>((resolve) => setTimeout(resolve, 100));
            } else {
              // FIX BUG #49: Graceful degradation - handoff proceeds but with basic instructions
              logger.warn(
                {
                  personaId: persona.id,
                  error: String(personaErr),
                  attempts: MAX_PERSONA_RETRIES + 1,
                },
                '⚠️ Persona update failed after retries - handoff continues with existing configuration'
              );
              diag.warn(
                `Persona async load failed for ${persona.name} after ${MAX_PERSONA_RETRIES + 1} attempts`
              );
            }
          }
        }

        // FIX: STEP 7 (was 6): Speak greeting AFTER instructions are updated
        // FIX BUG: Always speak a greeting - generate fallback if none provided
        let greetingSpoken = false;
        {
          // Generate fallback greeting if none provided
          let finalGreeting = greeting;

          if (!finalGreeting || finalGreeting.trim() === '') {
            // FIX BUG: Generate a fallback greeting so the new persona always introduces themselves
            finalGreeting = `Hey! ${persona.name} here. What's going on?`;
            logger.warn(
              { personaId: persona.id },
              'No greeting provided for handoff, using fallback'
            );
            diag.warn(`Using fallback greeting for ${persona.name} handoff`);
          }

          try {
            // ============================================================================
            // WARM HANDOFF: Arriving Welcome (new persona's warm greeting)
            // Spoken AFTER voice switch in the NEW persona's voice
            // Uses arrivingBanter declared at the start of handoff flow
            // ============================================================================
            if (prevPersona?.id) {
              // Try arriving banter first (warm welcome from new persona's perspective)
              if (arrivingBanter) {
                finalGreeting = arrivingBanter;
                diag.entry(`🎭 Arriving welcome: ${persona.name} acknowledges ${prevPersona.name}`);
              } else {
                // Fallback: Try DJ integration for radio show feel
                const shouldUseDJEntrance = Math.random() < 0.4;
                if (shouldUseDJEntrance) {
                  try {
                    const dj = getDJIntegration();
                    dj.setPersona(persona.id);

                    const entrance = dj.getArrivingEntrance(prevPersona.id, persona.id);
                    if (entrance) {
                      finalGreeting = entrance;
                      diag.entry(`🎧 Guest DJ entrance for ${persona.name}`);
                    }
                  } catch {
                    // DJ not available, keep the default greeting
                    diag.entry(`🎤 Using default greeting for ${persona.name}`);
                  }
                }
              }
            }

            // NOTE: Removed 150ms delay - voice is already switched, speak immediately!
            session.say(finalGreeting, { allowInterruptions: true });
            greetingSpoken = true;
            diag.entry(`🎤 ${persona.name} greeting spoken: "${finalGreeting.slice(0, 50)}..."`);
          } catch (greetingErr) {
            logger.warn(
              { error: String(greetingErr), greeting: finalGreeting },
              'Failed to speak handoff greeting'
            );
            // FIX BUG: Even if session.say fails, log the error with the greeting that was attempted
            diag.error(`Failed to speak greeting for ${persona.name}: ${greetingErr}`);
          }
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
            // Use type guard to safely extract bundle state
            const rawState = oldRuntime?.getState?.();
            const oldState = isPartialBundleState(rawState) ? rawState : undefined;

            // FIX BUG #63: Preserve important state from old runtime
            const preservedState = {
              relationshipTurns:
                oldState?.relationshipTurns || userData?.bundleRuntimeState?.relationshipTurns || 0,
              storiesToldThisSession: oldState?.storiesToldThisSession || [],
              currentMode: oldState?.currentMode || 'discovery',
            };

            const newRuntime = await createBundleRuntime(newBundle);

            // FIX BUG #64 & #65: Validate and merge preserved state with fresh data
            const stateUpdate: Partial<
              import('../../personas/bundles/index.js').BundleRuntimeState
            > = {
              ...preservedState,
              sessionCount: services?.userProfile?.totalConversations || 0,
              personaId: persona.id, // Ensure personaId is always set
            };
            const resolvedUserName = userData?.name || services?.userProfile?.name;
            if (resolvedUserName) {
              stateUpdate.userName = resolvedUserName;
            }
            newRuntime.updateState(stateUpdate);

            if (voiceAgentRef) {
              voiceAgentRef.setBundleRuntime(newRuntime);
              diag.entry(
                `📦 Bundle runtime updated on voiceAgent for ${persona.name} (preserved: ${preservedState.relationshipTurns} turns)`
              );
            } else {
              diag.warn('voiceAgentRef not yet initialized - bundle runtime not assigned');
            }

            diag.entry(`📦 Bundle runtime reloaded for ${persona.name}`);
          }
        } catch (bundleErr) {
          // FIX BUG #49: Graceful degradation when bundle loading fails
          // The handoff still proceeds - persona basics work, but advanced behaviors may be limited
          logger.warn(
            {
              personaId: persona.id,
              error: String(bundleErr),
            },
            '⚠️ Bundle runtime reload failed - handoff continues with basic persona capabilities'
          );
          diag.warn(`Bundle not loaded for ${persona.name} - using basic configuration`);
        }

        // STEP 9: Validate handoff consistency AND RECOVER if needed
        // FIX BUG #26 & #94 & NEW: Run validation and attempt recovery if inconsistent
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
          logger.warn(validation, '⚠️ HANDOFF IDENTITY MISMATCH - Attempting recovery...');
          diag.warn('Handoff validation warning - attempting recovery', validation);

          // FIX BUG: ATTEMPT RECOVERY instead of just logging!
          let recoveryAttempted = false;

          // Recovery 1: If voiceAgentPersona doesn't match, re-run setPersona
          if (voiceAgentRef && validation.voiceAgentPersona !== persona.id) {
            try {
              const loadedPersona = await getPersonaAsyncCached(persona.id);
              if (loadedPersona) {
                voiceAgentRef.setPersona(loadedPersona);
                recoveryAttempted = true;
                diag.entry(`🔧 RECOVERY: Re-applied setPersona for ${persona.name}`);
              }
            } catch (recoveryErr) {
              logger.error({ error: String(recoveryErr) }, 'Recovery setPersona failed');
            }
          }

          // Recovery 2: If LLM instructions not set but we have voiceAgentRef
          if (voiceAgentRef && !validation.llmInstructionsSet) {
            try {
              const loadedPersona = await getPersonaAsyncCached(persona.id);
              if (loadedPersona && loadedPersona.systemPrompt) {
                voiceAgentRef.setPersona(loadedPersona);
                recoveryAttempted = true;
                diag.entry(`🔧 RECOVERY: Re-applied LLM instructions for ${persona.name}`);
              }
            } catch (recoveryErr) {
              logger.error({ error: String(recoveryErr) }, 'Recovery LLM instructions failed');
            }
          }

          // FIX BUG #4: Recovery 3: If bundle persona doesn't match, reload bundle runtime
          if (voiceAgentRef && validation.bundlePersona !== persona.id) {
            try {
              const { loadBundleById, createBundleRuntime } = await getBundleFunctionsCached();
              const newBundle = await loadBundleById(persona.id);
              if (newBundle) {
                const newRuntime = await createBundleRuntime(newBundle);
                newRuntime.updateState({ personaId: persona.id });
                voiceAgentRef.setBundleRuntime(newRuntime);
                recoveryAttempted = true;
                diag.entry(`🔧 RECOVERY: Reloaded bundle runtime for ${persona.name}`);
              }
            } catch (bundleRecoveryErr) {
              logger.error({ error: String(bundleRecoveryErr) }, 'Recovery bundle reload failed');
            }
          }

          // Re-validate after recovery
          if (recoveryAttempted) {
            const postRecoveryValidation = {
              expectedAgent: persona.id,
              voiceAgentPersona: voiceAgentRef?.getPersona()?.id,
              llmInstructionsSet: !!voiceAgentRef?.instructions,
              bundlePersona: voiceAgentRef?.getBundleRuntime()?.getState().personaId,
            };

            const isNowConsistent =
              postRecoveryValidation.voiceAgentPersona === persona.id &&
              postRecoveryValidation.llmInstructionsSet &&
              postRecoveryValidation.bundlePersona === persona.id;

            if (isNowConsistent) {
              logger.info({ persona: persona.id }, '✅ RECOVERY SUCCESSFUL - Identity restored');
              diag.entry(`✅ Recovery successful: ${persona.name} identity restored`);
            } else {
              logger.error(
                postRecoveryValidation,
                '🚨 RECOVERY FAILED - Identity still mismatched'
              );
              diag.error('Recovery failed', postRecoveryValidation);
            }
          }

          // In development, also log as error for visibility
          if (process.env['NODE_ENV'] !== 'production' || process.env['DEBUG_HANDOFF'] === 'true') {
            if (!recoveryAttempted) {
              logger.error(validation, '🚨 HANDOFF IDENTITY MISMATCH - No recovery possible');
            }
          }
        } else {
          diag.entry(`✅ Handoff validated: all components now ${persona.name}`);
        }

        // FIX: Emit completion event so executor knows handler is done
        // This allows the tool to return AFTER greeting is spoken and instructions updated
        const { handoffEvents } = await import('../../tools/handoff/state.js');
        handoffEvents.emit('handoffHandlerComplete', {
          targetId: persona.id,
          success: true,
          greetingSpoken,
          instructionsUpdated,
        });
        diag.entry(`✅ Handoff handler complete for ${persona.name}`);
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

        // FIX: Emit completion event even on failure so executor doesn't timeout
        const { handoffEvents } = await import('../../tools/handoff/state.js');
        handoffEvents.emit('handoffHandlerComplete', {
          targetId: persona.id,
          success: false,
          greetingSpoken: false,
          instructionsUpdated: false,
          error: String(voiceSwitchErr),
        });
      }
    } catch (topLevelErr) {
      // FIX BUG: Catch any uncaught errors in the handoff flow
      // This prevents silent failures that leave the UI stuck
      logger.error(
        {
          error: String(topLevelErr),
          targetPersona: targetPersonaId,
          stack: topLevelErr instanceof Error ? topLevelErr.stack : undefined,
        },
        '🚨 HANDOFF HANDLER CRASHED - Unhandled error in handoff flow'
      );
      diag.error(`Handoff handler crashed: ${topLevelErr}`);

      // Try to notify frontend of the failure
      try {
        const crashMessage = JSON.stringify({
          type: 'handoff_failed',
          newAgent: targetPersonaId,
          error: `Handoff handler error: ${topLevelErr}`,
          timestamp: Date.now(),
        });
        await ctx.room.localParticipant?.publishData(new TextEncoder().encode(crashMessage), {
          reliable: true,
        });
      } catch {
        // Can't even send failure message - connection likely lost
        logger.error('Failed to send handoff_failed after handler crash');
      }

      // FIX: Emit completion event even on crash so executor doesn't timeout
      try {
        const { handoffEvents } = await import('../../tools/handoff/state.js');
        handoffEvents.emit('handoffHandlerComplete', {
          targetId: targetPersonaId,
          success: false,
          greetingSpoken: false,
          instructionsUpdated: false,
          error: String(topLevelErr),
        });
      } catch {
        // Can't import - just let the timeout handle it
      }
    }
  };

  // FIX GAP 5: Process next handoff in queue if any
  const processNextQueuedHandoff = async () => {
    const state = getHandoffSessionState(sessionId);
    if (state.pendingHandoffs.length > 0) {
      const nextHandoff = state.pendingHandoffs.shift();
      if (nextHandoff) {
        logger.info(
          { queueRemaining: state.pendingHandoffs.length },
          '📋 Processing next queued handoff'
        );
        // Recursively call the wrapped handler
        await wrappedHandler(nextHandoff);
      }
    }
  };

  // FIX GAP 5 & 6: Wrapper handler with queue and timeout logic
  const wrappedHandler = async (data: HandoffEventPayload) => {
    const state = getHandoffSessionState(sessionId);

    // FIX GAP 5: If handoff already in progress, queue this one
    if (state.isHandoffInProgress) {
      // Determine target persona for logging
      const targetId = 'persona' in data ? data.persona?.id : (data as LegacyHandoffData).newAgent;
      logger.info(
        {
          targetPersona: targetId,
          queueLength: state.pendingHandoffs.length,
        },
        '📋 Handoff in progress - queuing request'
      );
      diag.entry(
        `🚦 Handoff queued for ${targetId} (${state.pendingHandoffs.length + 1} in queue)`
      );

      // Add to queue (limit queue size to prevent memory issues)
      // FIX ISSUE #5: Increased from 5 to 10 to handle rapid persona switches better
      // (e.g., during testing or unusual conversation patterns)
      if (state.pendingHandoffs.length < 10) {
        state.pendingHandoffs.push(data);
      } else {
        logger.warn(
          { queueLength: state.pendingHandoffs.length },
          'Handoff queue full - dropping request'
        );
      }
      return;
    }

    // Mark handoff as in progress
    state.isHandoffInProgress = true;
    state.handoffStartTime = Date.now();

    // FIX GAP 6: Set up timeout
    state.timeoutTimer = setTimeout(() => {
      if (state.isHandoffInProgress) {
        const targetId =
          'persona' in data ? data.persona?.id : (data as LegacyHandoffData).newAgent;
        logger.error(
          {
            targetPersona: targetId,
            duration: Date.now() - (state.handoffStartTime || 0),
          },
          '⏱️ HANDOFF TIMEOUT - forcing completion'
        );
        diag.error(`Handoff timeout for ${targetId}`);

        // Force complete the handoff state
        state.isHandoffInProgress = false;
        state.handoffStartTime = null;
        state.timeoutTimer = null;

        // Try to notify frontend
        try {
          const timeoutMessage = JSON.stringify({
            type: 'handoff_failed',
            newAgent: targetId,
            error: 'Handoff timed out',
            timestamp: Date.now(),
          });
          void ctx.room.localParticipant?.publishData(new TextEncoder().encode(timeoutMessage), {
            reliable: true,
          });
        } catch {
          // Ignore send errors
        }

        // Process queue
        void processNextQueuedHandoff();
      }
    }, HANDOFF_TIMEOUT_MS);

    try {
      // Execute the actual handoff
      await executeHandoff(data);
    } finally {
      // Always clear state and timer when done
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
        state.timeoutTimer = null;
      }
      state.isHandoffInProgress = false;
      state.handoffStartTime = null;

      // FIX GAP 5: Process next queued handoff
      void processNextQueuedHandoff();
    }
  };

  return wrappedHandler;
}
