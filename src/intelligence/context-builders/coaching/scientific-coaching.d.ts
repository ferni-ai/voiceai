/**
 * Scientific Coaching Context Builder
 *
 * Integrates all research-backed intelligence systems into
 * every conversation turn. This is the "brain" that connects:
 *
 * - Cognitive distortion detection
 * - Wellbeing tracking & early warning
 * - Behavioral economics nudges
 * - Population wisdom synthesis
 * - Scientific knowledge base
 *
 * @module ScientificCoachingContext
 */
import { type ContextInjection } from '../index.js';
export interface ScientificCoachingInput {
    userId: string;
    userMessage: string;
    personaId: string;
    topic?: string;
    emotionalState?: string;
    emotionalIntensity?: number;
    conversationPhase?: 'opening' | 'exploring' | 'supporting' | 'closing';
    turnNumber?: number;
    sessionDurationMinutes?: number;
    enableDistortionDetection?: boolean;
    enableWellbeingTracking?: boolean;
    enableNudges?: boolean;
    enableWisdom?: boolean;
}
export interface ScientificCoachingResult {
    injections: ContextInjection[];
    detectedDistortions: string[];
    wellbeingSignals: Record<string, number>;
    warnings: string[];
    nudges: string[];
    endpointingRecommendation?: {
        minDelay: number;
        maxDelay: number;
    };
}
/**
 * Build scientific coaching context for a conversation turn.
 * This is called on every user message to enrich LLM context.
 */
export declare function buildScientificCoachingContext(input: ScientificCoachingInput): Promise<ScientificCoachingResult>;
export declare const scientificCoaching: {
    build: typeof buildScientificCoachingContext;
};
export default scientificCoaching;
//# sourceMappingURL=scientific-coaching.d.ts.map