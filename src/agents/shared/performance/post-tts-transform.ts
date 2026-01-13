/**
 * Post-TTS Audio Transform ("Better Than Human" Enhancement)
 *
 * Applies Rust-accelerated audio processing to Cartesia TTS output BEFORE WebRTC
 * to make Ferni's voice sound more human and natural than any human could be.
 *
 * Pipeline:
 * ```
 * Cartesia TTS → [THIS TRANSFORM] → WebRTC → User
 *                     ↓
 *               Rust DSP (STATEFUL):
 *               - Crossfade overlap-add (seamless frame boundaries)
 *               - Stateful biquad warmth (low-shelf EQ, no clicks)
 *               - Stateful biquad presence (2-4kHz boost, no clicks)
 *               - Stateful compression (no pumping/breathing)
 *               - De-esser (sibilance reduction, 4-8kHz)
 *               - Look-ahead soft limiter (prevents clipping)
 *               - Soft attack/release (utterance boundaries only)
 * ```
 *
 * Key Improvement: STATEFUL processing means filter state persists between
 * frames, eliminating clicks and artifacts at frame boundaries. This is what
 * makes audio "butter smooth" - the same technique used in professional DAWs.
 *
 * Performance Target: <1ms per 20ms frame (real-time safe)
 *
 * ============================================================================
 * HUMANIZATION FEATURES - "Better Than Human" Audio
 * ============================================================================
 * The following features add human-like imperfections to make TTS more natural:
 *
 * ✅ POST_TTS_MICRO_PITCH: SOLA-based pitch modulation (artifact-free via SOLA)
 * ✅ POST_TTS_VOCAL_FRY: Irregular glottal pulses with diploponia (rewrote Dec 2024)
 * ✅ POST_TTS_LIP_SMACKS: Formant-based synthesis with oral cavity resonances (rewrote Dec 2024)
 * ✅ POST_TTS_TEMPO_VARIATION: SOLA time-stretching with cross-correlation (rewrote Dec 2024)
 * ✅ POST_TTS_ADAPTIVE_PACING: Content complexity analysis for pacing (added Dec 2024)
 *
 * Enable via environment variables: POST_TTS_VOCAL_FRY=true, etc.
 * Use analyzeContentComplexity(text) for adaptive pacing.
 * ============================================================================
 *
 * @module agents/shared/performance/post-tts-transform
 */

import { AudioFrame } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PostTTSTransform' });

// ============================================================================
// RUST NATIVE MODULE (Lazy loaded to avoid startup crash if not built)
// ============================================================================

/**
 * Legacy Post-TTS Enhancement Config (for backward compatibility)
 */
interface PostTtsEnhancementConfig {
  sampleRate: number;
  enableBreath: boolean;
  enableWarmth: boolean;
  enableMicroPitch: boolean;
  enableSoftEdges: boolean;
  enableCompression: boolean;
  enablePresence: boolean;
  breathProbability: number;
  warmthAmount: number;
  pitchModulationCents: number;
  softEdgeMs: number;
  compressionRatio: number;
  compressionThresholdDb: number;
  presenceBoostDb: number;
}

/**
 * NEW: Stateful Post-TTS Processor Config
 * Matches NativePostTtsConfig from Rust NAPI bindings
 */
interface NativePostTtsConfig {
  sampleRate?: number;
  enableWarmth?: boolean;
  warmthFreq?: number;
  warmthGainDb?: number;
  enablePresence?: boolean;
  presenceFreq?: number;
  presenceGainDb?: number;
  enableCompression?: boolean;
  compThresholdDb?: number;
  compRatio?: number;
  compAttackMs?: number;
  compReleaseMs?: number;
  // Legacy de-esser (DEPRECATED - causes wideband artifacts)
  enableDeesser?: boolean;
  deesserFreq?: number;
  deesserThresholdDb?: number;
  // Split-band de-esser (NEW - professional quality)
  enableSplitbandDeesser?: boolean;
  splitbandCrossoverFreq?: number;
  splitbandThresholdDb?: number;
  splitbandRatio?: number;
  enableLimiter?: boolean;
  limiterThresholdDb?: number;
  enableCrossfade?: boolean;
  crossfadeMs?: number;
  softAttackMs?: number;
  softReleaseMs?: number;
  // =========================================================================
  // HUMANIZATION FEATURES - Make TTS sound natural
  // =========================================================================
  // Breath injection (at utterance start)
  enableBreath?: boolean;
  breathProbability?: number; // 0-1, chance of breath at utterance start
  // Micro-pitch modulation (fast ~5Hz pitch variation)
  enableMicroPitch?: boolean;
  microPitchCents?: number; // Depth in cents (typically 5-10)
  // Noise floor (subtle room tone)
  enableNoiseFloor?: boolean;
  noiseFloorDb?: number; // Level in dB (typically -60 to -50)
  // Amplitude jitter (volume micro-variations)
  enableAmplitudeJitter?: boolean;
  amplitudeJitterDepth?: number; // Depth 0-1 (typically 0.02 = 2%)
  // Pitch drift (slow pitch wandering over phrases)
  enablePitchDrift?: boolean;
  pitchDriftCents?: number; // Max drift in cents (typically 3-8)
  // =========================================================================
  // SOLA & EMOTION PROSODY - Artifact-free pitch + emotional expression
  // =========================================================================
  // Use SOLA-based pitch shifting (artifact-free, eliminates clicks)
  useSolaPitch?: boolean;
  // Enable emotion-aware prosody (vibrato, pitch drift, breath, pacing)
  enableEmotionProsody?: boolean;
  // Emotion state: 0=Neutral, 1=Happy, 2=Sad, 3=Excited, 4=Calm, 5=Tense, 6=Empathetic, 7=Curious, 8=Supportive
  emotion?: number;
  // Adaptive pacing based on content complexity
  enableAdaptivePacing?: boolean;
  // Content complexity 0-1 (affects pacing)
  contentComplexity?: number;
  // =========================================================================
  // ADVANCED HUMANIZATION - Ultra-realistic speech features
  // =========================================================================
  // Vocal fry (creaky voice at phrase endings)
  enableVocalFry?: boolean;
  vocalFryDepth?: number; // 0-1 (default 0.4)
  vocalFryDurationMs?: number; // Duration in ms (default 200)
  // Lip smacks (mouth sounds at phrase boundaries)
  enableLipSmacks?: boolean;
  lipSmackProbability?: number; // 0-1 (default 0.3)
  // Tempo micro-variation (subtle speed changes within phrases)
  enableTempoVariation?: boolean;
  tempoVariationDepth?: number; // 0-1 (default 0.03 = 3%)
  // Onset softening (micro-fades on hard attacks)
  enableOnsetSoftening?: boolean;
  // =========================================================================
  // STATE-OF-THE-ART HUMANIZATION - December 2024
  // =========================================================================
  // Jitter: cycle-to-cycle pitch variation (0.5-2% natural speech)
  enableJitter?: boolean;
  jitterAmount?: number; // 0-1 (0.015 = 1.5% typical)
  // Shimmer: cycle-to-cycle amplitude variation (3-10% natural speech)
  enableShimmer?: boolean;
  shimmerAmount?: number; // 0-1 (0.05 = 5% typical)
  // HNR Modulation: harmonic-to-noise ratio / breathiness
  enableHnrModulation?: boolean;
  hnrBreathiness?: number; // 0-1 (0.15 = light breathiness)
  // Subglottal Resonance: chest cavity resonances (600/1400/2200 Hz)
  enableSubglottalResonance?: boolean;
  subglottalStrength?: number; // 0-1 (0.2 = subtle presence)
  // Smile Formant Shifts: emotional brightness via formant shifting
  enableSmileFormants?: boolean;
  smileAmount?: number; // 0-1 (0.3 = subtle smile)
  // Glottalization: glottal stops at vowel onsets (70Hz modulation)
  enableGlottalization?: boolean;
  glottalizationStrength?: number; // 0-1 (0.4 = moderate)
  // Hesitation Phenomena: synthetic "um", "uh" filler sounds
  enableHesitationSounds?: boolean;
  hesitationProbability?: number; // 0-1 per phrase (0.1 = 10%)
  // Lombard Effect: noise-adaptive volume/brightness
  enableLombardEffect?: boolean;
  // Register Transitions: modal/falsetto/fry voice registers
  enableRegisterTransitions?: boolean;
  targetRegister?: number; // 0=Modal, 1=Falsetto, 2=Fry
  // Pharyngeal Constriction: throat tension/stress sound
  enablePharyngealConstriction?: boolean;
  pharyngealAmount?: number; // 0-1 (0.3 = moderate tightness)
}

/**
 * NEW: Processing statistics from stateful processor
 */
interface NativeProcessingStats {
  frameNumber: number;
  crossfadeApplied: boolean;
  softAttackApplied: boolean;
  softReleaseApplied: boolean;
  warmthApplied: boolean;
  presenceApplied: boolean;
  compressionReductionDb: number;
  deesserReductionDb: number;
  limiterReductionDb: number;
}

/**
 * NEW: Stateful Post-TTS Processor class interface
 * This maintains state between frames for seamless audio
 */
interface NativePostTTSProcessorClass {
  new (config?: NativePostTtsConfig): NativePostTTSProcessorInstance;
  withDefaults: () => NativePostTTSProcessorInstance;
}

interface NativePostTTSProcessorInstance {
  processFrame: (samples: Float32Array, isLastFrame: boolean) => NativeProcessingStats;
  startUtterance: () => void;
  reset: () => void;
  frameCount: () => number;
}

/**
 * Legacy Enhancement result from Rust PostTtsEnhancementResult
 */
interface PostTtsEnhancementResult {
  breathsInjected: number;
  edgesSoftened: number;
  warmthApplied: boolean;
  pitchModApplied: boolean;
  compressionApplied: boolean;
  presenceApplied: boolean;
}

/**
 * Rust audio module interface matching the actual NAPI exports
 */
interface RustAudioModule {
  // NEW: Stateful processor class (preferred)
  NativePostTtsProcessor: NativePostTTSProcessorClass;

  // Legacy: Main enhancement function (stateless - can cause clicks)
  enhanceTtsAudioInplace: (samples: Float32Array, config: PostTtsEnhancementConfig) => Float32Array;

  // Legacy: Enhancement with result stats
  enhanceTtsAudio: (
    samples: Float32Array,
    config: PostTtsEnhancementConfig
  ) => PostTtsEnhancementResult;

  // Individual processing functions (for manual boundary handling)
  applySoftAttack: (samples: Float32Array, attackMs: number, sampleRate: number) => Float32Array;
  applySoftRelease: (samples: Float32Array, releaseMs: number, sampleRate: number) => Float32Array;
  applyWarmth: (samples: Float32Array, sampleRate: number, amount: number) => Float32Array;
  applyPresence: (samples: Float32Array, sampleRate: number, boostDb: number) => Float32Array;
  applyCompression: (
    samples: Float32Array,
    sampleRate: number,
    thresholdDb: number,
    ratio: number
  ) => Float32Array;

  // Utility functions
  getDefaultPostTtsConfig: () => PostTtsEnhancementConfig;
}

let rustModule: RustAudioModule | null = null;
let rustLoadAttempted = false;
let hasStatefulProcessor = false;

/**
 * Lazily load the Rust native module
 */
async function getRustModule(): Promise<RustAudioModule | null> {
  if (rustModule) return rustModule;
  if (rustLoadAttempted) return null;

  rustLoadAttempted = true;

  try {
    // Dynamic import of the native addon
    // Cast through unknown because TypeScript doesn't know about NAPI exports
    const native = (await import('@ferni/audio')) as unknown;
    const module = native as RustAudioModule;

    // Check for NEW stateful processor (preferred)
    if (typeof module.NativePostTtsProcessor === 'function') {
      hasStatefulProcessor = true;
      log.info('🦀 Rust post-TTS module loaded with STATEFUL processor (butter smooth!)');
    }
    // Fall back to legacy stateless function
    else if (typeof module.enhanceTtsAudioInplace !== 'function') {
      log.warn('Rust module loaded but missing both stateful and legacy processors');
      return null;
    } else {
      log.info('🦀 Rust post-TTS module loaded (legacy stateless mode)');
    }

    rustModule = module;
    return rustModule;
  } catch (error) {
    log.warn(
      { error: String(error) },
      '⚠️ Rust post-TTS module not available - using JavaScript fallback'
    );
    return null;
  }
}

/**
 * Check if the stateful processor is available
 */
function hasStatefulProcessorAvailable(): boolean {
  return hasStatefulProcessor;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface PostTTSConfig {
  /** Sample rate of the TTS output (Cartesia uses 24kHz) */
  sampleRate?: number;

  /** Enable breath injection at phrase boundaries */
  enableBreath?: boolean;
  /** Probability of breath injection (0-1) */
  breathProbability?: number;

  /** Enable spectral warmth (low-shelf EQ boost at ~300Hz) */
  enableWarmth?: boolean;
  /** Warmth amount (0-1, 0.3 = subtle, 0.7 = very warm) */
  warmthAmount?: number;

  /** Enable micro-pitch modulation for naturalness */
  enableMicroPitch?: boolean;
  /** Pitch modulation range in cents (±5-15 typical) */
  pitchModulationCents?: number;

  /** Enable soft attack/release for phrase rounding */
  enableSoftEdges?: boolean;
  /** Soft edge duration in milliseconds */
  softEdgeMs?: number;

  /** Enable dynamic compression */
  enableCompression?: boolean;
  /** Compression ratio (2:1 typical for voice) */
  compressionRatio?: number;
  /** Compression threshold in dB */
  compressionThresholdDb?: number;

  /** Enable presence EQ boost (2-4kHz) */
  enablePresence?: boolean;
  /** Presence boost in dB */
  presenceBoostDb?: number;

  /** Session ID for logging */
  sessionId?: string;

  /** Persona ID for logging */
  personaId?: string;

  /** Enable metrics tracking */
  enableMetrics?: boolean;

  // =========================================================================
  // HUMANIZATION - Natural speech variations
  // =========================================================================

  /** Enable amplitude jitter (subtle volume micro-variations) */
  enableAmplitudeJitter?: boolean;
  /** Amplitude jitter depth (0-1, 0.02 = 2% typical) */
  amplitudeJitterDepth?: number;

  /** Enable pitch drift (slow pitch wandering over phrases) */
  enablePitchDrift?: boolean;
  /** Pitch drift max in cents (3-8 typical) */
  pitchDriftCents?: number;

  /** Enable noise floor (subtle room tone) */
  enableNoiseFloor?: boolean;
  /** Noise floor level in dB (-60 to -50 typical) */
  noiseFloorDb?: number;

  // =========================================================================
  // SOLA & EMOTION PROSODY - Better Than Human features
  // =========================================================================

  /** Use SOLA-based pitch shifting (artifact-free, eliminates clicks) */
  useSolaPitch?: boolean;

  /** Enable emotion-aware prosody (vibrato, pitch drift, breath, pacing) */
  enableEmotionProsody?: boolean;

  /** Emotion state (0=Neutral, 1=Happy, 2=Sad, 3=Excited, 4=Calm, 5=Tense, 6=Empathetic, 7=Curious, 8=Supportive) */
  emotion?: number;

  /** Enable adaptive pacing based on content complexity */
  enableAdaptivePacing?: boolean;

  /** Content complexity (0-1, affects pacing) */
  contentComplexity?: number;

  // =========================================================================
  // ADVANCED HUMANIZATION - Ultra-realistic speech features
  // =========================================================================

  /** Enable vocal fry (creaky voice at phrase endings) */
  enableVocalFry?: boolean;
  /** Vocal fry depth (0-1, default 0.4) */
  vocalFryDepth?: number;
  /** Vocal fry duration in ms (default 200) */
  vocalFryDurationMs?: number;

  /** Enable lip smacks (mouth sounds at phrase boundaries) */
  enableLipSmacks?: boolean;
  /** Lip smack probability (0-1, default 0.3) */
  lipSmackProbability?: number;

  /** Enable tempo micro-variation (subtle speed changes within phrases) */
  enableTempoVariation?: boolean;
  /** Tempo variation depth (0-1, default 0.03 = 3%) */
  tempoVariationDepth?: number;

  /** Enable onset softening (micro-fades on hard glottal attacks) */
  enableOnsetSoftening?: boolean;

  // =========================================================================
  // STATE-OF-THE-ART HUMANIZATION - December 2024
  // These features add subtle natural variations found in real human speech
  // =========================================================================

  /** Enable jitter (cycle-to-cycle pitch variation, 0.5-2% in natural speech) */
  enableJitter?: boolean;
  /** Jitter amount (0-1, 0.015 = 1.5% typical) */
  jitterAmount?: number;

  /** Enable shimmer (cycle-to-cycle amplitude variation, 3-10% in natural speech) */
  enableShimmer?: boolean;
  /** Shimmer amount (0-1, 0.05 = 5% typical) */
  shimmerAmount?: number;

  /** Enable HNR modulation (breathiness/aspiration noise) */
  enableHnrModulation?: boolean;
  /** HNR breathiness (0-1, 0.15 = light breathiness) */
  hnrBreathiness?: number;

  /** Enable subglottal resonance (chest cavity resonances at 600/1400/2200 Hz) */
  enableSubglottalResonance?: boolean;
  /** Subglottal resonance strength (0-1, 0.2 = subtle presence) */
  subglottalStrength?: number;

  /** Enable smile formant shifts (emotional brightness via formant shifting) */
  enableSmileFormants?: boolean;
  /** Smile amount (0-1, 0.3 = subtle smile) */
  smileAmount?: number;

  /** Enable glottalization (glottal stops at vowel onsets) */
  enableGlottalization?: boolean;
  /** Glottalization strength (0-1, 0.4 = moderate) */
  glottalizationStrength?: number;

  /** Enable hesitation phenomena (synthetic "um", "uh" filler sounds) */
  enableHesitationSounds?: boolean;
  /** Hesitation probability per phrase (0-1, 0.1 = 10%) */
  hesitationProbability?: number;

  /** Enable Lombard effect (noise-adaptive volume/brightness) */
  enableLombardEffect?: boolean;

  /** Enable register transitions (modal/falsetto/fry voice registers) */
  enableRegisterTransitions?: boolean;
  /** Target voice register (0=Modal, 1=Falsetto, 2=Fry) */
  targetRegister?: number;

  /** Enable pharyngeal constriction (throat tension/stress sound) */
  enablePharyngealConstriction?: boolean;
  /** Pharyngeal constriction amount (0-1, 0.3 = moderate tightness) */
  pharyngealAmount?: number;
}

// ============================================================================
// ENVIRONMENT VARIABLE HELPERS
// ============================================================================

/**
 * Check if an env var is explicitly set to 'true' or '1'
 * Used for features that are OFF by default (opt-in)
 */
function envEnabled(key: string): boolean {
  const val = process.env[key];
  return val === 'true' || val === '1';
}

/**
 * Check if an env var is explicitly set to 'false' or '0'
 * Used for features that are ON by default (opt-out)
 */
function envDisabled(key: string): boolean {
  const val = process.env[key];
  return val === 'false' || val === '0';
}

// Default config optimized for "Better Than Human" voice quality
// Features can be controlled via .env:
//   POST_TTS_MICRO_PITCH=true         - Enable micro pitch modulation
//   POST_TTS_ADAPTIVE_PACING=true     - Enable adaptive pacing
//   POST_TTS_VOCAL_FRY=true           - Enable vocal fry (ultra-realistic)
//   POST_TTS_LIP_SMACKS=true          - Enable lip smacks (ultra-realistic)
//   POST_TTS_TEMPO_VARIATION=true     - Enable tempo variation (ultra-realistic)
//   POST_TTS_BREATH=false             - Disable breath injection
//   POST_TTS_WARMTH=false             - Disable warmth filter
//   POST_TTS_COMPRESSION=false        - Disable compression
//   POST_TTS_PRESENCE=false           - Disable presence boost
//   POST_TTS_AMPLITUDE_JITTER=false   - Disable amplitude jitter
//   POST_TTS_PITCH_DRIFT=false        - Disable pitch drift
//   POST_TTS_NOISE_FLOOR=false        - Disable noise floor
//   POST_TTS_SOLA_PITCH=false         - Disable SOLA pitch shifting
//   POST_TTS_EMOTION_PROSODY=false    - Disable emotion prosody
// STATE-OF-THE-ART HUMANIZATION (December 2024):
//   POST_TTS_JITTER=true              - Enable cycle-to-cycle pitch variation
//   POST_TTS_SHIMMER=true             - Enable cycle-to-cycle amplitude variation
//   POST_TTS_HNR_MODULATION=true      - Enable breathiness modulation
//   POST_TTS_SUBGLOTTAL=true          - Enable chest cavity resonances
//   POST_TTS_SMILE_FORMANTS=true      - Enable emotional brightness
//   POST_TTS_GLOTTALIZATION=true      - Enable glottal stops
//   POST_TTS_HESITATION=true          - Enable "um", "uh" sounds
//   POST_TTS_LOMBARD=true             - Enable noise adaptation
//   POST_TTS_REGISTER=true            - Enable voice register transitions
//   POST_TTS_PHARYNGEAL=true          - Enable throat tension
export const DEFAULT_CONFIG: Required<PostTTSConfig> = {
  sampleRate: 24000, // Cartesia output rate
  // Features ON by default (use POST_TTS_X=false to disable)
  enableBreath: !envDisabled('POST_TTS_BREATH'),
  breathProbability: 0.15, // 15% chance at phrase boundaries
  enableWarmth: !envDisabled('POST_TTS_WARMTH'),
  warmthAmount: 0.35, // Subtle warmth
  // Soft edges now properly applied only at utterance boundaries (first/last frame)
  enableSoftEdges: true,
  softEdgeMs: 15, // 15ms attack/release for natural phrase edges
  enableCompression: !envDisabled('POST_TTS_COMPRESSION'),
  compressionRatio: 2.0, // 2:1 gentle compression
  compressionThresholdDb: -18, // Catch peaks
  enablePresence: !envDisabled('POST_TTS_PRESENCE'),
  presenceBoostDb: 2.0, // Subtle clarity boost
  sessionId: 'unknown',
  personaId: 'ferni',
  enableMetrics: true,
  // Humanization (ON by default)
  enableAmplitudeJitter: !envDisabled('POST_TTS_AMPLITUDE_JITTER'),
  amplitudeJitterDepth: 0.015, // 1.5% subtle volume variation
  enablePitchDrift: !envDisabled('POST_TTS_PITCH_DRIFT'),
  pitchDriftCents: 5, // Subtle pitch wandering
  enableNoiseFloor: !envDisabled('POST_TTS_NOISE_FLOOR'),
  noiseFloorDb: -55, // Very subtle room tone
  // SOLA & Emotion prosody (Better Than Human - ON by default)
  useSolaPitch: !envDisabled('POST_TTS_SOLA_PITCH'),
  enableEmotionProsody: !envDisabled('POST_TTS_EMOTION_PROSODY'),
  emotion: 0, // Neutral by default
  contentComplexity: 0.5, // Normal complexity
  // =========================================================================
  // MICRO-PITCH MODULATION (ENABLED - uses SOLA path)
  // When useSolaPitch=true (default), this uses SolaMicroPitch which is
  // artifact-free. Only the legacy path (useSolaPitch=false) has click issues.
  // =========================================================================
  enableMicroPitch: !envDisabled('POST_TTS_MICRO_PITCH'),
  pitchModulationCents: 8,
  // =========================================================================
  // HUMANIZATION FEATURES (All rewritten and working - December 2024)
  // =========================================================================
  // Adaptive pacing: Uses analyzeContentComplexity() for text-aware tempo adjustment
  enableAdaptivePacing: envEnabled('POST_TTS_ADAPTIVE_PACING'),
  // Vocal fry: Irregular glottal pulses (25-80 Hz) with diploponia, not LFO modulation
  enableVocalFry: envEnabled('POST_TTS_VOCAL_FRY'),
  vocalFryDepth: 0.4,
  vocalFryDurationMs: 200,
  // Lip smacks: Formant-based synthesis with oral cavity resonances (F1/F2/F3)
  // 4 types: lip pop (40%), soft smack (35%), wet smack (15%), tongue click (10%)
  enableLipSmacks: envEnabled('POST_TTS_LIP_SMACKS'),
  lipSmackProbability: 0.3,
  // Tempo variation: SOLA-based time stretching with cross-correlation and Hann windowing
  // Proper frame boundary continuity (no more read_pos reset bug)
  enableTempoVariation: envEnabled('POST_TTS_TEMPO_VARIATION'),
  tempoVariationDepth: 0.03,
  // Onset softening: micro-fades on hard glottal attacks
  // Reduces harsh vowel-initial sounds for more natural speech
  enableOnsetSoftening: envEnabled('POST_TTS_ONSET_SOFTENING'),
  // =========================================================================
  // STATE-OF-THE-ART HUMANIZATION - December 2024
  // These features add subtle natural variations found in real human speech
  // Most enabled by default for "Better Than Human" quality
  // =========================================================================
  // Jitter: cycle-to-cycle pitch variation (natural speech has 0.5-2%)
  enableJitter: !envDisabled('POST_TTS_JITTER'),
  jitterAmount: 0.015, // 1.5% - subtle and natural
  // Shimmer: cycle-to-cycle amplitude variation (natural speech has 3-10%)
  enableShimmer: !envDisabled('POST_TTS_SHIMMER'),
  shimmerAmount: 0.05, // 5% - within natural range
  // HNR Modulation: adds subtle breathiness/aspiration noise
  enableHnrModulation: !envDisabled('POST_TTS_HNR_MODULATION'),
  hnrBreathiness: 0.15, // Light breathiness - not too raspy
  // Subglottal Resonance: chest cavity resonances at Sg1=600Hz, Sg2=1400Hz, Sg3=2200Hz
  enableSubglottalResonance: !envDisabled('POST_TTS_SUBGLOTTAL'),
  subglottalStrength: 0.2, // Subtle presence - adds warmth
  // Smile Formant Shifts: high-shelf boost for emotional brightness
  enableSmileFormants: envEnabled('POST_TTS_SMILE_FORMANTS'), // OFF by default (situational)
  smileAmount: 0.3, // When enabled, subtle smile
  // Glottalization: 70Hz modulation at vowel onsets
  enableGlottalization: envEnabled('POST_TTS_GLOTTALIZATION'), // OFF by default (can be harsh)
  glottalizationStrength: 0.4, // When enabled, moderate intensity
  // Hesitation Phenomena: synthetic "um" (300ms, 120Hz) and "uh" (200ms, 110Hz)
  enableHesitationSounds: envEnabled('POST_TTS_HESITATION'), // OFF by default (use sparingly)
  hesitationProbability: 0.1, // 10% chance per phrase when enabled
  // Lombard Effect: noise-adaptive volume (+6dB) and brightness
  enableLombardEffect: envEnabled('POST_TTS_LOMBARD'), // OFF by default (needs noise detection)
  // Register Transitions: smooth transitions between modal/falsetto/fry
  enableRegisterTransitions: envEnabled('POST_TTS_REGISTER'), // OFF by default (advanced)
  targetRegister: 0, // 0=Modal (default), 1=Falsetto, 2=Fry
  // Pharyngeal Constriction: throat tension for stress/tension sounds
  enablePharyngealConstriction: envEnabled('POST_TTS_PHARYNGEAL'), // OFF by default (situational)
  pharyngealAmount: 0.3, // When enabled, moderate tightness
};

// ============================================================================
// METRICS
// ============================================================================

export interface PostTTSMetrics {
  totalFramesProcessed: number;
  totalProcessingTimeMs: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  breathsInjected: number;
  framesWithBreath: number;
  bypassedFrames: number;
}

const metrics: PostTTSMetrics = {
  totalFramesProcessed: 0,
  totalProcessingTimeMs: 0,
  avgProcessingTimeMs: 0,
  maxProcessingTimeMs: 0,
  breathsInjected: 0,
  framesWithBreath: 0,
  bypassedFrames: 0,
};

/**
 * Get post-TTS processing metrics
 */
export function getPostTTSMetrics(): PostTTSMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetPostTTSMetrics(): void {
  metrics.totalFramesProcessed = 0;
  metrics.totalProcessingTimeMs = 0;
  metrics.avgProcessingTimeMs = 0;
  metrics.maxProcessingTimeMs = 0;
  metrics.breathsInjected = 0;
  metrics.framesWithBreath = 0;
  metrics.bypassedFrames = 0;
}

// ============================================================================
// CONTENT COMPLEXITY ANALYSIS (for Adaptive Pacing)
// ============================================================================

/**
 * Analyze text content to determine complexity for adaptive pacing.
 *
 * This enables the POST_TTS_ADAPTIVE_PACING feature to automatically adjust
 * speech tempo based on how complex the content is:
 * - Complex content (technical, multi-clause) → slower pacing for comprehension
 * - Simple content (casual, short) → natural/faster pacing
 *
 * Factors analyzed:
 * - Sentence length and structure
 * - Word complexity (syllable count, technical terms)
 * - Question density
 * - Clause complexity (conjunctions, parentheticals)
 * - Emotional weight (certain words need time to land)
 *
 * @param text - The text content to analyze
 * @returns Complexity score 0-1 (0 = simple, 1 = very complex)
 */
export function analyzeContentComplexity(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0.5; // Default moderate complexity
  }

  let complexity = 0.3; // Base level

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // 1. Text length factor (longer = more complex)
  if (wordCount > 50) complexity += 0.15;
  else if (wordCount > 30) complexity += 0.08;
  else if (wordCount < 10) complexity -= 0.1; // Short = simpler

  // 2. Average word length (longer words = more complex)
  const avgWordLength =
    words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0) / Math.max(wordCount, 1);
  if (avgWordLength > 7) complexity += 0.15;
  else if (avgWordLength > 5.5) complexity += 0.08;
  else if (avgWordLength < 4) complexity -= 0.08;

  // 3. Sentence complexity (clauses, punctuation)
  const commaCount = (text.match(/,/g) || []).length;
  const semicolonCount = (text.match(/;/g) || []).length;
  if (commaCount > 4 || semicolonCount > 0) complexity += 0.1;

  // 4. Question density (questions need processing time)
  const questionCount = (text.match(/\?/g) || []).length;
  complexity += questionCount * 0.08;

  // 5. Technical/complex vocabulary
  const technicalPatterns = [
    /\b(understand|consider|important|significant|however|therefore)\b/gi,
    /\b(specifically|particularly|essentially|fundamentally|consequently)\b/gi,
    /\b(nevertheless|furthermore|additionally|alternatively|respectively)\b/gi,
    /\b(psychological|philosophical|analytical|theoretical|substantial)\b/gi,
  ];
  let technicalMatches = 0;
  for (const pattern of technicalPatterns) {
    technicalMatches += (text.match(pattern) || []).length;
  }
  if (technicalMatches > 3) complexity += 0.15;
  else if (technicalMatches > 1) complexity += 0.08;

  // 6. Emotional weight words (need time to land)
  const emotionalPatterns =
    /\b(love|grief|fear|hope|dream|loss|pain|joy|sorry|proud|grateful|worried)\b/gi;
  const emotionalMatches = (text.match(emotionalPatterns) || []).length;
  if (emotionalMatches > 0) complexity += 0.05 * Math.min(emotionalMatches, 3);

  // 7. Parenthetical/nested content (requires more cognitive load)
  const parentheticalCount = (text.match(/[(\[]/g) || []).length;
  const dashCount = (text.match(/[—–-]{2,}/g) || []).length;
  complexity += (parentheticalCount + dashCount) * 0.05;

  // 8. Numbers and data (need processing time)
  const numberCount = (text.match(/\d+/g) || []).length;
  if (numberCount > 2) complexity += 0.1;

  // 9. Conjunction chains (complex sentence structure)
  const conjunctionChains = (
    text.match(/\b(and|but|or|while|because|although|if|when|since)\b/gi) || []
  ).length;
  if (conjunctionChains > 3) complexity += 0.1;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, complexity));
}

/**
 * Get recommended pacing multiplier based on complexity.
 *
 * Higher complexity → lower multiplier (slower speech)
 * Lower complexity → higher multiplier (can speak faster)
 *
 * Range: 0.85 (very complex, slow down 15%) to 1.1 (simple, speed up 10%)
 */
export function getRecommendedPacingFromComplexity(complexity: number): number {
  // Map complexity 0-1 to pacing 1.1-0.85
  // complexity 0 → 1.1 (fast, simple content)
  // complexity 0.5 → 0.975 (normal)
  // complexity 1 → 0.85 (slow, complex content)
  return 1.1 - complexity * 0.25;
}

// ============================================================================
// AUDIO CONVERSION UTILITIES
// ============================================================================

/**
 * Convert Int16 PCM samples to Float32 (-1.0 to 1.0 range)
 */
function int16ToFloat32(int16Samples: Int16Array): Float32Array {
  const float32Samples = new Float32Array(int16Samples.length);
  for (let i = 0; i < int16Samples.length; i++) {
    // Int16 range: -32768 to 32767
    // Float32 range: -1.0 to 1.0
    float32Samples[i] = int16Samples[i] / 32768;
  }
  return float32Samples;
}

/**
 * Convert Float32 samples back to Int16 PCM with TPDF dithering
 *
 * Uses Triangular Probability Density Function (TPDF) dither to reduce
 * quantization distortion when reducing bit depth. This is the industry
 * standard for professional audio conversion.
 *
 * Without dither, quiet passages and fade-outs exhibit audible "staircase"
 * distortion. TPDF dither replaces this with benign white noise.
 */
function float32ToInt16(float32Samples: Float32Array): Int16Array {
  const int16Samples = new Int16Array(float32Samples.length);

  for (let i = 0; i < float32Samples.length; i++) {
    // Clip to [-1, 1] range
    const clipped = Math.max(-1, Math.min(1, float32Samples[i]));

    // Scale to Int16 range
    const scaled = clipped * 32767;

    // Add TPDF dither: sum of two uniform random numbers [-0.5, 0.5]
    // This creates triangular distribution with amplitude of ±1 LSB
    const dither = Math.random() - 0.5 + (Math.random() - 0.5);

    // Round with dither
    int16Samples[i] = Math.round(scaled + dither);
  }
  return int16Samples;
}

// ============================================================================
// JAVASCRIPT FALLBACK IMPLEMENTATIONS
// ============================================================================

/**
 * JavaScript fallback for soft attack (raised cosine fade-in)
 */
function jsApplySoftAttack(samples: Float32Array, attackMs: number, sampleRate: number): void {
  const attackSamples = Math.floor((attackMs / 1000) * sampleRate);
  for (let i = 0; i < attackSamples && i < samples.length; i++) {
    // Raised cosine: 0.5 * (1 - cos(π * i / N))
    const envelope = 0.5 * (1 - Math.cos(Math.PI * (i / attackSamples)));
    samples[i] *= envelope;
  }
}

/**
 * JavaScript fallback for soft release (raised cosine fade-out)
 */
function jsApplySoftRelease(samples: Float32Array, releaseMs: number, sampleRate: number): void {
  const releaseSamples = Math.floor((releaseMs / 1000) * sampleRate);
  const startIdx = Math.max(0, samples.length - releaseSamples);
  for (let i = startIdx; i < samples.length; i++) {
    const position = i - startIdx;
    // Raised cosine: 0.5 * (1 + cos(π * position / N))
    const envelope = 0.5 * (1 + Math.cos(Math.PI * (position / releaseSamples)));
    samples[i] *= envelope;
  }
}

/**
 * Simple JavaScript RMS compression (not as good as Rust but works)
 */
function jsApplySimpleCompression(samples: Float32Array, thresholdDb: number, ratio: number): void {
  const thresholdLinear = Math.pow(10, thresholdDb / 20);

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > thresholdLinear) {
      // Apply compression above threshold
      const over = abs - thresholdLinear;
      const compressed = thresholdLinear + over / ratio;
      samples[i] = samples[i] > 0 ? compressed : -compressed;
    }
  }
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process an audio frame with "Better Than Human" enhancements
 *
 * @param frame - Input AudioFrame from Cartesia TTS
 * @param config - Enhancement configuration
 * @returns Enhanced AudioFrame (or original if processing unavailable)
 */
async function processFrame(
  frame: AudioFrame,
  config: Required<PostTTSConfig>,
  rust: RustAudioModule | null
): Promise<AudioFrame> {
  const startTime = performance.now();

  // Get raw sample data from frame
  // AudioFrame stores Int16 PCM in frame.data (Uint8Array backing buffer)
  // We need to interpret it as Int16Array
  const frameData = frame.data;
  const int16Samples = new Int16Array(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength / 2
  );

  // Convert to Float32 for processing
  let float32Samples = int16ToFloat32(int16Samples);

  // Apply enhancements using Rust or JavaScript fallback
  if (rust) {
    // Use Rust for full enhancement pipeline (fastest)
    // Note: Rust config uses camelCase to match NAPI-RS conversion from snake_case
    const rustConfig: PostTtsEnhancementConfig = {
      sampleRate: config.sampleRate,
      enableBreath: config.enableBreath,
      enableWarmth: config.enableWarmth,
      enableMicroPitch: config.enableMicroPitch,
      enableSoftEdges: config.enableSoftEdges,
      enableCompression: config.enableCompression,
      enablePresence: config.enablePresence,
      breathProbability: config.breathProbability,
      warmthAmount: config.warmthAmount,
      pitchModulationCents: config.pitchModulationCents,
      softEdgeMs: config.softEdgeMs,
      compressionRatio: config.compressionRatio,
      compressionThresholdDb: config.compressionThresholdDb,
      presenceBoostDb: config.presenceBoostDb,
    };
    float32Samples = rust.enhanceTtsAudioInplace(float32Samples, rustConfig);
  } else {
    // JavaScript fallback (subset of features)
    if (config.enableSoftEdges) {
      jsApplySoftAttack(float32Samples, config.softEdgeMs, config.sampleRate);
      jsApplySoftRelease(float32Samples, config.softEdgeMs, config.sampleRate);
    }
    if (config.enableCompression) {
      jsApplySimpleCompression(
        float32Samples,
        config.compressionThresholdDb,
        config.compressionRatio
      );
    }
    // Note: warmth, presence, breath, micro-pitch require Rust
  }

  // Convert back to Int16
  const enhancedInt16 = float32ToInt16(float32Samples);

  // Create new AudioFrame with enhanced data
  const enhancedFrame = new AudioFrame(
    enhancedInt16,
    config.sampleRate,
    1, // mono
    enhancedInt16.length
  );

  // Track metrics
  const processingTime = performance.now() - startTime;
  metrics.totalFramesProcessed++;
  metrics.totalProcessingTimeMs += processingTime;
  metrics.avgProcessingTimeMs = metrics.totalProcessingTimeMs / metrics.totalFramesProcessed;
  if (processingTime > metrics.maxProcessingTimeMs) {
    metrics.maxProcessingTimeMs = processingTime;
  }

  return enhancedFrame;
}

// ============================================================================
// TRANSFORM STREAM
// ============================================================================

/**
 * Create a post-TTS transform stream that enhances audio frames
 *
 * NEW STATEFUL PROCESSING STRATEGY (Butter Smooth):
 * - Uses a STATEFUL Rust processor that maintains filter state between frames
 * - Crossfade overlap-add eliminates frame boundary artifacts
 * - Biquad filters persist state (no clicks at boundaries)
 * - Compressor maintains envelope (no pumping)
 * - De-esser reduces sibilance (4-8kHz)
 * - Look-ahead limiter prevents clipping
 * - Soft attack on first frame, soft release on last frame (automatic)
 *
 * LEGACY FALLBACK:
 * - If stateful processor unavailable, falls back to per-frame processing
 * - JavaScript fallback for minimal features when Rust not available
 *
 * Usage:
 * ```typescript
 * const audioStream = await someTTSFunction(text);
 * const enhancedStream = audioStream.pipeThrough(
 *   createPostTTSTransform({ sessionId, personaId })
 * );
 * ```
 */
export function createPostTTSTransform(
  config: PostTTSConfig = {}
): NodeTransformStream<AudioFrame, AudioFrame> {
  const fullConfig: Required<PostTTSConfig> = { ...DEFAULT_CONFIG, ...config };
  let rust: RustAudioModule | null = null;
  let statefulProcessor: NativePostTTSProcessorInstance | null = null;
  let frameCount = 0;
  // Buffer the ORIGINAL (unprocessed) frame so we can process it with isLastFrame=true in flush
  // This prevents double-processing which causes audio artifacts
  let bufferedOriginalFrame: AudioFrame | null = null;
  // For legacy mode: buffer the processed frame
  let bufferedProcessedFrame: AudioFrame | null = null;
  let isFirstFrame = true;

  return new NodeTransformStream<AudioFrame, AudioFrame>({
    async start() {
      // Load Rust module during stream initialization
      rust = await getRustModule();

      if (rust && hasStatefulProcessorAvailable()) {
        // NEW: Create stateful processor (butter smooth mode)
        try {
          const processorConfig: NativePostTtsConfig = {
            sampleRate: fullConfig.sampleRate,
            // Warmth: subtle low-shelf boost (2.1dB = 0.35 * 6)
            enableWarmth: fullConfig.enableWarmth,
            warmthGainDb: fullConfig.warmthAmount * 6,
            // Presence: subtle clarity boost
            enablePresence: fullConfig.enablePresence,
            presenceGainDb: fullConfig.presenceBoostDb,
            // Compression: gentle dynamics control
            enableCompression: fullConfig.enableCompression,
            compThresholdDb: fullConfig.compressionThresholdDb,
            compRatio: fullConfig.compressionRatio,
            compAttackMs: 30, // Slower attack prevents pumping
            compReleaseMs: 300, // Longer release prevents breathing
            // Legacy de-esser: DISABLED - causes wideband gain modulation artifacts ("sparkler" sound)
            enableDeesser: false,
            // Split-band de-esser: ENABLED - professional quality, only attenuates high frequencies
            // This is the same technique used in hardware de-essers like Empirical Labs DerrEsser
            enableSplitbandDeesser: true,
            splitbandCrossoverFreq: 5000, // Split at 5kHz
            splitbandThresholdDb: -20, // Moderate threshold
            splitbandRatio: 4, // 4:1 compression on high band only
            // Limiter: soft limiter to prevent clipping
            enableLimiter: true,
            // Crossfade: seamless frame boundaries
            enableCrossfade: true,
            crossfadeMs: 5,
            // Soft edges: gentle fade in/out at utterance boundaries
            softAttackMs: fullConfig.enableSoftEdges ? fullConfig.softEdgeMs : 0,
            softReleaseMs: fullConfig.enableSoftEdges ? fullConfig.softEdgeMs : 0,
            // =========================================================================
            // HUMANIZATION FEATURES - Make TTS sound natural
            // =========================================================================
            // Breath injection: subtle inhale at utterance start
            enableBreath: fullConfig.enableBreath,
            breathProbability: fullConfig.breathProbability,
            // Micro-pitch modulation: fast ~5Hz pitch wobble
            enableMicroPitch: fullConfig.enableMicroPitch,
            microPitchCents: fullConfig.pitchModulationCents,
            // Noise floor: very quiet room tone
            enableNoiseFloor: fullConfig.enableNoiseFloor,
            noiseFloorDb: fullConfig.noiseFloorDb,
            // Amplitude jitter: subtle volume variation
            enableAmplitudeJitter: fullConfig.enableAmplitudeJitter,
            amplitudeJitterDepth: fullConfig.amplitudeJitterDepth,
            // Pitch drift: slow wandering
            enablePitchDrift: fullConfig.enablePitchDrift,
            pitchDriftCents: fullConfig.pitchDriftCents,
            // =========================================================================
            // SOLA & EMOTION PROSODY - Better pitch shifting & emotional expression
            // =========================================================================
            // SOLA pitch: artifact-free pitch shifting using overlap-add
            useSolaPitch: fullConfig.useSolaPitch,
            // Emotion prosody: dynamically adjust pitch/rate based on emotion
            enableEmotionProsody: fullConfig.enableEmotionProsody,
            emotion: fullConfig.emotion,
            // Adaptive pacing: slow down for complex content
            enableAdaptivePacing: fullConfig.enableAdaptivePacing,
            contentComplexity: fullConfig.contentComplexity,
            // =========================================================================
            // ADVANCED HUMANIZATION - Ultra-realistic speech features
            // =========================================================================
            // Vocal fry: creaky voice effect at phrase endings
            enableVocalFry: fullConfig.enableVocalFry,
            vocalFryDepth: fullConfig.vocalFryDepth,
            vocalFryDurationMs: fullConfig.vocalFryDurationMs,
            // Lip smacks: natural mouth sounds between phrases
            enableLipSmacks: fullConfig.enableLipSmacks,
            lipSmackProbability: fullConfig.lipSmackProbability,
            // Tempo micro-variation: subtle speed changes within phrases
            enableTempoVariation: fullConfig.enableTempoVariation,
            tempoVariationDepth: fullConfig.tempoVariationDepth,
            // Onset softening: micro-fades on hard glottal attacks
            enableOnsetSoftening: fullConfig.enableOnsetSoftening,
            // =========================================================================
            // STATE-OF-THE-ART HUMANIZATION - December 2024
            // =========================================================================
            // Jitter: cycle-to-cycle pitch variation
            enableJitter: fullConfig.enableJitter,
            jitterAmount: fullConfig.jitterAmount,
            // Shimmer: cycle-to-cycle amplitude variation
            enableShimmer: fullConfig.enableShimmer,
            shimmerAmount: fullConfig.shimmerAmount,
            // HNR Modulation: breathiness/aspiration
            enableHnrModulation: fullConfig.enableHnrModulation,
            hnrBreathiness: fullConfig.hnrBreathiness,
            // Subglottal Resonance: chest cavity resonances
            enableSubglottalResonance: fullConfig.enableSubglottalResonance,
            subglottalStrength: fullConfig.subglottalStrength,
            // Smile Formant Shifts: emotional brightness
            enableSmileFormants: fullConfig.enableSmileFormants,
            smileAmount: fullConfig.smileAmount,
            // Glottalization: glottal stops at vowel onsets
            enableGlottalization: fullConfig.enableGlottalization,
            glottalizationStrength: fullConfig.glottalizationStrength,
            // Hesitation Phenomena: "um", "uh" sounds
            enableHesitationSounds: fullConfig.enableHesitationSounds,
            hesitationProbability: fullConfig.hesitationProbability,
            // Lombard Effect: noise adaptation
            enableLombardEffect: fullConfig.enableLombardEffect,
            // Register Transitions: modal/falsetto/fry
            enableRegisterTransitions: fullConfig.enableRegisterTransitions,
            targetRegister: fullConfig.targetRegister,
            // Pharyngeal Constriction: throat tension
            enablePharyngealConstriction: fullConfig.enablePharyngealConstriction,
            pharyngealAmount: fullConfig.pharyngealAmount,
          };

          statefulProcessor = new rust.NativePostTtsProcessor(processorConfig);
          statefulProcessor.startUtterance();

          log.info(
            {
              sessionId: fullConfig.sessionId,
              personaId: fullConfig.personaId,
              mode: 'stateful',
              features: {
                crossfade: true,
                splitbandDeesser: true,
                limiter: true,
                warmth: fullConfig.enableWarmth,
                presence: fullConfig.enablePresence,
                compression: fullConfig.enableCompression,
                // Humanization features
                breath: fullConfig.enableBreath,
                microPitch: fullConfig.enableMicroPitch,
                noiseFloor: fullConfig.enableNoiseFloor,
                amplitudeJitter: fullConfig.enableAmplitudeJitter,
                pitchDrift: fullConfig.enablePitchDrift,
                // SOLA & emotion prosody
                solaPitch: fullConfig.useSolaPitch,
                emotionProsody: fullConfig.enableEmotionProsody,
                adaptivePacing: fullConfig.enableAdaptivePacing,
                // Advanced humanization
                vocalFry: fullConfig.enableVocalFry,
                lipSmacks: fullConfig.enableLipSmacks,
                tempoVariation: fullConfig.enableTempoVariation,
                onsetSoftening: fullConfig.enableOnsetSoftening,
                // State-of-the-art humanization
                jitter: fullConfig.enableJitter,
                shimmer: fullConfig.enableShimmer,
                hnrModulation: fullConfig.enableHnrModulation,
                subglottalResonance: fullConfig.enableSubglottalResonance,
                smileFormants: fullConfig.enableSmileFormants,
                glottalization: fullConfig.enableGlottalization,
                hesitationSounds: fullConfig.enableHesitationSounds,
                lombardEffect: fullConfig.enableLombardEffect,
                registerTransitions: fullConfig.enableRegisterTransitions,
                pharyngealConstriction: fullConfig.enablePharyngealConstriction,
              },
            },
            '🧈 Post-TTS STATEFUL processor initialized (butter smooth + state-of-the-art humanization)'
          );
        } catch (error) {
          log.warn(
            { error: String(error) },
            'Failed to create stateful processor, falling back to legacy'
          );
          statefulProcessor = null;
        }
      } else if (rust) {
        log.info(
          { sessionId: fullConfig.sessionId, personaId: fullConfig.personaId },
          '🦀 Post-TTS Rust enhancement pipeline initialized (legacy mode)'
        );
      } else {
        log.info(
          { sessionId: fullConfig.sessionId },
          '📦 Post-TTS JavaScript fallback initialized (limited features)'
        );
      }
    },

    async transform(frame, controller) {
      frameCount++;
      const startTime = performance.now();

      try {
        // NEW: Use stateful processor if available
        if (statefulProcessor) {
          // STATEFUL MODE: Process the PREVIOUS buffered frame, buffer the CURRENT frame
          // This allows flush() to process the last frame with isLastFrame=true

          if (bufferedOriginalFrame) {
            // Process the PREVIOUS frame (not the last one)
            const prevFrameData = bufferedOriginalFrame.data;
            const prevInt16 = new Int16Array(
              prevFrameData.buffer,
              prevFrameData.byteOffset,
              prevFrameData.byteLength / 2
            );
            const prevFloat32 = int16ToFloat32(prevInt16);

            const stats = statefulProcessor.processFrame(prevFloat32, false);

            if (isFirstFrame) {
              isFirstFrame = false;
              log.debug(
                {
                  sessionId: fullConfig.sessionId,
                  sampleRate: fullConfig.sampleRate,
                  statefulMode: true,
                  firstFrameStats: stats,
                },
                '🎙️ Post-TTS processing first frame (stateful)'
              );
            }

            // Convert back and emit
            const enhancedInt16 = float32ToInt16(prevFloat32);
            const enhancedFrame = new AudioFrame(
              enhancedInt16,
              fullConfig.sampleRate,
              1,
              enhancedInt16.length
            );
            controller.enqueue(enhancedFrame);
          }

          // Buffer the CURRENT original frame for next iteration
          bufferedOriginalFrame = frame;
        } else {
          // LEGACY: Use stateless processing with manual boundary handling
          const noSoftEdgesConfig: Required<PostTTSConfig> = {
            ...fullConfig,
            enableSoftEdges: false,
          };
          let enhancedFrame = await processFrame(frame, noSoftEdgesConfig, rust);

          // FIRST FRAME: Apply soft attack (fade-in)
          if (isFirstFrame) {
            isFirstFrame = false;
            log.debug(
              {
                sessionId: fullConfig.sessionId,
                sampleRate: fullConfig.sampleRate,
                statefulMode: false,
              },
              '🎙️ Post-TTS processing first frame (legacy)'
            );

            if (fullConfig.enableSoftEdges) {
              enhancedFrame = applySoftAttackToFrame(
                enhancedFrame,
                fullConfig.softEdgeMs,
                fullConfig.sampleRate,
                rust
              );
            }
          }

          // Emit the PREVIOUS buffered frame (it's not the last one)
          if (bufferedProcessedFrame) {
            controller.enqueue(bufferedProcessedFrame);
          }
          bufferedProcessedFrame = enhancedFrame;
        }

        // Track metrics
        const processingTime = performance.now() - startTime;
        metrics.totalFramesProcessed++;
        metrics.totalProcessingTimeMs += processingTime;
        metrics.avgProcessingTimeMs = metrics.totalProcessingTimeMs / metrics.totalFramesProcessed;
        if (processingTime > metrics.maxProcessingTimeMs) {
          metrics.maxProcessingTimeMs = processingTime;
        }
      } catch (error) {
        // On error, pass through original frame
        log.warn(
          { error: String(error), sessionId: fullConfig.sessionId, frame: frameCount },
          'Post-TTS processing error - passing through original'
        );
        metrics.bypassedFrames++;

        // Emit any buffered frame
        if (statefulProcessor && bufferedOriginalFrame) {
          controller.enqueue(bufferedOriginalFrame);
          bufferedOriginalFrame = null;
        } else if (bufferedProcessedFrame) {
          controller.enqueue(bufferedProcessedFrame);
          bufferedProcessedFrame = null;
        }
        // Pass through current frame
        controller.enqueue(frame);
      }
    },

    flush(controller) {
      // Process and emit the last buffered frame
      if (statefulProcessor && bufferedOriginalFrame) {
        // STATEFUL: Process last ORIGINAL frame with isLastFrame: true
        // This applies soft release and finalizes crossfade
        // The frame has NOT been processed yet, so no double-processing!
        const frameData = bufferedOriginalFrame.data;
        const int16Samples = new Int16Array(
          frameData.buffer,
          frameData.byteOffset,
          frameData.byteLength / 2
        );
        const float32Samples = int16ToFloat32(int16Samples);

        const finalStats = statefulProcessor.processFrame(float32Samples, true);

        const enhancedInt16 = float32ToInt16(float32Samples);
        const finalFrame = new AudioFrame(
          enhancedInt16,
          fullConfig.sampleRate,
          1,
          enhancedInt16.length
        );

        controller.enqueue(finalFrame);

        log.debug(
          {
            sessionId: fullConfig.sessionId,
            finalStats,
            totalFrames: statefulProcessor.frameCount(),
          },
          '🎙️ Post-TTS processed final frame (stateful)'
        );
      } else if (bufferedProcessedFrame) {
        // LEGACY: Apply soft release to last frame
        if (fullConfig.enableSoftEdges) {
          bufferedProcessedFrame = applySoftReleaseToFrame(
            bufferedProcessedFrame,
            fullConfig.softEdgeMs,
            fullConfig.sampleRate,
            rust
          );
        }
        controller.enqueue(bufferedProcessedFrame);
      }

      // Log final metrics
      if (fullConfig.enableMetrics && frameCount > 0) {
        log.info(
          {
            sessionId: fullConfig.sessionId,
            personaId: fullConfig.personaId,
            framesProcessed: frameCount,
            avgProcessingTimeMs: metrics.avgProcessingTimeMs.toFixed(2),
            maxProcessingTimeMs: metrics.maxProcessingTimeMs.toFixed(2),
            breathsInjected: metrics.breathsInjected,
            bypassedFrames: metrics.bypassedFrames,
            statefulMode: statefulProcessor !== null,
            rustEnabled: rust !== null,
            softEdgesApplied: fullConfig.enableSoftEdges,
          },
          '📊 Post-TTS enhancement metrics'
        );
      }

      // Clean up stateful processor
      if (statefulProcessor) {
        statefulProcessor.reset();
        statefulProcessor = null;
      }
    },
  });
}

/**
 * Apply soft attack (fade-in) to a single frame
 */
function applySoftAttackToFrame(
  frame: AudioFrame,
  attackMs: number,
  sampleRate: number,
  rust: RustAudioModule | null
): AudioFrame {
  const frameData = frame.data;
  const int16Samples = new Int16Array(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength / 2
  );

  let float32Samples = int16ToFloat32(int16Samples);

  if (rust) {
    float32Samples = rust.applySoftAttack(float32Samples, attackMs, sampleRate);
  } else {
    jsApplySoftAttack(float32Samples, attackMs, sampleRate);
  }

  const enhancedInt16 = float32ToInt16(float32Samples);
  return new AudioFrame(enhancedInt16, sampleRate, 1, enhancedInt16.length);
}

/**
 * Apply soft release (fade-out) to a single frame
 */
function applySoftReleaseToFrame(
  frame: AudioFrame,
  releaseMs: number,
  sampleRate: number,
  rust: RustAudioModule | null
): AudioFrame {
  const frameData = frame.data;
  const int16Samples = new Int16Array(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength / 2
  );

  let float32Samples = int16ToFloat32(int16Samples);

  if (rust) {
    float32Samples = rust.applySoftRelease(float32Samples, releaseMs, sampleRate);
  } else {
    jsApplySoftRelease(float32Samples, releaseMs, sampleRate);
  }

  const enhancedInt16 = float32ToInt16(float32Samples);
  return new AudioFrame(enhancedInt16, sampleRate, 1, enhancedInt16.length);
}

// ============================================================================
// STREAM WRAPPER FUNCTION
// ============================================================================

/**
 * Wrap an audio stream with post-TTS enhancement
 *
 * This is the main entry point for integrating with tts-wrapper.ts
 *
 * @param audioStream - Input audio stream from TTS
 * @param config - Enhancement configuration
 * @returns Enhanced audio stream
 */
export async function applyPostTTSEnhancement(
  audioStream: NodeReadableStream<AudioFrame>,
  config: PostTTSConfig = {}
): Promise<NodeReadableStream<AudioFrame>> {
  // Check if post-TTS enhancement is enabled
  if (process.env.POST_TTS_ENHANCEMENT_ENABLED === 'false') {
    log.debug({ sessionId: config.sessionId }, 'Post-TTS enhancement disabled by env');
    return audioStream;
  }

  const transform = createPostTTSTransform(config);
  return audioStream.pipeThrough(
    transform as unknown as NodeTransformStream<AudioFrame, AudioFrame>
  );
}

/**
 * Check if post-TTS enhancement is available
 */
export async function isPostTTSAvailable(): Promise<boolean> {
  const rust = await getRustModule();
  return rust !== null;
}

// ============================================================================
// PRESETS FOR DIFFERENT SCENARIOS
// ============================================================================

/**
 * Preset configurations for different voice scenarios
 */
export const PostTTSPresets = {
  /**
   * Default "Better Than Human" preset - STATEFUL processing for butter smooth audio
   *
   * With the new stateful processor, this preset enables:
   * - Crossfade overlap-add (eliminates frame boundary clicks)
   * - Stateful biquad filters (no filter reset artifacts)
   * - Stateful compression (no pumping/breathing)
   * - De-esser (automatic sibilance control)
   * - Look-ahead limiter (prevents clipping)
   * - Soft attack/release (natural phrase boundaries)
   * - Basic humanization (breath, jitter, drift, noise floor)
   * - SOLA pitch shifting & emotion prosody
   * - Advanced features OFF by default (enable per-persona or via ultraRealistic)
   */
  betterThanHuman: {
    enableBreath: true,
    breathProbability: 0.15,
    enableWarmth: true,
    warmthAmount: 0.35,
    enableSoftEdges: true,
    softEdgeMs: 15,
    enableCompression: true,
    compressionRatio: 2.0,
    compressionThresholdDb: -18,
    enablePresence: true,
    presenceBoostDb: 2.0,
    // Humanization (on by default)
    enableAmplitudeJitter: true,
    amplitudeJitterDepth: 0.015,
    enablePitchDrift: true,
    pitchDriftCents: 5,
    enableNoiseFloor: true,
    noiseFloorDb: -55,
    // SOLA & emotion (on by default)
    useSolaPitch: true,
    enableEmotionProsody: true,
    // Advanced humanization (off by default - enable per-persona)
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
    // State-of-the-art humanization (on by default for natural speech)
    enableJitter: true,
    jitterAmount: 0.015,
    enableShimmer: true,
    shimmerAmount: 0.05,
    enableHnrModulation: true,
    hnrBreathiness: 0.15,
    enableSubglottalResonance: true,
    subglottalStrength: 0.2,
    enableSmileFormants: false, // Situational
    enableGlottalization: false, // Can be harsh
    enableHesitationSounds: false, // Use sparingly
    enableLombardEffect: false, // Needs noise detection
    enableRegisterTransitions: false, // Advanced
    enablePharyngealConstriction: false, // Situational
  } satisfies Partial<PostTTSConfig>,

  /** Minimal processing - just soft edges for smooth transitions */
  minimal: {
    enableBreath: false,
    enableWarmth: false,
    enableSoftEdges: true,
    softEdgeMs: 10,
    enableCompression: false,
    enablePresence: false,
    // Disable all humanization
    enableAmplitudeJitter: false,
    enablePitchDrift: false,
    enableNoiseFloor: false,
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
    // Disable state-of-the-art humanization
    enableJitter: false,
    enableShimmer: false,
    enableHnrModulation: false,
    enableSubglottalResonance: false,
    enableSmileFormants: false,
    enableGlottalization: false,
    enableHesitationSounds: false,
    enableLombardEffect: false,
    enableRegisterTransitions: false,
    enablePharyngealConstriction: false,
  } satisfies Partial<PostTTSConfig>,

  /** Warm and intimate - for emotional/supportive content */
  warmIntimate: {
    enableBreath: true,
    breathProbability: 0.2,
    enableWarmth: true,
    warmthAmount: 0.5,
    enableSoftEdges: true,
    softEdgeMs: 20,
    enableCompression: true,
    compressionRatio: 2.5,
    compressionThresholdDb: -20,
    enablePresence: false, // Less presence for softer sound
    presenceBoostDb: 0,
    // Enhanced humanization for intimacy
    enableAmplitudeJitter: true,
    amplitudeJitterDepth: 0.02, // Slightly more variation
    enablePitchDrift: true,
    pitchDriftCents: 8, // More expressive drift
    enableNoiseFloor: true,
    noiseFloorDb: -52, // Slightly more room tone
    // Deprecated features - disabled
    enableVocalFry: false, // DISABLED: sounds robotic, not natural
    vocalFryDepth: 0.3,
    vocalFryDurationMs: 150,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
    // State-of-the-art humanization (enhanced for intimacy)
    enableJitter: true,
    jitterAmount: 0.018, // Slightly more for vulnerability
    enableShimmer: true,
    shimmerAmount: 0.06, // Slightly more variation
    enableHnrModulation: true,
    hnrBreathiness: 0.2, // More breath for intimacy
    enableSubglottalResonance: true,
    subglottalStrength: 0.25, // Warmer chest resonance
    enableSmileFormants: false, // Off for intimate moments
    enableGlottalization: false,
    enableHesitationSounds: false,
    enableLombardEffect: false,
    enableRegisterTransitions: false,
    enablePharyngealConstriction: false,
  } satisfies Partial<PostTTSConfig>,

  /** Clear and energetic - for action-oriented content */
  clearEnergetic: {
    enableBreath: true,
    breathProbability: 0.1,
    enableWarmth: true,
    warmthAmount: 0.2,
    enableSoftEdges: true,
    softEdgeMs: 12,
    enableCompression: true,
    compressionRatio: 3.0, // More compression for punchier sound
    compressionThresholdDb: -15,
    enablePresence: true,
    presenceBoostDb: 3.0, // More presence for clarity
    // Light humanization (keep it clean)
    enableAmplitudeJitter: true,
    amplitudeJitterDepth: 0.01, // Subtle
    enablePitchDrift: true,
    pitchDriftCents: 3, // Less drift for stability
    enableNoiseFloor: true,
    noiseFloorDb: -58, // Quieter room tone
    // No advanced humanization (keep energy crisp)
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
    // State-of-the-art humanization (minimal for clarity)
    enableJitter: true,
    jitterAmount: 0.012, // Less for stability
    enableShimmer: true,
    shimmerAmount: 0.04, // Less variation
    enableHnrModulation: true,
    hnrBreathiness: 0.1, // Less breathiness for clarity
    enableSubglottalResonance: true,
    subglottalStrength: 0.15, // Subtle
    enableSmileFormants: true, // ON for energetic brightness
    smileAmount: 0.25,
    enableGlottalization: false,
    enableHesitationSounds: false,
    enableLombardEffect: false,
    enableRegisterTransitions: false,
    enablePharyngealConstriction: false,
  } satisfies Partial<PostTTSConfig>,

  /**
   * DEPRECATED: Ultra-realistic preset
   *
   * ⚠️ WARNING: The "advanced humanization" features (vocal fry, lip smacks,
   * tempo variation) have known audio quality issues:
   * - Vocal fry uses LFO amplitude modulation that sounds robotic
   * - Lip smacks are synthetic noise that sounds like audio glitches
   * - Tempo variation causes resampling artifacts
   *
   * This preset now uses the same settings as betterThanHuman.
   * The deprecated features are kept disabled.
   */
  ultraRealistic: {
    enableBreath: true,
    breathProbability: 0.2,
    enableWarmth: true,
    warmthAmount: 0.35,
    enableSoftEdges: true,
    softEdgeMs: 15,
    enableCompression: true,
    compressionRatio: 2.0,
    compressionThresholdDb: -18,
    enablePresence: true,
    presenceBoostDb: 2.0,
    // Full humanization (working features only)
    enableAmplitudeJitter: true,
    amplitudeJitterDepth: 0.02,
    enablePitchDrift: true,
    pitchDriftCents: 8,
    enableNoiseFloor: true,
    noiseFloorDb: -52,
    // SOLA & emotion prosody
    useSolaPitch: true,
    enableEmotionProsody: true,
    enableAdaptivePacing: false, // DISABLED: not properly implemented
    contentComplexity: 0.5,
    // DEPRECATED features - kept disabled due to audio quality issues
    enableVocalFry: false, // DISABLED: sounds robotic
    vocalFryDepth: 0.4,
    vocalFryDurationMs: 200,
    enableLipSmacks: false, // DISABLED: sounds like glitches
    lipSmackProbability: 0.25,
    enableTempoVariation: false, // DISABLED: causes artifacts
    tempoVariationDepth: 0.03,
    enableOnsetSoftening: false,
    // State-of-the-art humanization (all on for maximum realism)
    enableJitter: true,
    jitterAmount: 0.02, // Full natural range
    enableShimmer: true,
    shimmerAmount: 0.06, // Full natural range
    enableHnrModulation: true,
    hnrBreathiness: 0.2, // More breathiness
    enableSubglottalResonance: true,
    subglottalStrength: 0.25, // Stronger chest presence
    enableSmileFormants: false, // Context-dependent
    smileAmount: 0.3,
    enableGlottalization: false, // Can be enabled per-context
    glottalizationStrength: 0.4,
    enableHesitationSounds: false, // Can be enabled per-context
    hesitationProbability: 0.1,
    enableLombardEffect: false, // Needs noise detection
    enableRegisterTransitions: false, // Advanced use case
    targetRegister: 0,
    enablePharyngealConstriction: false, // Context-dependent
    pharyngealAmount: 0.3,
  } satisfies Partial<PostTTSConfig>,

  /** Bypass - no processing (for debugging) */
  bypass: {
    enableBreath: false,
    enableWarmth: false,
    enableMicroPitch: false,
    enableSoftEdges: false,
    enableCompression: false,
    enablePresence: false,
    // Disable all humanization
    enableAmplitudeJitter: false,
    enablePitchDrift: false,
    enableNoiseFloor: false,
    enableVocalFry: false,
    enableLipSmacks: false,
    enableTempoVariation: false,
    enableOnsetSoftening: false,
    useSolaPitch: false,
    enableEmotionProsody: false,
    enableAdaptivePacing: false,
    // Disable state-of-the-art humanization
    enableJitter: false,
    enableShimmer: false,
    enableHnrModulation: false,
    enableSubglottalResonance: false,
    enableSmileFormants: false,
    enableGlottalization: false,
    enableHesitationSounds: false,
    enableLombardEffect: false,
    enableRegisterTransitions: false,
    enablePharyngealConstriction: false,
  } satisfies Partial<PostTTSConfig>,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createPostTTSTransform,
  applyPostTTSEnhancement,
  isPostTTSAvailable,
  getPostTTSMetrics,
  resetPostTTSMetrics,
  PostTTSPresets,
};

// ============================================================================
// PERSONA HUMANIZATION CONFIG
// ============================================================================

/**
 * Persona humanization config from persona.manifest.json
 * This defines what humanization settings to use for a specific persona
 */
export interface PersonaHumanizationConfig {
  /** Base preset to start from */
  preset?: keyof typeof PostTTSPresets;
  // Individual overrides (same as PostTTSConfig)
  enableBreath?: boolean;
  breathProbability?: number;
  enableWarmth?: boolean;
  warmthAmount?: number;
  enableAmplitudeJitter?: boolean;
  amplitudeJitterDepth?: number;
  enablePitchDrift?: boolean;
  pitchDriftCents?: number;
  enableNoiseFloor?: boolean;
  noiseFloorDb?: number;
  useSolaPitch?: boolean;
  enableEmotionProsody?: boolean;
  enableAdaptivePacing?: boolean;
  enableVocalFry?: boolean;
  vocalFryDepth?: number;
  vocalFryDurationMs?: number;
  enableLipSmacks?: boolean;
  lipSmackProbability?: number;
  enableTempoVariation?: boolean;
  tempoVariationDepth?: number;
  enableOnsetSoftening?: boolean;
  // State-of-the-art humanization
  enableJitter?: boolean;
  jitterAmount?: number;
  enableShimmer?: boolean;
  shimmerAmount?: number;
  enableHnrModulation?: boolean;
  hnrBreathiness?: number;
  enableSubglottalResonance?: boolean;
  subglottalStrength?: number;
  enableSmileFormants?: boolean;
  smileAmount?: number;
  enableGlottalization?: boolean;
  glottalizationStrength?: number;
  enableHesitationSounds?: boolean;
  hesitationProbability?: number;
  enableLombardEffect?: boolean;
  enableRegisterTransitions?: boolean;
  targetRegister?: number;
  enablePharyngealConstriction?: boolean;
  pharyngealAmount?: number;
}

/**
 * Get recommended humanization presets for persona archetypes
 *
 * This provides sensible defaults based on persona personality/role.
 * Individual personas can override these in their manifest.
 */
export function getRecommendedPreset(personaId: string): keyof typeof PostTTSPresets {
  // Map personas to recommended presets based on their role/personality
  const personaPresets: Record<string, keyof typeof PostTTSPresets> = {
    // Ferni (coordinator) - warm, natural, not too dramatic
    ferni: 'betterThanHuman',
    // Maya (habit coach) - warm and intimate for personal coaching
    'maya-santos': 'warmIntimate',
    maya: 'warmIntimate',
    // Peter (research analyst) - clear and energetic for data presentation
    'peter-john': 'clearEnergetic',
    'peter-lynch': 'clearEnergetic', // Legacy alias
    peter: 'clearEnergetic',
    // Jordan (life planning) - clear and celebratory
    'jordan-barnes': 'clearEnergetic',
    jordan: 'clearEnergetic',
    // Alex (communication) - clear for professional contexts
    'alex-chen': 'clearEnergetic',
    alex: 'clearEnergetic',
    // Nayan (wisdom) - ultra-realistic for deep conversations
    'nayan-sharma': 'ultraRealistic',
    nayan: 'ultraRealistic',
  };

  return personaPresets[personaId.toLowerCase()] || 'betterThanHuman';
}

/**
 * Build PostTTSConfig from persona manifest's humanization section
 *
 * Priority: session config > persona config > preset > defaults
 *
 * @param personaId - Persona identifier
 * @param personaConfig - Humanization config from persona.manifest.json
 * @param sessionConfig - Session-specific overrides (optional)
 */
export function buildPersonaPostTTSConfig(
  personaId: string,
  personaConfig?: PersonaHumanizationConfig,
  sessionConfig?: Partial<PostTTSConfig>
): PostTTSConfig {
  // 1. Start with recommended preset for this persona type
  const recommendedPreset = getRecommendedPreset(personaId);

  // 2. Get the preset config (from manifest or recommended)
  const presetName = personaConfig?.preset || recommendedPreset;
  const presetConfig = PostTTSPresets[presetName] || PostTTSPresets.betterThanHuman;

  // 3. Merge: defaults < preset < persona config < session config
  const merged: PostTTSConfig = {
    ...DEFAULT_CONFIG,
    ...presetConfig,
    personaId,
  };

  // 4. Apply persona-specific overrides from manifest
  if (personaConfig) {
    const personaOverrides: Partial<PostTTSConfig> = {};
    if (personaConfig.enableBreath !== undefined)
      personaOverrides.enableBreath = personaConfig.enableBreath;
    if (personaConfig.breathProbability !== undefined)
      personaOverrides.breathProbability = personaConfig.breathProbability;
    if (personaConfig.enableWarmth !== undefined)
      personaOverrides.enableWarmth = personaConfig.enableWarmth;
    if (personaConfig.warmthAmount !== undefined)
      personaOverrides.warmthAmount = personaConfig.warmthAmount;
    if (personaConfig.enableAmplitudeJitter !== undefined)
      personaOverrides.enableAmplitudeJitter = personaConfig.enableAmplitudeJitter;
    if (personaConfig.amplitudeJitterDepth !== undefined)
      personaOverrides.amplitudeJitterDepth = personaConfig.amplitudeJitterDepth;
    if (personaConfig.enablePitchDrift !== undefined)
      personaOverrides.enablePitchDrift = personaConfig.enablePitchDrift;
    if (personaConfig.pitchDriftCents !== undefined)
      personaOverrides.pitchDriftCents = personaConfig.pitchDriftCents;
    if (personaConfig.enableNoiseFloor !== undefined)
      personaOverrides.enableNoiseFloor = personaConfig.enableNoiseFloor;
    if (personaConfig.noiseFloorDb !== undefined)
      personaOverrides.noiseFloorDb = personaConfig.noiseFloorDb;
    if (personaConfig.useSolaPitch !== undefined)
      personaOverrides.useSolaPitch = personaConfig.useSolaPitch;
    if (personaConfig.enableEmotionProsody !== undefined)
      personaOverrides.enableEmotionProsody = personaConfig.enableEmotionProsody;
    if (personaConfig.enableAdaptivePacing !== undefined)
      personaOverrides.enableAdaptivePacing = personaConfig.enableAdaptivePacing;
    if (personaConfig.enableVocalFry !== undefined)
      personaOverrides.enableVocalFry = personaConfig.enableVocalFry;
    if (personaConfig.vocalFryDepth !== undefined)
      personaOverrides.vocalFryDepth = personaConfig.vocalFryDepth;
    if (personaConfig.vocalFryDurationMs !== undefined)
      personaOverrides.vocalFryDurationMs = personaConfig.vocalFryDurationMs;
    if (personaConfig.enableLipSmacks !== undefined)
      personaOverrides.enableLipSmacks = personaConfig.enableLipSmacks;
    if (personaConfig.lipSmackProbability !== undefined)
      personaOverrides.lipSmackProbability = personaConfig.lipSmackProbability;
    if (personaConfig.enableTempoVariation !== undefined)
      personaOverrides.enableTempoVariation = personaConfig.enableTempoVariation;
    if (personaConfig.tempoVariationDepth !== undefined)
      personaOverrides.tempoVariationDepth = personaConfig.tempoVariationDepth;
    if (personaConfig.enableOnsetSoftening !== undefined)
      personaOverrides.enableOnsetSoftening = personaConfig.enableOnsetSoftening;
    // State-of-the-art humanization overrides
    if (personaConfig.enableJitter !== undefined)
      personaOverrides.enableJitter = personaConfig.enableJitter;
    if (personaConfig.jitterAmount !== undefined)
      personaOverrides.jitterAmount = personaConfig.jitterAmount;
    if (personaConfig.enableShimmer !== undefined)
      personaOverrides.enableShimmer = personaConfig.enableShimmer;
    if (personaConfig.shimmerAmount !== undefined)
      personaOverrides.shimmerAmount = personaConfig.shimmerAmount;
    if (personaConfig.enableHnrModulation !== undefined)
      personaOverrides.enableHnrModulation = personaConfig.enableHnrModulation;
    if (personaConfig.hnrBreathiness !== undefined)
      personaOverrides.hnrBreathiness = personaConfig.hnrBreathiness;
    if (personaConfig.enableSubglottalResonance !== undefined)
      personaOverrides.enableSubglottalResonance = personaConfig.enableSubglottalResonance;
    if (personaConfig.subglottalStrength !== undefined)
      personaOverrides.subglottalStrength = personaConfig.subglottalStrength;
    if (personaConfig.enableSmileFormants !== undefined)
      personaOverrides.enableSmileFormants = personaConfig.enableSmileFormants;
    if (personaConfig.smileAmount !== undefined)
      personaOverrides.smileAmount = personaConfig.smileAmount;
    if (personaConfig.enableGlottalization !== undefined)
      personaOverrides.enableGlottalization = personaConfig.enableGlottalization;
    if (personaConfig.glottalizationStrength !== undefined)
      personaOverrides.glottalizationStrength = personaConfig.glottalizationStrength;
    if (personaConfig.enableHesitationSounds !== undefined)
      personaOverrides.enableHesitationSounds = personaConfig.enableHesitationSounds;
    if (personaConfig.hesitationProbability !== undefined)
      personaOverrides.hesitationProbability = personaConfig.hesitationProbability;
    if (personaConfig.enableLombardEffect !== undefined)
      personaOverrides.enableLombardEffect = personaConfig.enableLombardEffect;
    if (personaConfig.enableRegisterTransitions !== undefined)
      personaOverrides.enableRegisterTransitions = personaConfig.enableRegisterTransitions;
    if (personaConfig.targetRegister !== undefined)
      personaOverrides.targetRegister = personaConfig.targetRegister;
    if (personaConfig.enablePharyngealConstriction !== undefined)
      personaOverrides.enablePharyngealConstriction = personaConfig.enablePharyngealConstriction;
    if (personaConfig.pharyngealAmount !== undefined)
      personaOverrides.pharyngealAmount = personaConfig.pharyngealAmount;
    Object.assign(merged, personaOverrides);
  }

  // 5. Apply session-specific overrides
  if (sessionConfig) {
    Object.assign(merged, sessionConfig);
  }

  log.debug(
    {
      personaId,
      preset: presetName,
      hasPersonaConfig: !!personaConfig,
      hasSessionConfig: !!sessionConfig,
      vocalFry: merged.enableVocalFry,
      lipSmacks: merged.enableLipSmacks,
      tempoVariation: merged.enableTempoVariation,
    },
    '🎭 Built persona-specific PostTTS config'
  );

  return merged;
}
