/**
 * Cartesia TTS Adapter
 *
 * Wraps Cartesia TTS with clean interface for the agent architecture.
 * Handles voice switching, speed control, and connection warming.
 *
 * @module agents/adapters/cartesia
 */

import { TTS } from '@livekit/agents-plugin-cartesia';
import { TTSError } from '../core/errors.js';
import { type Result, ok, tryAsync } from '../core/result.js';
import type { Logger, PersonaConfig, SpeakOptions, TTSAdapter } from '../core/types.js';

// ============================================================================
// CARTESIA TTS ADAPTER
// ============================================================================

export interface CartesiaTTSConfig {
  voiceId: string;
  model?: string;
  apiKey?: string;
  speed?: number;
  accent?: string;
}

/**
 * Cartesia TTS adapter implementation.
 */
export class CartesiaTTSAdapter implements TTSAdapter {
  private tts: TTS;
  private currentVoiceId: string;
  private currentSpeed: number;
  private lastLatency: number = 0;
  private warmed: boolean = false;

  constructor(config: CartesiaTTSConfig) {
    this.currentVoiceId = config.voiceId;
    this.currentSpeed = config.speed ?? 1.0;

    this.tts = new TTS({
      model: config.model ?? 'sonic-2',
      voice: config.voiceId,
      apiKey: config.apiKey ?? process.env.CARTESIA_API_KEY,
      speed: this.currentSpeed,
    });
  }

  /**
   * Speak text (delegates to underlying TTS stream).
   * Note: This returns immediately - actual speech is handled by AgentSession.
   */
  async speak(_text: string, _options?: SpeakOptions): Promise<void> {
    // In the real implementation, this is handled by voice.AgentSession
    // This adapter is primarily for configuration and voice switching
    // The speak method exists for interface compliance and testing
  }

  /**
   * Switch to a different voice.
   */
  switchVoice(name: string, voiceId: string): void {
    this.currentVoiceId = voiceId;
    // Cartesia TTS doesn't support dynamic voice switching on existing instance
    // This is tracked for when we recreate TTS or for logging
    process.stderr.write(`[CartesiaTTSAdapter] Voice switched to ${name} (${voiceId})\n`);
  }

  /**
   * Set speech speed multiplier.
   */
  setSpeed(multiplier: number): void {
    this.currentSpeed = Math.max(0.5, Math.min(2.0, multiplier));
  }

  /**
   * Get last speech latency.
   */
  getLatency(): number {
    return this.lastLatency;
  }

  /**
   * Warm the TTS connection for faster first synthesis.
   */
  async warmConnection(): Promise<void> {
    if (this.warmed) return;

    try {
      // Synthesize a tiny amount of speech to warm the connection
      const stream = this.tts.synthesize('Hi');
      // Consume the stream to establish connection
      for await (const _chunk of stream) {
        // Just consume to warm connection
        break; // Only need first chunk
      }
      this.warmed = true;
    } catch {
      // Non-fatal - connection will warm on first real use
    }
  }

  // ============================================================================
  // EXTENDED METHODS
  // ============================================================================

  /**
   * Get the underlying TTS instance for AgentSession.
   */
  getUnderlyingTTS(): TTS {
    return this.tts;
  }

  /**
   * Get current voice ID.
   */
  getCurrentVoiceId(): string {
    return this.currentVoiceId;
  }

  /**
   * Get current speed.
   */
  getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  /**
   * Check if connection is warmed.
   */
  isWarmed(): boolean {
    return this.warmed;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create TTS adapter for a persona.
 */
export function createTTSAdapter(
  persona: PersonaConfig,
  options: { accent?: string; apiKey?: string } = {}
): CartesiaTTSAdapter {
  return new CartesiaTTSAdapter({
    voiceId: persona.voice.voiceId,
    speed: persona.speechCharacteristics?.baseSpeedMultiplier ?? 1.0,
    accent: options.accent,
    apiKey: options.apiKey,
  });
}

/**
 * Create TTS adapter with localized voice.
 */
export async function createLocalizedTTSAdapter(
  persona: PersonaConfig,
  userAccent: string,
  logger: Logger
): Promise<Result<CartesiaTTSAdapter, TTSError>> {
  let voiceId = persona.voice.voiceId;

  // Try to get localized voice for non-American accents
  if (userAccent && userAccent !== 'american') {
    try {
      const { getLocalizedVoiceId } = await import('../../services/cartesia-voice-localization.js');
      // Cast to the expected accent type (service validates internally)
      const result = await getLocalizedVoiceId(
        persona.id,
        userAccent as 'british' | 'australian' | 'indian'
      );
      voiceId = result.voiceId;
      logger.info(`Voice localized for ${userAccent}`, { cached: result.cached });
    } catch (e) {
      logger.warn(`Voice localization failed (using default)`, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const adapter = new CartesiaTTSAdapter({
    voiceId,
    speed: persona.speechCharacteristics?.baseSpeedMultiplier ?? 1.0,
  });

  return ok(adapter);
}

/**
 * Warm TTS connection with Result type error handling.
 */
export async function warmTTSConnection(
  adapter: CartesiaTTSAdapter,
  logger: Logger
): Promise<Result<void, TTSError>> {
  return tryAsync(
    async () => {
      await adapter.warmConnection();
      logger.debug('TTS connection warmed');
    },
    (e) => new TTSError('connect', e instanceof Error ? e.message : String(e))
  );
}

// ============================================================================
// MOCK ADAPTER (Testing)
// ============================================================================

/**
 * Mock TTS adapter for testing.
 */
export class MockTTSAdapter implements TTSAdapter {
  public spokenTexts: Array<{ text: string; options?: SpeakOptions }> = [];
  public voiceSwitches: Array<{ name: string; voiceId: string }> = [];
  public currentSpeed = 1.0;
  public warmed = false;

  private shouldFail = false;
  private failError?: Error;

  async speak(text: string, options?: SpeakOptions): Promise<void> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw this.failError ?? new Error('Mock TTS failure');
    }
    this.spokenTexts.push({ text, options });
  }

  switchVoice(name: string, voiceId: string): void {
    this.voiceSwitches.push({ name, voiceId });
  }

  setSpeed(multiplier: number): void {
    this.currentSpeed = multiplier;
  }

  getLatency(): number {
    return 50; // Mock latency
  }

  async warmConnection(): Promise<void> {
    this.warmed = true;
  }

  // Test helpers
  failNext(error?: Error): void {
    this.shouldFail = true;
    this.failError = error;
  }

  getLastSpoken(): string | undefined {
    return this.spokenTexts[this.spokenTexts.length - 1]?.text;
  }

  clear(): void {
    this.spokenTexts = [];
    this.voiceSwitches = [];
  }
}
