/**
 * Silence Presence Phrases
 *
 * Comfortable silence phrases by presence level.
 * These are phrases that can trail off into silence while maintaining presence.
 *
 * @module speech/adaptive-ssml/superhuman-voice/silence-presence
 */
import type { PresenceLevel } from '../../../conversation/superhuman/presence-mode.js';
/**
 * Comfortable silence phrases by presence level.
 * These are phrases that can trail off into silence while maintaining presence.
 */
export declare const SILENCE_PRESENCE_PHRASES: Record<PresenceLevel, string[]>;
/**
 * Get a silence presence phrase for the given level.
 */
export declare function getSilencePresencePhrase(level: PresenceLevel | undefined): string | null;
//# sourceMappingURL=silence-presence.d.ts.map