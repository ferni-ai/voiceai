/**
 * Humanization Orchestrator
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is the SINGLE system that makes Ferni feel alive.
 * No more scattered humanizing logic - one orchestrator that handles:
 * - Active listening cues
 * - Emotional mirroring
 * - Spontaneous elements (when appropriate)
 * - Personal touches based on relationship stage
 *
 * The key insight: In high-emotion moments, we REDUCE humanization features
 * and focus purely on presence. The user needs us, not our personality.
 *
 * @module intelligence/unified/humanization-orchestrator
 */
import type { PersonaConfig } from '../../personas/types.js';
import type { UnifiedAnalysisResult } from './unified-analyzer.js';
export interface HumanizationInput {
    /** The unified analysis result */
    analysis: UnifiedAnalysisResult;
    /** Current persona */
    persona: PersonaConfig;
    /** Turn number */
    turnNumber: number;
    /** Session count with this user */
    sessionCount: number;
    /** User's name (if known) */
    userName?: string;
    /** Recent topics discussed */
    recentTopics: string[];
    /** Relationship stage */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'trusted';
}
/**
 * Active listening cue - shows we're present
 */
export interface ActiveListeningCue {
    /** Type of listening cue */
    type: 'reflection' | 'validation' | 'clarification' | 'encouragement';
    /** The cue itself */
    content: string;
    /** When to use it */
    timing: 'before_response' | 'during_response' | 'after_response';
}
/**
 * Emotional mirror - matching their state
 */
export interface EmotionalMirror {
    /** The emotional state to mirror */
    emotion: string;
    /** How to express it */
    expression: string;
    /** Intensity (0-1) */
    intensity: number;
}
/**
 * Spontaneous element - makes us feel alive
 * Only used when NOT in high-emotion mode
 */
export interface SpontaneousElement {
    /** Type of spontaneous element */
    type: 'thought' | 'callback' | 'observation' | 'humor' | 'vulnerability';
    /** The content */
    content: string;
    /** Whether to use it (probability already applied) */
    shouldUse: boolean;
}
export interface HumanizationResult {
    /** Active listening cues to incorporate */
    activeListening: ActiveListeningCue[];
    /** How to mirror their emotional state */
    emotionalMirror: EmotionalMirror;
    /** Spontaneous elements (only if not high-emotion) */
    spontaneousElements: SpontaneousElement[];
    /** Response tone guidance */
    toneGuidance: string;
    /** Response length guidance */
    lengthGuidance: {
        min: number;
        max: number;
        note: string;
    };
    /** Name usage guidance */
    nameUsage: {
        shouldUse: boolean;
        frequency: 'once' | 'twice' | 'natural';
    };
    /** Whether to skip most humanization (high-emotion mode) */
    focusedSupportMode: boolean;
    /** Pre-formatted injection for prompt */
    promptInjection: string;
}
export declare class HumanizationOrchestrator {
    private static instance;
    static getInstance(): HumanizationOrchestrator;
    /**
     * Generate humanization guidance for a response
     */
    humanize(input: HumanizationInput): HumanizationResult;
    private shouldUseFocusedSupportMode;
    private buildActiveListeningCues;
    private buildEmotionalMirror;
    private buildSpontaneousElements;
    private getPersonaThought;
    private buildToneGuidance;
    private buildLengthGuidance;
    private buildNameUsageGuidance;
    private buildPromptInjection;
}
/**
 * Quick humanization function - use for single calls
 */
export declare function humanize(input: HumanizationInput): HumanizationResult;
export default HumanizationOrchestrator;
//# sourceMappingURL=humanization-orchestrator.d.ts.map