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
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import { getPersonaAsyncCached } from '../../services/cached-imports.js';
import { getLogger } from '../../utils/safe-logger.js';
import { HANDOFF_TIMING } from '../../config/handoff-timing.js';
// Internal modules
import { validateHandoffPreconditions, } from './pre-validation.js';
import { resolveVoiceId } from './voice-id-resolver.js';
import { createTransaction } from './handoff-transaction.js';
import { EventSequencer, sequenceGenerator, } from './event-sequencer.js';
import { getHandoffManager } from './handoff-state-manager.js';
import { recordHandoffMetrics } from '../../services/handoff-metrics.js';
const log = getLogger();
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
    sessionId;
    stateManager;
    sequencer;
    events = new EventEmitter();
    onVoiceSwitch;
    onLLMUpdate;
    onUINotify;
    handoffTimeoutMs;
    // Banter hooks
    onBeforeVoiceSwitch;
    onAfterVoiceSwitch;
    skipBanter;
    currentTransaction = null;
    lastTraceId = '';
    constructor(config) {
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
            this.stateManager.reset(config.initialAgent);
            log.info({ sessionId: config.sessionId, initialAgent: config.initialAgent }, '🎯 State manager reset to initial agent');
        }
        // Banter configuration
        this.onBeforeVoiceSwitch = config.onBeforeVoiceSwitch;
        this.onAfterVoiceSwitch = config.onAfterVoiceSwitch;
        this.skipBanter = config.skipBanter || false;
        log.info({
            sessionId: config.sessionId,
            initialAgent: config.initialAgent || 'ferni',
            hasBanterHooks: !!(config.onBeforeVoiceSwitch || config.onAfterVoiceSwitch),
        }, '🎯 HandoffCoordinator created');
    }
    // ========================================================================
    // MAIN EXECUTION
    // ========================================================================
    /**
     * Execute a handoff.
     *
     * This is the SINGLE entry point for all handoffs.
     */
    async execute(request) {
        const startTime = Date.now();
        const traceId = this.generateTraceId();
        this.lastTraceId = traceId;
        const canonicalId = getCanonicalPersonaId(request.targetAgent);
        const displayName = getPersonaDisplayName(canonicalId);
        log.info({
            traceId,
            sessionId: this.sessionId,
            targetAgent: canonicalId,
            displayName,
            source: request.source || 'unknown',
            reason: request.reason,
        }, '🚀 Starting handoff execution');
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
                    log.warn({ traceId, errorCode: error.code, error: error.message }, '❌ Handoff validation failed');
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
            const voiceResult = resolveVoiceId(request.voiceIdInput || {
                personaId: canonicalId,
                persona: { id: canonicalId, voiceId: personaConfig.voice?.voiceId },
            }, { logLevel: 'info' });
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
            const banterContext = {
                reason: request.reason,
                recentMessages: request.recentMessages,
                cognitiveContext: request.cognitiveContext,
                isFirstMeeting: !this.stateManager.hasMetPersona(canonicalId),
                isUserInitiated: request.source === 'user',
                previousAgent, // CRITICAL: Needed for arriving welcome banter lookup
                targetAgent: canonicalId, // The persona we're switching TO
            };
            // ====================================================================
            // FAST MODE DETECTION (Option D: Instant Switch + Async Welcome)
            // ====================================================================
            // Default: user-initiated = fast, LLM-initiated = normal banter
            const useFastMode = request.fastMode ?? request.source === 'user';
            if (useFastMode) {
                log.info({ traceId, target: canonicalId }, '⚡ FAST MODE: Instant switch enabled');
            }
            // Step 1: Soft Open (departing persona's goodbye) - SKIP IN FAST MODE
            if (!useFastMode && !this.skipBanter && this.onBeforeVoiceSwitch) {
                tx.addStep({
                    name: 'soft-open-banter',
                    execute: async () => {
                        this.emitUIEvent('handoff_progress', { traceId, phase: 'soft_open', progress: 0.35 });
                        await this.onBeforeVoiceSwitch(previousAgent, canonicalId, banterContext);
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
                    this.emitUIEvent('handoff_progress', {
                        traceId,
                        phase: 'switching_voice',
                        progress: useFastMode ? 0.5 : 0.5,
                    });
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
                    this.emitUIEvent('handoff_progress', {
                        traceId,
                        phase: 'updating_llm',
                        progress: useFastMode ? 0.75 : 0.75,
                    });
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
                            // Use setTimeout(0) to ensure it runs after handoff_complete is sent
                            setTimeout(() => {
                                log.info({ traceId, target: canonicalId }, '🎭 FAST MODE: Async welcome starting');
                                this.onAfterVoiceSwitch(canonicalId, banterContext).catch((err) => {
                                    log.warn({ traceId, error: String(err) }, '⚠️ Async welcome failed (non-critical)');
                                });
                            }, 0);
                        },
                        rollback: async () => {
                            // Can't cancel queued async - it's fire-and-forget
                        },
                        critical: false,
                    });
                }
                else {
                    // NORMAL MODE: Blocking arriving welcome
                    tx.addStep({
                        name: 'arriving-welcome-banter',
                        execute: async () => {
                            this.emitUIEvent('handoff_progress', {
                                traceId,
                                phase: 'arriving_welcome',
                                progress: 0.6,
                            });
                            await this.onAfterVoiceSwitch(canonicalId, banterContext);
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
            log.info({ traceId, targetAgent: canonicalId, durationMs }, '✅ Handoff completed successfully');
            return {
                success: true,
                targetPersonaId: canonicalId,
                voiceId: voiceResult.voiceId,
                traceId,
                durationMs,
            };
        }
        catch (err) {
            const durationMs = Date.now() - startTime;
            const errorMsg = err instanceof Error ? err.message : String(err);
            log.error({ traceId, error: errorMsg, durationMs }, '🚨 Handoff execution error');
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
    async cancel(reason = 'user cancelled') {
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
    getCurrentAgent() {
        return this.stateManager.getCurrentAgent();
    }
    /**
     * Check if handoff is in progress.
     */
    isInProgress() {
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
    onStateChange(callback) {
        return this.stateManager.onChange(callback);
    }
    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================
    /**
     * Build LLM instructions for the new persona.
     */
    async buildInstructions(personaId, personaConfig, request) {
        const parts = [];
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
    emitUIEvent(type, data) {
        const seq = sequenceGenerator.next(this.sessionId);
        const event = {
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
    recordMetrics(data) {
        try {
            recordHandoffMetrics(data);
        }
        catch (err) {
            log.warn({ error: String(err) }, 'Failed to record handoff metrics');
        }
    }
    /**
     * Generate a unique trace ID.
     */
    generateTraceId() {
        return `hndff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    /**
     * Dispose coordinator and clean up resources.
     */
    dispose() {
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
export function createHandoffCoordinator(config) {
    return new HandoffCoordinator(config);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default HandoffCoordinator;
//# sourceMappingURL=handoff-coordinator.js.map