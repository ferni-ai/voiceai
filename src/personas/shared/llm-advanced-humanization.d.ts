/**
 * LLM-Powered Advanced Humanization Generator
 *
 * Generates dynamic humanization responses (subtext, aftercare, energy, affirmations)
 * using LLM, with fallback to static pools.
 *
 * This makes the "Better Than Human" capabilities truly superhuman by generating
 * contextually perfect responses rather than selecting from static pools.
 *
 * @module personas/shared/llm-advanced-humanization
 */
export type HumanizationType = 'subtext' | 'aftercare' | 'energy' | 'affirmation';
export type SubtextType = 'deflection' | 'minimizing' | 'testing_waters';
export type AftercareType = 'holding' | 'grounding';
export type EnergyType = 'matching_low' | 'matching_high' | 'leading_up' | 'grounding';
export type AffirmationType = 'acknowledgment' | 'validation' | 'encouragement';
export interface HumanizationContext {
    personaId: string;
    type: HumanizationType;
    subtype: SubtextType | AftercareType | EnergyType | AffirmationType;
    userTranscript: string;
    emotion?: string;
    distressLevel?: number;
    intensity?: number;
    relationshipStage?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late_night';
}
export interface GeneratedHumanization {
    type: HumanizationType;
    subtype: string;
    content: string;
    ssml: string;
    source: 'llm' | 'pool';
    generatedAt: Date;
}
/**
 * Generate a humanization response using LLM
 */
export declare function generateHumanizationLLM(context: HumanizationContext): Promise<GeneratedHumanization | null>;
/**
 * Clear humanization cache for a persona
 */
export declare function clearHumanizationCache(personaId: string): void;
export declare const llmHumanization: {
    generate: typeof generateHumanizationLLM;
    clearCache: typeof clearHumanizationCache;
};
//# sourceMappingURL=llm-advanced-humanization.d.ts.map