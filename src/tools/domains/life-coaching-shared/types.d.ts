/**
 * Life Coaching Shared Types
 *
 * Core types used across all life coaching domains.
 */
/**
 * Gretchen Rubin's Four Tendencies framework
 * Determines how to frame requests and accountability
 */
export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';
/**
 * Attachment style affects relationship coaching approach
 */
export type AttachmentStyle = 'secure' | 'anxious' | 'avoidant' | 'disorganized';
/**
 * User's current emotional state (detected or stated)
 */
export type EmotionalState = 'calm' | 'anxious' | 'sad' | 'angry' | 'overwhelmed' | 'hopeful' | 'neutral' | 'distressed' | 'numb';
/**
 * Life coaching user profile - persisted in Firestore
 */
export interface LifeCoachingProfile {
    userId: string;
    currentEmotionalState?: EmotionalState;
    fourTendency?: FourTendency;
    fourTendencyConfidence?: number;
    attachmentStyle?: AttachmentStyle;
    attachmentStyleConfidence?: number;
    boundaryHistory?: BoundaryAttempt[];
    peoplesPleasing?: {
        score: number;
        patterns: string[];
        progress: string[];
    };
    socialAnxiety?: {
        level: 'mild' | 'moderate' | 'severe';
        triggers: string[];
        coping: string[];
    };
    friendshipCircle?: {
        inner: number;
        close: number;
        casual: number;
        desired: string;
    };
    angerPatterns?: {
        triggers: string[];
        expression: 'suppressed' | 'explosive' | 'passive-aggressive' | 'healthy';
        physicalSigns: string[];
    };
    datingHistory?: {
        readinessScore: number;
        attachmentInDating: AttachmentStyle;
        patterns: string[];
        redFlagsIgnored: string[];
    };
    bodyRelationship?: {
        spectrum: 'body_hatred' | 'body_dissatisfaction' | 'body_neutrality' | 'body_acceptance' | 'body_appreciation';
        dietCultureExposure: 'high' | 'moderate' | 'low';
        triggers: string[];
    };
    neurodivergence?: {
        adhd?: boolean;
        autism?: boolean;
        other?: string[];
        strategies: string[];
        struggles: string[];
    };
    traumaAwareness?: {
        hasTraumaHistory: boolean;
        preferredGrounding: string[];
        triggers?: string[];
    };
    digitalHealth?: {
        screenTimeLevel: 'healthy' | 'concerning' | 'problematic';
        socialMediaImpact: 'positive' | 'neutral' | 'negative';
        boundariesSet: string[];
    };
    perfectionism?: {
        type: 'self-oriented' | 'other-oriented' | 'socially-prescribed';
        imposterSyndrome: boolean;
        overworkPattern: boolean;
    };
    lastUpdated: Date;
    totalLifeCoachingInteractions: number;
}
/**
 * A boundary setting attempt tracked over time
 */
export interface BoundaryAttempt {
    date: Date;
    personType: string;
    boundaryType: string;
    outcome: 'maintained' | 'tested' | 'violated' | 'unsure';
    notes?: string;
}
/**
 * Context passed to adaptive response generator
 */
export interface ResponseContext {
    userId: string;
    personaId: string;
    userProfile?: LifeCoachingProfile;
    emotionalState?: EmotionalState;
    previousAttempts?: number;
    conversationHistory?: ConversationTurn[];
    isFirstTimeWithTopic?: boolean;
    urgencyLevel?: 'low' | 'medium' | 'high' | 'crisis';
}
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    emotion?: EmotionalState;
}
/**
 * Response adaptation options
 */
export interface AdaptationOptions {
    frameTendency?: boolean;
    includeScripts?: boolean;
    includeReflection?: boolean;
    warmthLevel?: 'high' | 'medium' | 'low';
    brevity?: 'brief' | 'moderate' | 'thorough';
    validateFirst?: boolean;
}
/**
 * A reusable script template
 */
export interface ScriptTemplate {
    id: string;
    category: string;
    situation: string;
    variations: {
        soft: string[];
        firm: string[];
        assertive: string[];
    };
    adaptations?: Partial<Record<FourTendency, string>>;
}
/**
 * A psychological framework or model
 */
export interface Framework {
    id: string;
    name: string;
    description: string;
    source?: string;
    steps?: string[];
    questions?: string[];
    adaptations?: Partial<Record<FourTendency, {
        framing: string;
        motivation: string;
    }>>;
}
/**
 * A coping technique or exercise
 */
export interface CopingTechnique {
    id: string;
    name: string;
    domain: string;
    duration?: string;
    steps: string[];
    bestFor?: string[];
    contraindicatedFor?: string[];
}
/**
 * Safety assessment result
 */
export interface SafetyAssessment {
    level: 'safe' | 'concerning' | 'urgent' | 'crisis';
    flags: string[];
    recommendedAction: 'continue' | 'check_in' | 'resources' | 'immediate_referral';
    resources?: CrisisResource[];
}
/**
 * Crisis resource
 */
export interface CrisisResource {
    name: string;
    description: string;
    phone?: string;
    text?: string;
    website?: string;
    available?: string;
}
/**
 * Context shared between chained tools
 */
export interface ToolChainContext {
    sessionId: string;
    toolsUsed: string[];
    factsGathered: Record<string, unknown>;
    emotionalJourney: EmotionalState[];
    nextSuggestions: string[];
}
//# sourceMappingURL=types.d.ts.map