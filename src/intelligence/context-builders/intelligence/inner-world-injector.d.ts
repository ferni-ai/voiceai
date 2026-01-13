/**
 * Inner World Injector
 *
 * Brings personas to life by injecting their inner world into conversations.
 * When the conversation touches on certain topics, the AI can naturally
 * reference sensory memories, personal contradictions, and embodied experiences.
 *
 * This is what makes a persona feel REAL - not just knowledgeable, but HUMAN.
 *
 * "The smell of sage after rain in Wyoming... that takes me right back."
 *
 * IMPORTANT: Uses thematic tracking to prevent repetition of major backstory
 * elements (Wyoming, Japan, book, etc.) - each theme should only be mentioned
 * ONCE per session unless the user specifically asks about it.
 */
import type { BundleRuntimeEngine } from '../../../personas/bundles/runtime.js';
export interface InnerWorldInjection {
    type: 'sensory_memory' | 'embodied_memory' | 'contradiction' | 'emotional_flashpoint' | 'unfinished_business' | 'secret_self' | 'dream_still_chasing' | 'mortality_awareness' | 'voice_fingerprint';
    /** The content to potentially share */
    content: string;
    /** What triggered this memory/share */
    trigger: string;
    /** How vulnerable/deep is this share? */
    depth: 'surface' | 'medium' | 'deep' | 'sacred';
    /** Minimum relationship stage required */
    requiredRelationship: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    /** How to introduce this naturally */
    transitionPhrases: string[];
    /** Probability this should be injected (0-1) */
    probability: number;
}
export interface InnerWorldContext {
    currentTopic?: string;
    recentTopics: string[];
    userMessage: string;
    emotionalIntensity: number;
    relationshipStage: string;
    turnCount: number;
    isVulnerableMoment: boolean;
    /** Themes already mentioned this session (prevents Wyoming/Japan/book repetition) */
    mentionedThemes?: Set<string>;
    /** Whether user explicitly asked about a topic (allows override of theme blocking) */
    userAskedAbout?: string;
}
/**
 * Analyze context and find relevant inner world content to inject
 *
 * IMPORTANT: Filters out content containing themes that have already been
 * mentioned this session to prevent the "always talks about Wyoming" problem.
 */
export declare function findInnerWorldInjections(context: InnerWorldContext, bundleRuntime: BundleRuntimeEngine | undefined): InnerWorldInjection[];
/**
 * Format inner world injections for LLM prompt
 */
export declare function formatInnerWorldForPrompt(injections: InnerWorldInjection[], relationshipStage: string): string;
/**
 * Check if an injection should actually be used (probabilistic)
 */
export declare function shouldInject(injection: InnerWorldInjection): boolean;
export default findInnerWorldInjections;
//# sourceMappingURL=inner-world-injector.d.ts.map