/**
 * Core Adaptive SSML Functions
 *
 * Base adaptive tagging and SSML adjustment functions.
 * Now integrates Alive Voice and Superhuman Voice features
 * for truly "Better Than Human" speech.
 */
import type { SpeechContext } from '../speech-context.js';
/**
 * Extended speech context with superhuman voice parameters.
 * Includes vulnerability, presence mode, and memory-informed context.
 */
export interface ExtendedSpeechContext extends SpeechContext {
    /** Session ID for tracking */
    sessionId?: string;
    /** Vulnerability depth from vulnerability-matching system */
    vulnerabilityDepth?: 'surface' | 'thoughtful' | 'personal' | 'vulnerable' | 'raw';
    /** Presence level from presence-mode system */
    presenceLevel?: 'normal' | 'gentle' | 'holding' | 'silent';
    /** Known user context from memory (grief, stress, etc.) */
    knownUserContext?: 'grieving' | 'stressed' | 'celebrating' | 'struggling' | 'growing' | null;
    /** Relationship depth in turns */
    relationshipTurns?: number;
    /** Is the response to heavy content? */
    isHeavyContent?: boolean;
    /** Current detected emotion for the response */
    currentEmotion?: string;
}
/**
 * Tag text with SSML, adapting to speech context
 *
 * @param text - The text to tag
 * @param context - Speech context with pacing, energy, etc.
 * @param personaId - Optional persona ID for persona-specific SSML (e.g., 'nayan-patel', 'peter-john')
 */
export declare function tagTextWithSsmlAdaptive(text: string, context: SpeechContext, personaId?: string): string;
/**
 * Tag text with SSML including superhuman voice enhancements.
 *
 * This is the "Better Than Human" version that includes:
 * - Prosodic mirroring (match user's pace)
 * - Vulnerability voice softening
 * - Silence presence phrases
 * - Anticipatory comfort sounds
 * - Memory-informed baseline
 * - Emotional transition bridges
 *
 * @param text - The text to tag
 * @param context - Extended speech context with superhuman parameters
 * @param personaId - Persona ID
 */
export declare function tagTextWithSsmlSuperhuman(text: string, context: ExtendedSpeechContext, personaId?: string): string;
//# sourceMappingURL=adaptation.d.ts.map