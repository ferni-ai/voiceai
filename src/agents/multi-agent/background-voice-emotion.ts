/**
 * The caller's voice emotion for the background turn-intelligence pass.
 *
 * The background pass (turn-intelligence.ts) builds its own turn user data, and
 * on main that data has no voiceEmotion, so the voice-vs-words read
 * (intelligence/detectors/voice-mismatch.ts) and the turn crisis read
 * (turn-processor/turn-crisis.ts) only ever see the caller's words there.
 * BACKGROUND_VOICE_EMOTION (default off) passes the voice through.
 *
 * It passes a measured-only view, not the analyzer result as is. The native
 * analyzer (speech/audio-prosody/analyzer.ts, mapNativeToJsFeatures) does not
 * measure jitter, shimmer or breathiness; it writes fixed defaults, and the
 * analyzer's stress level, anxiety markers, valence and emotion label are
 * computed from them. So those four are re-derived here with the three
 * voice-quality inputs set to zero, using the analyzer's own functions
 * (emotion-mapping.ts). Arousal and dominance read no voice-quality input and
 * pass through. Prosody is left out, so readers keyed on the raw features
 * (voice tremor from shimmer, concern signals) stay as on main; every reader
 * on the background path guards prosody as optional.
 *
 * @module agents/multi-agent/background-voice-emotion
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import {
  calculateStressLevel,
  classifyEmotion,
  detectAnxietyMarkers,
  mapToEmotionalDimensions,
  type ProsodyFeatures,
  type VoiceEmotionResult,
} from '../../speech/audio-prosody/index.js';

/** The voice emotion the background pass hands its turn: no raw prosody, no unmeasured inputs. */
export type BackgroundVoiceEmotion = Omit<VoiceEmotionResult, 'prosody'>;

/** BACKGROUND_VOICE_EMOTION (config/flags/BACKGROUND_VOICE_EMOTION.ts). */
export function backgroundVoiceEmotionOn(env: Env = process.env): boolean {
  return flagOn('BACKGROUND_VOICE_EMOTION', env);
}

/** The analyzer's prosody with the inputs the native path never measures set to zero. */
function measuredOnly(prosody: ProsodyFeatures): ProsodyFeatures {
  return { ...prosody, jitter: 0, shimmer: 0, breathiness: 0 };
}

/**
 * The measured-only view of an analyzer result, or undefined when there is no
 * result or it carries no prosody to re-derive from.
 */
export function backgroundVoiceEmotion(
  voiceEmotion: VoiceEmotionResult | undefined
): BackgroundVoiceEmotion | undefined {
  if (!voiceEmotion?.prosody) return undefined;
  const prosody = measuredOnly(voiceEmotion.prosody);
  // Valence does not read the baseline (emotion-mapping.ts), so an empty one is exact here.
  const { valence } = mapToEmotionalDimensions(prosody, { pitch: 0, energy: 0, rate: 0 }, false);
  const dimensions = { valence, arousal: voiceEmotion.arousal, dominance: voiceEmotion.dominance };
  const { emotion, confidence } = classifyEmotion(dimensions, prosody);
  return {
    primary: emotion,
    confidence,
    ...dimensions,
    stressLevel: calculateStressLevel(prosody, dimensions),
    anxietyMarkers: detectAnxietyMarkers(prosody),
    sampleCount: voiceEmotion.sampleCount,
    processingTimeMs: voiceEmotion.processingTimeMs,
  };
}

/** What the background turn context gets under the flag. */
export interface BackgroundTurnVoice {
  /** For the turn user data, read by the voice-vs-words and crisis reads. */
  view: BackgroundVoiceEmotion;
  /** The context's top-level voice emotion: arousal and valence from measured fields. */
  summary: Pick<BackgroundVoiceEmotion, 'primary' | 'confidence' | 'arousal' | 'valence'>;
}

/**
 * The caller's voice for the background turn context, or undefined when the flag
 * is off or there is no reading with prosody. The turn user data types the
 * reading loosely; it is what AudioProsodyAnalyzer.analyze() returns.
 */
export function backgroundTurnVoice(
  reading: unknown,
  env: Env = process.env
): BackgroundTurnVoice | undefined {
  if (!backgroundVoiceEmotionOn(env)) return undefined;
  const view = backgroundVoiceEmotion(reading as VoiceEmotionResult | undefined);
  if (!view) return undefined;
  const { primary, confidence, arousal, valence } = view;
  return { view, summary: { primary, confidence, arousal, valence } };
}
