/**
 * Crisis Response System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Generates warm, human responses to crisis situations.
 * Never abandons the user while connecting them to appropriate resources.
 *
 * Philosophy:
 * - "I'm here, AND I want you to have more support"
 * - Validate feelings before offering resources
 * - Warm language, not clinical
 * - Stay present throughout
 *
 * @module CrisisResponse
 */
import type { CrisisSignal, CrisisType } from './crisis-detection.js';
export interface CrisisResource {
    name: string;
    description: string;
    phone?: string;
    text?: string;
    chat?: string;
    available: string;
    specialization?: string[];
}
export interface CrisisResponseContent {
    /** The empathetic opening (validation) */
    validation: string;
    /** The offer to stay present */
    presence: string;
    /** The warm resource introduction (if applicable) */
    resourceIntro?: string;
    /** Primary resource to offer */
    primaryResource?: CrisisResource;
    /** Additional resources */
    additionalResources?: CrisisResource[];
    /** Follow-up question to keep engaged */
    followUp: string;
    /** Full combined response text */
    fullResponse: string;
    /** SSML version with appropriate pauses and tone */
    ssml: string;
}
export interface CrisisResponseContext {
    /** The crisis signal being responded to */
    signal: CrisisSignal;
    /** User's name (if known) */
    userName?: string;
    /** Persona generating the response */
    personaId: string;
    /** Time of day */
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    /** Whether this is the first crisis mention in session */
    isFirstMention: boolean;
}
/**
 * Generate a warm, human crisis response
 */
export declare function generateCrisisResponse(context: CrisisResponseContext): CrisisResponseContent;
/**
 * Get additional resources for a crisis type (for follow-up or data message)
 */
export declare function getCrisisResources(crisisType: CrisisType): CrisisResource[];
/**
 * Generate a grounding exercise for panic/severe distress
 */
export declare function getGroundingExercise(): string;
/**
 * Generate a safety check question
 */
export declare function getSafetyCheckQuestion(crisisType: CrisisType): string;
declare const _default: {
    generateCrisisResponse: typeof generateCrisisResponse;
    getCrisisResources: typeof getCrisisResources;
    getGroundingExercise: typeof getGroundingExercise;
    getSafetyCheckQuestion: typeof getSafetyCheckQuestion;
};
export default _default;
//# sourceMappingURL=crisis-response.d.ts.map