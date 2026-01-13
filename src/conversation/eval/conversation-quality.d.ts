/**
 * Conversation Quality Evaluator
 *
 * A lightweight heuristic scoring system for "better-than-human" behaviors.
 * This is intentionally simple + fast: it should be safe to run in tests or
 * dev tooling without model calls.
 */
export interface ConversationQualityInput {
    userMessage: string;
    responseText: string;
    /** Optional context hints to shape scoring. */
    userEmotion?: string;
    wasPersonalSharing?: boolean;
    turnNumber?: number;
}
export interface ConversationQualityScore {
    brevity: number;
    validation: number;
    repair: number;
    followUp: number;
    overall: number;
    notes: string[];
    diagnostics: {
        responseWordCount: number;
        responseQuestionCount: number;
        responseHasSsml: boolean;
    };
}
export declare function evaluateConversationQuality(input: ConversationQualityInput): ConversationQualityScore;
//# sourceMappingURL=conversation-quality.d.ts.map