/**
 * Escalation Classifier
 *
 * > "Better than human means knowing when a human is needed."
 *
 * Determines when and where to transfer to human help.
 * Integrates with existing crisis detection from emotional-first-aid.ts
 *
 * @module services/human-transfer/escalation-classifier
 */
import type { EscalationDecision, CrisisSignals } from './types.js';
/**
 * Detect crisis signals from transcript text
 */
export declare function detectCrisisSignals(transcript: string): CrisisSignals;
/**
 * Classify what type of escalation is needed
 */
export declare function classifyEscalation(signals: CrisisSignals, conversationContext?: string): EscalationDecision;
/**
 * Enhanced classification with conversation history
 */
export declare function classifyWithContext(currentTranscript: string, conversationHistory: string[], userProfile?: {
    hasTherapist?: boolean;
    inTreatment?: boolean;
    knownDiagnoses?: string[];
    safetyPlanExists?: boolean;
}): EscalationDecision;
export declare const escalationClassifier: {
    detectCrisisSignals: typeof detectCrisisSignals;
    classifyEscalation: typeof classifyEscalation;
    classifyWithContext: typeof classifyWithContext;
};
//# sourceMappingURL=escalation-classifier.d.ts.map