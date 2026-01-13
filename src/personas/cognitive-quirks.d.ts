/**
 * Cognitive Quirks - Unique Thinking Patterns
 *
 * Each persona has distinctive cognitive quirks that make them
 * feel genuinely different. These go beyond reasoning style to
 * include unique mental habits, thought patterns, and idiosyncrasies.
 *
 * These quirks make personas feel like real people with real minds.
 */
export interface CognitiveQuirk {
    /** Name of the quirk */
    name: string;
    /** Description of how it manifests */
    description: string;
    /** Triggers that activate this quirk */
    triggers: string[];
    /** Example phrases that embody this quirk */
    examplePhrases: string[];
    /** How often this quirk appears (0-1) */
    frequency: number;
}
export interface MentalHabit {
    /** What they naturally do when thinking */
    habit: string;
    /** When they do it */
    when: string;
    /** How it sounds in conversation */
    manifestation: string;
}
export interface ThoughtPattern {
    /** Name of the pattern */
    name: string;
    /** The sequence of mental steps */
    sequence: string[];
    /** When this pattern is triggered */
    triggers: string[];
}
export interface PersonaCognitiveQuirks {
    /** Unique cognitive quirks */
    quirks: CognitiveQuirk[];
    /** Mental habits */
    mentalHabits: MentalHabit[];
    /** Distinctive thought patterns */
    thoughtPatterns: ThoughtPattern[];
    /** Signature transitions between ideas */
    transitionPhrases: string[];
    /** What makes them light up cognitively */
    cognitiveJoys: string[];
    /** What frustrates them cognitively */
    cognitiveFrustrations: string[];
    /** Their internal monologue style */
    internalMonologueStyle: string;
}
export declare const ferniQuirks: PersonaCognitiveQuirks;
export declare const peterQuirks: PersonaCognitiveQuirks;
export declare const alexQuirks: PersonaCognitiveQuirks;
export declare const mayaQuirks: PersonaCognitiveQuirks;
export declare const jordanQuirks: PersonaCognitiveQuirks;
export declare const nayanQuirks: PersonaCognitiveQuirks;
export declare const personaCognitiveQuirks: Record<string, PersonaCognitiveQuirks>;
/**
 * Get cognitive quirks for a persona
 */
export declare function getCognitiveQuirks(personaId: string): PersonaCognitiveQuirks | undefined;
/**
 * Get a random activated quirk based on context
 */
export declare function getActiveQuirk(personaId: string, contextText: string): CognitiveQuirk | null;
/**
 * Get a random transition phrase for a persona
 */
export declare function getTransitionPhrase(personaId: string): string | null;
declare const _default: {
    getCognitiveQuirks: typeof getCognitiveQuirks;
    getActiveQuirk: typeof getActiveQuirk;
    getTransitionPhrase: typeof getTransitionPhrase;
    personaCognitiveQuirks: Record<string, PersonaCognitiveQuirks>;
};
export default _default;
//# sourceMappingURL=cognitive-quirks.d.ts.map