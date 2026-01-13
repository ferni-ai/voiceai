/**
 * Persona Phrases - Backchannels
 *
 * Backchannel data for all personas.
 *
 * @module persona-phrases/backchannels
 */
import type { BackchannelCategory, BackchannelEmotionType, PersonaBackchannelStyle } from './types.js';
export declare const SOFT_BACKCHANNELS: Record<string, Record<BackchannelEmotionType, string[]>>;
export declare const BACKCHANNEL_LIBRARY: Record<BackchannelCategory, string[]>;
export declare const PERSONA_BACKCHANNEL_STYLE: Record<string, PersonaBackchannelStyle>;
/**
 * Get soft backchannel for a persona
 */
export declare function getSoftBackchannel(personaId: string, emotionType?: BackchannelEmotionType): string;
/**
 * Get backchannel style for a persona
 */
export declare function getPersonaBackchannelStyle(personaId: string): PersonaBackchannelStyle;
/**
 * Get a backchannel phrase from a category
 */
export declare function getBackchannelPhrase(category: BackchannelCategory): string;
//# sourceMappingURL=backchannels.d.ts.map