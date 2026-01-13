/**
 * Brand System Types
 *
 * Core type definitions for the AI-powered brand system.
 * These types represent structured brand rules that AI can query and apply.
 *
 * @module @ferni/brand/types
 */
/**
 * The complete brand context - everything AI needs to generate on-brand content
 */
export interface BrandContext {
    /** Core brand identity */
    identity: BrandIdentity;
    /** Voice and tone rules */
    voice: BrandVoice;
    /** Per-persona voice configurations */
    personas: Record<PersonaId, PersonaVoice>;
    /** Design tokens (colors, animation, etc.) */
    tokens: BrandTokens;
    /** Learnings from experiments */
    learnings: BrandLearnings;
    /** Version and metadata */
    meta: {
        version: string;
        lastUpdated: string;
        sourceDocs: string[];
    };
}
/**
 * Core brand identity
 */
export interface BrandIdentity {
    /** The core promise: "Better than human" */
    promise: string;
    /** Brand values: Warm, Present, Grounded, Wise */
    values: string[];
    /** What makes Ferni unique */
    superpowers: string[];
    /** What Ferni is NOT */
    antiPatterns: string[];
    /** Design philosophy keywords */
    designPhilosophy: string[];
}
/**
 * Voice and tone configuration
 */
export interface BrandVoice {
    /** Voice principles with examples */
    principles: VoicePrinciple[];
    /** Words we actively use */
    wordsToUse: WordDefinition[];
    /** Words we avoid (with alternatives) */
    wordsToAvoid: WordReplacement[];
    /** Phrases that are absolutely banned */
    bannedPhrases: string[];
    /** Tone settings by context */
    toneByContext: Record<ContextType, ToneConfig>;
    /** Sample copy for reference */
    sampleCopy: SampleCopy[];
}
/**
 * A voice principle with good/bad examples
 */
export interface VoicePrinciple {
    /** e.g., "Warm, Not Saccharine" */
    name: string;
    /** Full description */
    description: string;
    /** Bad example */
    badExample: string;
    /** Good example */
    goodExample: string;
    /** Why this matters */
    rationale: string;
}
/**
 * Word we should use
 */
export interface WordDefinition {
    word: string;
    why: string;
    examples?: string[];
}
/**
 * Word to avoid with replacement
 */
export interface WordReplacement {
    avoid: string;
    useInstead: string;
    severity: 'critical' | 'warning' | 'suggestion';
}
/**
 * Context types for tone adjustment
 */
export type ContextType = 'celebration' | 'support' | 'coaching' | 'checkin' | 'onboarding' | 'error' | 'notification' | 'marketing';
/**
 * Tone configuration for a specific context
 */
export interface ToneConfig {
    /** e.g., "Genuine joy, not over-the-top" */
    description: string;
    /** Example phrases */
    examples: string[];
    /** What to avoid in this context */
    avoid: string[];
    /** Energy level 1-5 */
    energyLevel: number;
    /** Formality level 1-5 */
    formalityLevel: number;
}
/**
 * Sample copy for reference
 */
export interface SampleCopy {
    type: 'headline' | 'body' | 'cta' | 'notification' | 'error' | 'greeting';
    context: string;
    content: string;
    notes?: string;
}
/** Valid persona IDs */
export type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan' | 'eli' | 'marcus' | 'kenji' | 'carmen' | 'amara' | 'sasha' | 'ray';
/**
 * Per-persona voice configuration
 */
export interface PersonaVoice {
    /** Persona identifier */
    id: PersonaId;
    /** Display name */
    name: string;
    /** Role description */
    role: string;
    /** Archetype (e.g., "The Warm Friend Who Really Listens") */
    archetype: string;
    /** Overall tone description */
    tone: string;
    /** Speaking style description */
    speakingStyle: string;
    /** Words this persona uses more often */
    vocabularyBias: string[];
    /** Greeting patterns */
    greetings: string[];
    /** Response patterns by context */
    responsePatterns: Record<ContextType, string[]>;
    /** Signature phrases unique to this persona */
    signaturePhrases: string[];
    /** What this persona NEVER says */
    antiPatterns: string[];
    /** Design tokens specific to this persona */
    colors: {
        primary: string;
        secondary: string;
        glow: string;
    };
}
/**
 * Design tokens for brand consistency
 */
export interface BrandTokens {
    colors: {
        primary: string;
        secondary: string;
        background: string;
        text: string;
        accent: string;
        error: string;
        warning: string;
        success: string;
    };
    animation: {
        durationFast: number;
        durationNormal: number;
        durationSlow: number;
        easingStandard: string;
        easingSpring: string;
    };
    typography: {
        fontDisplay: string;
        fontBody: string;
        fontMono: string;
    };
}
/**
 * Learnings from experiments and user feedback
 */
export interface BrandLearnings {
    /** Patterns that win in experiments */
    winningPatterns: ExperimentPattern[];
    /** Approaches that failed */
    failedApproaches: FailedApproach[];
    /** Emerging user preferences */
    emergingPreferences: UserPreference[];
}
/**
 * A pattern that wins in experiments
 */
export interface ExperimentPattern {
    /** What the pattern is */
    pattern: string;
    /** How confident we are (0-1) */
    confidence: number;
    /** Supporting experiment IDs */
    experiments: string[];
    /** When this was discovered */
    discoveredAt: string;
    /** Example content that won */
    examples: string[];
}
/**
 * An approach that failed
 */
export interface FailedApproach {
    approach: string;
    reason: string;
    experiments: string[];
    learnedAt: string;
}
/**
 * An emerging user preference
 */
export interface UserPreference {
    preference: string;
    strength: number;
    source: 'experiment' | 'feedback' | 'engagement';
    discoveredAt: string;
}
/**
 * A brand violation found during validation
 */
export interface BrandViolation {
    /** Type of violation */
    type: 'banned_word' | 'banned_phrase' | 'tone_mismatch' | 'too_corporate' | 'too_saccharine' | 'persona_mismatch' | 'missing_warmth';
    /** Severity level */
    severity: 'critical' | 'warning' | 'suggestion';
    /** The problematic text */
    text: string;
    /** Position in the content */
    position: {
        start: number;
        end: number;
    };
    /** Suggested fix */
    suggestion: string;
    /** Which rule was violated */
    rule: string;
}
/**
 * Result of brand validation
 */
export interface ValidationResult {
    /** Does it pass? */
    isCompliant: boolean;
    /** Score 0-100 */
    score: number;
    /** All violations found */
    violations: BrandViolation[];
    /** Suggestions for improvement */
    suggestions: string[];
}
/**
 * Request to generate brand content
 */
export interface GenerationRequest {
    /** What type of content */
    type: 'headline' | 'cta' | 'toast' | 'email' | 'notification' | 'response' | 'greeting';
    /** Context for generation */
    context: {
        audience: 'new_user' | 'returning_user' | 'churned_user' | 'subscriber';
        emotion: ContextType;
        channel: Channel;
        persona?: PersonaId;
        topic?: string;
    };
    /** Optional constraints */
    constraints?: {
        maxLength?: number;
        mustInclude?: string[];
        mustAvoid?: string[];
        tone?: string;
    };
}
/**
 * Result of content generation
 */
export interface GenerationResult {
    /** The generated content */
    content: string;
    /** Alternative options */
    alternatives: string[];
    /** Compliance score */
    complianceScore: number;
    /** Any violations (should be empty) */
    violations: BrandViolation[];
    /** Metadata */
    meta: {
        personaUsed: PersonaId;
        tokensUsed: number;
        generatedAt: string;
    };
}
/**
 * Supported channels
 */
export type Channel = 'app' | 'web' | 'email' | 'sms' | 'push' | 'voice';
/**
 * Channel-specific configuration
 */
export interface ChannelConfig {
    channel: Channel;
    constraints: {
        maxLength: number;
        allowEmoji: boolean;
        allowLinks: boolean;
        formality: 'casual' | 'semi-formal' | 'formal';
    };
    adaptations: {
        greetingStyle: string;
        signoffStyle: string;
        urgencyLevel: 'low' | 'medium' | 'high';
    };
}
/**
 * Brand health metrics
 */
export interface BrandHealthMetrics {
    /** Content compliance rate */
    complianceRate: number;
    /** Average compliance score */
    averageComplianceScore: number;
    /** Top violations */
    topViolations: BrandViolation[];
    /** Voice consistency across channels */
    voiceConsistencyScore: number;
    /** How unique each persona sounds */
    personaDistinctiveness: number;
    /** Recent brand learnings */
    recentLearnings: ExperimentPattern[];
    /** Experiments per week */
    experimentVelocity: number;
    /** Last updated */
    updatedAt: string;
}
/**
 * Brand rule change record
 */
export interface BrandRuleChange {
    rule: string;
    change: 'added' | 'modified' | 'removed';
    source: 'experiment' | 'manual' | 'feedback';
    confidence: number;
    timestamp: string;
    details?: string;
}
//# sourceMappingURL=types.d.ts.map