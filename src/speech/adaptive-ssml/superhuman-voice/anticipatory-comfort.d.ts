/**
 * Anticipatory Comfort Sounds
 *
 * Soft sounds that can be interjected when we detect
 * the user is sharing something difficult.
 *
 * @module speech/adaptive-ssml/superhuman-voice/anticipatory-comfort
 */
import type { HeavyContentType } from './types.js';
/**
 * Anticipatory comfort sounds for heavy content.
 * These are soft sounds that can be interjected when we detect
 * the user is sharing something difficult.
 */
export declare const ANTICIPATORY_COMFORT_SOUNDS: {
    /** When heavy content is detected mid-sentence */
    readonly heavyContent: readonly ["<break time=\"50ms\"/><volume ratio=\"0.7\"/><speed ratio=\"0.85\"/>Mm<break time=\"100ms\"/>", "<break time=\"80ms\"/><volume ratio=\"0.75\"/>Oh<break time=\"100ms\"/>", "<break time=\"60ms\"/><volume ratio=\"0.7\"/>...<break time=\"120ms\"/>"];
    /** When grief/loss is mentioned */
    readonly grief: readonly ["<break time=\"100ms\"/><speed ratio=\"0.75\"/><volume ratio=\"0.7\"/><emotion value=\"sympathetic\"/>Oh...<break time=\"200ms\"/>", "<break time=\"150ms\"/><volume ratio=\"0.65\"/><speed ratio=\"0.7\"/>Mm...<break time=\"200ms\"/>"];
    /** When fear/anxiety is expressed */
    readonly fear: readonly ["<break time=\"80ms\"/><volume ratio=\"0.8\"/><speed ratio=\"0.85\"/>I hear you.<break time=\"150ms\"/>", "<break time=\"100ms\"/><volume ratio=\"0.75\"/>Mm.<break time=\"150ms\"/>"];
    /** When frustration is expressed */
    readonly frustration: readonly ["<break time=\"60ms\"/><volume ratio=\"0.85\"/>Yeah.<break time=\"100ms\"/>", "<break time=\"80ms\"/>Ugh.<break time=\"100ms\"/>"];
};
/**
 * Get an anticipatory comfort sound based on content type.
 */
export declare function getAnticipatoryComfortSound(contentType: 'heavyContent' | 'grief' | 'fear' | 'frustration'): string;
/**
 * Detect if text contains heavy content signals.
 */
export declare function detectHeavyContentType(text: string): HeavyContentType | null;
//# sourceMappingURL=anticipatory-comfort.d.ts.map