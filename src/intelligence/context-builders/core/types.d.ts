/**
 * Context Builder Types
 *
 * Canonical type definitions for the context builder system.
 * All types are defined here and re-exported from index.ts.
 *
 * @module intelligence/context-builders/types
 */
import type { PersonaConfig } from '../../../personas/types.js';
import type { UserProfile } from '../../../types/user-profile.js';
import type { BuilderCategory } from './categories.js';
export type EmotionValence = 'positive' | 'negative' | 'neutral';
export interface EmotionAnalysis {
    /** Primary emotion detected */
    primary: string;
    /** Emotion intensity (0-1) */
    intensity: number;
    /** Secondary emotions */
    secondaryEmotions?: string[];
    /** User needs emotional support */
    needsSupport?: boolean;
    /** User is venting (needs to be heard, not solved) */
    isVenting?: boolean;
    /** User is processing something */
    isProcessing?: boolean;
    /** Mental health signals detected */
    mentalHealthSignals?: string[];
    /** Distress level (0-1) - see distress-levels.ts for thresholds */
    distressLevel?: number;
    /** Confidence in detection (0-1) */
    confidence?: number;
    /** Overall emotional valence */
    valence?: EmotionValence;
    /** Keywords/patterns that triggered detection */
    markers?: string[];
    /** Suggested response tone */
    suggestedTone?: string;
}
export interface IntentAnalysis {
    /** Primary intent */
    primary: string;
    /** Confidence in classification (0-1) */
    confidence: number;
    /** Extracted entities */
    entities?: Record<string, unknown>;
    /** Is this a question? */
    isQuestion?: boolean;
    /** Is this a follow-up to previous topic? */
    isFollowUp?: boolean;
    /** Does this require empathy? */
    requiresEmpathy?: boolean;
    /** Does this require action? */
    requiresAction?: boolean;
    /** Suggested approach(es) */
    suggestedApproach?: string | string[];
}
export interface TopicsAnalysis {
    /** Detected topics */
    detected: string[];
    /** Primary/main topic */
    primary?: string | null;
    /** Trending topics in conversation */
    trending?: string[];
    /** Sentiment per topic */
    sentiment?: Record<string, number>;
    /** Did user shift topics? */
    isTopicShift?: boolean;
    /** Current topic being discussed */
    currentTopic?: string;
    /** Suggested transition phrase */
    suggestedTransition?: string;
}
export interface ConversationStateAnalysis {
    /** Current conversation phase */
    phase: string;
    /** Trust level with user (0-1) */
    trustLevel?: number;
    /** User engagement level (0-1) */
    engagementLevel?: number;
    /** Current distress level (0-1) */
    distressLevel?: number;
    /** Current user mood */
    currentMood?: string;
}
export interface ConversationAnalysis {
    emotion: EmotionAnalysis;
    intent: IntentAnalysis;
    topics: TopicsAnalysis;
    state: ConversationStateAnalysis;
}
/**
 * Minimal SessionServices interface for context builders.
 *
 * This is a SUBSET of the full SessionServices from services/index.ts.
 * Context builders only need these fields to operate. The full SessionServices
 * interface is structurally compatible with this, so passing the real
 * SessionServices object works due to TypeScript's structural typing.
 *
 * @see services/index.ts for the full SessionServices interface
 */
export interface SessionServices {
    sessionId: string;
    userId?: string;
    sessionStartTime: number;
    userProfile: UserProfile | null;
    searchKnowledge?: (query: string) => Promise<string | null>;
    searchPastConversations?: (query: string) => Promise<string | null>;
    getEnhancedPromptContext?: () => string;
    trackResponseQuality?: (response: string, reaction: 'positive' | 'neutral' | 'negative') => void;
    learningEngine?: {
        getProactiveInsight: (profile: UserProfile | null, turnCount: number) => string | null;
    };
    historyTracker?: {
        getSimpleTurns: () => Array<{
            role: string;
            content: string;
        }>;
        getTurnCount: () => number;
    };
    personaId?: string;
}
export interface VoiceEmotionResult {
    emotion: string;
    confidence: number;
    speechRate?: number;
    pitch?: number;
    /** Voice stress level (0-1) */
    stressLevel?: number;
    /** Voice arousal level (0-1) */
    arousal?: number;
    /** Voice valence (-1 to 1) */
    valence?: number;
}
export interface SessionRecoveryState {
    wasDisconnected?: boolean;
    disconnectedAt?: Date | null;
    recoveryGreeting?: string;
}
export interface ExtractedDetail {
    type: 'user_name' | 'person_name' | 'pet_name' | 'place' | 'company' | 'date' | 'amount' | 'other';
    value: string;
}
export interface ContextUserData {
    userName?: string;
    name?: string;
    isReturningUser?: boolean;
    sessionDurationMs?: number;
    turnCount?: number;
    lastTopic?: string;
    recentTopics?: string[];
    currentPersona?: string;
    keyMoments?: Array<{
        summary: string;
        timestamp: Date;
    }>;
    lastPacingScore?: number;
    sessionRecoveryState?: SessionRecoveryState;
    storiesShared?: string[];
    lastPhysicalNote?: string;
    extractedDetails?: ExtractedDetail[];
    lastNameUsed?: number;
    /** Memory references already made this session (prevents repetition) */
    referencedMemories?: string[];
    /** Whether we've already referenced the last conversation topic */
    hasReferencedLastConversation?: boolean;
    /** macOS desktop context from menubar app (sent via data channel) */
    macOS?: import('../external/macos-context.js').MacOSContextPayload;
    /** Actual silence analysis from voice pipeline (real ms, not estimated) */
    lastSilenceAnalysis?: {
        type: string;
        duration: number;
        confidence: number;
        suggestedResponse: string;
        guidance: string;
        promptSuggestion?: string;
    };
    /** Last user message for context builders */
    lastUserMessage?: string;
    /** Last agent response for repair detection */
    lastAgentResponse?: string;
    /** Energy level detected from voice/text signals */
    energyLevel?: 'depleted' | 'low' | 'normal' | 'high' | 'energized';
    /** Resistance signals detected this session */
    resistanceTopics?: string[];
    /** Voice-text mismatch detected */
    voiceTextMismatch?: {
        detected: boolean;
        type: string;
        interpretation: string;
        surfacePhrase?: string;
    };
    /** Cross-domain life context snapshot */
    lifeContextSnapshot?: import('../../triggers/index.js').LifeContextSnapshot;
}
export interface ContextBuilderInput {
    /** User's text input */
    userText: string;
    /** Analysis of the conversation */
    analysis: ConversationAnalysis;
    /** Session services for data access */
    services: SessionServices;
    /** User data for this session */
    userData: ContextUserData;
    /** User's profile */
    userProfile: UserProfile | null;
    /** Current persona */
    persona: PersonaConfig;
    /** Voice emotion if available */
    voiceEmotion?: VoiceEmotionResult;
    /** Bundle runtime for accessing rich persona content */
    bundleRuntime?: import('../../../personas/bundles/runtime.js').BundleRuntimeEngine;
}
export type ContextPriority = 'critical' | 'high' | 'standard' | 'hint';
export interface ContextInjection {
    /** Unique ID */
    id: string;
    /** Source builder name */
    source: string;
    /** Content to inject into prompt */
    content: string;
    /** Priority level */
    priority: ContextPriority;
    /** Category for organization */
    category?: string;
    /** Confidence in this injection (0-1) */
    confidence?: number;
}
export interface ContextBuilder {
    /** Builder name (must be unique) */
    name: string;
    /** Human-readable description */
    description: string;
    /** Priority (0-100, lower runs first, higher can override) */
    priority: number;
    /** Category for organization */
    category?: BuilderCategory;
    /** Dependencies - other builders that must run first */
    dependsOn?: string[];
    /** The build function */
    build: (input: ContextBuilderInput) => Promise<ContextInjection[]>;
}
export interface ContextBuilderMetrics {
    name: string;
    callCount: number;
    totalDurationMs: number;
    avgDurationMs: number;
    injectionsProduced: number;
    skipCount: number;
    errorCount: number;
    lastCallTimestamp?: number;
}
export type { PersonaConfig, UserProfile };
//# sourceMappingURL=types.d.ts.map