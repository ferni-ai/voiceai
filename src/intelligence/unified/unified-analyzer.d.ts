/**
 * Unified Analyzer
 *
 * THE single entry point for analyzing user input.
 * Combines text emotion, voice emotion, intent, topics, and context
 * into one coherent analysis that flows through the entire system.
 *
 * Key principles:
 * 1. Single source of truth - no component re-analyzes
 * 2. Voice/text mismatch is a first-class signal
 * 3. High-emotion mode simplifies everything for focused support
 *
 * @module intelligence/unified/unified-analyzer
 */
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { PersonaConfig } from '../../personas/types.js';
export interface UnifiedAnalysisInput {
    /** The user's message text */
    message: string;
    /** Optional voice emotion from prosody analysis */
    voiceEmotion?: VoiceEmotionResult | null;
    /** User's profile for context */
    userProfile?: UserProfile | null;
    /** Current persona */
    persona?: PersonaConfig;
    /** Session context */
    sessionId?: string;
    userId?: string;
    turnNumber?: number;
    sessionMinutes?: number;
    /** Whether this is a returning user */
    isReturningUser?: boolean;
    /** Previous AI response (for context) */
    previousAIResponse?: string;
    /** Silence duration before this message */
    silenceDurationMs?: number;
    /** Optional LLM caller for enhanced analysis */
    llmCaller?: (prompt: string) => Promise<string>;
}
/**
 * The single source of truth for emotion in a conversation turn
 */
export interface EmotionSignal {
    /** Primary emotion detected */
    primary: string;
    /** Secondary emotion (if present) */
    secondary?: string;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Emotional valence (-1 to 1) */
    valence: number;
    /** Intensity of the emotion (0-1) */
    intensity: number;
    /** Distress level requiring support (0-1) */
    distressLevel: number;
    /** Suggested response tone */
    suggestedTone: 'gentle' | 'warm' | 'enthusiastic' | 'calm' | 'serious' | 'reassuring';
    /** Source of primary detection */
    source: 'text' | 'voice' | 'combined';
    /** Raw text analysis */
    textAnalysis?: {
        primary: string;
        confidence: number;
        markers: string[];
    };
    /** Raw voice analysis */
    voiceAnalysis?: {
        primary: string;
        confidence: number;
        stressLevel: number;
        arousal: number;
    };
}
/**
 * Intent signal - what the user wants
 */
export interface IntentSignal {
    /** Primary intent */
    primary: string;
    /** Confidence (0-1) */
    confidence: number;
    /** Does this require empathy first? */
    requiresEmpathy: boolean;
    /** Does this require action/information? */
    requiresAction: boolean;
    /** Suggested approach */
    suggestedApproach: string;
    /** Is this a question? */
    isQuestion: boolean;
    /** Is this wrapping up? */
    isWrappingUp: boolean;
}
/**
 * Context signal - where we are in the conversation
 */
export interface ContextSignal {
    /** Current conversation phase */
    phase: 'greeting' | 'warming_up' | 'exploring' | 'advising' | 'supporting' | 'wrapping_up';
    /** Topics being discussed */
    topics: string[];
    /** Current primary topic */
    currentTopic: string | null;
    /** Is this a topic shift? */
    isTopicShift: boolean;
    /** Turn count */
    turnCount: number;
    /** Topics to circle back to */
    topicsToCircleBack: string[];
    /** Relationship stage with user */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'trusted';
}
/**
 * THE SUPERHUMAN SIGNAL - Voice/text mismatch detection
 *
 * This is what makes Ferni "better than human" - noticing when
 * someone says "I'm fine" but their voice says otherwise.
 */
export interface MismatchSignal {
    /** Is there a significant mismatch? */
    detected: boolean;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Type of mismatch */
    type: 'masking_negative' | 'understating_positive' | 'suppressing' | 'contradicting' | 'none';
    /** What the text suggests */
    textEmotion: string;
    /** What the voice reveals */
    voiceEmotion: string;
    /** Human-readable interpretation */
    interpretation: string;
    /** How to approach this sensitively */
    approach: string;
    /** Should we gently surface this? */
    shouldSurface: boolean;
    /** If surfacing, what to say */
    surfacePhrase?: string;
}
/**
 * Behavioral signals detected in the message
 */
export interface BehavioralSignals {
    isRushed: boolean;
    isRelaxed: boolean;
    needsSupport: boolean;
    isPersonalSharing: boolean;
    seekingAdvice: boolean;
    isVenting: boolean;
    madeDecision: boolean;
    markers: string[];
}
/**
 * Response guidance for the LLM
 */
export interface ResponseGuidance {
    /** Suggested response length (words) */
    responseLength: {
        min: number;
        max: number;
    };
    /** Priority focus for this response */
    priorityFocus: string;
    /** Response approach */
    approach: 'empathy_first' | 'direct' | 'exploratory' | 'supportive' | 'celebratory';
    /** Key guidelines to follow */
    guidelines: string[];
    /** Should we use high-emotion mode? (simplified context) */
    useHighEmotionMode: boolean;
}
/**
 * The complete unified analysis result
 */
export interface UnifiedAnalysisResult {
    /** Single source of truth for emotion */
    emotion: EmotionSignal;
    /** What the user wants */
    intent: IntentSignal;
    /** Where we are in the conversation */
    context: ContextSignal;
    /** THE SUPERHUMAN SIGNAL - voice/text mismatch */
    mismatch: MismatchSignal;
    /** Behavioral signals */
    signals: BehavioralSignals;
    /** How to respond */
    guidance: ResponseGuidance;
    /** Pre-formatted context for prompt injection */
    contextForPrompt: string;
    /** Processing time in ms */
    processingTimeMs: number;
    /** Analysis timestamp */
    timestamp: Date;
}
export declare class UnifiedAnalyzer {
    private static instance;
    static getInstance(): UnifiedAnalyzer;
    /**
     * The main analysis function - call this once per turn
     */
    analyze(input: UnifiedAnalysisInput): Promise<UnifiedAnalysisResult>;
    private buildEmotionSignal;
    private mapTone;
    private buildIntentSignal;
    private buildContextSignal;
    /**
     * THE SUPERHUMAN CAPABILITY: Detect voice/text emotional mismatch
     *
     * This is what makes Ferni "better than human" - we notice when
     * someone says "I'm fine" but their voice tells a different story.
     */
    private detectMismatch;
    private getMismatchSurfacePhrase;
    private detectBehavioralSignals;
    private buildResponseGuidance;
    private buildContextForPrompt;
}
/**
 * Quick analysis function - use this for single calls
 */
export declare function analyzeUnified(input: UnifiedAnalysisInput): Promise<UnifiedAnalysisResult>;
/**
 * Alias for analyzeUnified - backward compatibility with old unified-analyzer.ts
 * @deprecated Use analyzeUnified() instead
 */
export declare const analyze: typeof analyzeUnified;
export default UnifiedAnalyzer;
//# sourceMappingURL=unified-analyzer.d.ts.map