/**
 * Handoff Coordinator
 *
 * Single orchestration point for all handoffs.
 * Coordinates validation, state, voice, LLM, and UI updates.
 *
 * This consolidates the scattered logic that was previously across:
 * - executor.ts
 * - data-channel-handler.ts
 * - state.ts
 *
 * BANTER INTEGRATION:
 * The coordinator supports warm handoffs with intelligent banter via hooks:
 * - onBeforeVoiceSwitch: Called before switching - use for "soft open" (departing goodbye)
 * - onAfterVoiceSwitch: Called after switching - use for "arriving welcome" (new persona greeting)
 *
 * Example with banter:
 * ```typescript
 * const coordinator = createHandoffCoordinator({
 *   sessionId,
 *   // IMPORTANT: Use personaId (not voiceUUID) for VoiceManager.switchVoice()!
 *   onVoiceSwitch: async (voiceUUID, personaId) => voiceManager.switchVoice(personaId),
 *   onLLMUpdate: async (personaId, instructions) => agent.setPersona(personaId, instructions),
 *   onBeforeVoiceSwitch: async (fromPersona, toPersona) => {
 *     // Soft open - departing persona's goodbye
 *     const banter = await getLLMDrivenBanter(session, fromPersona, toPersona);
 *     await session.say(banter.softOpen);
 *   },
 *   onAfterVoiceSwitch: async (toPersona, context) => {
 *     // Arriving welcome - new persona's greeting
 *     const greeting = await generateContextualGreeting(toPersona, context);
 *     await session.say(greeting);
 *   },
 * });
 * ```
 *
 * @module handoff/handoff-coordinator
 */

import { EventEmitter } from 'events';
import type { AgentId } from '../../services/agent-bus.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import { getPersonaAsyncCached } from '../../agents/shared/cached-imports.js';
import { getLogger } from '../../utils/safe-logger.js';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';

// Internal modules
import { validateHandoffPreconditions, type ValidationSuccess, type ValidationOptions } from './pre-validation.js';
import { resolveVoiceId, type VoiceIdInput } from './voice-id-resolver.js';
import { HandoffTransaction, createTransaction } from './handoff-transaction.js';
import { EventSequencer, sequenceGenerator, type SequencedEvent, type HandoffEventType } from './event-sequencer.js';
import { HandoffStateManager, getHandoffManager } from './handoff-state-manager.js';
import { recordHandoffMetrics, type HandoffMetricsData } from '../../services/handoff-metrics.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handoff request options.
 */
export interface HandoffRequest {
  /** Target persona ID */
  targetAgent: string;
  /** Reason for handoff (logged, passed to context) */
  reason?: string;
  /** User profile for unlock checks */
  userProfile?: UserProfile | null;
  /** Subscription tier override */
  subscriptionTier?: 'free' | 'friend' | 'partner';
  /** Skip validation (dangerous, for recovery only) */
  skipValidation?: boolean;
  /** Voice ID input for resolution */
  voiceIdInput?: VoiceIdInput;
  /** Custom greeting (overrides auto-generated) */
  greeting?: string;
  /** Recent messages for context continuation */
  recentMessages?: string[];
  /** Cognitive context from previous persona */
  cognitiveContext?: string;
  /** Source of the handoff request */
  source?: 'user' | 'llm' | 'system';
  /**
   * FAST MODE: Instant switch with async welcome (Option D)
   * 
   * When true:
   * - Skip soft-open banter (no goodbye from departing persona)
   * - Voice switch + LLM update happen immediately (~250ms)
   * - handoff_complete sent to frontend immediately
   * - Arriving welcome spoken ASYNC (non-blocking)
   * 
   * Best for: User-initiated transfers (they clicked, they want it NOW)
   * Default: true for user-initiated, false for LLM-initiated
   */
  fastMode?: boolean;
}

/**
 * Handoff result.
 */
export interface HandoffResult {
  success: boolean;
  targetPersonaId?: string;
  voiceId?: string;
  error?: string;
  errorCode?: string;
  traceId: string;
  durationMs?: number;
  rolledBack?: boolean;
}

/**
 * Voice switch callback signature.
 * 
 * IMPORTANT: The first parameter (voiceUUID) is the Cartesia voice UUID for reference/logging.
 * The actual voice switch should use personaId (agent ID like 'peter-john') because
 * VoiceManager.switchVoice() looks up the voice from its internal VOICES registry.
 * 
 * @param voiceUUID - The Cartesia voice UUID (for logging/reference only)
 * @param personaId - The canonical persona ID (e.g., 'peter-john') - USE THIS for VoiceManager
 */
export type VoiceSwitchCallback = (voiceUUID: string, personaId: string) => Promise<void>;

/**
 * LLM update callback signature.
 */
export type LLMUpdateCallback = (personaId: string, instructions: string) => Promise<void>;

/**
 * UI notification callback signature.
 */
export type UINotifyCallback = (event: SequencedEvent) => void;

/**
 * Banter context passed to banter hooks.
 */
export interface BanterContext {
  /** Reason for the handoff */
  reason?: string;
  /** Recent conversation messages */
  recentMessages?: string[];
  /** User's cognitive style */
  cognitiveContext?: string;
  /** Whether this is the first time meeting this persona */
  isFirstMeeting: boolean;
  /** Whether the user initiated this handoff */
  isUserInitiated: boolean;
}

/**
 * Before voice switch callback - for "soft open" (departing persona's goodbye).
 * Called BEFORE the voice is switched, so banter is spoken in the current persona's voice.
 */
export type BeforeVoiceSwitchCallback = (
  fromPersonaId: string,
  toPersonaId: string,
  context: BanterContext
) => Promise<void>;

/**
 * After voice switch callback - for "arriving welcome" (new persona's greeting).
 * Called AFTER the voice is switched, so greeting is spoken in the new persona's voice.
 */
export type AfterVoiceSwitchCallback = (
  toPersonaId: string,
  context: BanterContext
) => Promise<void>;

/**
 * Coordinator configuration.
 */
export interface CoordinatorConfig {
  /** Session ID */
  sessionId: string;
  /** CRITICAL: Initial agent for the session. Defaults to 'ferni' if not provided. */
  initialAgent?: string;
  /** Callback to switch voice */
  onVoiceSwitch: VoiceSwitchCallback;
  /** Callback to update LLM instructions */
  onLLMUpdate: LLMUpdateCallback;
  /** Callback to notify UI */
  onUINotify?: UINotifyCallback;
  /** Timeout for handoff completion (default: 15000ms) */
  handoffTimeoutMs?: number;

  // ========== BANTER HOOKS ==========

  /**
   * Called BEFORE voice switch for "soft open" banter.
   * The departing persona says goodbye in their voice.
   *
   * Example: "I'm going to hand you to Peter - he's great with research!"
   */
  onBeforeVoiceSwitch?: BeforeVoiceSwitchCallback;

  /**
   * Called AFTER voice switch for "arriving welcome" banter.
   * The new persona greets the user in their voice.
   *
   * Example: "Hey! I heard you're looking into some financial stuff..."
   */
  onAfterVoiceSwitch?: AfterVoiceSwitchCallback;

  /**
   * Whether to skip banter entirely (for fast/emergency handoffs).
   * Default: false
   */
  skipBanter?: boolean;
}

// ============================================================================
// COORDINATOR CLASS
// ============================================================================

/**
 * Handoff Coordinator
 *
 * Single orchestration point for all handoffs.
 *
 * @example
 * ```typescript
 * const coordinator = new HandoffCoordinator({
 *   sessionId: 'session-123',
 *   // IMPORTANT: Use personaId (not voiceUUID) for VoiceManager.switchVoice()!
 *   onVoiceSwitch: async (voiceUUID, personaId) => {
 *     await voiceManager.switchVoice(personaId);
 *   },
 *   onLLMUpdate: async (personaId, instructions) => {
 *     await agent.setPersona(personaId, instructions);
 *   },
 *   onUINotify: (event) => {
 *     sendDataChannelMessage(event);
 *   },
 * });
 *
 * const result = await coordinator.execute({
 *   targetAgent: 'peter-john',
 *   reason: 'User wants research help',
 *   userProfile,
 * });
 *
 * if (result.success) {
 *   console.log('Handoff complete!');
 * } else {
 *   console.error('Handoff failed:', result.error);
 * }
 * ```
 */
export class HandoffCoordinator {
  private readonly sessionId: string;
  private readonly stateManager: HandoffStateManager;
  private readonly sequencer: EventSequencer;
  private readonly events = new EventEmitter();

  private readonly onVoiceSwitch: VoiceSwitchCallback;
  private readonly onLLMUpdate: LLMUpdateCallback;
  private readonly onUINotify?: UINotifyCallback;
  private readonly handoffTimeoutMs: number;

  // Banter hooks
  private readonly onBeforeVoiceSwitch?: BeforeVoiceSwitchCallback;
  private readonly onAfterVoiceSwitch?: AfterVoiceSwitchCallback;
  private readonly skipBanter: boolean;

  private currentTransaction: HandoffTransaction | null = null;
  private lastTraceId: string = '';

  constructor(config: CoordinatorConfig) {
    this.sessionId = config.sessionId;
    this.stateManager = getHandoffManager(config.sessionId);
    this.sequencer = new EventSequencer(config.sessionId);
    this.onVoiceSwitch = config.onVoiceSwitch;
    this.onLLMUpdate = config.onLLMUpdate;
    this.onUINotify = config.onUINotify;
    this.handoffTimeoutMs = config.handoffTimeoutMs || HANDOFF_TIMING.HANDOFF_TIMEOUT_MS;

    // CRITICAL: Reset state manager with the correct initial agent
    // This fixes the bug where handoffs fail with "Already with X" when starting on a non-ferni persona
    if (config.initialAgent) {
      this.stateManager.reset(config.initialAgent as AgentId);
      log.info({ sessionId: config.sessionId, initialAgent: config.initialAgent }, '🎯 State manager reset to initial agent');
    }

    // Banter configuration
    this.onBeforeVoiceSwitch = config.onBeforeVoiceSwitch;
    this.onAfterVoiceSwitch = config.onAfterVoiceSwitch;
    this.skipBanter = config.skipBanter || false;

    log.info({ sessionId: config.sessionId, initialAgent: config.initialAgent || 'ferni', hasBanterHooks: !!(config.onBeforeVoiceSwitch || config.onAfterVoiceSwitch) }, '🎯 HandoffCoordinator created');
  }

  // ========================================================================
  // MAIN EXECUTION
  // ========================================================================

  /**
   * Execute a handoff.
   *
   * This is the SINGLE entry point for all handoffs.
   */
  async execute(request: HandoffRequest): Promise<HandoffResult> {
    const startTime = Date.now();
    const traceId = this.generateTraceId();
    this.lastTraceId = traceId;

    const canonicalId = getCanonicalPersonaId(request.targetAgent);
    const displayName = getPersonaDisplayName(canonicalId);

    log.info(
      {
        traceId,
        sessionId: this.sessionId,
        targetAgent: canonicalId,
        displayName,
        source: request.source || 'unknown',
        reason: request.reason,
      },
      '🚀 Starting handoff execution'
    );

    try {
      // ====================================================================
      // PHASE 1: VALIDATION
      // ====================================================================
      // CRITICAL: Frontend expects 'target' not 'targetAgent'
      this.emitUIEvent('handoff_acknowledged', { traceId, target: canonicalId });

      if (!request.skipValidation) {
        const validation = await validateHandoffPreconditions(canonicalId, {
          userProfile: request.userProfile,
          subscriptionTier: request.subscriptionTier,
          sessionId: this.sessionId,
          voiceIdInput: request.voiceIdInput || { personaId: canonicalId },
          // CRITICAL FIX: Pass session-scoped current agent to prevent state mismatch bugs
          currentAgent: this.stateManager.getCurrentAgent(),
        });

        if (!validation.valid) {
          const error = validation.primaryError;
          log.warn(
            { traceId, errorCode: error.code, error: error.message },
            '❌ Handoff validation failed'
          );

          this.emitUIEvent('handoff_failed', {
            traceId,
            error: error.userMessage,
            errorCode: error.code,
          });

          return {
            success: false,
            error: error.userMessage,
            errorCode: error.code,
            traceId,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // ====================================================================
      // PHASE 2: STATE UPDATE (START)
      // ====================================================================
      const stateStart = this.stateManager.startHandoff(canonicalId, request.reason || 'user request');

      if (!stateStart.allowed) {
        log.warn({ traceId, error: stateStart.error }, '❌ State manager rejected handoff');

        this.emitUIEvent('handoff_failed', {
          traceId,
          error: stateStart.error,
          errorCode: 'STATE_REJECTED',
        });

        return {
          success: false,
          error: stateStart.error,
          errorCode: 'STATE_REJECTED',
          traceId,
          durationMs: Date.now() - startTime,
        };
      }

      // CRITICAL: Frontend expects 'target' not 'targetAgent'
      this.emitUIEvent('handoff_started', { traceId, target: canonicalId, displayName });

      // ====================================================================
      // PHASE 3: LOAD PERSONA DATA
      // ====================================================================
      this.emitUIEvent('handoff_progress', { traceId, phase: 'loading_persona', progress: 0.2 });

      const personaConfig = await getPersonaAsyncCached(canonicalId);
      if (!personaConfig) {
        throw new Error(`Persona not found: ${canonicalId}`);
      }

      // ====================================================================
      // PHASE 4: RESOLVE VOICE ID
      // ====================================================================
      this.emitUIEvent('handoff_progress', { traceId, phase: 'resolving_voice', progress: 0.3 });

      const voiceResult = resolveVoiceId(
        request.voiceIdInput || {
          personaId: canonicalId,
          persona: { id: canonicalId, voiceId: personaConfig.voice?.voiceId },
        },
        { logLevel: 'info' }
      );

      if (!voiceResult.success) {
        throw new Error(`Voice ID resolution failed: ${voiceResult.error}`);
      }

      // ====================================================================
      // PHASE 5: CREATE TRANSACTION
      // ====================================================================
      const previousAgent = this.stateManager.getSnapshot().previousAgent || 'ferni';
      const previousVoiceResult = resolveVoiceId({ personaId: previousAgent });
      const previousVoiceId = previousVoiceResult.success ? previousVoiceResult.voiceId : '';

      const tx = createTransaction(`${previousAgent}-to-${canonicalId}`);
      this.currentTransaction = tx;

      // Build banter context
      const banterContext: BanterContext = {
        reason: request.reason,
        recentMessages: request.recentMessages,
        cognitiveContext: request.cognitiveContext,
        isFirstMeeting: !this.stateManager.hasMetPersona(canonicalId),
        isUserInitiated: request.source === 'user',
      };

      // ====================================================================
      // FAST MODE DETECTION (Option D: Instant Switch + Async Welcome)
      // ====================================================================
      // Default: user-initiated = fast, LLM-initiated = normal banter
      const useFastMode = request.fastMode ?? (request.source === 'user');
      
      if (useFastMode) {
        log.info({ traceId, target: canonicalId }, '⚡ FAST MODE: Instant switch enabled');
      }

      // Step 1: Soft Open (departing persona's goodbye) - SKIP IN FAST MODE
      if (!useFastMode && !this.skipBanter && this.onBeforeVoiceSwitch) {
        tx.addStep({
          name: 'soft-open-banter',
          execute: async () => {
            this.emitUIEvent('handoff_progress', { traceId, phase: 'soft_open', progress: 0.35 });
            await this.onBeforeVoiceSwitch!(previousAgent, canonicalId, banterContext);
            // CRITICAL: Frontend expects 'target' (uses 'previousAgent' for from)
            this.emitUIEvent('soft_open_complete', { traceId, previousAgent, target: canonicalId });
          },
          rollback: async () => {
            // Can't unsay banter, but that's okay
          },
          critical: false, // Don't fail handoff if banter fails
        });
      }

      // Step 2: Switch voice - CRITICAL (always runs)
      tx.addStep({
        name: 'switch-voice',
        execute: async () => {
          this.emitUIEvent('handoff_progress', { traceId, phase: 'switching_voice', progress: useFastMode ? 0.5 : 0.5 });
          await this.onVoiceSwitch(voiceResult.voiceId, canonicalId);
        },
        rollback: async () => {
          if (previousVoiceId) {
            await this.onVoiceSwitch(previousVoiceId, previousAgent);
          }
        },
        critical: true,
      });

      // Step 3: Update LLM instructions - CRITICAL (moved UP for fast mode)
      tx.addStep({
        name: 'update-llm',
        execute: async () => {
          this.emitUIEvent('handoff_progress', { traceId, phase: 'updating_llm', progress: useFastMode ? 0.75 : 0.75 });
          const instructions = await this.buildInstructions(canonicalId, personaConfig, request);
          await this.onLLMUpdate(canonicalId, instructions);
        },
        rollback: async () => {
          // Load previous persona config for rollback
          const prevConfig = await getPersonaAsyncCached(previousAgent);
          if (prevConfig) {
            await this.onLLMUpdate(previousAgent, prevConfig.systemPrompt || '');
          }
        },
        critical: true,
      });

      // Step 4: Arriving Welcome - BLOCKING in normal mode, ASYNC in fast mode
      if (!this.skipBanter && this.onAfterVoiceSwitch) {
        if (useFastMode) {
          // FAST MODE: Trigger arriving welcome ASYNC (non-blocking)
          // Don't add to transaction - fire and forget after switch completes
          tx.addStep({
            name: 'queue-async-welcome',
            execute: async () => {
              // Queue the welcome to run AFTER transaction completes
              // Use setImmediate to ensure it runs after handoff_complete is sent
              setImmediate(() => {
                log.info({ traceId, target: canonicalId }, '🎭 FAST MODE: Async welcome starting');
                this.onAfterVoiceSwitch!(canonicalId, banterContext).catch((err) => {
                  log.warn({ traceId, error: String(err) }, '⚠️ Async welcome failed (non-critical)');
                });
              });
            },
            rollback: async () => {
              // Can't cancel queued async - it's fire-and-forget
            },
            critical: false,
          });
        } else {
          // NORMAL MODE: Blocking arriving welcome
          tx.addStep({
            name: 'arriving-welcome-banter',
            execute: async () => {
              this.emitUIEvent('handoff_progress', { traceId, phase: 'arriving_welcome', progress: 0.6 });
              await this.onAfterVoiceSwitch!(canonicalId, banterContext);
            },
            rollback: async () => {
              // Can't unsay banter
            },
            critical: false, // Don't fail handoff if banter fails
          });
        }
      }

      // Step 5: Notify UI of completion (non-critical)
      tx.addStep({
        name: 'notify-ui',
        execute: async () => {
          this.emitUIEvent('handoff_progress', { traceId, phase: 'finalizing', progress: 0.9 });
        },
        rollback: async () => {
          // Nothing to rollback for notifications
        },
        critical: false,
      });

      // ====================================================================
      // PHASE 6: EXECUTE TRANSACTION
      // ====================================================================
      const txResult = await tx.execute();

      if (!txResult.success) {
        this.stateManager.failHandoff(txResult.error || 'Transaction failed', traceId);

        this.emitUIEvent('handoff_failed', {
          traceId,
          error: 'Handoff failed - rolled back to previous agent',
          errorCode: 'TRANSACTION_FAILED',
          rolledBack: txResult.rolledBack,
        });

        return {
          success: false,
          error: txResult.error,
          errorCode: 'TRANSACTION_FAILED',
          traceId,
          durationMs: Date.now() - startTime,
          rolledBack: txResult.rolledBack,
        };
      }

      // ====================================================================
      // PHASE 7: COMPLETE
      // ====================================================================
      this.stateManager.completeHandoff(canonicalId, traceId);
      this.currentTransaction = null;

      const durationMs = Date.now() - startTime;

      // CRITICAL: Frontend expects 'target' not 'targetAgent'
      this.emitUIEvent('handoff_complete', {
        traceId,
        target: canonicalId,
        displayName,
        voiceId: voiceResult.voiceId,
        durationMs,
      });

      // Record metrics
      this.recordMetrics({
        traceId,
        from: previousAgent,
        to: canonicalId,
        success: true,
        durationMs,
        source: request.source || 'unknown',
      });

      log.info(
        { traceId, targetAgent: canonicalId, durationMs },
        '✅ Handoff completed successfully'
      );

      return {
        success: true,
        targetPersonaId: canonicalId,
        voiceId: voiceResult.voiceId,
        traceId,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      log.error(
        { traceId, error: errorMsg, durationMs },
        '🚨 Handoff execution error'
      );

      // Fail state if in progress
      if (this.stateManager.isHandoffInProgress()) {
        this.stateManager.failHandoff(errorMsg, traceId);
      }

      // Rollback transaction if exists
      if (this.currentTransaction && this.currentTransaction.getState() === 'executing') {
        await this.currentTransaction.rollback();
      }
      this.currentTransaction = null;

      this.emitUIEvent('handoff_failed', {
        traceId,
        error: errorMsg,
        errorCode: 'EXECUTION_ERROR',
      });

      // Record metrics
      this.recordMetrics({
        traceId,
        from: this.stateManager.getSnapshot().previousAgent || 'ferni',
        to: getCanonicalPersonaId(request.targetAgent),
        success: false,
        durationMs,
        source: request.source || 'unknown',
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        errorCode: 'EXECUTION_ERROR',
        traceId,
        durationMs,
      };
    }
  }

  // ========================================================================
  // CANCEL / ABORT
  // ========================================================================

  /**
   * Cancel current handoff.
   */
  async cancel(reason: string = 'user cancelled'): Promise<void> {
    const traceId = this.lastTraceId;

    log.info({ traceId, sessionId: this.sessionId, reason }, '⏹️ Cancelling handoff');

    if (this.currentTransaction) {
      await this.currentTransaction.rollback();
      this.currentTransaction = null;
    }

    if (this.stateManager.isHandoffInProgress()) {
      this.stateManager.failHandoff(reason, traceId);
    }

    this.emitUIEvent('handoff_cancelled', { traceId, reason });
  }

  // ========================================================================
  // STATE ACCESS
  // ========================================================================

  /**
   * Get current agent.
   */
  getCurrentAgent(): AgentId {
    return this.stateManager.getCurrentAgent();
  }

  /**
   * Check if handoff is in progress.
   */
  isInProgress(): boolean {
    return this.stateManager.isHandoffInProgress();
  }

  /**
   * Get state snapshot.
   */
  getState() {
    return this.stateManager.getSnapshot();
  }

  /**
   * Subscribe to state changes.
   */
  onStateChange(callback: (event: unknown) => void): () => void {
    return this.stateManager.onChange(callback);
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  /**
   * Build LLM instructions for the new persona.
   */
  private async buildInstructions(
    personaId: string,
    personaConfig: { systemPrompt?: string },
    request: HandoffRequest
  ): Promise<string> {
    const parts: string[] = [];

    // Base system prompt
    if (personaConfig.systemPrompt) {
      parts.push(personaConfig.systemPrompt);
    }

    // Context continuation
    if (request.recentMessages && request.recentMessages.length > 0) {
      parts.push('\n\n[CONTEXT CONTINUATION]');
      parts.push('Recent conversation:');
      parts.push(request.recentMessages.slice(-5).join('\n'));
    }

    // Cognitive context
    if (request.cognitiveContext) {
      parts.push('\n\n[USER STYLE]');
      parts.push(request.cognitiveContext);
    }

    // Greeting instruction
    if (request.greeting) {
      parts.push('\n\n[GREETING]');
      parts.push(`Start by saying: "${request.greeting}"`);
    }

    return parts.join('\n');
  }

  /**
   * Emit UI event through sequencer.
   */
  private emitUIEvent(type: HandoffEventType, data: Record<string, unknown>): void {
    const seq = sequenceGenerator.next(this.sessionId);
    const event: SequencedEvent = {
      type,
      seq,
      handoffId: this.lastTraceId,
      timestamp: Date.now(),
      data,
    };

    // Send to UI callback
    if (this.onUINotify) {
      this.onUINotify(event);
    }

    // Also emit on internal event bus
    this.events.emit('ui-event', event);
  }

  /**
   * Record metrics.
   */
  private recordMetrics(data: HandoffMetricsData): void {
    try {
      recordHandoffMetrics(data);
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to record handoff metrics');
    }
  }

  /**
   * Generate a unique trace ID.
   */
  private generateTraceId(): string {
    return `hndff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Dispose coordinator and clean up resources.
   */
  dispose(): void {
    this.sequencer.dispose();
    this.events.removeAllListeners();
    this.currentTransaction = null;

    log.debug({ sessionId: this.sessionId }, '🗑️ HandoffCoordinator disposed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new handoff coordinator.
 */
export function createHandoffCoordinator(config: CoordinatorConfig): HandoffCoordinator {
  return new HandoffCoordinator(config);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default HandoffCoordinator;

