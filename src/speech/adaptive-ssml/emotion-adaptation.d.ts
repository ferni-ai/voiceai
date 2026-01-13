/**
 * Emotion Adaptation
 *
 * Voice tone matching based on user emotional state.
 * Uses Cartesia Sonic-3's FULL 50+ emotion palette for richer expression.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags#emotion-beta
 */
import type { SpeechContext } from '../speech-context.js';
/**
 * Apply emotion adaptation - VOICE TONE MATCHING
 *
 * Uses nuanced emotions to create genuine human connection:
 * - Sad user → Sympathetic, gentle, slower
 * - Stressed user → Calm, serene, reassuring
 * - Excited user → Enthusiastic, matching energy
 * - Thinking → Curious, engaged
 * - Heavy topics → Sympathetic, patient
 */
export declare function applyEmotionAdaptation(text: string, context: SpeechContext): string;
//# sourceMappingURL=emotion-adaptation.d.ts.map