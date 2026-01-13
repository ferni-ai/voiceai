/**
 * Cognitive Differentiation - Extended Persona Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module extends the cognitive profile system with deeper differentiation:
 * - How each persona asks questions
 * - How they interpret silence
 * - How they disagree
 * - How they frame insights
 * - Their response pacing patterns
 *
 * The goal: Each persona should feel distinctly different, not just in
 * personality but in HOW they think and engage.
 */
import type { PersonaId } from './types.js';
export interface QuestioningStyle {
    /** Open-ended vs closed questions (0=closed, 1=open) */
    openVsClosed: number;
    /** Feeling-focused vs data-focused (0=data, 1=feeling) */
    feelingVsData: number;
    /** Why-focused vs how-focused (0=how, 1=why) */
    whyVsHow: number;
    /** How often they ask follow-up questions (0-1) */
    followUpFrequency: number;
    /** Typical question starters */
    questionStarters: string[];
    /** Deep dive questions for their domain */
    deepDiveQuestions: string[];
    /** Questions they would never ask */
    avoidQuestions: string[];
}
export type SilenceInterpretation = 'reflection' | 'confusion' | 'resistance' | 'processing' | 'emotional' | 'invitation' | 'discomfort' | 'waiting';
export interface SilenceHandling {
    /** Primary interpretation of silence */
    primaryInterpretation: SilenceInterpretation;
    /** How long to wait before responding (ms) */
    comfortWithSilence: number;
    /** What to do during silence */
    silenceResponses: {
        short: string[];
        medium: string[];
        long: string[];
    };
    /** How to break silence */
    silenceBreakers: string[];
}
export type DisagreementStyle = 'gentle' | 'curious' | 'direct' | 'supportive' | 'philosophical' | 'data_driven' | 'gentle_question' | 'direct_but_warm' | 'evidence_based' | 'reframe';
export interface DisagreementApproach {
    /** Primary style */
    primaryStyle: DisagreementStyle;
    /** Secondary style (when primary doesn't work) */
    secondaryStyle: DisagreementStyle;
    /** How often they disagree (0-1) */
    disagreementFrequency: number;
    /** Topics they will always push back on */
    strongOpinionTopics: string[];
    /** Phrases for disagreeing */
    disagreementPhrases: {
        mild: string[];
        moderate: string[];
        strong: string[];
    };
    /** Recovery phrases after disagreement */
    reconciliationPhrases: string[];
}
export type InsightFramingStyle = 'story' | 'data' | 'metaphor' | 'question' | 'principle' | 'example' | 'direct' | 'observation' | 'reflection' | 'hypothesis';
export interface InsightFraming {
    /** Primary framing style */
    primaryFraming: InsightFramingStyle;
    /** Alternate framings by context */
    contextualFraming: {
        emotional: InsightFramingStyle;
        analytical: InsightFramingStyle;
        actionable: InsightFramingStyle;
    };
    /** Insight lead-ins */
    insightLeadIns: string[];
    /** How to soften insights */
    softeners: string[];
    /** How to emphasize insights */
    amplifiers: string[];
}
export interface ResponsePacing {
    /** Base thinking time (ms) */
    baseThinkingTime: number;
    /** Additional time for complex questions */
    complexityMultiplier: number;
    /** Additional time for emotional topics */
    emotionalMultiplier: number;
    /** How often to pause mid-response (0-1) */
    midResponsePauseFrequency: number;
    /** How to signal thinking */
    thinkingSignals: string[];
    /** How to signal processing */
    processingSignals: string[];
    /** Pause duration before uncertain statements (ms) */
    uncertaintyPause?: number;
    /** Topics that require slower, more deliberate pacing */
    breathingTopics?: string[];
}
export interface CognitiveDifferentiation {
    personaId: PersonaId;
    questioning: QuestioningStyle;
    silence: SilenceHandling;
    disagreement: DisagreementApproach;
    insight: InsightFraming;
    pacing: ResponsePacing;
}
export declare const ferniDifferentiation: CognitiveDifferentiation;
export declare const peterDifferentiation: CognitiveDifferentiation;
export declare const alexDifferentiation: CognitiveDifferentiation;
export declare const mayaDifferentiation: CognitiveDifferentiation;
export declare const jordanDifferentiation: CognitiveDifferentiation;
export declare const nayanDifferentiation: CognitiveDifferentiation;
export declare const cognitiveDifferentiation: Record<string, CognitiveDifferentiation>;
/**
 * Get cognitive differentiation profile for a persona
 */
export declare function getCognitiveDifferentiation(personaId: string): CognitiveDifferentiation | undefined;
/**
 * Get a question for a persona based on context
 */
export declare function getPersonaQuestion(personaId: string, type: 'starter' | 'deep_dive'): string | undefined;
/**
 * Get a disagreement phrase based on intensity
 */
export declare function getDisagreementPhrase(personaId: string, intensity: 'mild' | 'moderate' | 'strong'): string | undefined;
/**
 * Get an insight lead-in for a persona
 */
export declare function getInsightLeadIn(personaId: string): string | undefined;
export default cognitiveDifferentiation;
//# sourceMappingURL=cognitive-differentiation.d.ts.map