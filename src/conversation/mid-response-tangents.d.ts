/**
 * Mid-Response Tangent System
 *
 * Creates those magical "Oh, that reminds me..." moments that make
 * conversations feel alive. Real people don't just answer questions -
 * they have associations, memories, and sudden connections.
 *
 * Key Insight: Tangents are NOT random. They reveal:
 * - What matters to the persona (values)
 * - How their mind works (associations)
 * - Their lived experience (memories)
 * - Their humanity (getting sidetracked)
 *
 * When to Tangent:
 * - After establishing main point (not before)
 * - When momentum is cruising (not intimate/peaking)
 * - When topic triggers genuine association
 * - Rarely (max 1 per 5-7 turns)
 *
 * @module conversation/mid-response-tangents
 */
import { type ThemeCategory } from '../services/session-variety-tracker.js';
export interface TangentTrigger {
    /** Keywords that trigger this tangent */
    keywords: string[];
    /** The tangent text to inject */
    tangent: string;
    /** Theme category for variety tracking */
    theme: ThemeCategory;
    /** How the tangent connects back */
    reconnection: string;
    /** Minimum relationship depth (0-3) */
    minRelationship?: number;
    /** Weight for selection (higher = more likely) */
    weight?: number;
}
export interface TangentDecision {
    shouldTangent: boolean;
    tangent?: TangentTrigger;
    reason: string;
    /** Where to insert tangent (only present when shouldTangent is true) */
    insertionPoint?: 'after_first_sentence' | 'mid_response' | 'before_conclusion';
}
export interface TangentProfile {
    /** How likely to tangent when conditions are right (0-1) */
    tangentProbability: number;
    /** Minimum turns between tangents */
    cooldownTurns: number;
    /** Whether persona tends toward personal tangents */
    personalTangents: boolean;
    /** Whether persona tends toward philosophical tangents */
    philosophicalTangents: boolean;
    /** Tangent triggers specific to this persona */
    triggers: TangentTrigger[];
}
declare const DEFAULT_TANGENT_PROFILE: TangentProfile;
declare const FERNI_TANGENT_PROFILE: TangentProfile;
declare const TANGENT_PROFILES: Record<string, TangentProfile>;
/**
 * Decide whether to inject a tangent and which one
 */
export declare function decideTangent(sessionId: string, personaId: string, userText: string, turnCount: number, relationshipDepth?: number): TangentDecision;
/**
 * Apply tangent to response text
 */
export declare function applyTangent(responseText: string, decision: TangentDecision): string;
export declare function resetTangentState(sessionId: string): void;
export declare function resetAllTangentStates(): void;
export { DEFAULT_TANGENT_PROFILE, FERNI_TANGENT_PROFILE, TANGENT_PROFILES };
//# sourceMappingURL=mid-response-tangents.d.ts.map