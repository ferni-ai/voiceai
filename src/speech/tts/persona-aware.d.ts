/**
 * Persona-Aware TTS - Full-Featured Voice Agent TTS
 *
 * This module provides a TTS wrapper with:
 * - Runtime voice switching for persona handoffs
 * - International accent support
 * - Thread-safe stream tracking
 * - LiveKit tts.TTS base class compatibility
 *
 * ARCHITECTURE NOTE:
 * This module uses the lightweight cartesia-core.ts for TTS creation.
 * Heavy dependencies (logger, handoffEvents) are lazy-loaded to avoid
 * import chain issues in contexts where they're not needed.
 *
 * For simple TTS without voice switching, use cartesia-core.ts directly.
 *
 * @module @ferni/speech/tts/persona-aware
 */
import { tts } from '@livekit/agents';
import type { PersonaVoiceConfig } from './types.js';
export type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';
export declare const DEFAULT_ACCENT: EnglishAccent;
export declare const SUPPORTED_ACCENTS: EnglishAccent[];
/**
 * Persona-Aware TTS
 *
 * A TTS implementation that uses the voice configuration from a PersonaConfig.
 * This allows each persona (Ferni, Peter John, etc.) to have its own distinct voice.
 *
 * Features:
 * - VOICE SWITCHING: Call switchVoice() to change voices at runtime
 * - ACCENT SUPPORT: Pass a localized voice ID for British/Australian/Indian
 * - THREAD SAFETY: Voice switches are synchronized during active synthesis
 */
export declare class PersonaAwareTTS extends tts.TTS {
    readonly label = "persona-aware-tts";
    private personaTTS;
    private personaName;
    private voiceId;
    private accent;
    private isLocalizedVoice;
    private provider;
    private isSwitching;
    private pendingSwitch;
    private activeStreamCount;
    private voiceSwitchHandler;
    constructor(personaName: string, voiceConfig: PersonaVoiceConfig & {
        isLocalizedVoice?: boolean;
    });
    /**
     * Clean up resources.
     */
    cleanup(): void;
    /**
     * Switch to a different voice at runtime (e.g., for persona handoffs).
     *
     * If a stream is currently active, the switch is queued and applied
     * after the current stream completes.
     *
     * @param newPersonaName - Name of the new persona
     * @param newVoiceId - Voice ID for the new persona
     * @param newAccent - Optional accent override
     */
    switchVoice(newPersonaName: string, newVoiceId: string, newAccent?: EnglishAccent): void;
    /**
     * Switch accent without changing the persona.
     *
     * @param newAccent - The new accent to use
     * @param personaId - The persona ID to get localized voice for (defaults to current persona name)
     * @deprecated Use switchToLocalizedAccent() directly for proper accent changes
     */
    switchAccent(newAccent: EnglishAccent, personaId?: string): void;
    /**
     * Switch to a localized accent by getting the proper voice ID from Cartesia.
     *
     * @param newAccent - The new accent to use
     * @param personaId - The persona ID (e.g., 'ferni', 'peter-john')
     * @returns Promise resolving to true if switch was successful
     */
    switchToLocalizedAccent(newAccent: EnglishAccent, personaId: string): Promise<boolean>;
    /**
     * Actually perform the voice switch.
     */
    private performVoiceSwitch;
    /**
     * Track stream lifecycle for safe voice switching.
     */
    private trackStream;
    /**
     * Strip SSML tags from text before sending to TTS.
     * Cartesia doesn't support SSML and will speak tags literally (e.g., "break time 300ms").
     * BTCW has its own stripping, so this is a safety net for Cartesia.
     */
    private stripSsml;
    /**
     * Clean up colon-based patterns that sound unnatural in speech.
     * OpenAI models often produce "The pro: X. The con: Y." patterns.
     * TTS either says "colon" or pauses awkwardly.
     */
    private cleanColonPatterns;
    /**
     * Synthesize text to speech.
     * Note: When using BTCW provider, this returns a Promise. We cast to satisfy
     * the base class signature since both implementations produce compatible audio streams.
     *
     * SSML tags are stripped before synthesis since Cartesia doesn't support them
     * and will speak them literally (e.g., "break time 300ms").
     */
    synthesize(text: string): tts.ChunkedStream;
    /**
     * Start a streaming synthesis.
     * Note: BTCWSynthesizeStream and SynthesizeStream are structurally compatible
     * (both are AsyncIterable producing audio frames), so we cast for type safety.
     *
     * The returned stream wraps pushText() to strip SSML tags before synthesis.
     */
    stream(): tts.SynthesizeStream;
    getVoiceId(): string;
    getPersonaName(): string;
    getAccent(): EnglishAccent;
    isLocalized(): boolean;
    hasPendingSwitch(): boolean;
    getProvider(): 'cartesia' | 'btcw';
}
/**
 * Create a PersonaAwareTTS instance for a specific persona.
 *
 * @param personaName - The name of the persona (for logging)
 * @param voiceConfig - The voice configuration from the persona
 * @returns A TTS instance configured for the persona's voice
 *
 * @example
 * ```ts
 * const tts = createPersonaAwareTTS('Ferni', sessionPersona.voice);
 * ```
 */
export declare function createPersonaAwareTTS(personaName: string, voiceConfig: PersonaVoiceConfig): PersonaAwareTTS;
export { CARTESIA_MODEL, DEFAULT_VOICE_IDS, getVoiceIdForPersona } from './cartesia-core.js';
export type { PersonaVoiceConfig, VoiceConfig } from './types.js';
//# sourceMappingURL=persona-aware.d.ts.map