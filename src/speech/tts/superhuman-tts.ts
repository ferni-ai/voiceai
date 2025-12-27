/**
 * Superhuman TTS - Beyond Human Voice Experience
 *
 * This module wraps the BTCW CosyVoice backend with full superhuman capabilities:
 * - Circadian rhythm adaptation (warmer at night)
 * - Relationship stage awareness (grows more intimate over time)
 * - Emotional anticipation (voice shifts BEFORE emotional content)
 * - Meaningful silence (knows when NOT to speak)
 * - Memory-aware prosody (reverent when discussing sacred memories)
 * - Micro-prosody (subliminal warmth cues)
 * - Active listening backchannels ("mm-hmm", "uh-huh")
 *
 * This is not just TTS - it's context-to-speech.
 *
 * @module @ferni/speech/tts/superhuman-tts
 */

import { tts } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import type { BTCWEmotionType, SuperhumanOptions } from './btcw-core.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Relationship stage between user and AI companion
 */
export type RelationshipStage =
  | 'stranger' // First interactions
  | 'acquaintance' // Getting to know each other
  | 'emerging_friend' // Starting to trust
  | 'developing_friend' // Regular interactions
  | 'close_friend' // Deep trust established
  | 'trusted_confidant' // Shares vulnerabilities
  | 'lifelong_bond'; // Years of history

/**
 * Memory emotional weight - how sacred is this memory?
 */
export type MemoryWeight = 'casual' | 'meaningful' | 'significant' | 'sacred' | 'life_defining';

/**
 * A memory reference that may color the voice
 */
export interface MemoryReference {
  /** Brief description of the memory */
  topic: string;
  /** Original emotion when memory was created */
  originalEmotion: string;
  /** Intensity of the original emotion (0-1) */
  originalIntensity: number;
  /** How emotionally weighted this memory is */
  weight: MemoryWeight;
  /** Does this memory involve loss? */
  involvesLoss?: boolean;
  /** Was this a milestone moment? */
  isMilestone?: boolean;
}

/**
 * User state for context-aware synthesis
 */
export interface UserState {
  /** User's timezone offset from UTC in hours */
  timezoneOffset?: number;
  /** Is the user currently distressed? */
  isDistressed?: boolean;
  /** Distress level (0-1) */
  distressLevel?: number;
  /** Seems emotional right now? */
  seemsEmotional?: boolean;
  /** Seems vulnerable right now? */
  seemsVulnerable?: boolean;
  /** User's breathing rate if known */
  breathRate?: number;
  /** Time since user finished speaking (ms) */
  timeSinceUserFinishedMs?: number;
  /** What the user just said */
  lastMessage?: string;
}

/**
 * Relationship metrics for voice adaptation
 */
export interface RelationshipContext {
  /** Days since first interaction */
  daysSinceFirstInteraction: number;
  /** Total number of interactions */
  totalInteractions: number;
  /** Number of vulnerable moments shared */
  vulnerableMomentsShared?: number;
  /** Emotional support given */
  emotionalSupportGiven?: number;
  /** Computed relationship stage (optional - will be calculated if not provided) */
  stage?: RelationshipStage;
}

/**
 * Full superhuman synthesis context
 */
export interface SuperhumanContext {
  /** User state */
  user?: UserState;
  /** Relationship context */
  relationship?: RelationshipContext;
  /** Memory references in this response */
  memories?: MemoryReference[];
  /** Base emotion for synthesis */
  emotion?: BTCWEmotionType;
  /** Emotion intensity (0-1) */
  emotionIntensity?: number;
}

/**
 * Superhuman synthesis result
 */
export interface SuperhumanResult {
  /** Should we be silent instead of speaking? */
  shouldBeSilent: boolean;
  /** If silent, for how long? (ms) */
  silenceDurationMs?: number;
  /** Minimal response if silent ("I'm here") */
  minimalResponse?: string;
  /** Backchannel to use ("mm-hmm", etc) */
  backchannel?: string;
  /** Capabilities that were applied */
  capabilitiesUsed: string[];
  /** The audio stream (null if silent) */
  audio?: AsyncIterable<{ type: string; frame?: AudioFrame }>;
}

/**
 * Superhuman TTS configuration
 */
export interface SuperhumanTTSConfig {
  /** BTCW server endpoint */
  endpoint?: string;
  /** API key */
  apiKey?: string;
  /** Voice persona name */
  voice?: string;

  // Feature toggles
  enableMicroProsody?: boolean;
  enableBreathSync?: boolean;
  enableEmotionalAnticipation?: boolean;
  enableCircadian?: boolean;
  enableMemoryProsody?: boolean;
  enableBackchannels?: boolean;
  enableMeaningfulSilence?: boolean;
  enableRelationshipEvolution?: boolean;
}

// ============================================================================
// SUPERHUMAN TTS CLASS
// ============================================================================

/**
 * Superhuman TTS - Context-aware voice synthesis
 *
 * This goes beyond traditional TTS by understanding:
 * - WHO is speaking (relationship stage)
 * - WHEN they're speaking (circadian rhythm)
 * - WHAT they're discussing (memory weight)
 * - HOW the user feels (emotional state)
 *
 * @example
 * ```typescript
 * const tts = new SuperhumanTTS({
 *   voice: 'ferni',
 *   apiKey: process.env.BTCW_API_KEY,
 * });
 *
 * const result = await tts.synthesize("I remember what you told me", {
 *   user: { timezoneOffset: -8, seemsEmotional: true },
 *   relationship: { daysSinceFirstInteraction: 180, totalInteractions: 500 },
 *   memories: [{ topic: "loss of father", weight: "sacred", involvesLoss: true }],
 * });
 *
 * if (result.shouldBeSilent) {
 *   // Don't speak - let the moment land
 *   await sleep(result.silenceDurationMs);
 * } else {
 *   // Play the audio
 *   for await (const event of result.audio) { ... }
 * }
 * ```
 */
export class SuperhumanTTS extends tts.TTS {
  readonly label = 'superhuman-tts';

  // Note: sampleRate and numChannels are inherited from parent class (tts.TTS)
  // which provides them as getters based on constructor params

  private endpoint: string;
  private apiKey?: string;
  private voice: string;
  private config: SuperhumanTTSConfig;

  constructor(config: SuperhumanTTSConfig = {}) {
    super(24000, 1, { streaming: true });

    this.endpoint =
      config.endpoint ||
      process.env.BTCW_ENDPOINT ||
      'https://btcw-cosyvoice-1031920444452.us-central1.run.app';
    this.apiKey = config.apiKey || process.env.BTCW_API_KEY;
    this.voice = config.voice || 'ferni';
    this.config = {
      enableMicroProsody: config.enableMicroProsody ?? true,
      enableBreathSync: config.enableBreathSync ?? true,
      enableEmotionalAnticipation: config.enableEmotionalAnticipation ?? true,
      enableCircadian: config.enableCircadian ?? true,
      enableMemoryProsody: config.enableMemoryProsody ?? true,
      enableBackchannels: config.enableBackchannels ?? true,
      enableMeaningfulSilence: config.enableMeaningfulSilence ?? true,
      enableRelationshipEvolution: config.enableRelationshipEvolution ?? true,
      ...config,
    };
  }

  /**
   * Synthesize with full superhuman context
   */
  async synthesizeWithContext(
    text: string,
    context: SuperhumanContext = {}
  ): Promise<SuperhumanResult> {
    // Build the superhuman request body
    const body = {
      input: text,
      voice: this.voice,
      emotion: context.emotion || 'warm',
      emotion_intensity: context.emotionIntensity || 1.0,

      // User context
      user_timezone_offset: context.user?.timezoneOffset || 0,
      user_distressed: context.user?.isDistressed || false,
      user_distress_level: context.user?.distressLevel || 0,
      user_emotional: context.user?.seemsEmotional || false,
      user_vulnerable: context.user?.seemsVulnerable || false,
      user_breath_rate: context.user?.breathRate,
      time_since_user_ms: context.user?.timeSinceUserFinishedMs || 0,
      user_last_text: context.user?.lastMessage || '',

      // Relationship context
      relationship_days: context.relationship?.daysSinceFirstInteraction || 0,
      total_interactions: context.relationship?.totalInteractions || 0,
      vulnerable_moments: context.relationship?.vulnerableMomentsShared || 0,

      // Memory references
      memory_topics: context.memories?.map((m) => m.topic) || [],
      memory_involves_loss: context.memories?.some((m) => m.involvesLoss) || false,

      // Feature toggles (from config)
      superhuman: {
        enable_micro_prosody: this.config.enableMicroProsody,
        enable_breath_sync: this.config.enableBreathSync,
        enable_emotional_anticipation: this.config.enableEmotionalAnticipation,
        enable_circadian: this.config.enableCircadian,
        enable_memory_prosody: this.config.enableMemoryProsody,
        enable_backchannels: this.config.enableBackchannels,
        enable_meaningful_silence: this.config.enableMeaningfulSilence,
        enable_relationship_evolution: this.config.enableRelationshipEvolution,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(`${this.endpoint}/v1/audio/superhuman`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Superhuman synthesis failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Check for meaningful silence
    if (result.should_be_silent) {
      return {
        shouldBeSilent: true,
        silenceDurationMs: result.silence_duration_ms || 2000,
        minimalResponse: result.minimal_response,
        capabilitiesUsed: result.capabilities_used || ['meaningful_silence'],
      };
    }

    // Check for backchannel
    if (result.backchannel) {
      return {
        shouldBeSilent: false,
        backchannel: result.backchannel,
        capabilitiesUsed: result.capabilities_used || ['backchannel'],
        audio: this.createBackchannelAudio(result.backchannel),
      };
    }

    // Stream the audio
    return {
      shouldBeSilent: false,
      capabilitiesUsed: result.capabilities_used || [],
      audio: this.streamAudio(result),
    };
  }

  /**
   * Simple synthesis (for compatibility with base TTS class)
   */
  synthesize(text: string): tts.ChunkedStream {
    // Use simple BTCW synthesis for compatibility
    return this.synthesizeSimple(text);
  }

  /**
   * Simple streaming synthesis
   */
  stream(): tts.SynthesizeStream {
    return this.createSimpleStream();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private synthesizeSimple(text: string): tts.ChunkedStream {
    // Delegate to regular BTCW synthesis

    const generator = async function* (
      this: SuperhumanTTS
    ): AsyncGenerator<{ type: string; frame?: AudioFrame }> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await fetch(`${this.endpoint}/v1/audio/speech`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: text,
          voice: this.voice,
          emotion: 'warm',
          stream: false,
        }),
      });

      if (!response.ok) {
        // For errors, just return without yielding - the stream will end gracefully
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const int16Array = new Int16Array(arrayBuffer);
      const samplesPerChannel = int16Array.length;
      // Use proper LiveKit AudioFrame for compatibility
      const frame = new AudioFrame(int16Array, 24000, 1, samplesPerChannel);

      yield { type: 'audio', frame };
      yield { type: 'done' };
    }.bind(this);

    return generator() as unknown as tts.ChunkedStream;
  }

  private createSimpleStream(): tts.SynthesizeStream {
    // Return a stream-compatible object with internal state
    const self = this;
    const streamState = {
      _text: '',
      _ended: false,
    };

    return {
      pushText(text: string) {
        // Store text for synthesis
        streamState._text += text;
      },
      endInput() {
        streamState._ended = true;
      },
      updateInputStream(text: string) {
        // Replace current text with new text (required by LiveKit agents)
        streamState._text = text;
      },
      markSegmentEnd() {
        // No-op for simple stream
      },
      flush() {
        // No-op for simple stream
      },
      close() {
        // No-op for simple stream
      },
      async *[Symbol.asyncIterator]() {
        // Wait for text
        await new Promise((r) => setTimeout(r, 10));
        const text = streamState._text;

        if (!text) {
          yield { type: 'done' };
          return;
        }

        // Synthesize
        const stream = self.synthesizeSimple(text);
        for await (const event of stream) {
          yield event;
        }
      },
    } as unknown as tts.SynthesizeStream;
  }

  private async *streamAudio(
    result: any
  ): AsyncGenerator<{ type: string; frame?: AudioFrame }> {
    // If we have audio data directly in result
    if (result.audio_base64) {
      const binaryString = atob(result.audio_base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const samplesPerChannel = int16Array.length;
      // Use proper LiveKit AudioFrame for compatibility
      const frame = new AudioFrame(int16Array, 24000, 1, samplesPerChannel);
      yield { type: 'audio', frame };
    }

    yield { type: 'done' };
  }

  private async *createBackchannelAudio(
    backchannel: string
  ): AsyncGenerator<{ type: string; frame?: AudioFrame }> {
    // Synthesize the backchannel phrase - already uses proper AudioFrame
    const stream = this.synthesizeSimple(backchannel);
    for await (const event of stream) {
      yield event as unknown as { type: string; frame?: AudioFrame };
    }
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a SuperhumanTTS instance
 */
export function createSuperhumanTTS(config: SuperhumanTTSConfig = {}): SuperhumanTTS {
  return new SuperhumanTTS(config);
}

/**
 * Create a SuperhumanTTS from environment variables
 */
export function createSuperhumanTTSFromEnv(voice: string = 'ferni'): SuperhumanTTS {
  return new SuperhumanTTS({
    endpoint: process.env.BTCW_ENDPOINT,
    apiKey: process.env.BTCW_API_KEY,
    voice,
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate relationship stage from metrics
 */
export function calculateRelationshipStage(
  daysSinceFirst: number,
  totalInteractions: number,
  vulnerableMoments: number = 0
): RelationshipStage {
  // Calculate intimacy score
  const intimacyScore =
    Math.min(daysSinceFirst / 365, 1) * 0.3 +
    Math.min(totalInteractions / 500, 1) * 0.4 +
    Math.min(vulnerableMoments / 20, 1) * 0.3;

  if (intimacyScore < 0.05) return 'stranger';
  if (intimacyScore < 0.15) return 'acquaintance';
  if (intimacyScore < 0.3) return 'emerging_friend';
  if (intimacyScore < 0.5) return 'developing_friend';
  if (intimacyScore < 0.7) return 'close_friend';
  if (intimacyScore < 0.9) return 'trusted_confidant';
  return 'lifelong_bond';
}

/**
 * Check if it's late night wisdom time
 */
export function isLateNightWisdomTime(timezoneOffset: number = 0): boolean {
  const now = new Date();
  const localHour = (now.getUTCHours() + timezoneOffset + 24) % 24;
  return localHour >= 23 || localHour < 4;
}

/**
 * Get memory weight from characteristics
 */
export function determineMemoryWeight(
  involvesLoss: boolean,
  isMilestone: boolean,
  emotionalIntensity: number
): MemoryWeight {
  if (involvesLoss && emotionalIntensity > 0.8) return 'sacred';
  if (isMilestone && emotionalIntensity > 0.7) return 'life_defining';
  if (emotionalIntensity > 0.6) return 'significant';
  if (emotionalIntensity > 0.3) return 'meaningful';
  return 'casual';
}
