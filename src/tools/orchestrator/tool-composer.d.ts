/**
 * Tool Composer
 *
 * Enables tools to work together for human-level conversation.
 * Provides:
 * - Tool chaining (one tool suggesting the next)
 * - Context passing between tools
 * - Response composition
 * - Emotional awareness integration
 *
 * USAGE:
 *   const composer = new ToolComposer(conversationState);
 *
 *   // Execute with context sharing
 *   const result = await composer.execute('rememberAboutUser', params);
 *
 *   // Get next suggested tools
 *   const suggestions = composer.getSuggestedTools();
 */
import { type ConversationStateManager, type EmotionalContext } from '../../services/conversation-state.js';
/**
 * Tool execution result with composition metadata
 */
export interface ComposedResult {
    /** The tool's actual result */
    result: unknown;
    /** Natural language for speech */
    speech: string;
    /** Emotion hint for TTS */
    emotion?: 'neutral' | 'happy' | 'excited' | 'concerned' | 'empathetic' | 'celebratory';
    /** Tools to consider next */
    suggestedNext: string[];
    /** Topic change detected */
    topicChange?: string;
    /** Facts to remember from this interaction */
    factsToRemember?: Array<{
        fact: string;
        category: 'personal' | 'financial' | 'emotional' | 'goal' | 'preference';
        importance: 'low' | 'medium' | 'high';
    }>;
    /** Should circle back later */
    circleBackLater?: {
        topic: string;
        reason: string;
    };
}
/**
 * Tool chain definition
 */
export interface ToolChain {
    /** Primary tool */
    primary: string;
    /** Tools that might logically follow */
    suggestedFollowers: string[];
    /** Context to pass to followers */
    contextKeys: string[];
    /** Emotion typically associated with this tool */
    typicalEmotion?: ComposedResult['emotion'];
}
/**
 * Composed execution options
 */
export interface ComposeOptions {
    /** Share context with next tools */
    shareContext?: boolean;
    /** Auto-detect topic changes */
    detectTopicChange?: boolean;
    /** Extract facts to remember */
    extractFacts?: boolean;
    /** Override emotion */
    emotion?: ComposedResult['emotion'];
}
/**
 * Predefined tool chains for common conversation patterns
 */
export declare const TOOL_CHAINS: Record<string, ToolChain>;
export declare class ToolComposer {
    private state;
    private context;
    private logger;
    constructor(sessionId: string, userId?: string, agentId?: string);
    /**
     * Get the conversation state manager
     */
    getState(): ConversationStateManager;
    /**
     * Set context value for sharing between tools
     */
    setContext(key: string, value: unknown): void;
    /**
     * Get context value
     */
    getContext<T>(key: string): T | undefined;
    /**
     * Clear context
     */
    clearContext(): void;
    /**
     * Compose a tool result with metadata
     */
    compose(toolName: string, result: unknown, options?: ComposeOptions): ComposedResult;
    /**
     * Get suggested next tools based on conversation state
     */
    getSuggestedTools(): string[];
    /**
     * Check if we should wrap up
     */
    shouldWrapUp(): {
        should: boolean;
        reasons: string[];
    };
    /**
     * Get emotional context for voice modulation
     */
    getEmotionalContext(): EmotionalContext;
    /**
     * Get conversation summary for LLM context
     */
    getConversationSummary(): string;
    /**
     * Get a circle-back topic if any pending
     */
    getCircleBackTopic(): {
        topic: string;
        reason: string;
    } | null;
    /**
     * Add a topic to circle back to later
     */
    addCircleBack(topic: string, reason: string): void;
}
/**
 * Create a tool composer for a session
 */
export declare function createToolComposer(sessionId: string, userId?: string, agentId?: string): ToolComposer;
declare const _default: {
    ToolComposer: typeof ToolComposer;
    createToolComposer: typeof createToolComposer;
    TOOL_CHAINS: Record<string, ToolChain>;
};
export default _default;
//# sourceMappingURL=tool-composer.d.ts.map