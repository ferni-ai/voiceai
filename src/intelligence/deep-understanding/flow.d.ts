/**
 * Conversational Flow Optimizer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Knowing when to go deep vs. keep light - managing the rhythm of
 * conversation with the skill of a master therapist.
 *
 * Understanding when someone is opening up, reaching capacity,
 * needs a breather, or is seeking deeper connection.
 *
 * This is superhuman because it requires tracking multiple signals
 * simultaneously and making real-time decisions about direction.
 */
export type ConversationDepth = 'surface' | 'medium' | 'deep' | 'vulnerable';
export type FlowDirection = 'deepen' | 'maintain' | 'lighten' | 'close' | 'pause';
export type UserSignal = 'opening_up' | 'pulling_back' | 'reaching_capacity' | 'seeking_closeness' | 'needs_breather' | 'ready_to_close' | 'stable';
export interface DepthIndicators {
    /** Content indicators */
    content: {
        personalPronouns: number;
        vulnerableTopics: boolean;
        emotionalLanguage: number;
        specificity: number;
        selfDisclosure: number;
    };
    /** Voice indicators (if available) */
    voice: {
        softerVolume: boolean;
        slowerPace: boolean;
        emotionalBreaks: boolean;
        hesitations: number;
    };
    /** Engagement indicators */
    engagement: {
        responseLength: number;
        questionAsking: boolean;
        topicContinuity: boolean;
        timeInConversation: number;
    };
}
export interface FlowState {
    /** Current conversation depth */
    currentDepth: ConversationDepth;
    /** How long at current depth (turns) */
    turnsAtDepth: number;
    /** Optimal depth for this user/session */
    optimalDepth: ConversationDepth;
    /** Signals from user */
    userSignals: UserSignal[];
    /** Recommended next move */
    recommendedDirection: FlowDirection;
    /** Natural exit points available */
    exitPoints: string[];
    /** Why we recommend this direction */
    reasoning: string;
}
export interface FlowTransition {
    /** When to transition */
    timing: 'now' | 'next_turn' | 'when_natural' | 'user_initiated';
    /** How to transition */
    technique: string;
    /** Sample phrases */
    phrases: string[];
    /** What to avoid */
    avoid: string[];
}
export interface FlowProfile {
    userId: string;
    /** How deep they typically go */
    typicalDepth: ConversationDepth;
    /** How long they stay at depth before needing a break */
    depthStamina: number;
    /** Preferred pace of deepening */
    deepeningPace: 'slow' | 'moderate' | 'fast';
    /** Signs they're overwhelmed */
    overwhelmSigns: string[];
    /** Signs they want to go deeper */
    deepeningSigns: string[];
    /** Average conversation length */
    avgConversationLength: number;
    /** Observations count */
    observations: number;
}
/**
 * Get or create flow profile
 */
export declare function getFlowProfile(userId: string): FlowProfile;
export interface FlowAnalysis {
    /** Current state assessment */
    state: FlowState;
    /** Depth indicators from this message */
    indicators: DepthIndicators;
    /** Transition recommendation */
    transition: FlowTransition;
    /** Guidance for response */
    responseGuidance: {
        depth: ConversationDepth;
        length: 'brief' | 'normal' | 'extended';
        tone: string;
        focusOn: string;
    };
}
/**
 * Analyze conversation flow
 */
export declare function analyzeFlow(userId: string, sessionId: string, text: string, turnCount: number, emotionIntensity: number, voiceData?: {
    pace: number;
    volume: number;
    hasHesitations: boolean;
}): FlowAnalysis;
/**
 * Format flow analysis for prompt injection
 */
export declare function formatFlowForPrompt(analysis: FlowAnalysis): string;
/**
 * Import a flow profile into memory (for persistence)
 */
export declare function importFlowProfile(profile: FlowProfile): void;
/**
 * Reset all conversational flow state (for testing)
 */
export declare function resetConversationalFlow(): void;
declare const _default: {
    getFlowProfile: typeof getFlowProfile;
    analyzeFlow: typeof analyzeFlow;
    formatFlowForPrompt: typeof formatFlowForPrompt;
    resetConversationalFlow: typeof resetConversationalFlow;
};
export default _default;
//# sourceMappingURL=flow.d.ts.map