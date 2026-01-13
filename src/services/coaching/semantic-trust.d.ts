/**
 * Semantic Trust Signal Detection
 *
 * Enhanced trust signal detection using semantic similarity.
 * Catches nuanced trust moments that keyword matching misses:
 *
 * - "The funeral was... fine" → False fine + heavy topic
 * - "Can I tell you something weird?" → Permission seeking
 * - "I used to get so angry, but now..." → Growth reflection
 * - "Remember that time we talked about..." → Rapport callback
 *
 * @module SemanticTrust
 */
export type TrustSignalType = 'boundary' | 'permission' | 'growth' | 'sensitive' | 'rapport' | 'deflection' | 'vulnerability' | 'false_fine' | 'none';
export interface TrustSignal {
    type: TrustSignalType;
    confidence: number;
    reason: string;
    suggestedApproach?: string;
    relatedContext?: {
        topic?: string;
        emotion?: string;
        historyReference?: string;
    };
}
/**
 * Detect trust signals from user message
 */
export declare function detectTrustSignals(message: string): TrustSignal[];
/**
 * Get the most significant trust signal
 */
export declare function detectPrimaryTrustSignal(message: string): TrustSignal;
export { detectTrustSignals as default };
//# sourceMappingURL=semantic-trust.d.ts.map