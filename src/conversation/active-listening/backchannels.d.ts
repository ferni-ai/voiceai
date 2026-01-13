/**
 * Backchannel Library
 *
 * "Better Than Human" Listening Philosophy:
 *
 * The best human listeners don't constantly interject—they're PRESENT.
 * They use breath sounds and soft resonance, not questions or commands.
 * A good listener never asks a question they don't know they asked.
 *
 * Our backchannels should:
 * 1. BLEND into silence, not interrupt it
 * 2. Be breath-like sounds that signal presence, not words that demand response
 * 3. Never sound like questions without context
 * 4. Never sound like commands ("Go on", "Tell me more")
 *
 * @module conversation/active-listening/backchannels
 */
import type { Backchannel, PersonaBackchannelStyle } from './types.js';
export declare const BACKCHANNELS: Record<Backchannel['type'], Array<Omit<Backchannel, 'type'>>>;
export declare const PERSONA_BACKCHANNEL_STYLES: Record<string, PersonaBackchannelStyle>;
export declare const SILENCE_BACKCHANNELS: Array<Backchannel>;
export declare const SAD_SILENCE_BACKCHANNELS: Array<Backchannel>;
export declare const FERNI_SILENCE_BACKCHANNEL: Backchannel;
export declare const NAYAN_SILENCE_BACKCHANNEL: Backchannel;
//# sourceMappingURL=backchannels.d.ts.map