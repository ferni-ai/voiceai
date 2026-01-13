/**
 * Handoff Executor - Generic Handoff Execution Logic
 *
 * This module provides the actual handoff execution logic that is
 * independent of specific agents. It replaces the hardcoded
 * handoff functions in handoff.ts.
 *
 * USAGE:
 *   import { executeHandoff } from './executor.js';
 *   await executeHandoff('peter-john', 'User wants stock research', { userId: '123' });
 */
import { type CognitiveHandoffContext } from './cognitive-handoff.js';
import { getCurrentAgent, isHandoffAllowed, isSameAgent, setCurrentAgent } from './state.js';
interface HandoffContext {
    topics: string[];
    emotionalState: string;
    summary: string;
    pendingItems: string[];
    recentMessages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    /** Cognitive insights for the target persona */
    cognitiveContext?: CognitiveHandoffContext;
    /** Voice emotion for better-than-human entrance adaptation */
    voiceEmotion?: {
        voiceEmotion?: string;
        voiceConfidence?: number;
        arousal?: number;
        valence?: number;
        hasVoiceStrain?: boolean;
        hasVoiceTremor?: boolean;
    };
}
/**
 * Capture context before a handoff
 */
export declare function captureHandoffContext(context: Partial<HandoffContext>): void;
/**
 * Capture handoff context with cognitive intelligence
 */
export declare function captureHandoffContextWithCognition(context: Partial<HandoffContext>, sessionId: string, previousPersonaId: string, targetPersonaId: string): void;
/**
 * Get the captured handoff context
 */
export declare function getHandoffContext(): HandoffContext | null;
export { getCurrentAgent, isHandoffAllowed, isSameAgent, setCurrentAgent };
/**
 * Reset handoff state
 * Resets both executor and state.js state (including rate limiting)
 */
export declare function resetHandoffState(): void;
export interface ExecuteHandoffOptions {
    /** User ID for context */
    userId?: string;
    /** Session ID for context */
    sessionId?: string;
    /** Sound to play during handoff */
    playSound?: string;
    /** Additional context to pass */
    context?: Record<string, unknown>;
    /** Skip rate limiting check */
    skipRateLimit?: boolean;
    /** User profile for unlock validation */
    userProfile?: import('../../types/user-profile.js').UserProfile | null;
    /** User's subscription tier */
    subscriptionTier?: 'free' | 'friend' | 'partner';
    /** Skip unlock validation (for testing) */
    skipUnlockCheck?: boolean;
    /**
     * FIX BUG #6: Recent conversation messages to pass to the new persona.
     * This ensures the new agent has context of what was just discussed.
     */
    recentMessages?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    /** Current emotional state of the user */
    emotionalState?: string;
    /** Topics discussed in the conversation */
    topics?: string[];
    /** Voice emotion for better-than-human entrance adaptation */
    voiceEmotion?: {
        voiceEmotion?: string;
        voiceConfidence?: number;
        arousal?: number;
        valence?: number;
        hasVoiceStrain?: boolean;
        hasVoiceTremor?: boolean;
    };
}
export interface HandoffResult {
    success: boolean;
    error?: string;
    targetAgent: string;
    targetAgentName: string;
    previousAgent: string;
    greeting: string;
    contextContinuation?: string;
    instructions?: string;
    voiceId?: string;
    rateLimited?: boolean;
    /** FIX: Indicates greeting was actually spoken by handler */
    greetingSpoken?: boolean;
    /** FIX: Indicates LLM instructions were updated by handler */
    instructionsUpdated?: boolean;
}
/**
 * Execute a handoff to another agent.
 *
 * This is the main entry point for all handoffs. It:
 * 1. Validates the handoff is allowed
 * 2. Gets agent information from registry
 * 3. Generates an appropriate greeting
 * 4. Emits the voiceSwitch event
 * 5. Returns the handoff result
 *
 * @param targetAgentId - The agent to hand off to
 * @param reason - The reason for the handoff
 * @param options - Additional options
 * @returns HandoffResult with success status and details
 */
export declare function executeHandoff(targetAgentId: string, reason: string, options?: ExecuteHandoffOptions): Promise<HandoffResult>;
export { getHandoffHistory, getLastHandoff, clearHandoffHistory } from './state.js';
export default executeHandoff;
//# sourceMappingURL=executor.d.ts.map