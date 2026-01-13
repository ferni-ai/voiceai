/**
 * Cognitive Intelligence Types
 *
 * Defines HOW a persona THINKS, not just how they feel or sound.
 * This creates truly differentiated AI personalities that reason differently,
 * notice different things, and have distinct cognitive blind spots.
 *
 * Philosophy: Humans don't just have different personalities - they have
 * different cognitive styles. A data analyst and a therapist don't just
 * feel differently, they THINK differently about the same problem.
 */
/**
 * Primary reasoning approach
 * - 'analytical': Works from data → patterns → conclusions (Peter)
 * - 'intuitive': Trusts gut feelings, sees wholes before parts (Nayan)
 * - 'empathetic': Reasons through emotional lens first (Maya)
 * - 'systematic': Step-by-step, process-oriented (Alex)
 * - 'narrative': Thinks in stories, metaphors, journeys (Ferni)
 * - 'pragmatic': What works? Outcome-focused (Jordan)
 */
export type ReasoningStyle = 'analytical' | 'intuitive' | 'empathetic' | 'systematic' | 'narrative' | 'pragmatic';
/**
 * Decision-making approach when uncertain
 * - 'explore': Gather more data before deciding
 * - 'converge': Make a decision and adjust
 * - 'synthesize': Try to find middle ground
 * - 'defer': Hand off to expert or user
 */
export type UncertaintyResponse = 'explore' | 'converge' | 'synthesize' | 'defer';
export interface AttentionProfile {
    /**
     * What this persona naturally focuses on in conversation
     * These are detected and highlighted in their responses
     */
    primaryFocus: AttentionFocus[];
    /**
     * What this persona tends to overlook or deprioritize
     * Creates natural "blind spots" for humanization
     */
    blindSpots: AttentionFocus[];
    /**
     * Triggers that make this persona want to dig deeper
     * "Wait, tell me more about that..."
     */
    curiosityTriggers: string[];
    /**
     * Topics that make their attention "light up"
     * They become more engaged, ask follow-up questions
     */
    attentionMagnets: string[];
    /**
     * How long they stay on one thread before naturally shifting
     * 0.0 = very distractible, 1.0 = laser focused
     */
    focusPersistence: number;
}
export type AttentionFocus = 'emotions' | 'patterns' | 'relationships' | 'systems' | 'meaning' | 'actions' | 'possibilities' | 'history' | 'details' | 'big_picture' | 'risks' | 'opportunities';
export interface TheoryOfMindConfig {
    /**
     * How much this persona adapts explanations to user knowledge
     * 0.0 = assumes everyone knows what they know
     * 1.0 = constantly checks and calibrates
     */
    adaptiveness: number;
    /**
     * Default assumption about user expertise when unknown
     * - 'novice': Explain everything
     * - 'intermediate': Some background assumed
     * - 'expert': Assume domain knowledge
     */
    defaultExpertiseAssumption: 'novice' | 'intermediate' | 'expert';
    /**
     * Phrases used to check user understanding
     */
    comprehensionChecks: string[];
    /**
     * Phrases used when realizing user knows more than assumed
     */
    expertiseRecognition: string[];
    /**
     * Phrases used when realizing explanation was too advanced
     */
    simplificationPhrases: string[];
    /**
     * How this persona handles misunderstandings
     */
    misunderstandingRecovery: string[];
}
export interface CognitiveBiasConfig {
    /**
     * Primary biases this persona exhibits
     * Makes them feel more human, less like an oracle
     */
    primaryBiases: CognitiveBias[];
    /**
     * How strongly biases manifest (0.0 - 1.0)
     * Higher = more noticeable, lower = subtle
     */
    biasIntensity: number;
    /**
     * Whether this persona can recognize their own biases
     * Enables self-awareness moments: "I might be biased toward..."
     */
    selfAwareness: boolean;
    /**
     * Phrases for when they catch themselves being biased
     */
    biasRecognitionPhrases: string[];
}
export interface CognitiveBias {
    /** Type of cognitive bias */
    type: CognitiveBiasType;
    /** Description of how it manifests */
    manifestation: string;
    /** Trigger contexts for this bias */
    triggers: string[];
}
export type CognitiveBiasType = 'optimism_bias' | 'data_over_feeling' | 'efficiency_tunnel' | 'empathy_projection' | 'planning_fallacy' | 'hindsight_clarity' | 'action_bias' | 'analysis_paralysis' | 'novelty_seeking' | 'status_quo_bias' | 'confirmation_seeking' | 'recency_weighting';
export interface MetacognitionConfig {
    /**
     * How often this persona reflects on their own reasoning
     * "Let me think about why I'm suggesting this..."
     */
    reflectionFrequency: number;
    /**
     * Areas where this persona knows they're strong
     */
    knownStrengths: string[];
    /**
     * Areas where this persona knows they're limited
     * Enables honest "I'm not sure" moments
     */
    knownLimitations: string[];
    /**
     * Phrases for expressing uncertainty appropriately
     */
    uncertaintyExpressions: UncertaintyExpression[];
    /**
     * How this persona signals confidence levels
     */
    confidenceSignaling: ConfidenceLevel[];
    /**
     * Phrases for admitting mistakes or changing mind
     */
    mindChangeExpressions: string[];
}
export interface UncertaintyExpression {
    /** Confidence level (0.0 - 1.0) */
    confidenceRange: [number, number];
    /** Phrases to use at this confidence level */
    phrases: string[];
}
export interface ConfidenceLevel {
    /** Name of this confidence band */
    name: 'very_confident' | 'confident' | 'uncertain' | 'speculating' | 'guessing';
    /** Phrases that signal this confidence level */
    markers: string[];
}
export interface InformationProcessingStyle {
    /**
     * Balance between fast (System 1) and slow (System 2) thinking
     * 0.0 = All intuitive/quick
     * 1.0 = All deliberate/analytical
     */
    deliberationLevel: number;
    /**
     * How much context they need before responding
     * Lower = comfortable with ambiguity
     * Higher = needs full picture
     */
    contextRequirement: number;
    /**
     * Preferred information format
     * - 'stories': Prefers narrative context
     * - 'data': Prefers numbers and facts
     * - 'examples': Prefers concrete cases
     * - 'principles': Prefers general rules
     */
    preferredFormat: 'stories' | 'data' | 'examples' | 'principles';
    /**
     * How they handle conflicting information
     * - 'integrate': Try to reconcile
     * - 'prioritize': Pick the most relevant
     * - 'acknowledge': Surface the tension
     */
    conflictResolution: 'integrate' | 'prioritize' | 'acknowledge';
    /**
     * Phrases showing their thinking process
     */
    thinkingAloudPhrases: string[];
}
export interface CognitiveProfile {
    /**
     * Primary reasoning style
     */
    reasoningStyle: ReasoningStyle;
    /**
     * Secondary reasoning style (used situationally)
     */
    secondaryReasoning?: ReasoningStyle;
    /**
     * How they handle uncertainty
     */
    uncertaintyResponse: UncertaintyResponse;
    /**
     * What they notice and miss
     */
    attention: AttentionProfile;
    /**
     * How they model user knowledge
     */
    theoryOfMind: TheoryOfMindConfig;
    /**
     * Humanizing cognitive biases
     */
    biases: CognitiveBiasConfig;
    /**
     * Self-awareness about thinking
     */
    metacognition: MetacognitionConfig;
    /**
     * How they process information
     */
    informationProcessing: InformationProcessingStyle;
    /**
     * Signature cognitive phrases unique to this persona
     * Used to make their thinking style audibly distinct
     */
    signatureThinkingPhrases: string[];
}
/**
 * Context for applying cognitive intelligence
 */
export interface CognitiveContext {
    /** Current topic being discussed */
    currentTopic: string;
    /** User's apparent expertise level on this topic */
    userExpertise: 'novice' | 'intermediate' | 'expert' | 'unknown';
    /** Whether the situation is emotionally charged */
    emotionalWeight: number;
    /** Complexity of the current question */
    questionComplexity: 'simple' | 'moderate' | 'complex' | 'ambiguous';
    /** Turn count in conversation */
    turnCount: number;
    /** Previous reasoning approaches used */
    previousApproaches: ReasoningStyle[];
}
/**
 * Result of applying cognitive processing
 */
export interface CognitiveGuidance {
    /** Suggested reasoning approach for this context */
    recommendedApproach: ReasoningStyle;
    /** Attention cues to include */
    attentionCues: string[];
    /** Bias warnings to be aware of */
    biasAlerts: string[];
    /** Theory of mind adjustments */
    expertiseAdjustment: string;
    /** Confidence level for this response */
    confidenceLevel: number;
    /** Phrases to incorporate */
    suggestedPhrases: string[];
    /** Whether to show thinking process */
    showReasoning: boolean;
}
export default CognitiveProfile;
//# sourceMappingURL=cognitive-types.d.ts.map