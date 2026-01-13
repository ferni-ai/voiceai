/**
 * Persona Phrases - Superhuman Voice
 *
 * Silence presence phrases, anticipatory comfort sounds, and emotional transitions.
 * These features make Ferni feel MORE present than a human could be.
 *
 * @module persona-phrases/superhuman-voice
 */
/**
 * Silence presence phrases by persona.
 * Used when holding space in presence mode - comfortable silences with presence.
 */
export declare const SILENCE_PRESENCE_PHRASES: Record<string, string[]>;
/**
 * Anticipatory comfort sounds by persona and content type.
 * Emitted when detecting heavy content to show immediate presence.
 */
export declare const ANTICIPATORY_COMFORT_SOUNDS: Record<string, Record<'grief' | 'fear' | 'frustration' | 'general', string[]>>;
/**
 * Bridging sounds/phrases for emotional transitions per persona.
 * Prevents jarring shifts between emotions.
 */
export declare const EMOTIONAL_TRANSITION_BRIDGES: Record<string, Record<string, Record<string, string>>>;
/**
 * Get a silence presence phrase for a persona
 */
export declare function getPersonaSilencePresencePhrase(personaId: string): string | null;
/**
 * Get an anticipatory comfort sound for a persona and content type
 */
export declare function getPersonaAnticipatoryComfortSound(personaId: string, contentType: 'grief' | 'fear' | 'frustration' | 'general'): string;
/**
 * Get an emotional transition bridge for a persona
 */
export declare function getPersonaEmotionalTransitionBridge(personaId: string, fromEmotion: string, toEmotion: string): string | null;
//# sourceMappingURL=superhuman-voice.d.ts.map