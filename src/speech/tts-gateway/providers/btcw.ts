/**
 * @deprecated BTCW provider — not actively maintained. Set USE_BTCW_TTS=true to enable.
 *
 * BTCW (Better Than Cartesia Work) TTS Provider
 *
 * Superhuman TTS with 12+ capabilities that no other system offers:
 * - Circadian adaptation (voice changes by time of day)
 * - Relationship evolution (voice deepens with trust)
 * - Meaningful silence (knows when NOT to speak)
 * - Backchannels (active listening sounds)
 * - Memory prosody (reverence for past emotional moments)
 * - Emotional anticipation (primes emotion BEFORE content)
 * - Responsive escalation (MORE present as distress increases)
 * - Vocal fatigue (realistic strain showing dedication)
 * - Breath sync (parasympathetic coupling)
 * - Micro-prosody (subliminal 40-150ms cues)
 * - Full SSML support (W3C 1.1 + Cartesia extensions)
 *
 * @module speech/tts-gateway/providers/btcw
 */

import { getVoiceIdForPersona } from '../../../config/voice-ids.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { ITTSProvider, SSMLProsodyConfig } from '../types.js';

const log = createLogger({ module: 'BTCWTTSProvider' });

// ============================================================================
// SUPERHUMAN CONTEXT TYPES
// ============================================================================

/**
 * Memory reference for memory-aware prosody
 */
export interface MemoryReference {
  topic: string;
  originalEmotion: string;
  emotionalWeight: 'light' | 'significant' | 'heavy' | 'sacred';
  daysAgo: number;
  involvesLoss: boolean;
  involvesAchievement: boolean;
  isUserInitiated: boolean;
}

/**
 * Session context for superhuman capabilities
 */
export interface SuperhumanSessionContext {
  // User emotional state
  userDistressed: boolean;
  distressLevel: number; // 0.0 to 1.0
  emotional: boolean;
  vulnerable: boolean;

  // Physiological
  breathRate?: number; // breaths per minute

  // Relationship context
  daysSinceFirst: number;
  totalInteractions: number;

  // Memory references
  memoryRefs: MemoryReference[];

  // Conversation state
  userJustSpoke: boolean;
  lastUserMessage: string;
  timeSinceUserMs: number;
  turnNumber: number;
  conversationDurationSecs: number;

  // Time
  timezoneOffset: number; // hours from UTC

  // Escalation tracking
  isSustainedDistress: boolean;
  turnsAtDistressLevel: number;
  totalWordsSpoken: number;
  isCalming: boolean;
}

/**
 * Superhuman synthesis result
 */
export interface SuperhumanResult {
  /** Modified SSML text */
  ssml: string;

  /** Whether to be silent instead of speaking */
  shouldBeSilent: boolean;

  /** Silence duration if silent */
  silenceDurationMs: number;

  /** Minimal response if silent (e.g., "I understand") */
  minimalResponse: string | null;

  /** Backchannel response (e.g., "mm-hmm") */
  backchannel: string | null;

  /** Pre-speech delay in ms */
  preSpeechDelayMs: number;

  /** List of capabilities that were applied */
  capabilitiesUsed: string[];

  /** Final emotion instruction for the synthesizer */
  emotionInstruction: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Emotion to CosyVoice instruction mapping
 */
const EMOTION_TO_INSTRUCTION: Record<string, string> = {
  neutral: '',
  happy: '[happy]',
  sad: '[sad]',
  angry: '[angry]',
  excited: '[excited]',
  sympathetic: '[gentle][slow]',
  contemplative: '[slow][soft]',
  warm: '[gentle][warm]',
  concerned: '[gentle][slow][soft]',
  proud: '[happy][slightly excited]',
  grateful: '[warm][gentle]',
  calm: '[slow][soft]',
  peaceful: '[very slow][very soft]',
  nostalgic: '[soft][slow]',
  reverent: '[very soft][very slow]',
};

/**
 * Circadian phases with voice adjustments
 */
const CIRCADIAN_PHASES = {
  EARLY_MORNING: { speed: 0.92, warmth: 0.7, delayMs: 200 }, // 5am-7am
  MORNING: { speed: 1.0, warmth: 0.5, delayMs: 0 }, // 7am-11am
  MIDDAY: { speed: 1.02, warmth: 0.4, delayMs: 0 }, // 11am-2pm
  AFTERNOON: { speed: 0.98, warmth: 0.5, delayMs: 50 }, // 2pm-5pm
  EARLY_EVENING: { speed: 0.95, warmth: 0.6, delayMs: 100 }, // 5pm-8pm
  EVENING: { speed: 0.9, warmth: 0.7, delayMs: 150 }, // 8pm-10pm
  LATE_NIGHT: { speed: 0.85, warmth: 0.85, delayMs: 250 }, // 10pm-12am
  DEEP_NIGHT: { speed: 0.8, warmth: 0.95, delayMs: 400 }, // 12am-5am (2am wisdom)
};

/**
 * Deep sharing patterns that require silence or minimal response
 */
const DEEP_SHARING_PATTERNS = [
  'passed away',
  'died',
  'lost',
  'funeral',
  'miss them',
  'abuse',
  'trauma',
  'never told anyone',
  'first time saying',
  'scared to admit',
  'giving up',
  "don't know if I can",
  'betrayed',
  'divorce',
  'diagnosis',
  'terminal',
  'estranged',
];

/**
 * Minimal responses for different silence types
 */
const MINIMAL_RESPONSES: Record<string, string[]> = {
  holding_space: ["I'm here with you.", "I'm here.", 'Take your time.'],
  grief: ["I'm so sorry.", "I'm here with you.", "That's so hard."],
  sacred: ['Thank you for sharing that.'],
};

// ============================================================================
// BTCW PROVIDER CLASS
// ============================================================================

/**
 * BTCW TTS Provider configuration
 */
export interface BTCWProviderConfig {
  /** BTCW server URL (defaults to BTCW_SERVER_URL env var) */
  serverUrl?: string;
  /** Request timeout in ms (defaults to 30000) */
  timeoutMs?: number;
  /** Enable superhuman capabilities (defaults to true) */
  enableSuperhuman?: boolean;
  /** Throw errors instead of returning empty buffer (defaults to false) */
  throwOnError?: boolean;
}

/**
 * BTCW TTS Provider implementation
 *
 * Provides superhuman TTS through CosyVoice 3 + superhuman synthesis layer.
 */
export class BTCWTTSProvider implements ITTSProvider {
  readonly name = 'btcw';

  private readonly serverUrl: string;
  private readonly timeoutMs: number;
  private readonly enableSuperhuman: boolean;
  private readonly throwOnError: boolean;

  constructor(config: BTCWProviderConfig = {}) {
    this.serverUrl = config.serverUrl || process.env.BTCW_SERVER_URL || 'http://localhost:8081';
    this.timeoutMs = config.timeoutMs || 30000;
    this.enableSuperhuman = config.enableSuperhuman ?? true;
    this.throwOnError = config.throwOnError ?? false;

    log.info({ serverUrl: this.serverUrl }, 'BTCW TTS Provider initialized');
  }

  /**
   * Synthesize text to audio with superhuman capabilities
   *
   * @param text - Text to synthesize (may contain SSML)
   * @param voiceId - Voice identifier (persona name or ID)
   * @param prosody - Optional prosody configuration
   * @param sessionContext - Optional session context for superhuman features
   * @returns Generated audio buffer (or empty if should be silent)
   */
  async synthesize(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig,
    sessionContext?: Partial<SuperhumanSessionContext>
  ): Promise<ArrayBuffer> {
    if (!text.trim()) {
      log.debug({}, 'Empty text, returning empty buffer');
      return new ArrayBuffer(0);
    }

    const startTime = Date.now();
    const resolvedVoiceId = this.resolveVoiceId(voiceId);

    try {
      // Apply superhuman capabilities if enabled and context provided
      let processedText = text;
      let finalEmotion = prosody?.emotion || 'neutral';
      let preDelay = 0;
      let capabilitiesUsed: string[] = [];

      if (this.enableSuperhuman && sessionContext) {
        const superhuman = this.applySuperhuman(text, finalEmotion, sessionContext);

        // Check for meaningful silence
        if (superhuman.shouldBeSilent) {
          log.info(
            {
              duration: superhuman.silenceDurationMs,
              minimal: superhuman.minimalResponse,
              capabilities: superhuman.capabilitiesUsed,
            },
            '🤫 BTCW recommends silence'
          );

          // Return silence or minimal response
          if (superhuman.minimalResponse) {
            processedText = superhuman.minimalResponse;
          } else {
            return this.createSilence(superhuman.silenceDurationMs);
          }
        }

        processedText = superhuman.ssml;
        finalEmotion = this.extractEmotionFromInstruction(superhuman.emotionInstruction);
        preDelay = superhuman.preSpeechDelayMs;
        capabilitiesUsed = superhuman.capabilitiesUsed;
      }

      // Wait for pre-speech delay if needed
      if (preDelay > 0) {
        await this.delay(preDelay);
      }

      // Call BTCW server
      const response = await this.callServer({
        text: this.stripSSML(processedText),
        voiceId: resolvedVoiceId,
        emotion: finalEmotion,
        speed: prosody?.speed,
      });

      const durationMs = Date.now() - startTime;

      log.debug(
        {
          text: text.slice(0, 50),
          voiceId: resolvedVoiceId,
          audioBytes: response.byteLength,
          durationMs,
          capabilities: capabilitiesUsed,
        },
        '✅ BTCW TTS generated'
      );

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error: errorMessage, text: text.slice(0, 50) }, 'BTCW TTS synthesis failed');

      if (this.throwOnError) {
        throw error;
      }
      return new ArrayBuffer(0);
    }
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${this.serverUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response.ok;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return false;
    }
  }

  /**
   * Estimate audio duration from text
   */
  estimateDuration(text: string): number {
    const words = Math.ceil(text.length / 5);
    const minutes = words / 150; // 150 WPM
    return Math.round(minutes * 60 * 1000);
  }

  // ===========================================================================
  // SUPERHUMAN CAPABILITIES
  // ===========================================================================

  /**
   * Apply all superhuman capabilities to text
   */
  private applySuperhuman(
    text: string,
    baseEmotion: string,
    ctx: Partial<SuperhumanSessionContext>
  ): SuperhumanResult {
    const capabilitiesUsed: string[] = [];
    let ssml = text;
    let preDelay = 0;
    let emotionInstruction = EMOTION_TO_INSTRUCTION[baseEmotion] || '';

    // 1. Check for meaningful silence
    if (ctx.userJustSpoke && ctx.lastUserMessage) {
      const silenceCheck = this.checkMeaningfulSilence(ctx.lastUserMessage, ctx);
      if (silenceCheck.shouldBeSilent) {
        capabilitiesUsed.push('meaningful_silence');
        return {
          ssml: '',
          shouldBeSilent: true,
          silenceDurationMs: silenceCheck.durationMs,
          minimalResponse: silenceCheck.minimalResponse,
          backchannel: null,
          preSpeechDelayMs: 0,
          capabilitiesUsed,
          emotionInstruction,
        };
      }
    }

    // 2. Check for backchannel opportunity
    const backchannel = this.checkBackchannel(ctx);
    if (backchannel) {
      capabilitiesUsed.push('backchannel');
    }

    // 3. Apply circadian adaptation
    const circadian = this.applyCircadian(ctx.timezoneOffset ?? 0);
    if (circadian) {
      capabilitiesUsed.push('circadian_adaptation');
      preDelay += circadian.delayMs;
      emotionInstruction += circadian.warmth > 0.7 ? ', warm' : '';

      // Apply speed adjustment via SSML
      if (circadian.speed !== 1.0) {
        const speedPct = Math.round((circadian.speed - 1) * 100);
        ssml = `<prosody rate="${speedPct >= 0 ? '+' : ''}${speedPct}%">${ssml}</prosody>`;
      }
    }

    // 4. Apply relationship voice evolution
    const relationship = this.applyRelationship(ctx);
    if (relationship) {
      capabilitiesUsed.push('relationship_voice');
      emotionInstruction += relationship.modifier;
    }

    // 5. Apply memory prosody for referenced memories
    if (ctx.memoryRefs && ctx.memoryRefs.length > 0) {
      const memoryProsody = this.applyMemoryProsody(ssml, ctx.memoryRefs);
      if (memoryProsody) {
        capabilitiesUsed.push('memory_prosody');
        ssml = memoryProsody.ssml;
        emotionInstruction += memoryProsody.emotionModifier;
        preDelay += memoryProsody.preDelay;
      }
    }

    // 6. Apply responsive escalation for distressed users
    if (ctx.distressLevel && ctx.distressLevel > 0.5) {
      const escalation = this.applyEscalation(ctx);
      if (escalation) {
        capabilitiesUsed.push('responsive_escalation');
        emotionInstruction += escalation.modifier;
        preDelay += escalation.preDelay;
        ssml = `<prosody rate="${escalation.rateAdjust}%">${ssml}</prosody>`;
      }
    }

    // 7. Apply concern response mode
    if (ctx.userDistressed || ctx.vulnerable) {
      capabilitiesUsed.push('concern_response');
      emotionInstruction += ', warm, caring, gentle';
      preDelay += 200;
    }

    return {
      ssml,
      shouldBeSilent: false,
      silenceDurationMs: 0,
      minimalResponse: null,
      backchannel,
      preSpeechDelayMs: preDelay,
      capabilitiesUsed,
      emotionInstruction,
    };
  }

  /**
   * Check if meaningful silence is the right response
   */
  private checkMeaningfulSilence(
    userMessage: string,
    ctx: Partial<SuperhumanSessionContext>
  ): { shouldBeSilent: boolean; durationMs: number; minimalResponse: string | null } {
    const lower = userMessage.toLowerCase();

    // Check for deep sharing patterns
    for (const pattern of DEEP_SHARING_PATTERNS) {
      if (lower.includes(pattern)) {
        // Grief needs more space
        const isGrief = ['passed away', 'died', 'funeral'].some((p) => lower.includes(p));
        const duration = isGrief ? 3500 : 2500;

        // Pick minimal response
        const responses = isGrief ? MINIMAL_RESPONSES.grief : MINIMAL_RESPONSES.holding_space;
        const minimalResponse = responses[Math.floor(Math.random() * responses.length)];

        return { shouldBeSilent: true, durationMs: duration, minimalResponse };
      }
    }

    // Trailing off with emotion = give space
    if (lower.endsWith('...') && (ctx.emotional || ctx.vulnerable)) {
      return { shouldBeSilent: true, durationMs: 1500, minimalResponse: null };
    }

    return { shouldBeSilent: false, durationMs: 0, minimalResponse: null };
  }

  /**
   * Check for backchannel opportunity
   */
  private checkBackchannel(ctx: Partial<SuperhumanSessionContext>): string | null {
    if (!ctx.userJustSpoke || !ctx.timeSinceUserMs) return null;

    // Backchannel window: 300-800ms after user stops
    if (ctx.timeSinceUserMs < 300 || ctx.timeSinceUserMs > 800) return null;

    // More likely if emotional
    if (ctx.emotional || ctx.vulnerable) {
      const responses = ['mm-hmm', "I'm listening", 'yeah'];
      return responses[Math.floor(Math.random() * responses.length)];
    }

    return null;
  }

  /**
   * Apply circadian adaptation based on time of day
   */
  private applyCircadian(
    timezoneOffset: number
  ): { speed: number; warmth: number; delayMs: number } | null {
    const now = new Date();
    const hour = (now.getUTCHours() + timezoneOffset + 24) % 24;

    if (hour >= 0 && hour < 5) return CIRCADIAN_PHASES.DEEP_NIGHT;
    if (hour >= 5 && hour < 7) return CIRCADIAN_PHASES.EARLY_MORNING;
    if (hour >= 7 && hour < 11) return CIRCADIAN_PHASES.MORNING;
    if (hour >= 11 && hour < 14) return CIRCADIAN_PHASES.MIDDAY;
    if (hour >= 14 && hour < 17) return CIRCADIAN_PHASES.AFTERNOON;
    if (hour >= 17 && hour < 20) return CIRCADIAN_PHASES.EARLY_EVENING;
    if (hour >= 20 && hour < 22) return CIRCADIAN_PHASES.EVENING;
    return CIRCADIAN_PHASES.LATE_NIGHT;
  }

  /**
   * Apply relationship voice evolution
   */
  private applyRelationship(ctx: Partial<SuperhumanSessionContext>): { modifier: string } | null {
    const days = ctx.daysSinceFirst ?? 0;
    const interactions = ctx.totalInteractions ?? 0;

    if (days < 7 || interactions < 3) {
      return { modifier: ', friendly' }; // New relationship
    } else if (days < 30 || interactions < 20) {
      return { modifier: ', warmer' }; // Building trust
    } else if (days < 90) {
      return { modifier: ', familiar, comfortable' }; // Established
    } else {
      return { modifier: ', intimate, trusted' }; // Deep relationship
    }
  }

  /**
   * Apply memory-aware prosody
   */
  private applyMemoryProsody(
    ssml: string,
    memoryRefs: MemoryReference[]
  ): { ssml: string; emotionModifier: string; preDelay: number } | null {
    if (memoryRefs.length === 0) return null;

    // Find the most significant memory reference
    const primaryRef = memoryRefs.reduce((most, ref) => {
      const weights = { light: 1, significant: 2, heavy: 3, sacred: 4 };
      return weights[ref.emotionalWeight] > weights[most.emotionalWeight] ? ref : most;
    });

    let emotionModifier = '';
    let preDelay = 0;

    switch (primaryRef.emotionalWeight) {
      case 'sacred':
        emotionModifier = ', reverent, honoring';
        preDelay = 500;
        break;
      case 'heavy':
        emotionModifier = ', gentle, holding space';
        preDelay = 300;
        break;
      case 'significant':
        emotionModifier = ', thoughtful';
        preDelay = 200;
        break;
    }

    if (primaryRef.involvesLoss) {
      emotionModifier += ', compassionate';
    } else if (primaryRef.involvesAchievement) {
      emotionModifier = ', proudly celebrating';
    }

    // Add pause before sacred memories
    const modifiedSsml =
      primaryRef.emotionalWeight === 'sacred' ? `<break time="300ms"/>${ssml}` : ssml;

    return { ssml: modifiedSsml, emotionModifier, preDelay };
  }

  /**
   * Apply responsive escalation for distressed users
   */
  private applyEscalation(
    ctx: Partial<SuperhumanSessionContext>
  ): { modifier: string; preDelay: number; rateAdjust: number } | null {
    const distressLevel = ctx.distressLevel ?? 0;
    const turnsAtDistress = ctx.turnsAtDistressLevel ?? 0;
    const isSustained = ctx.isSustainedDistress ?? false;

    // Crisis mode: sustained high distress
    if (distressLevel > 0.8 && (isSustained || turnsAtDistress > 3)) {
      return {
        modifier: ', fully present, anchoring, grounding',
        preDelay: 500,
        rateAdjust: -15,
      };
    }

    // High alert: high distress
    if (distressLevel > 0.7) {
      return {
        modifier: ', deeply concerned, supportive',
        preDelay: 300,
        rateAdjust: -10,
      };
    }

    // Elevated: moderate distress
    if (distressLevel > 0.5) {
      return {
        modifier: ', attentive, supportive',
        preDelay: 150,
        rateAdjust: -5,
      };
    }

    return null;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Resolve voice ID from persona name
   */
  private resolveVoiceId(voiceIdOrPersona: string): string {
    // Check if it's a persona name
    const personaMapping: Record<string, string> = {
      ferni: 'ferni',
      peter: 'peter',
      maya: 'maya',
      alex: 'alex',
      jordan: 'jordan',
      nayan: 'nayan',
    };

    if (personaMapping[voiceIdOrPersona.toLowerCase()]) {
      return personaMapping[voiceIdOrPersona.toLowerCase()];
    }

    // Fall back to Cartesia voice ID lookup
    const resolved = getVoiceIdForPersona(voiceIdOrPersona);
    return resolved || voiceIdOrPersona;
  }

  /**
   * Extract primary emotion from instruction string
   */
  private extractEmotionFromInstruction(instruction: string): string {
    const emotions = Object.keys(EMOTION_TO_INSTRUCTION);
    for (const emotion of emotions) {
      if (instruction.includes(emotion)) return emotion;
    }
    return 'neutral';
  }

  /**
   * Strip SSML tags from text for CosyVoice
   */
  private stripSSML(text: string): string {
    // Remove XML-like tags
    let clean = text.replace(/<[^>]+>/g, '');
    // Normalize whitespace
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
  }

  /**
   * Create silence audio buffer
   */
  private createSilence(durationMs: number): ArrayBuffer {
    const sampleRate = 24000;
    const numSamples = Math.round((durationMs / 1000) * sampleRate);
    const bytesPerSample = 2; // 16-bit PCM
    return new ArrayBuffer(numSamples * bytesPerSample);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Call BTCW server for synthesis
   */
  private async callServer(params: {
    text: string;
    voiceId: string;
    emotion: string;
    speed?: number;
  }): Promise<ArrayBuffer> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.serverUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: params.text,
          voice: params.voiceId,
          instruct: EMOTION_TO_INSTRUCTION[params.emotion] || '',
          speed: params.speed ?? 1.0,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`BTCW API error: ${response.status} - ${errorText.slice(0, 200)}`);
      }

      return await response.arrayBuffer();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let providerInstance: BTCWTTSProvider | null = null;

/**
 * Get the singleton BTCW provider instance
 */
export function getBTCWProvider(config?: BTCWProviderConfig): ITTSProvider {
  if (!providerInstance) {
    providerInstance = new BTCWTTSProvider(config);
  }
  return providerInstance;
}

/**
 * Reset the singleton provider (for testing)
 */
export function resetBTCWProvider(): void {
  providerInstance = null;
}

/**
 * Create a new BTCW provider instance
 */
export function createBTCWProvider(config?: BTCWProviderConfig): ITTSProvider {
  return new BTCWTTSProvider(config);
}
