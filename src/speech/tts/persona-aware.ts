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
import type * as cartesia from '@livekit/agents-plugin-cartesia';
import {
  CARTESIA_MODEL,
  createCartesiaTTS,
  DEFAULT_VOICE_IDS,
  getDefaultTTSProvider,
} from './cartesia-core.js';
import { createBTCWTTS, getBTCWVoiceIdForPersona, type BTCWTTS } from './btcw-core.js';
import type { PersonaVoiceConfig } from './types.js';

// Union type for supported TTS providers
type TTSInstance = cartesia.TTS | BTCWTTS;

// ============================================================================
// ACCENT TYPES
// ============================================================================

export type EnglishAccent = 'american' | 'british' | 'australian' | 'indian';
export const DEFAULT_ACCENT: EnglishAccent = 'american';
export const SUPPORTED_ACCENTS: EnglishAccent[] = ['american', 'british', 'australian', 'indian'];

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

  private personaTTS: TTSInstance;
  private personaName: string;
  private voiceId: string;
  private accent: EnglishAccent;
  private isLocalizedVoice: boolean;
  private provider: 'cartesia' | 'btcw';

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

    // Determine provider from config or environment
    this.provider = (voiceConfig.provider as 'cartesia' | 'btcw') || getDefaultTTSProvider();

    // Create TTS using provider-aware factory
    if (this.provider === 'btcw') {
      // For BTCW, map the voice ID to a persona name
      const btcwVoice = getBTCWVoiceIdForPersona(personaName);
      this.personaTTS = createBTCWTTS(btcwVoice, {
        endpoint: voiceConfig.btcwEndpoint,
        apiKey: voiceConfig.btcwApiKey,
        defaultEmotion: (voiceConfig.btcwDefaultEmotion as any) || 'warm',
      });
    } else {
      this.personaTTS = createCartesiaTTS(this.voiceId);
    }

    // Initialize logger asynchronously (non-blocking)
    getLogger().then((logger) => {
      logger.info(
        {
          persona: personaName,
          voiceId: this.voiceId,
          accent: this.accent,
          isLocalizedVoice: this.isLocalizedVoice,
          provider: this.provider,
          model: this.provider === 'cartesia' ? CARTESIA_MODEL : 'cosyvoice-3',
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

    // Create new TTS using provider-aware factory
    if (this.provider === 'btcw') {
      const btcwVoice = getBTCWVoiceIdForPersona(newPersonaName);
      this.personaTTS = createBTCWTTS(btcwVoice, {
        defaultEmotion: 'warm',
      });
    } else {
      this.personaTTS = createCartesiaTTS(newVoiceId);
    }

    log(
      'info',
      { from: oldPersona, to: newPersonaName, oldVoiceId, newVoiceId, provider: this.provider },
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
   * Synthesize text to speech.
   * Note: When using BTCW provider, this returns a Promise. We cast to satisfy
   * the base class signature since both implementations produce compatible audio streams.
   */
  synthesize(text: string): tts.ChunkedStream {
    log('debug', { persona: this.personaName, voiceId: this.voiceId }, 'TTS synthesize');
    // BTCW.synthesize() returns Promise<BTCWChunkedStream>, Cartesia returns ChunkedStream
    // Both are functionally compatible audio iterables, so we cast for the base class
    return this.trackStream(() => this.personaTTS.synthesize(text)) as tts.ChunkedStream;
  }

  /**
   * Start a streaming synthesis.
   * Note: BTCWSynthesizeStream and SynthesizeStream are structurally compatible
   * (both are AsyncIterable producing audio frames), so we cast for type safety.
   */
  stream(): tts.SynthesizeStream {
    log('debug', { persona: this.personaName, voiceId: this.voiceId }, 'TTS stream');
    // BTCWSynthesizeStream is structurally compatible with SynthesizeStream
    return this.trackStream(() => this.personaTTS.stream()) as tts.SynthesizeStream;
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

  getProvider(): 'cartesia' | 'btcw' {
    return this.provider;
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

export { CARTESIA_MODEL, DEFAULT_VOICE_IDS, getVoiceIdForPersona } from './cartesia-core.js';
export type { PersonaVoiceConfig, VoiceConfig } from './types.js';
