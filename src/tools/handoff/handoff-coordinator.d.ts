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
import type { AgentId } from '../../services/agent-bus.js';
import type { UserProfile } from '../../types/user-profile.js';
import { type VoiceIdInput } from './voice-id-resolver.js';
import { type SequencedEvent } from './event-sequencer.js';
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
    /** The persona we're switching FROM (needed for arriving welcome banter lookup) */
    previousAgent: string;
    /** The persona we're switching TO */
    targetAgent: string;
}
/**
 * Before voice switch callback - for "soft open" (departing persona's goodbye).
 * Called BEFORE the voice is switched, so banter is spoken in the current persona's voice.
 */
export type BeforeVoiceSwitchCallback = (fromPersonaId: string, toPersonaId: string, context: BanterContext) => Promise<void>;
/**
 * After voice switch callback - for "arriving welcome" (new persona's greeting).
 * Called AFTER the voice is switched, so greeting is spoken in the new persona's voice.
 */
export type AfterVoiceSwitchCallback = (toPersonaId: string, context: BanterContext) => Promise<void>;
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
export declare class HandoffCoordinator {
    private readonly sessionId;
    private readonly stateManager;
    private readonly sequencer;
    private readonly events;
    private readonly onVoiceSwitch;
    private readonly onLLMUpdate;
    private readonly onUINotify?;
    private readonly handoffTimeoutMs;
    private readonly onBeforeVoiceSwitch?;
    private readonly onAfterVoiceSwitch?;
    private readonly skipBanter;
    private currentTransaction;
    private lastTraceId;
    constructor(config: CoordinatorConfig);
    /**
     * Execute a handoff.
     *
     * This is the SINGLE entry point for all handoffs.
     */
    execute(request: HandoffRequest): Promise<HandoffResult>;
    /**
     * Cancel current handoff.
     */
    cancel(reason?: string): Promise<void>;
    /**
     * Get current agent.
     */
    getCurrentAgent(): AgentId;
    /**
     * Check if handoff is in progress.
     */
    isInProgress(): boolean;
    /**
     * Get state snapshot.
     */
    getState(): import("./handoff-state-manager.js").HandoffStateSnapshot;
    /**
     * Subscribe to state changes.
     */
    onStateChange(callback: (event: unknown) => void): () => void;
    /**
     * Build LLM instructions for the new persona.
     */
    private buildInstructions;
    /**
     * Emit UI event through sequencer.
     */
    private emitUIEvent;
    /**
     * Record metrics.
     */
    private recordMetrics;
    /**
     * Generate a unique trace ID.
     */
    private generateTraceId;
    /**
     * Dispose coordinator and clean up resources.
     */
    dispose(): void;
}
/**
 * Create a new handoff coordinator.
 */
export declare function createHandoffCoordinator(config: CoordinatorConfig): HandoffCoordinator;
export default HandoffCoordinator;
//# sourceMappingURL=handoff-coordinator.d.ts.map