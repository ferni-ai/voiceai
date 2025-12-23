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
  HandoffCoordinator,
  createHandoffCoordinator,
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
import { safeGenerateReply } from '../safe-generate-reply.js';

// Cached module accessors
import { getVoiceManagerCached, getPersonaAsyncCached } from './cached-modules.js';

// Speech coordination for centralized speech management
import { coordinatedSay } from '../../../speech/coordination/index.js';
import { getNextMessageSeqSync } from './session-state.js';

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
    const { ctx, session, services, room, getVoiceAgentRef, initialAgent, tts } = config;
    this.session = session;
    this.services = services;
    this.room = room;
    this.getVoiceAgentRef = getVoiceAgentRef;
    this.sessionId = ctx.room?.name || `adapter-${Date.now()}`;
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
    const source = options?.source ?? 'user';
    const fastMode = options?.fastMode; // Let coordinator decide default based on source

    log.info({ targetAgent, reason, fastMode, source }, '🚀 CoordinatorAdapter executing handoff');

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
  async cancel(reason: string = 'User cancelled'): Promise<void> {
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
   */
  private async handleVoiceSwitch(voiceId: string, personaId: string): Promise<void> {
    log.debug({ voiceId, personaId }, '🎤 Switching voice');

    const voiceManager = await getVoiceManagerCached(this.sessionId);
    if (!voiceManager) {
      throw new Error('VoiceManager not available');
    }

    // Small delay to prevent race conditions
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Step 1: Update VoiceManager internal state
    voiceManager.switchVoice(personaId);

    // Step 2: CRITICAL - Update session TTS (actually changes the voice!)
    // Without this, the voice stays the same even though state changed
    if (this.tts?.switchVoice) {
      const displayName = getPersonaDisplayName(personaId);
      const resolvedVoiceId = voiceId || getVoiceId(personaId);
      this.tts.switchVoice(displayName, resolvedVoiceId);
      log.info(
        { voiceId: resolvedVoiceId, personaId, displayName },
        '✅ Session TTS voice switched'
      );
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
   */
  private async handleSoftOpen(
    fromPersonaId: string,
    toPersonaId: string,
    context: BanterContext
  ): Promise<void> {
    log.debug({ from: fromPersonaId, to: toPersonaId }, '🎭 Generating soft open banter');

    try {
      // Get the fallback banter phrase (actual speech, not meta-instructions)
      const goodbyePhrase = getHandoffBanter(fromPersonaId, toPersonaId);

      if (goodbyePhrase) {
        // Use safeGenerateReply with the actual speech as "instructions"
        // The model sees this as something it "said" and continues naturally
        const result = await safeGenerateReply(this.session, {
          instructions: goodbyePhrase, // ACTUAL SPEECH, not "say goodbye warmly"
          allowInterruptions: false,
          timeoutMs: 4000,
          context: 'handoff-soft-open',
        });

        if (result.success) {
          diag.entry('🎭 Soft open banter complete');
        } else {
          // Fallback to coordinated speech if generateReply fails
          coordinatedSay(this.sessionId, goodbyePhrase, { allowInterruptions: false });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          diag.entry('🎭 Soft open fallback (coordinated say)');
        }
      } else {
        diag.entry('🎭 Soft open skipped - no banter phrase');
      }
    } catch (err) {
      log.warn({ error: String(err) }, '🎭 Soft open error - skipping');
      // Non-critical - continue with handoff
    }
  }

  /**
   * Handle arriving welcome (new persona's greeting) - called AFTER voice switch.
   *
   * Uses safeGenerateReply with ACTUAL SPEECH (not meta-instructions).
   * generateReply adds text as role:"model" - the model thinks IT said it and continues.
   * So we pass the greeting phrase directly, and model naturally greets.
   */
  private async handleArrivingWelcome(toPersonaId: string, context: BanterContext): Promise<void> {
    log.debug({ to: toPersonaId }, '🎭 Generating arriving welcome');

    try {
      // Get the fallback banter phrase (actual speech, not meta-instructions)
      const fromPersonaId =
        (this.services.handoffState as { previousAgent?: string })?.previousAgent || 'ferni';
      const greetingPhrase = getArrivingBanter(toPersonaId, fromPersonaId);

      if (greetingPhrase) {
        // Use safeGenerateReply with the actual greeting as "instructions"
        // The model sees this as something it "said" and continues naturally
        const result = await safeGenerateReply(this.session, {
          instructions: greetingPhrase, // ACTUAL SPEECH, not "greet the user warmly"
          allowInterruptions: false,
          timeoutMs: 4000,
          context: 'handoff-arriving-welcome',
        });

        if (result.success) {
          diag.entry('🎭 Arriving welcome complete');
        } else {
          // Fallback to coordinated speech if generateReply fails
          coordinatedSay(this.sessionId, greetingPhrase, { allowInterruptions: false });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          diag.entry('🎭 Arriving welcome fallback (coordinated say)');
        }
      } else {
        // No greeting phrase - let the persona's first natural response be the greeting
        diag.entry('🎭 Arriving welcome skipped - letting natural response be greeting');
      }
    } catch (err) {
      log.warn({ error: String(err) }, '🎭 Arriving welcome error - skipping');
      // Non-critical - continue with handoff
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
