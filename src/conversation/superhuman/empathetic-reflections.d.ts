/**
 * Empathetic Reflections System
 *
 * > "It sounds like you're feeling overwhelmed, and that makes total sense."
 *
 * Generates contextually appropriate empathetic reflections that:
 * - Mirror back what the user is feeling
 * - Validate their experience
 * - Show genuine understanding
 * - Avoid being repetitive or formulaic
 *
 * This is different from generic "I hear you" - these are specific,
 * tailored reflections that prove Ferni truly understands.
 *
 * @module @ferni/superhuman/empathetic-reflections
 */
export type ReflectionType = 'feeling' | 'experience' | 'meaning' | 'validation' | 'need' | 'strength';
export interface Reflection {
    /** The reflection text */
    text: string;
    /** Type of reflection */
    type: ReflectionType;
    /** How deep/intense this reflection is */
    intensity: 'light' | 'moderate' | 'deep';
    /** SSML-enhanced version */
    ssml?: string;
}
export interface ReflectionContext {
    /** Detected emotion */
    emotion: string;
    /** Topics discussed */
    topics: string[];
    /** Original user message */
    message: string;
    /** Is this personal sharing? */
    isPersonalSharing: boolean;
    /** Relationship depth */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';
    /** Current session turn */
    turnCount: number;
}
/**
 * Generate an empathetic reflection based on context
 * Now LLM-powered with template fallback!
 */
export declare function generateReflection(context: ReflectionContext): Reflection | null;
/**
 * Generate an empathetic reflection asynchronously
 * Use this when you can afford to wait for LLM
 */
export declare function generateReflectionAsync(context: ReflectionContext): Promise<Reflection | null>;
/**
 * Format reflection guidance for LLM prompt
 */
export declare function formatReflectionGuidance(context: ReflectionContext): string | null;
export declare function clearReflectionStates(): void;
//# sourceMappingURL=empathetic-reflections.d.ts.map