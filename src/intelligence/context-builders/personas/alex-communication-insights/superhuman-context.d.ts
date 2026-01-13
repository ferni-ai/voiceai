/**
 * Superhuman Communication Context for Alex
 *
 * Integrates the 10 "Better Than Human" communication capabilities:
 *
 * 1. Communication Archaeology - Perfect recall of past conversations
 * 2. Relationship Temperature - Track gradual drift
 * 3. Unsaid Words Detector - Notice what they DON'T say
 * 4. Reception Predictor - Predict how messages will land
 * 5. Apology Effectiveness - Learn what works per person
 * 6. Conflict Replay - Objective conflict analysis
 * 7. Communication Debt - Track all obligations
 * 8. Third-Party Perspective - Truly neutral viewpoints
 * 9. Strategic Silence - Know when NOT to communicate
 * 10. Unspoken Needs - Surface underlying needs
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/superhuman-context
 */
import { communicationArchaeology, unsaidWordsDetector, communicationDebt, unspokenNeeds } from '../../../../tools/domains/communication/superhuman-tools/index.js';
export interface SuperhumanCommunicationBriefing {
    /** Full context string for LLM injection */
    contextString: string;
    /** Quick summary for display */
    summary: {
        relationshipsNeedingAttention: number;
        communicationDebts: number;
        unsaidTopics: number;
        heldMessages: number;
    };
    /** Whether any urgent items need attention */
    hasUrgentItems: boolean;
}
export interface ConversationContext {
    /** Current user transcript */
    transcript?: string;
    /** Detected topics */
    topics?: string[];
    /** Mentioned person name */
    mentionedPerson?: string;
    /** Current emotion */
    emotion?: string;
}
/**
 * Build full superhuman communication context for Alex.
 * Use on first turn, handoffs, or when communication topics arise.
 */
export declare function buildAlexSuperhumanContext(userId: string, conversationContext?: ConversationContext): Promise<SuperhumanCommunicationBriefing>;
/**
 * Build quick superhuman context for ongoing turns.
 * Lightweight - only most actionable items.
 */
export declare function buildAlexQuickSuperhumanContext(userId: string): Promise<string>;
/**
 * Process user transcript for superhuman insights in real-time.
 * Call this on each turn to detect patterns.
 */
export declare function processTranscriptForSuperhuman(userId: string, transcript: string, context?: {
    currentTopic?: string;
}): Promise<{
    detectedDebt?: ReturnType<typeof communicationDebt.detect>[0];
    detectedUnsaid?: ReturnType<typeof unsaidWordsDetector.detect>;
    detectedNeed?: ReturnType<typeof unspokenNeeds.detect>;
    communicationMention?: ReturnType<typeof communicationArchaeology.detectMention>;
}>;
/**
 * End session and persist all tracked data.
 * Call when conversation ends.
 */
export declare function endSuperhumanSession(userId: string): Promise<void>;
export declare const alexSuperhumanContext: {
    buildFull: typeof buildAlexSuperhumanContext;
    buildQuick: typeof buildAlexQuickSuperhumanContext;
    processTranscript: typeof processTranscriptForSuperhuman;
    endSession: typeof endSuperhumanSession;
};
export default alexSuperhumanContext;
//# sourceMappingURL=superhuman-context.d.ts.map