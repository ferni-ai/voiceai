/**
 * Pre-Response Micro-Sounds
 *
 * Opening micro-sounds that create immediate emotional connection:
 * - "Oh!" for good news
 * - "Oh..." for bad news
 * - "Hmm..." for questions
 * - "Hey!" for greetings
 *
 * @module speech/adaptive-ssml/alive-voice/opening-sounds
 */
import type { AliveVoiceContext, OpeningSoundOption } from './types.js';
/**
 * Opening micro-sounds based on context.
 * These create immediate emotional connection.
 */
export declare const OPENING_SOUNDS: Record<string, OpeningSoundOption[]>;
/**
 * Add pre-response micro-sound based on context.
 * These small sounds create immediate emotional connection.
 */
export declare function addOpeningSound(text: string, context: AliveVoiceContext): string;
//# sourceMappingURL=opening-sounds.d.ts.map