/**
 * Handoff Coordinator Adapter
 *
 * Bridges the new HandoffCoordinator with the existing voice agent infrastructure.
 * This adapter provides:
 * - LLM-driven banter (soft open + arriving welcome)
 * - Voice switching via VoiceManager
 * - LLM instruction updates
 * - Data channel notifications to frontend
 *
 * Usage:
 *   const adapter = createCoordinatorAdapter(config);
 *   const result = await adapter.executeHandoff('peter-john', 'User requested via UI');
 *
 * @module agents/shared/handoff/coordinator-adapter
 */

import type { JobContext, voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import type { SessionServices } from '../../../services/types.js';
import type { UserData } from '../types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { diag } from '../../../services/diagnostic-logger.js';

// New coordinator system
import {
  createHandoffCoordinator,
  type HandoffCoordinator,
  type BanterContext,
  type CoordinatorConfig,
} from '../../../tools/handoff/handoff-coordinator.js';
import { resolveVoiceId } from '../../../tools/handoff/voice-id-resolver.js';

// Voice registry for persona display names and voice IDs
import { getPersonaDisplayName, getVoiceId } from '../../../personas/voice-registry.js';

// Existing banter system
// NOTE: We use fallback phrases (actual speech) with generateReply, NOT meta-instructions.
// generateReply(instructions) adds text as role:"model" - the model thinks IT said it.
// So we must pass ACTUAL SPEECH the model can continue from, not "generate a greeting" instructions.
import {
  getHandoffBanter,
  getArrivingBanter,
} from '../../../services/engagement/team-engagement.js';

// Safe LLM generation (with mutex and timeout protection)
import { safeGenerateReply, resetCircuitBreaker } from '../safe-generate-reply.js';

// Cached module accessors
import { getVoiceManagerCached, getPersonaAsyncCached } from './cached-modules.js';

// Speech coordination for centralized speech management
import { coordinatedSay } from '../../../speech/coordination/index.js';
import { getNextMessageSeqSync } from './session-state.js';

// ⚡ Conversational cache for instant handoff banter
import { getCachedAudioForPersona } from '../conversational-audio-cache.js';

// Team Huddle for cross-persona intelligence (Better Than Human)
import {
  generateTeamHuddle,
  type TeamHuddleSummary,
  type TeamRecommendation,
} from '../../../services/cross-persona/team-huddle.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * TTS interface for voice switching.
 */
export interface TTSWithVoiceSwitch {
  switchVoice?: (name: string, voiceId: string, accent?: string) => void;
}

/**
 * Configuration for the coordinator adapter.
 */
export interface CoordinatorAdapterConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** Voice session */
  session: voice.AgentSession<UserData>;
  /** Session services */
  services: SessionServices;
  /** Room for data channel */
  room: Room;
  /** Voice agent reference for persona updates */
  getVoiceAgentRef: () => {
    setPersona: (personaId: string, instructions: string) => void;
  } | null;
  /** CRITICAL: Initial agent for the session. Must match sessionPersona.id! */
  initialAgent?: string;
  /** TTS instance for voice switching - CRITICAL for actual voice change! */
  tts?: TTSWithVoiceSwitch;
  /**
   * CRITICAL: Session ID for speech coordination.
   * Must match the sessionId used in initializeSpeechCoordination().
   * Without this, coordinatedSay() fails with "sessionId: 'unknown'".
   */
  sessionId?: string;
}

/**
 * Result of a handoff execution.
 */
export interface AdapterHandoffResult {
  success: boolean;
  targetAgent?: string;
  error?: string;
  traceId: string;
  durationMs?: number;
}

// ============================================================================
// BANTER TIMEOUT
// ============================================================================
// COORDINATOR ADAPTER CLASS
// ============================================================================

/**
 * Coordinator Adapter
 *
 * Wraps the HandoffCoordinator with voice agent specific functionality.
 */
export class CoordinatorAdapter {
  private readonly coordinator: HandoffCoordinator;
  private readonly session: voice.AgentSession<UserData>;
  private readonly services: SessionServices;
  private readonly room: Room;
  private readonly getVoiceAgentRef: () => {
    setPersona: (personaId: string, instructions: string) => void;
  } | null;
  private readonly sessionId: string;
  private readonly tts?: TTSWithVoiceSwitch;

  constructor(config: CoordinatorAdapterConfig) {
    const {
      ctx,
      session,
      services,
      room,
      getVoiceAgentRef,
      initialAgent,
      tts,
      sessionId: configSessionId,
    } = config;
    this.session = session;
    this.services = services;
    this.room = room;
    this.getVoiceAgentRef = getVoiceAgentRef;
    // CRITICAL: Use passed sessionId to match speech coordination.
    // Previously used ctx.room?.name which didn't match the sessionId used in
    // initializeSpeechCoordination(), causing "sessionId: 'unknown'" errors.
    this.sessionId =
      configSessionId || services.sessionId || ctx.room?.name || `adapter-${Date.now()}`;
    this.tts = tts;

    // Create the coordinator with our callbacks
    // CRITICAL: Pass initialAgent so state manager knows the starting persona
    this.coordinator = createHandoffCoordinator({
      sessionId: this.sessionId,
      initialAgent: initialAgent || 'ferni', // Default to ferni if not provided
      onVoiceSwitch: this.handleVoiceSwitch.bind(this),
      onLLMUpdate: this.handleLLMUpdate.bind(this),
      onUINotify: this.handleUINotify.bind(this),
      onBeforeVoiceSwitch: this.handleSoftOpen.bind(this),
      onAfterVoiceSwitch: this.handleArrivingWelcome.bind(this),
    });

    log.info({ sessionId: this.sessionId, initialAgent }, '🔌 CoordinatorAdapter created');
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /**
   * Execute a handoff to a target persona.
   *
   * @param targetAgent - Target persona ID
   * @param reason - Reason for handoff
   * @param options - Additional options
   * @param options.fastMode - Enable instant switch with async welcome (default: true for UI-initiated)
   */
  async executeHandoff(
    targetAgent: string,
    reason: string,
    options?: {
      userProfile?: unknown;
      subscriptionTier?: 'free' | 'friend' | 'partner';
      /**
       * FAST MODE (Option D): Instant switch + async welcome
       * - true: Voice switch immediately, greeting async (~250ms)
       * - false: Full banter flow (~5-10s)
       * - undefined: Auto-detect (true for user-initiated)
       */
      fastMode?: boolean;
      /** Source of the handoff request */
      source?: 'user' | 'llm' | 'system';
    }
  ): Promise<AdapterHandoffResult> {
    const adapterStart = Date.now();
    const source = options?.source ?? 'user';
    const fastMode = options?.fastMode; // Let coordinator decide default based on source

    log.info(
      {
        sessionId: this.sessionId,
        targetAgent,
        reason,
        fastMode,
        source,
        hasUserProfile: !!options?.userProfile,
        subscriptionTier: options?.subscriptionTier,
      },
      '🔌 [ADAPTER] executeHandoff() ENTRY'
    );

    // CRITICAL: Check if session is closing - abort immediately to prevent timeout
    const { isSessionClosing } = await import('../session-closing-tracker.js');
    if (isSessionClosing(this.sessionId)) {
      log.warn(
        { sessionId: this.sessionId, targetAgent },
        '🔌 [ADAPTER] ⚠️ Session closing - aborting handoff'
      );
      return {
        success: false,
        targetAgent,
        error: 'Session is closing - handoff aborted',
        traceId: `aborted-${Date.now()}`,
      };
    }

    log.info(
      { targetAgent, reason, fastMode, source },
      '🔌 [ADAPTER] Calling coordinator.execute()...'
    );

    const coordinatorStart = Date.now();
    const result = await this.coordinator.execute({
      targetAgent,
      reason,
      userProfile: options?.userProfile as Parameters<
        typeof this.coordinator.execute
      >[0]['userProfile'],
      subscriptionTier: options?.subscriptionTier,
      source,
      fastMode,
      recentMessages: this.getRecentMessages(),
      cognitiveContext: this.getCognitiveContext(),
    });

    log.info(
      {
        sessionId: this.sessionId,
        targetAgent,
        success: result.success,
        error: result.error,
        traceId: result.traceId,
        coordinatorDurationMs: Date.now() - coordinatorStart,
        totalDurationMs: Date.now() - adapterStart,
      },
      '🔌 [ADAPTER] executeHandoff() EXIT'
    );

    return {
      success: result.success,
      targetAgent: result.targetPersonaId,
      error: result.error,
      traceId: result.traceId,
      durationMs: result.durationMs,
    };
  }

  /**
   * Cancel current handoff.
   */
  async cancel(reason = 'User cancelled'): Promise<void> {
    await this.coordinator.cancel(reason);
  }

  /**
   * Get current agent.
   */
  getCurrentAgent(): string {
    return this.coordinator.getCurrentAgent();
  }

  /**
   * Check if handoff is in progress.
   */
  isInProgress(): boolean {
    return this.coordinator.isInProgress();
  }

  /**
   * Dispose the adapter.
   */
  dispose(): void {
    this.coordinator.dispose();
    log.info({ sessionId: this.sessionId }, '🗑️ CoordinatorAdapter disposed');
  }

  // ========================================================================
  // COORDINATOR CALLBACKS
  // ========================================================================

  /**
   * Handle voice switch - called by coordinator.
   *
   * CRITICAL: Must update BOTH:
   * 1. VoiceManager (internal state tracking)
   * 2. Session TTS (actual Cartesia voice change)
   *
   * Without step 2, the voice doesn't actually change!
   *
   * VOICE ID FIX: Always use resolveVoiceId for single source of truth.
   * The passed voiceId parameter may be unreliable - resolver handles fallbacks.
   */
  private async handleVoiceSwitch(voiceId: string, personaId: string): Promise<void> {
    log.debug({ voiceId, personaId }, '🎤 Switching voice');

    const voiceManager = await getVoiceManagerCached(this.sessionId);
    if (!voiceManager) {
      throw new Error('VoiceManager not available');
    }

    // OPTIMIZATION: Reduced from 150ms to 50ms - race condition prevention still works
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    // Step 1: Update VoiceManager internal state
    voiceManager.switchVoice(personaId);

    // Step 2: CRITICAL - Update session TTS (actually changes the voice!)
    // VOICE ID FIX: Use resolveVoiceId for single source of truth
    // This ensures consistent voice ID regardless of what was passed
    if (this.tts?.switchVoice) {
      const displayName = getPersonaDisplayName(personaId);

      // Use voice-id-resolver as single source of truth
      const voiceIdResult = resolveVoiceId({ voiceId, personaId }, { logLevel: 'info' });

      if (!voiceIdResult.success) {
        log.error(
          { personaId, error: voiceIdResult.error },
          '🚨 Voice ID resolution failed - using fallback'
        );
        // Emergency fallback to getVoiceId
        const fallbackVoiceId = getVoiceId(personaId);
        this.tts.switchVoice(displayName, fallbackVoiceId);
      } else {
        log.info(
          { voiceId: voiceIdResult.voiceId, source: voiceIdResult.source, personaId, displayName },
          '✅ Session TTS voice switched (via resolver)'
        );
        this.tts.switchVoice(displayName, voiceIdResult.voiceId);
      }
    } else {
      log.warn({ personaId }, '⚠️ No TTS available for voice switch - voice may not change!');
    }

    log.info({ voiceId, personaId, usedAgentId: personaId }, '✅ Voice switched');
  }

  /**
   * Handle LLM update - called by coordinator.
   */
  private async handleLLMUpdate(personaId: string, instructions: string): Promise<void> {
    log.debug({ personaId, instructionLength: instructions.length }, '📝 Updating LLM');

    const voiceAgentRef = this.getVoiceAgentRef();
    if (!voiceAgentRef) {
      log.warn('VoiceAgentRef not available for LLM update');
      return;
    }

    voiceAgentRef.setPersona(personaId, instructions);

    // Also update session-scoped state
    if (this.services.handoffState) {
      (this.services.handoffState as { currentAgent: string }).currentAgent = personaId;
    }

    log.info({ personaId }, '✅ LLM updated');
  }

  /**
   * Handle UI notification - called by coordinator.
   */
  private handleUINotify(event: unknown): void {
    // Send to frontend via data channel
    const eventData = event as { type: string; data?: Record<string, unknown> };

    try {
      const message = JSON.stringify({
        ...eventData.data,
        type: eventData.type,
        seq: getNextMessageSeqSync(this.sessionId),
        timestamp: Date.now(),
      });

      if (this.room.localParticipant) {
        this.room.localParticipant
          .publishData(new TextEncoder().encode(message), { reliable: true })
          .catch((err) => {
            log.warn({ error: String(err) }, 'Failed to publish UI event');
          });
      }
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to send UI notification');
    }
  }

  /**
   * Handle soft open (departing persona's goodbye) - called BEFORE voice switch.
   *
   * Uses safeGenerateReply with ACTUAL SPEECH (not meta-instructions).
   * generateReply adds text as role:"model" - the model thinks IT said it and continues.
   * So we pass the goodbye phrase directly, and model naturally wraps up.
   *
   * CRITICAL: Must wait for speech to complete before returning, otherwise the
   * voice switch happens mid-speech and cuts off the departing persona!
   */
  private async handleSoftOpen(
    fromPersonaId: string,
    toPersonaId: string,
    context: BanterContext
  ): Promise<void> {
    try {
      // Get the banter phrase (actual speech, not meta-instructions)
      const goodbyePhrase = getHandoffBanter(fromPersonaId, toPersonaId);

      // Use specific banter if available, otherwise use generic fallback
      const fromDisplayName = getPersonaDisplayName(fromPersonaId);
      const toDisplayName = getPersonaDisplayName(toPersonaId);
      const finalGoodbye = goodbyePhrase || `Let me get ${toDisplayName} for you. One moment.`;

      log.info(
        { fromPersonaId, toPersonaId, hasSpecificBanter: !!goodbyePhrase, goodbye: finalGoodbye },
        '🎭 Speaking soft open (goodbye)'
      );

      // Estimate speech duration BEFORE speaking so we can wait for it
      const estimatedDurationMs = this.estimateSpeechDuration(finalGoodbye);
      log.debug(
        { estimatedDurationMs, wordCount: finalGoodbye.split(/\s+/).length },
        '🎭 Estimated soft open duration'
      );

      // Try safeGenerateReply first
      const result = await safeGenerateReply(this.session, {
        instructions: finalGoodbye,
        allowInterruptions: false,
        timeoutMs: 4000,
        context: 'handoff-soft-open',
        waitForPlayout: true, // CRITICAL: Wait for audio to finish before returning
      });

      if (result.success) {
        // CRITICAL FIX: Wait for speech to complete before returning!
        // safeGenerateReply returns when text is sent to TTS, not when audio finishes.
        // Without this wait, the voice switch cuts off the departing persona mid-speech.
        log.debug({ estimatedDurationMs }, '🎭 Waiting for soft open speech to complete...');
        await this.waitForSpeechComplete(estimatedDurationMs);
        diag.entry('🎭 Soft open complete (safeGenerateReply)');
        return;
      }

      // Fallback: coordinatedSay or session.say
      log.warn(
        { error: result.error, fromPersonaId },
        '🎭 safeGenerateReply failed for soft open, using fallback'
      );

      try {
        coordinatedSay(this.sessionId, finalGoodbye, { allowInterruptions: false });
        await this.waitForSpeechComplete(estimatedDurationMs);
        diag.entry('🎭 Soft open complete (coordinatedSay)');
      } catch {
        this.session.say(finalGoodbye, { allowInterruptions: false });
        await this.waitForSpeechComplete(estimatedDurationMs);
        diag.entry('🎭 Soft open complete (session.say)');
      }
    } catch (err) {
      log.warn({ error: String(err), fromPersonaId, toPersonaId }, '🎭 Soft open error - skipping');
    }
  }

  /**
   * Estimate speech duration based on text content.
   * Uses a conservative pace to ensure speech completes before transitions.
   */
  private estimateSpeechDuration(text: string): number {
    // Extract and sum SSML break times (e.g., <break time='200ms'/>)
    const breakMatches = text.match(/<break\s+time=['"](\d+)ms['"]\s*\/>/g) || [];
    const breakTimeMs = breakMatches.reduce((total, match) => {
      const ms = parseInt(match.match(/(\d+)ms/)?.[1] || '0', 10);
      return total + ms;
    }, 0);

    // Remove SSML tags to count actual words
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    // Conservative pace: ~150 words per minute = 400ms per word
    // TTS tends to be slower than natural conversational speech
    const speakingTimeMs = wordCount * 400;

    // Buffer for TTS processing, network latency, and safety margin
    const buffer = 500;

    return speakingTimeMs + breakTimeMs + buffer;
  }

  /**
   * Wait for speech to complete (timeout-based estimation).
   */
  private async waitForSpeechComplete(estimatedMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, estimatedMs);
    });
  }

  /**
   * Handle arriving welcome (new persona's greeting) - called AFTER voice switch.
   *
   * Uses safeGenerateReply with ACTUAL SPEECH (not meta-instructions).
   * generateReply adds text as role:"model" - the model thinks IT said it and continues.
   * So we pass the greeting phrase directly, and model naturally greets.
   *
   * NEW: Integrates Team Huddle for intelligent, context-aware greetings.
   * The arriving persona receives a brief from the team about what's relevant.
   */
  private async handleArrivingWelcome(toPersonaId: string, context: BanterContext): Promise<void> {
    // Use previousAgent from context (passed from coordinator) - NOT from services.handoffState
    const fromPersonaId = context.previousAgent || 'ferni';

    // CRITICAL: Reset circuit breaker for new agent - don't let old failures block greeting
    // This ensures the new persona gets a clean slate for speech
    resetCircuitBreaker();
    log.info({ toPersonaId, fromPersonaId }, '🔄 Circuit breaker reset for new persona');

    try {
      // Get Team Huddle context for intelligent handoff (non-blocking)
      const teamContext = await this.getTeamHuddleContextForHandoff(toPersonaId, context);

      // Get the banter phrase (actual speech, not meta-instructions)
      const greetingPhrase = getArrivingBanter(toPersonaId, fromPersonaId);

      // Build greeting - incorporate team context if available and relevant
      const displayName = getPersonaDisplayName(toPersonaId);
      let finalGreeting = greetingPhrase || `Hey! ${displayName} here. How can I help?`;

      // If team huddle has a high-priority recommendation for this persona, weave it in
      if (teamContext?.enhancedGreeting) {
        finalGreeting = teamContext.enhancedGreeting;
        log.info({ toPersonaId, hasTeamContext: true }, '🤝 Using Team Huddle enhanced greeting');
      }

      // Estimate speech duration BEFORE speaking so we can wait for it
      const estimatedDurationMs = this.estimateSpeechDuration(finalGreeting);

      log.info(
        {
          toPersonaId,
          fromPersonaId,
          hasSpecificBanter: !!greetingPhrase,
          greeting: finalGreeting,
          estimatedDurationMs,
        },
        '🎭 Speaking arriving welcome'
      );

      // Try safeGenerateReply first - best UX as model can continue naturally
      // CRITICAL: Bypass circuit breaker and session closing check for handoff greetings
      // Handoffs must ALWAYS produce a greeting - we know the session is valid because
      // the new agent was just spawned on it
      const result = await safeGenerateReply(this.session, {
        instructions: finalGreeting,
        allowInterruptions: false,
        timeoutMs: 4000,
        context: 'handoff-arriving-welcome',
        sessionId: this.sessionId,
        bypassCircuitBreaker: true, // CRITICAL: Don't let old failures block greeting
        bypassSessionClosingCheck: true, // CRITICAL: Session is valid for new agent
        waitForPlayout: true, // CRITICAL: Wait for audio to finish before returning
      });

      if (result.success) {
        // CRITICAL FIX: Wait for speech to complete before returning!
        // safeGenerateReply returns when text is sent to TTS, not when audio finishes.
        // Without this wait, the handoff completes before the greeting finishes speaking.
        log.debug({ estimatedDurationMs }, '🎭 Waiting for arriving welcome to complete...');
        await this.waitForSpeechComplete(estimatedDurationMs);
        diag.entry('🎭 Arriving welcome complete (safeGenerateReply)');
        return;
      }

      // Fallback 1: coordinatedSay (speech coordination)
      log.warn(
        { error: result.error, toPersonaId, skippedConcurrent: result.skippedConcurrent },
        '🎭 safeGenerateReply failed, trying coordinatedSay'
      );

      try {
        coordinatedSay(this.sessionId, finalGreeting, { allowInterruptions: false });
        await this.waitForSpeechComplete(estimatedDurationMs);
        diag.entry('🎭 Arriving welcome complete (coordinatedSay)');
        return;
      } catch (coordErr) {
        log.warn({ error: String(coordErr) }, '🎭 coordinatedSay failed, trying session.say');
      }

      // Fallback 2: Direct session.say (last resort - always works if session is valid)
      try {
        this.session.say(finalGreeting, { allowInterruptions: false });
        await this.waitForSpeechComplete(estimatedDurationMs);
        diag.entry('🎭 Arriving welcome complete (session.say)');
      } catch (sayErr) {
        log.error({ error: String(sayErr), toPersonaId }, '🎭 ALL greeting methods failed!');
      }
    } catch (err) {
      log.error({ error: String(err), toPersonaId, fromPersonaId }, '🎭 Arriving welcome error');
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Get recent messages for context continuation.
   */
  private getRecentMessages(): string[] {
    try {
      // Try different methods that might be available
      const historyTracker = this.services.historyTracker as {
        getRecentHistory?: (count: number) => Array<{ role: string; content: string }>;
        getSessionHistory?: () => { entries?: Array<{ role: string; content: string }> };
      };

      if (historyTracker?.getRecentHistory) {
        const history = historyTracker.getRecentHistory(5);
        return history.map((entry) => `${entry.role}: ${entry.content}`);
      }

      if (historyTracker?.getSessionHistory) {
        const sessionHistory = historyTracker.getSessionHistory();
        const entries = sessionHistory?.entries?.slice(-5) || [];
        return entries.map((entry) => `${entry.role}: ${entry.content}`);
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Get cognitive context for the new persona.
   */
  private getCognitiveContext(): string | undefined {
    try {
      // cognitiveStyle might be nested or have different shapes
      const sessionPriming = this.services.sessionPriming as {
        cognitiveStyle?: { style?: string; pace?: string };
        userStyle?: string;
      };

      if (sessionPriming?.cognitiveStyle) {
        const cognitive = sessionPriming.cognitiveStyle;
        return `User communication style: ${cognitive.style || 'conversational'}. 
Preferred pace: ${cognitive.pace || 'moderate'}.`;
      }

      if (sessionPriming?.userStyle) {
        return `User style: ${sessionPriming.userStyle}`;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get Team Huddle context for intelligent handoff greetings.
   *
   * This provides the arriving persona with:
   * - What the team has noticed about this user
   * - Any high-priority recommendations
   * - An enhanced greeting if relevant team insights exist
   *
   * This is the "Better than Human" feature - human support networks don't coordinate,
   * but Ferni's team does. The arriving persona knows what's been happening.
   */
  private async getTeamHuddleContextForHandoff(
    toPersonaId: string,
    context: BanterContext
  ): Promise<{ enhancedGreeting?: string; teamBrief?: string } | null> {
    try {
      // Get user ID from services
      const userId = this.services.userId || this.services.userProfile?.id;
      if (!userId) {
        log.debug({ toPersonaId }, 'No userId available for Team Huddle');
        return null;
      }

      // Generate Team Huddle (quick, cached data)
      const huddle = await generateTeamHuddle(userId);
      if (!huddle || huddle.observations.length === 0) {
        return null;
      }

      // Find recommendations relevant to this persona
      const relevantRec = huddle.recommendations.find(
        (rec: TeamRecommendation) =>
          rec.targetPersona === toPersonaId &&
          (rec.priority === 'high' || rec.priority === 'urgent')
      );

      // Find any observations from other personas that this one should know about
      const otherObservations = huddle.observations.filter(
        (obs) => obs.personaId !== toPersonaId && obs.confidence > 0.6
      );

      // Build enhanced greeting if there's relevant context
      if (relevantRec || otherObservations.length > 0) {
        const displayName = getPersonaDisplayName(toPersonaId);
        const shortName = displayName.split(' ')[0] || displayName;

        let enhancedGreeting = `Hey! ${shortName} here.`;

        // Add team context naturally
        if (relevantRec?.shouldMentionTeam) {
          enhancedGreeting += ` The team mentioned something I wanted to follow up on.`;
        } else if (otherObservations.length > 0) {
          // Pick the most recent relevant observation
          const recentObs = otherObservations[otherObservations.length - 1];
          const obsPersonaName = getPersonaDisplayName(recentObs.personaId).split(' ')[0];
          if (recentObs.observationType === 'concern') {
            enhancedGreeting += ` ${obsPersonaName} shared some thoughts with me.`;
          } else if (recentObs.observationType === 'opportunity') {
            enhancedGreeting += ` ${obsPersonaName} mentioned something I'm excited to explore with you.`;
          }
        }

        enhancedGreeting += ` How can I help?`;

        // Build team brief for logging
        const teamBrief = `[Team Huddle] ${huddle.synthesis}`;

        log.info(
          {
            toPersonaId,
            userId,
            observationCount: huddle.observations.length,
            hasRelevantRec: !!relevantRec,
            wellbeing: huddle.userStateAssessment.wellbeing,
          },
          '🤝 Team Huddle context built for handoff'
        );

        return { enhancedGreeting, teamBrief };
      }

      return null;
    } catch (err) {
      // Non-blocking - if Team Huddle fails, continue without it
      log.debug({ error: String(err), toPersonaId }, 'Team Huddle context not available');
      return null;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a coordinator adapter for a session.
 */
export function createCoordinatorAdapter(config: CoordinatorAdapterConfig): CoordinatorAdapter {
  return new CoordinatorAdapter(config);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const adapters = new Map<string, CoordinatorAdapter>();

/**
 * Get or create adapter for a session.
 */
export function getSessionAdapter(
  sessionId: string,
  config?: CoordinatorAdapterConfig
): CoordinatorAdapter | null {
  let adapter = adapters.get(sessionId);

  if (!adapter && config) {
    adapter = createCoordinatorAdapter(config);
    adapters.set(sessionId, adapter);
  }

  return adapter || null;
}

/**
 * Remove adapter for a session.
 */
export function removeSessionAdapter(sessionId: string): void {
  const adapter = adapters.get(sessionId);
  if (adapter) {
    adapter.dispose();
    adapters.delete(sessionId);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default CoordinatorAdapter;
