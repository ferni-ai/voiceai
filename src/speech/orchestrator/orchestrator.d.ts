/**
 * Speech Orchestrator
 *
 * Single entry point for all speech humanization and listening analysis.
 * Coordinates all speech services to produce natural, human-like voice output.
 *
 * This orchestrator follows clean architecture principles:
 * - Single responsibility for callers (one API to learn)
 * - Correct ordering of humanization steps guaranteed
 * - Easier testing and feature flags per step
 * - Centralized session management
 *
 * @module speech/orchestrator
 */
import type { AnticipatedResult, AnticipationContext, BackchannelRequest, BackchannelResponse, HumanizationOptions, HumanizedResponse, ListeningAnalysisOptions, ListeningAnalysisResult, SpeechOrchestratorContext } from './types.js';
/**
 * Central orchestrator for all speech humanization
 */
export declare class SpeechOrchestrator {
    private readonly sessionId;
    private personaId;
    private turnNumber;
    private voiceDataLoaded;
    constructor(sessionId: string, personaId?: string);
    /**
     * Initialize the orchestrator (preload persona voice data)
     */
    initialize(): Promise<void>;
    /**
     * Switch to a different persona
     */
    switchPersona(personaId: string): Promise<void>;
    /**
     * Signal start of a new turn
     */
    newTurn(): void;
    /**
     * Get current turn number
     */
    getTurnNumber(): number;
    /**
     * Humanize a response text with all appropriate enhancements
     *
     * This is the main entry point for making agent speech sound natural.
     * It applies persona fingerprints, emotion arcs, dynamic pauses, and more.
     *
     * @param text - Raw response text from LLM
     * @param context - Conversation context
     * @param options - Humanization options (optional)
     * @returns Humanized response with SSML
     */
    humanize(text: string, context: Partial<SpeechOrchestratorContext>, options?: Partial<HumanizationOptions>): Promise<HumanizedResponse>;
    /**
     * Analyze user speech to understand emotional undercurrent (full analysis)
     *
     * Use this for comprehensive analysis at turn boundaries.
     *
     * @param options - Analysis options including text and/or audio
     * @returns Comprehensive listening analysis
     */
    analyzeFull(options: ListeningAnalysisOptions): Promise<ListeningAnalysisResult>;
    /**
     * Quick analysis for real-time use (text only, faster)
     *
     * Use this during conversation for quick decisions.
     *
     * @param text - User's text to analyze
     * @returns Quick analysis result
     */
    analyzeQuick(text: string): ListeningAnalysisResult;
    private mapFullResult;
    private mapQuickResult;
    /**
     * Get a backchanneling decision
     *
     * @param request - Backchannel context
     * @returns Decision on whether to backchannel and what phrase to use
     */
    getBackchannel(request: BackchannelRequest): BackchannelResponse;
    /**
     * Process partial transcript for anticipatory response preparation
     *
     * Call this DURING user speech, not after, to prepare the response prosody
     * before they finish speaking. This is what makes the agent feel responsive.
     *
     * @param context - Partial transcript and context
     * @returns Anticipated response parameters
     */
    anticipate(context: AnticipationContext): AnticipatedResult | null;
    /**
     * Get a natural thinking filler for LLM processing delays
     *
     * Uses ProcessingIntelligence for context-aware phrase composition.
     *
     * @param options - Optional context for phrase composition
     * @returns SSML-formatted thinking filler
     */
    getThinkingFiller(options?: {
        type?: 'thinking' | 'emotional' | 'tool_call' | 'memory_recall';
        weight?: 'light' | 'medium' | 'heavy';
        emotionalState?: {
            primary: string;
            intensity: number;
        };
        hourOfDay?: number;
    }): string;
    private shouldAddAcknowledgment;
    private shouldAddCatchphrase;
    private determineAcknowledgmentMood;
}
/**
 * Get or create a SpeechOrchestrator for a session
 */
export declare function getOrchestrator(sessionId: string, personaId?: string): SpeechOrchestrator;
/**
 * Reset orchestrator for a session
 */
export declare function resetOrchestrator(sessionId: string): void;
/**
 * Reset all orchestrators
 */
export declare function resetAllOrchestrators(): void;
/**
 * Get active orchestrator count
 */
export declare function getActiveOrchestratorCount(): number;
//# sourceMappingURL=orchestrator.d.ts.map