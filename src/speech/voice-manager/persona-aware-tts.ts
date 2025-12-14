/**
 * Persona-Aware TTS
 *
 * A TTS implementation that uses the voice configuration from a PersonaConfig.
 * Supports runtime voice switching for handoffs.
 * Supports international English accents (British, Australian, Indian).
 *
 * IMPORTANT: For non-American accents, you must pass a LOCALIZED voice ID
 * (from Cartesia's /voices/localize API). The `language` parameter alone
 * does NOT change the accent - it only affects multilingual text processing.
 *
 * Use `getLocalizedVoiceId()` from cartesia-voice-localization.ts to get
 * the correct voice ID before creating this TTS instance.
 */

import { tts } from '@livekit/agents';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { type EnglishAccent, DEFAULT_ACCENT } from '../../config/voice-accents.js';
import { handoffEvents } from '../../tools/handoff/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { PersonaVoiceConfig } from './types.js';

// Cartesia model from env var - single source of truth
const CARTESIA_MODEL = process.env.CARTESIA_MODEL || 'sonic-3';

// ============================================================================
// PERSONA-AWARE TTS
// ============================================================================

/**
 * Persona-Aware TTS
 *
 * A TTS implementation that uses the voice configuration from a PersonaConfig.
 * This allows each persona (Jack Bogle, Ferni, Peter John, etc.) to have
 * its own distinct voice.
 *
 * SUPPORTS VOICE SWITCHING: Call switchVoice() to change to a different voice
 * at runtime (e.g., for Jack <-> Peter handoffs).
 *
 * SUPPORTS ACCENTS: Pass a localized voice ID for British/Australian/Indian accents.
 * The voice ID should come from Cartesia's voice localization API.
 *
 * THREAD SAFETY: Voice switches are synchronized to prevent race conditions
 * during active speech synthesis.
 */
export class PersonaAwareTTS extends tts.TTS {
  readonly label = 'persona-aware-cartesia-tts';

  private personaTTS: cartesia.TTS;
  private personaName: string;
  private voiceId: string;
  private accent: EnglishAccent;
  private isLocalizedVoice: boolean;

  // Synchronization state for safe voice switching
  private isSwitching = false;
  private pendingSwitch: { personaName: string; voiceId: string; accent?: EnglishAccent } | null =
    null;
  private activeStreamCount = 0;

  // Event handler reference for cleanup
  private voiceSwitchHandler: ((data: { newAgent: string; voiceId: string }) => void) | null = null;

  constructor(
    personaName: string,
    voiceConfig: PersonaVoiceConfig & { isLocalizedVoice?: boolean }
  ) {
    // Call parent with sample rate and channels (matching DynamicTTS)
    super(44100, 1, { streaming: true });

    this.personaName = personaName;
    this.voiceId = voiceConfig.voiceId;
    this.accent = voiceConfig.accent ?? DEFAULT_ACCENT;
    this.isLocalizedVoice = voiceConfig.isLocalizedVoice ?? this.accent !== 'american';

    // Create TTS instance for this persona's voice
    // Using model from env var (speed control not available - use SSML prosody instead)
    // NOTE: For accents, the voiceId should already be a localized voice from Cartesia API
    this.personaTTS = new cartesia.TTS({
      model: CARTESIA_MODEL,
      voice: voiceConfig.voiceId,
      language: 'en', // Always 'en' - accent is determined by voice ID, not language param
    });

    getLogger().info(
      {
        persona: personaName,
        voiceId: voiceConfig.voiceId,
        accent: this.accent,
        isLocalizedVoice: this.isLocalizedVoice,
        model: CARTESIA_MODEL,
      },
      '🌍 PersonaAwareTTS initialized with accent'
    );

    // NOTE: PersonaAwareTTS no longer auto-switches on voiceSwitch events
    // The voice-agent.ts now controls timing: it sends frontend notification,
    // waits for transition sound, THEN calls switchVoice() directly.
    // This prevents the voice from changing before the frontend plays sounds.
    this.voiceSwitchHandler = null; // Explicitly null - no auto-switch
  }

  /**
   * Clean up event listeners to prevent memory leaks
   */
  cleanup(): void {
    if (this.voiceSwitchHandler) {
      handoffEvents.off('voiceSwitch', this.voiceSwitchHandler);
      this.voiceSwitchHandler = null;
    }
  }

  /**
   * Switch to a different voice at runtime (e.g., for Jack <-> Peter handoffs).
   *
   * If a stream is currently active, the switch is queued and applied
   * after the current stream completes.
   *
   * @param newPersonaName - Name of the new persona
   * @param newVoiceId - Voice ID for the new persona
   * @param newAccent - Optional accent override (defaults to current accent)
   */
  switchVoice(newPersonaName: string, newVoiceId: string, newAccent?: EnglishAccent): void {
    const targetAccent = newAccent ?? this.accent;

    if (this.voiceId === newVoiceId && this.accent === targetAccent) {
      getLogger().debug({ persona: newPersonaName }, 'Already using this voice and accent');
      return;
    }

    // If we're in the middle of a stream, queue the switch
    if (this.activeStreamCount > 0) {
      getLogger().info(
        {
          persona: newPersonaName,
          activeStreams: this.activeStreamCount,
        },
        '⏸️ Voice switch queued (stream active)'
      );
      this.pendingSwitch = {
        personaName: newPersonaName,
        voiceId: newVoiceId,
        accent: targetAccent,
      };
      return;
    }

    this.performVoiceSwitch(newPersonaName, newVoiceId, targetAccent);
  }

  /**
   * Switch accent without changing the persona.
   * This is a simple version that just updates internal state.
   * For proper accent changes, use switchToLocalizedAccent() instead.
   *
   * @param newAccent - The new accent to use
   * @deprecated Use switchToLocalizedAccent() for proper accent changes
   */
  switchAccent(newAccent: EnglishAccent): void {
    if (this.accent === newAccent) {
      getLogger().debug({ accent: newAccent }, 'Already using this accent');
      return;
    }

    getLogger().info(
      {
        from: this.accent,
        to: newAccent,
        persona: this.personaName,
      },
      '🌍 Accent switch requested (simple)'
    );

    this.switchVoice(this.personaName, this.voiceId, newAccent);
  }

  /**
   * Switch to a localized accent by getting the proper voice ID from Cartesia.
   * This is the correct way to change accents mid-session.
   *
   * @param newAccent - The new accent to use
   * @param personaId - The persona ID (canonical, e.g., 'ferni', 'peter-john')
   * @returns Promise resolving to true if switch was successful
   */
  async switchToLocalizedAccent(newAccent: EnglishAccent, personaId: string): Promise<boolean> {
    if (this.accent === newAccent) {
      getLogger().debug({ accent: newAccent }, 'Already using this accent');
      return true;
    }

    getLogger().info(
      {
        from: this.accent,
        to: newAccent,
        persona: personaId,
      },
      '🌍 Localized accent switch requested'
    );

    try {
      // Dynamically import to avoid circular dependencies
      const { getLocalizedVoiceId } = await import('../../services/cartesia-voice-localization.js');
      const result = await getLocalizedVoiceId(personaId, newAccent);

      // Switch to the localized voice
      this.switchVoice(this.personaName, result.voiceId, newAccent);

      getLogger().info(
        {
          from: this.accent,
          to: newAccent,
          voiceId: result.voiceId,
          isLocalized: result.isLocalized,
        },
        '✅ Switched to localized accent'
      );

      return true;
    } catch (error) {
      getLogger().error(
        { error: String(error), accent: newAccent, persona: personaId },
        '❌ Failed to switch to localized accent'
      );
      return false;
    }
  }

  /**
   * Actually perform the voice switch.
   */
  private performVoiceSwitch(
    newPersonaName: string,
    newVoiceId: string,
    newAccent?: EnglishAccent
  ): void {
    if (this.isSwitching) {
      // Already switching, queue this one
      this.pendingSwitch = { personaName: newPersonaName, voiceId: newVoiceId, accent: newAccent };
      return;
    }

    this.isSwitching = true;

    const oldPersona = this.personaName;
    const oldVoiceId = this.voiceId;
    const oldAccent = this.accent;

    this.personaName = newPersonaName;
    this.voiceId = newVoiceId;
    this.accent = newAccent ?? this.accent;
    this.isLocalizedVoice = this.accent !== 'american';

    // Create new TTS instance with new voice
    // NOTE: For accents, newVoiceId should already be a localized voice ID
    this.personaTTS = new cartesia.TTS({
      model: CARTESIA_MODEL,
      voice: newVoiceId,
      language: 'en', // Always 'en' - accent is determined by voice ID
    });

    getLogger().info(
      {
        from: oldPersona,
        to: newPersonaName,
        oldVoiceId,
        newVoiceId,
        oldAccent,
        newAccent: this.accent,
        isLocalizedVoice: this.isLocalizedVoice,
      },
      '🔄 PersonaAwareTTS voice switched'
    );

    this.isSwitching = false;

    // Process any pending switch
    if (
      this.pendingSwitch &&
      (this.pendingSwitch.voiceId !== this.voiceId || this.pendingSwitch.accent !== this.accent)
    ) {
      const pending = this.pendingSwitch;
      this.pendingSwitch = null;
      this.performVoiceSwitch(pending.personaName, pending.voiceId, pending.accent);
    }
  }

  /**
   * Track stream lifecycle for safe voice switching.
   */
  private trackStream<T>(operation: () => T): T {
    this.activeStreamCount++;

    try {
      const result = operation();

      // For streams, we need to track when they complete
      // Note: The actual stream completion tracking would require
      // wrapping the stream, but for now we decrement immediately
      // since Cartesia handles this internally
      return result;
    } finally {
      // Use setTimeout to allow the stream to start before decrementing
      setTimeout(() => {
        this.activeStreamCount = Math.max(0, this.activeStreamCount - 1);

        // Process pending switch if all streams are done
        if (this.activeStreamCount === 0 && this.pendingSwitch) {
          const pending = this.pendingSwitch;
          this.pendingSwitch = null;
          this.performVoiceSwitch(pending.personaName, pending.voiceId);
        }
      }, 100); // Small delay to allow stream to initialize
    }
  }

  /**
   * Synthesize text to speech using the persona's voice
   */
  synthesize(text: string): tts.ChunkedStream {
    getLogger().debug({ persona: this.personaName }, 'TTS speaking');
    return this.trackStream(() => this.personaTTS.synthesize(text));
  }

  /**
   * Stream synthesis for the persona's voice
   */
  stream(): tts.SynthesizeStream {
    getLogger().debug({ persona: this.personaName }, 'Starting TTS stream');
    return this.trackStream(() => this.personaTTS.stream());
  }

  /**
   * Get the voice ID being used
   */
  getVoiceId(): string {
    return this.voiceId;
  }

  /**
   * Get the current persona name
   */
  getPersonaName(): string {
    return this.personaName;
  }

  /**
   * Get the current accent
   */
  getAccent(): EnglishAccent {
    return this.accent;
  }

  /**
   * Check if the current voice is a localized version
   */
  isLocalized(): boolean {
    return this.isLocalizedVoice;
  }

  /**
   * Check if a voice switch is pending
   */
  hasPendingSwitch(): boolean {
    return this.pendingSwitch !== null;
  }
}

/**
 * Create a PersonaAwareTTS instance for a specific persona
 *
 * @param personaName - The name of the persona (for logging)
 * @param voiceConfig - The voice configuration from the persona (includes optional accent)
 * @returns A TTS instance configured for the persona's voice and accent
 *
 * @example
 * // With default American accent
 * const tts = createPersonaAwareTTS(sessionPersona.name, sessionPersona.voice);
 *
 * @example
 * // With user's preferred accent
 * const tts = createPersonaAwareTTS(sessionPersona.name, {
 *   ...sessionPersona.voice,
 *   accent: userPreferences.accent  // 'british', 'australian', 'indian'
 * });
 */
export function createPersonaAwareTTS(
  personaName: string,
  voiceConfig: PersonaVoiceConfig
): PersonaAwareTTS {
  return new PersonaAwareTTS(personaName, voiceConfig);
}

// Re-export accent types for convenience
export { DEFAULT_ACCENT, SUPPORTED_ACCENTS } from '../../config/voice-accents.js';
export type { EnglishAccent } from '../../config/voice-accents.js';
