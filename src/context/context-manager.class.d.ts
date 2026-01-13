/**
 * ContextManager - Core conversation context management
 *
 * Responsibilities:
 * - Tracks conversation turns and rolling summaries
 * - Builds context for LLM prompt injection
 * - Manages persona transitions (with full handoff chain)
 * - Integrates speech insights for voice-aware context
 * - Provides hooks for trust and memory systems
 *
 * @module context/ContextManager
 */
import { type ConversationTurn } from '../memory/summarizer.js';
import { type PersonaId, type SessionId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import type { InjectedContent } from '../personas/shared/index.js';
import { buildSpeechInsightsContext } from './speech-insights.js';
import type { ContextOptions, ConversationState, EmotionResult, HandoffRecord, MemoryRetrievalResult, PhaseGuidance, PromptContext, SpeechInsightsContext, TrustContextResult } from './types.js';
export declare class ContextManager {
    private turns;
    private rollingSummary;
    private userProfile?;
    private readonly sessionId;
    private readonly startedAt;
    private currentPersona;
    private previousPersona?;
    private handoffHistory;
    private rollingSummaryUpdateInFlight;
    private rollingSummaryUpdateQueued;
    private rollingSummaryRetryCount;
    private trustContextBuilder?;
    private memoryRetriever?;
    constructor(sessionId: SessionId, userProfile?: UserProfile);
    getSessionId(): SessionId;
    getCurrentPersona(): PersonaId;
    getPreviousPersona(): PersonaId | undefined;
    /**
     * Get the full handoff chain for this session.
     * Useful for understanding conversation flow across personas.
     */
    getHandoffHistory(): readonly HandoffRecord[];
    getUserProfile(): UserProfile | undefined;
    getRollingSummary(): string;
    /**
     * Set the current persona with optional explicit previous persona.
     * Automatically tracks handoff history.
     */
    setCurrentPersona(personaId: string, previousPersonaId?: string): void;
    setUserProfile(profile: UserProfile): void;
    /**
     * Register a trust context builder function.
     * This allows trust systems to be injected without creating circular deps.
     */
    setTrustContextBuilder(builder: (userId: string, userText: string, context: {
        currentTopic?: string;
        detectedEmotion?: string;
        emotionIntensity?: number;
    }) => TrustContextResult): void;
    /**
     * Register a memory retrieval function.
     * This allows RAG/semantic search to be injected without creating circular deps.
     */
    setMemoryRetriever(retriever: (userId: string, query: string, options?: {
        limit?: number;
        minRelevance?: number;
    }) => Promise<MemoryRetrievalResult>): void;
    addTurn(turn: ConversationTurn): void;
    getContextWindow(maxTurns?: number): ConversationTurn[];
    getTurnCount(): number;
    getDurationMinutes(): number;
    shouldSummarize(): boolean;
    getAllTurns(): ConversationTurn[];
    clear(): void;
    private requestRollingSummaryUpdate;
    /**
     * Force a rolling summary update (useful for session end).
     * Resets retry count to allow one more attempt.
     */
    forceRollingSummaryUpdate(): Promise<void>;
    private recordHandoff;
    /**
     * Get a formatted string describing the handoff chain.
     * Example: "Ferni → Peter (turn 5) → Maya (turn 12)"
     */
    getHandoffChainDescription(): string;
    buildRelationshipContext(): string;
    buildEmotionalContext(emotion?: EmotionResult, state?: ConversationState): string;
    buildTopicContext(state?: ConversationState): string;
    buildPhaseGuidance(guidance: PhaseGuidance): string;
    buildContinuityContext(): string;
    buildSharedContent(options?: {
        isGreeting?: boolean;
        isClosing?: boolean;
        isHandoff?: boolean;
        mentionTeammate?: string;
        lastUserMessage?: string;
    }): InjectedContent;
    getFormattedSharedContent(options?: {
        isGreeting?: boolean;
        isClosing?: boolean;
        isHandoff?: boolean;
        mentionTeammate?: string;
        lastUserMessage?: string;
    }): string;
    /**
     * Build trust-aware context if a trust builder was registered.
     * Returns null if no trust builder is available.
     */
    buildTrustContext(userId: string, userText: string, context?: {
        currentTopic?: string;
        detectedEmotion?: string;
        emotionIntensity?: number;
    }): TrustContextResult | null;
    /**
     * Retrieve relevant memories if a memory retriever was registered.
     * Returns null if no retriever is available.
     */
    retrieveRelevantMemories(userId: string, query: string, options?: {
        limit?: number;
        minRelevance?: number;
    }): Promise<MemoryRetrievalResult | null>;
    buildSpeechInsightsContext(options: Parameters<typeof buildSpeechInsightsContext>[0]): SpeechInsightsContext;
    formatSpeechInsightsForPrompt(insights: SpeechInsightsContext): string;
    buildPromptContext(state?: ConversationState, guidance?: PhaseGuidance, emotion?: EmotionResult, options?: ContextOptions & {
        isGreeting?: boolean;
        isClosing?: boolean;
        isHandoff?: boolean;
        lastUserMessage?: string;
        speechInsights?: SpeechInsightsContext;
        userId?: string;
        userText?: string;
    }): PromptContext;
    /** Extract all context strings in one helper (to reduce cyclomatic complexity) */
    private buildAllContextStrings;
    /** Assemble the final PromptContext object */
    private assemblePromptContext;
    private formatForPrompt;
}
//# sourceMappingURL=context-manager.class.d.ts.map