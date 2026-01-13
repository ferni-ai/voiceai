/**
 * Persona-Parameterized Greeting Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Generates natural, warm greetings based on persona configuration.
 * Replaces Jack-specific hardcoded greetings with persona-driven ones.
 *
 * First impressions matter. Greetings should feel like reconnecting
 * with a friend, not starting a support ticket.
 */
import type { PersonaConfig } from './types.js';
export type VoiceRecognitionScenario = 'voice_recognized' | 'voice_familiar' | 'voice_mismatch';
/**
 * Generate a greeting for voice recognition scenarios
 */
export declare function generateVoiceRecognitionGreeting(persona: PersonaConfig, scenario: VoiceRecognitionScenario, options: {
    userName?: string;
    possibleName?: string;
    expectedName?: string;
    confidence?: number;
}): string;
export declare function generateStaticGreeting(persona: PersonaConfig, options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
    usedGreetings?: string[];
}): string;
/**
 * Generate a dynamic greeting using Gemini API
 */
export declare function generateDynamicGreeting(persona: PersonaConfig, options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
}): Promise<string | null>;
export interface PersonaMemoryForGreeting {
    type: string;
    name: string;
    details?: string;
    sentiment?: 'positive' | 'negative' | 'neutral' | 'watchful';
    ticker?: string;
    date?: string;
    targetAmount?: number;
    currentAmount?: number;
    reason?: string;
}
import type { BundleRuntimeEngine } from './bundles/runtime.js';
import { type LifeEvent } from './shared/life-events.js';
/**
 * Generate a greeting for the persona
 *
 * Priority order:
 * 1. PROACTIVE OPENER - Context-aware opener for returning users (thread continuity, callbacks)
 * 2. MEMORY-BASED - References specific things the persona remembers about user
 * 3. DYNAMIC (Gemini) - AI-generated contextual greeting
 * 4. COMPOSITIONAL - Built from atomic pieces at runtime (infinite variety)
 * 5. STATIC - Template-based last resort
 *
 * The goal is to make every greeting feel like reconnecting with a real person.
 */
export declare function generateGreeting(persona: PersonaConfig, options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
    personaMemories?: PersonaMemoryForGreeting[];
    usedGreetings?: string[];
    bundleRuntime?: BundleRuntimeEngine;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    lastConversationDate?: Date;
    openQuestions?: string[];
    goals?: Array<{
        name: string;
        type: string;
    }>;
    primaryConcerns?: string[];
    upcomingEvents?: string[];
    lifeEvents?: LifeEvent[];
    conversationCount?: number;
    userId?: string;
}): Promise<string>;
/**
 * Sync version for backwards compatibility
 */
export declare function generateRandomGreeting(persona: PersonaConfig, options?: {
    isReturningUser?: boolean;
    userName?: string;
    lastConversationSummary?: string;
}): string;
//# sourceMappingURL=greetings.d.ts.map