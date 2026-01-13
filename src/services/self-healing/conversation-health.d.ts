/**
 * Conversation Health Awareness
 *
 * Integrates self-healing system into Ferni's conversational abilities.
 * "Better than human" means being transparent about our limitations.
 *
 * Features:
 * - Real-time health monitoring during conversations
 * - Proactive communication about service issues
 * - Warm, human explanations of technical problems
 * - Recovery announcements when issues resolve
 *
 * This makes Ferni feel more human - she acknowledges when things
 * aren't working perfectly, just like a real person would.
 */
export interface HealthContext {
    /** Overall system health */
    overallHealth: 'healthy' | 'degraded' | 'critical';
    /** Services that are having issues */
    degradedServices: string[];
    /** Human-friendly summary for LLM context */
    contextSummary: string;
    /** Whether to proactively mention health status */
    shouldMentionHealth: boolean;
    /** Specific capabilities that are affected */
    affectedCapabilities: string[];
    /** Recovery messages if services just recovered */
    recoveryMessages: string[];
}
export interface HealthAwarenessConfig {
    /** How often to check health (ms) */
    checkIntervalMs: number;
    /** Whether to proactively mention degradation */
    proactiveCommunication: boolean;
    /** Minimum time between health mentions (ms) */
    mentionCooldownMs: number;
    /** Whether to announce recoveries */
    announceRecoveries: boolean;
}
/**
 * Phrases Ferni uses to mention service issues
 * These are warm, human, and non-technical
 */
declare const DEGRADATION_PHRASES: {
    music: string[];
    weather: string[];
    calendar: string[];
    smartHome: string[];
    memory: string[];
    general: string[];
};
/**
 * Phrases Ferni uses to announce recovery
 */
declare const RECOVERY_PHRASES: {
    music: string[];
    weather: string[];
    calendar: string[];
    smartHome: string[];
    memory: string[];
    general: string[];
};
/**
 * Context injections for LLM prompts when services are degraded
 */
declare const CONTEXT_INJECTIONS: {
    music: string;
    weather: string;
    calendar: string;
    smartHome: string;
    memory: string;
    ai: string;
    voice: string;
};
/**
 * Configure health awareness behavior
 */
export declare function configureHealthAwareness(newConfig: Partial<HealthAwarenessConfig>): void;
/**
 * Get current health context for conversation
 *
 * Call this before generating LLM responses to inject health awareness.
 */
export declare function getHealthContext(): HealthContext;
/**
 * Get a proactive health message if appropriate
 *
 * Call this when starting a conversation or after a pause to see
 * if Ferni should mention any health issues.
 */
export declare function getProactiveHealthMessage(): string | null;
/**
 * Get recovery announcement if services just recovered
 */
export declare function getRecoveryAnnouncement(): string | null;
/**
 * Generate context injection for LLM system prompt
 *
 * Add this to the system prompt to make Ferni aware of health status.
 */
export declare function getSystemPromptInjection(): string;
/**
 * Handle an error during conversation
 *
 * Returns a human-friendly message Ferni can say.
 */
export declare function handleConversationError(error: Error): string;
/**
 * Check if a specific capability is available
 *
 * Use this before attempting operations that might fail.
 */
export declare function checkCapability(capability: 'music' | 'weather' | 'calendar' | 'smartHome' | 'memory'): {
    available: boolean;
    message?: string;
};
/**
 * Create a health-aware wrapper for tool execution
 *
 * Wraps tool execution with health checks and error handling.
 */
export declare function withHealthAwareness<T>(capability: 'music' | 'weather' | 'calendar' | 'smartHome' | 'memory', operation: () => Promise<T>): Promise<{
    success: true;
    result: T;
} | {
    success: false;
    message: string;
}>;
/**
 * Hook: Called at start of conversation
 */
export declare function onConversationStart(): {
    healthContext: HealthContext;
    openingHealthMessage?: string;
};
/**
 * Hook: Called during conversation pauses
 */
export declare function onConversationPause(): string | null;
/**
 * Hook: Called before LLM generates response
 */
export declare function beforeLLMResponse(): {
    systemPromptAddition: string;
    preResponseMessage?: string;
};
export { DEGRADATION_PHRASES, RECOVERY_PHRASES, CONTEXT_INJECTIONS };
//# sourceMappingURL=conversation-health.d.ts.map