/**
 * Persona-Aware TTS - Full-Featured Voice Agent TTS
 *
 * This module provides a TTS wrapper with:
 * - Runtime voice switching for persona handoffs
 * - International accent support
 * - Thread-safe stream tracking
 * - LiveKit tts.TTS base class compatibility
 *
 * After Sonata migration (Feb 2026), uses Cartesia via LiveKit plugin.
 *
 * @module @ferni/speech/tts/persona-aware
 */

import { tts } from '@livekit/agents';
import { TTS as CartesiaTTS } from '@livekit/agents-plugin-cartesia';
import { CARTESIA_MODEL, DEFAULT_VOICE_IDS } from '../../config/voice-ids.js';
import type { PersonaVoiceConfig } from './types.js';

// ============================================================================
// ACCENT TYPES
// ============================================================================

export type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';
export const DEFAULT_ACCENT: EnglishAccent = 'american';
export const SUPPORTED_ACCENTS: EnglishAccent[] = ['american', 'british', 'australian', 'indian'];

// ============================================================================
// CARTESIA TTS FACTORY
// ============================================================================

function createCartesiaTTSInstance(voiceId: string): CartesiaTTS {
  return new CartesiaTTS({
    model: CARTESIA_MODEL,
    voice: voiceId,
    language: 'en',
    sampleRate: 24000,
    encoding: 'pcm_s16le',
  });
}

// ============================================================================
// LAZY-LOADED LOGGER
// ============================================================================

// Logger is lazy-loaded to avoid import chain in lightweight contexts
let _logger: { info: Function; debug: Function; warn: Function; error: Function } | null = null;

async function getLogger() {
  if (!_logger) {
    try {
      const { getLogger: _getLogger } = await import('../../utils/safe-logger.js');
      _logger = _getLogger();
    } catch {
      // Fallback to console in contexts where logger isn't available
      _logger = {
        info: (data: unknown, msg: string) => console.log(`[PersonaAwareTTS] ${msg}`, data),
        debug: (data: unknown, msg: string) => console.debug(`[PersonaAwareTTS] ${msg}`, data),
        warn: (data: unknown, msg: string) => console.warn(`[PersonaAwareTTS] ${msg}`, data),
        error: (data: unknown, msg: string) => console.error(`[PersonaAwareTTS] ${msg}`, data),
      };
    }
  }
  return _logger;
}

// Sync logger for hot paths (uses cached logger or fallback)
function log(level: 'info' | 'debug' | 'warn' | 'error', data: unknown, msg: string) {
  if (_logger) {
    _logger[level](data, msg);
  } else {
    // Fallback for before async init
    process.stderr.write(`[PersonaAwareTTS] ${msg} ${JSON.stringify(data)}\n`);
  }
}

// ============================================================================
// PERSONA-AWARE TTS CLASS
// ============================================================================

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
export class PersonaAwareTTS extends tts.TTS {
  readonly label = 'persona-aware-tts';

  private personaTTS: CartesiaTTS;
  private personaName: string;
  private voiceId: string;
  private accent: EnglishAccent;
  private isLocalizedVoice: boolean;

  // Synchronization state for safe voice switching
  private isSwitching = false;
  private pendingSwitch: { personaName: string; voiceId: string; accent?: EnglishAccent } | null =
    null;
  private activeStreamCount = 0;

  // Legacy property for backwards compatibility (no longer auto-subscribes to events)
  private voiceSwitchHandler: ((data: { newAgent: string; voiceId: string }) => void) | null = null;

  constructor(
    personaName: string,
    voiceConfig: PersonaVoiceConfig & { isLocalizedVoice?: boolean }
  ) {
    // Call parent with sample rate and channels
    // IMPORTANT: Cartesia outputs at 24000 Hz - must match!
    super(24000, 1, { streaming: true });

    this.personaName = personaName;
    this.voiceId = voiceConfig.voiceId || DEFAULT_VOICE_IDS.FERNI;
    this.accent = (voiceConfig.accent as EnglishAccent) ?? DEFAULT_ACCENT;
    this.isLocalizedVoice = voiceConfig.isLocalizedVoice ?? this.accent !== 'american';

    this.personaTTS = createCartesiaTTSInstance(this.voiceId);

    // Initialize logger asynchronously (non-blocking)
    getLogger().then((logger) => {
      logger.info(
        {
          persona: personaName,
          voiceId: this.voiceId,
          accent: this.accent,
          isLocalizedVoice: this.isLocalizedVoice,
          model: CARTESIA_MODEL,
        },
        '🌍 PersonaAwareTTS initialized'
      );
    });
  }

  /**
   * Clean up resources.
   */
  cleanup(): void {
    // No-op - no event listeners to clean up in this version
  }

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
  switchVoice(newPersonaName: string, newVoiceId: string, newAccent?: EnglishAccent): void {
    const targetAccent = newAccent ?? this.accent;

    if (this.voiceId === newVoiceId && this.accent === targetAccent) {
      log('debug', { persona: newPersonaName }, 'Already using this voice and accent');
      return;
    }

    // If we're in the middle of a stream, queue the switch
    if (this.activeStreamCount > 0) {
      log(
        'info',
        { persona: newPersonaName, activeStreams: this.activeStreamCount },
        '⏸️ Voice switch queued'
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
   *
   * @param newAccent - The new accent to use
   * @param personaId - The persona ID to get localized voice for (defaults to current persona name)
   * @deprecated Use switchToLocalizedAccent() directly for proper accent changes
   */
  switchAccent(newAccent: EnglishAccent, personaId?: string): void {
    if (this.accent === newAccent) {
      log('debug', { accent: newAccent }, 'Already using this accent');
      return;
    }

    log(
      'warn',
      { from: this.accent, to: newAccent, persona: this.personaName },
      '⚠️ switchAccent() is deprecated - calling switchToLocalizedAccent() instead'
    );
    // Call the proper async method (fire-and-forget since this method is sync)
    void this.switchToLocalizedAccent(newAccent, personaId ?? this.personaName);
  }

  /**
   * Switch to a localized accent by getting the proper voice ID from Cartesia.
   *
   * @param newAccent - The new accent to use
   * @param personaId - The persona ID (e.g., 'ferni', 'peter-john')
   * @returns Promise resolving to true if switch was successful
   */
  async switchToLocalizedAccent(newAccent: EnglishAccent, personaId: string): Promise<boolean> {
    if (this.accent === newAccent) {
      log('debug', { accent: newAccent }, 'Already using this accent');
      return true;
    }

    log(
      'info',
      { from: this.accent, to: newAccent, persona: personaId },
      '🌍 Localized accent switch requested'
    );

    try {
      // Dynamic import to avoid circular dependencies
      const { getLocalizedVoiceId } =
        await import('../../services/voice/cartesia-voice-localization.js');
      const result = await getLocalizedVoiceId(personaId, newAccent);

      this.switchVoice(this.personaName, result.voiceId, newAccent);

      log(
        'info',
        { voiceId: result.voiceId, isLocalized: result.isLocalized },
        '✅ Switched to localized accent'
      );
      return true;
    } catch (error) {
      log('error', { error: String(error), accent: newAccent }, '❌ Failed to switch accent');
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
      this.pendingSwitch = { personaName: newPersonaName, voiceId: newVoiceId, accent: newAccent };
      return;
    }

    this.isSwitching = true;

    const oldPersona = this.personaName;
    const oldVoiceId = this.voiceId;

    this.personaName = newPersonaName;
    this.voiceId = newVoiceId;
    this.accent = newAccent ?? this.accent;
    this.isLocalizedVoice = this.accent !== 'american';

    this.personaTTS = createCartesiaTTSInstance(newVoiceId);

    log(
      'info',
      { from: oldPersona, to: newPersonaName, oldVoiceId, newVoiceId },
      '🔄 Voice switched'
    );

    this.isSwitching = false;

    // Process any pending switch
    if (this.pendingSwitch && this.pendingSwitch.voiceId !== this.voiceId) {
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
      return operation();
    } finally {
      // Decrement after small delay to allow stream to start
      setTimeout(() => {
        this.activeStreamCount = Math.max(0, this.activeStreamCount - 1);

        // Process pending switch if all streams are done
        if (this.activeStreamCount === 0 && this.pendingSwitch) {
          const pending = this.pendingSwitch;
          this.pendingSwitch = null;
          this.performVoiceSwitch(pending.personaName, pending.voiceId, pending.accent);
        }
      }, 100);
    }
  }

  /**
   * Strip SSML tags from text before sending to TTS.
   * Cartesia doesn't support SSML and will speak tags literally (e.g., "break time 300ms").
   */
  private stripSsml(text: string): string {
    // Remove <break> tags entirely
    let result = text.replace(/<break[^>]*\/>/gi, ' ');
    result = result.replace(/<break[^>]*>[^<]*<\/break>/gi, ' ');

    // Remove <emotion> tags but keep content
    result = result.replace(/<emotion[^>]*>(.*?)<\/emotion>/gi, '$1');

    // Remove <prosody> tags but keep content
    result = result.replace(/<prosody[^>]*>(.*?)<\/prosody>/gi, '$1');

    // Remove <speed> and <volume> tags (self-closing)
    result = result.replace(/<speed[^>]*\/?>/gi, '');
    result = result.replace(/<volume[^>]*\/?>/gi, '');

    // Remove <speak> wrapper if present
    result = result.replace(/<\/?speak>/gi, '');

    // Remove any other XML-like tags
    result = result.replace(/<[^>]+>/g, ' ');

    // Clean up colon-based speech patterns that TTS doesn't handle well
    result = this.cleanColonPatterns(result);

    // Clean up multiple spaces
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  /**
   * Clean up colon-based patterns that sound unnatural in speech.
   * OpenAI models often produce "The pro: X. The con: Y." patterns.
   * TTS either says "colon" or pauses awkwardly.
   */
  private cleanColonPatterns(text: string): string {
    let result = text;

    // "The pro: X" → "On one hand, X"
    result = result.replace(/\bThe pro:\s*/gi, 'On one hand, ');
    // "The con: X" → "On the other hand, X"
    result = result.replace(/\bThe con:\s*/gi, 'On the other hand, ');

    // "Pros: X" → "The advantages are X"
    result = result.replace(/\bPros?:\s*/gi, 'The advantage is ');
    // "Cons: X" → "The downside is X"
    result = result.replace(/\bCons?:\s*/gi, 'The downside is ');

    // "Option one: X" / "Option 1: X" → "One option is X"
    result = result.replace(/\bOption\s*(?:one|1):\s*/gi, 'One option is ');
    result = result.replace(/\bOption\s*(?:two|2):\s*/gi, 'Another option is ');
    result = result.replace(/\bOption\s*(?:three|3):\s*/gi, 'A third option is ');

    // "Step one: X" / "Step 1: X" → "First, X"
    result = result.replace(/\bStep\s*(?:one|1):\s*/gi, 'First, ');
    result = result.replace(/\bStep\s*(?:two|2):\s*/gi, 'Second, ');
    result = result.replace(/\bStep\s*(?:three|3):\s*/gi, 'Third, ');

    // "Note: X" → "One thing to note, X"
    result = result.replace(/\bNote:\s*/gi, 'One thing to note, ');

    // "Summary: X" → "To summarize, X"
    result = result.replace(/\bSummary:\s*/gi, 'To summarize, ');

    // "Example: X" → "For example, X"
    result = result.replace(/\bExample:\s*/gi, 'For example, ');

    // "Result: X" → "The result is X"
    result = result.replace(/\bResult:\s*/gi, 'The result is ');

    // "Answer: X" → "The answer is X"
    result = result.replace(/\bAnswer:\s*/gi, 'The answer is ');

    // "Reason: X" → "The reason is X"
    result = result.replace(/\bReason:\s*/gi, 'The reason is ');

    // Generic "Label: value" at sentence start - replace colon with period or comma
    // "Here's the thing: X" → "Here's the thing. X"
    result = result.replace(/:\s*(?=[A-Z])/g, '. ');

    // Cleanup: fix double spaces and awkward punctuation
    result = result.replace(/\.\s*\./g, '.');
    result = result.replace(/,\s*,/g, ',');
    result = result.replace(/\s+/g, ' ');

    return result;
  }

  /**
   * Synthesize text to speech.
   *
   * SSML tags are stripped before synthesis since Cartesia doesn't support them
   * and will speak them literally (e.g., "break time 300ms").
   */
  synthesize(text: string): tts.ChunkedStream {
    // Strip SSML tags - Cartesia speaks them literally if not removed
    const cleanText = this.stripSsml(text);
    log(
      'debug',
      { persona: this.personaName, voiceId: this.voiceId, hadSsml: cleanText !== text },
      'TTS synthesize'
    );
    return this.trackStream(() => this.personaTTS.synthesize(cleanText));
  }

  /**
   * Start a streaming synthesis.
   *
   * The returned stream wraps pushText() to strip SSML tags before synthesis.
   */
  stream(): tts.SynthesizeStream {
    log('debug', { persona: this.personaName, voiceId: this.voiceId }, 'TTS stream');
    const underlyingStream = this.trackStream(() =>
      this.personaTTS.stream()
    ) as tts.SynthesizeStream;

    // Wrap pushText to strip SSML before forwarding to underlying stream
    const originalPushText = underlyingStream.pushText.bind(underlyingStream);
    underlyingStream.pushText = (text: string) => {
      const cleanText = this.stripSsml(text);
      return originalPushText(cleanText);
    };

    return underlyingStream;
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getVoiceId(): string {
    return this.voiceId;
  }

  getPersonaName(): string {
    return this.personaName;
  }

  getAccent(): EnglishAccent {
    return this.accent;
  }

  isLocalized(): boolean {
    return this.isLocalizedVoice;
  }

  hasPendingSwitch(): boolean {
    return this.pendingSwitch !== null;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

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
export function createPersonaAwareTTS(
  personaName: string,
  voiceConfig: PersonaVoiceConfig
): PersonaAwareTTS {
  return new PersonaAwareTTS(personaName, voiceConfig);
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export { CARTESIA_MODEL, DEFAULT_VOICE_IDS, getVoiceIdForPersona } from '../../config/voice-ids.js';
export type { PersonaVoiceConfig, VoiceConfig } from './types.js';
