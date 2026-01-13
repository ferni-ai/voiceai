/**
 * Outbound Call SSML Enhancement
 *
 * Makes Ferni's outbound calls sound natural and human by adding:
 * - Natural pauses for breathing
 * - Emotional warmth
 * - Speed variations for emphasis
 * - Thoughtful hesitations
 *
 * USES CANONICAL PERSONA PROFILES from src/speech/voice-manager/config.ts
 *
 * @module outbound-ssml
 */
export interface OutboundSsmlOptions {
    /** The persona making the call */
    personaId?: string;
    /** Type of call for appropriate tone */
    callType?: 'introduction' | 'check-in' | 'celebration' | 'support' | 'reminder';
    /** Relationship with recipient */
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    /** Whether to add opening warmth */
    addOpeningWarmth?: boolean;
}
/**
 * Enhance outbound call message with natural SSML
 *
 * Transforms plain text into human-sounding speech with:
 * - Opening warmth (emotion tag from persona's canonical profile)
 * - Natural pauses after sentences
 * - Breath pauses after names
 * - Thoughtful pacing for important phrases (using persona's defaultSpeed)
 * - Closing warmth
 */
export declare function enhanceOutboundMessage(message: string, options?: OutboundSsmlOptions): string;
/**
 * Create a warm introduction opening with SSML
 * Uses canonical persona emotion profiles and display names
 */
export declare function createWarmOpening(personaId: string, recipientName: string, referrerName?: string): string;
/**
 * Create a thoughtful closing with SSML
 */
export declare function createWarmClosing(recipientName: string, occasion?: string): string;
/**
 * Add a thoughtful pause (for transitions, important points)
 */
export declare function thoughtfulPause(ms?: number): string;
/**
 * Wrap text in warm emotion
 */
export declare function warmWrap(text: string): string;
/**
 * Wrap text in curious/interested emotion
 */
export declare function curiousWrap(text: string): string;
/**
 * Slow down important text
 * @param text - Text to slow down
 * @param speed - Speed ratio (0.6-1.5), or leave undefined to use 0.85
 * @param personaId - Optional persona ID to calculate relative slowdown
 */
export declare function emphasize(text: string, speed?: number, personaId?: string): string;
//# sourceMappingURL=outbound-ssml.d.ts.map