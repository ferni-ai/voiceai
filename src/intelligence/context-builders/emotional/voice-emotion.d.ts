/**
 * Voice Emotion Context Builder
 *
 * Integrates voice emotion signals into cognitive adjustments.
 * When we detect stress, tremor, or other voice qualities,
 * this builder suggests cognitive adaptations.
 *
 * This creates emotionally intelligent AI that responds to
 * HOW something is said, not just WHAT is said.
 *
 * Uses centralized:
 * - SessionStateManager for session tracking
 * - VoiceEmotionOrchestrator for unified analysis
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build voice emotion context
 *
 * Uses centralized SessionStateManager for session tracking.
 */
declare function buildVoiceEmotionContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Clear voice emotion session state
 *
 * NOTE: Session state is now managed centrally by SessionStateManager.
 * This function is kept for backward compatibility but delegates to the manager.
 */
export declare function clearVoiceEmotionSession(sessionId: string): void;
export { buildVoiceEmotionContext };
export default buildVoiceEmotionContext;
//# sourceMappingURL=voice-emotion.d.ts.map