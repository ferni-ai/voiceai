/**
 * Music Emotion Offers Context Builder
 *
 * Detects emotional states and injects music offers based on the user's mood.
 * Part of the "More Than Human" music intelligence system.
 *
 * This builder:
 * - Analyzes emotional signals from conversation
 * - Determines if music might help the user's emotional state
 * - Injects contextual music offers at appropriate moments
 * - Tracks offer acceptance/rejection for future improvement
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface EmotionOfferState {
    lastOfferTime: number;
    lastOfferedEmotion: string | null;
    offerCount: number;
    acceptedCount: number;
    declinedCount: number;
}
/**
 * Detect emotion from user text
 */
declare function detectEmotionFromText(text: string): string | null;
/**
 * Build music emotion offer injections
 */
declare function buildMusicEmotionOffers(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Track that a music offer was accepted
 */
export declare function trackMusicOfferAccepted(userId: string): void;
/**
 * Track that a music offer was declined
 */
export declare function trackMusicOfferDeclined(userId: string): void;
/**
 * Reset offer state for a new session
 */
export declare function resetMusicOfferState(userId: string): void;
/**
 * Get offer statistics for a user
 */
export declare function getMusicOfferStats(userId: string): EmotionOfferState | null;
export { buildMusicEmotionOffers, detectEmotionFromText };
//# sourceMappingURL=music-emotion-offers.d.ts.map