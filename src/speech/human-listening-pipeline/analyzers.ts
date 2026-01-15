/**
 * Human Listening Analyzers
 *
 * Analysis functions for audio, text, and conversation signals.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  AudioAnalysis,
  ConversationAnalysis,
  HumanListeningContext,
  ProsodyFeaturesInput,
  TextAnalysis,
} from './types.js';

// Audio-based analyzers
import { getBreathDetector, type BreathPatternResult } from '../breath-detection.js';
import { getEnergyDynamicsTracker, type EnergyDynamicsResult } from '../energy-dynamics.js';
import { getFillerAnalyzer } from '../filler-analysis.js';
import { getFluencyAnalyzer } from '../fluency-analysis.js';
import { getVoiceTremorDetector, type VoiceTremorResult } from '../voice-tremor.js';
import { getVolumeDynamicsTracker, type VolumeDynamicsState } from '../volume-dynamics.js';

// Text-based analyzers
import { getCognitiveLoadDetector } from '../../intelligence/detectors/cognitive-load.js';
import { getHedgingDetector } from '../../intelligence/detectors/hedging.js';
import { getSelfSoothingDetector } from '../../intelligence/detectors/self-soothing.js';

// Conversation-based analyzers
import { getEngagementScorer } from '../../conversation/engagement-scoring.js';
import { getNarrativeArcTracker } from '../../conversation/narrative-arc.js';

const log = getLogger().child({ module: 'HumanListeningAnalyzers' });

// ============================================================================
// AUDIO ANALYSIS
// ============================================================================

/**
 * Analyze audio signals from raw samples or prosody features
 */
export async function analyzeAudio(
  sessionId: string,
  context: HumanListeningContext
): Promise<AudioAnalysis> {
  // If we have raw audio samples, use the full analyzers
  if (context.audioSamples && context.sampleRate) {
    const breath = getBreathDetector(sessionId).analyzeAudio(
      context.audioSamples,
      context.sampleRate
    );

    const tremor = getVoiceTremorDetector(sessionId).analyzeAudio(
      context.audioSamples,
      context.sampleRate
    );

    const volumeDynamics = getVolumeDynamicsTracker(sessionId).recordFromAudioSamples(
      context.audioSamples,
      context.sampleRate,
      context.text.slice(0, 50)
    );

    const energyDynamics = getEnergyDynamicsTracker(sessionId).analyzeFromAudio(
      context.audioSamples,
      context.sampleRate,
      context.text
    );

    return { breath, tremor, volumeDynamics, energyDynamics };
  }

  // If we have pre-computed prosody features, derive insights from them
  if (context.prosodyFeatures) {
    return deriveAudioFromProsody(context.prosodyFeatures, context.text);
  }

  // No audio data available
  return {
    breath: null,
    tremor: null,
    volumeDynamics: null,
    energyDynamics: null,
  };
}

/**
 * Derive audio analysis from pre-computed prosody features.
 * This allows us to get human listening insights without raw audio.
 */
function deriveAudioFromProsody(prosody: ProsodyFeaturesInput, _text: string): AudioAnalysis {
  // Derive tremor from jitter and voice quality
  let tremor: VoiceTremorResult | null = null;
  if (prosody.jitter !== undefined || prosody.voiceQuality) {
    const jitterHigh = (prosody.jitter ?? 0) > 0.02;
    const shimmerHigh = (prosody.shimmer ?? 0) > 0.1;
    const isTrembling = prosody.voiceQuality === 'trembling';
    const isStrained = prosody.voiceQuality === 'strained';

    if (jitterHigh || isTrembling || isStrained) {
      tremor = {
        detected: true,
        primaryType: isTrembling ? 'quiver' : isStrained ? 'strain' : 'tremor',
        intensity: jitterHigh ? 'noticeable' : 'subtle',
        events: [],
        emotionalIndicator: isTrembling ? 'strong emotion' : 'tension or stress',
        possibleTears: isTrembling && shimmerHigh,
        possibleAnxiety: jitterHigh || isStrained,
        suggestedResponse: isTrembling
          ? 'Voice suggests strong emotion - be gentle and give space'
          : 'Voice sounds strained - acknowledge they may be processing something difficult',
        confidence: jitterHigh ? 0.7 : 0.5,
      };
    }
  }

  // Derive breath patterns from breathiness and pause patterns
  let breath: BreathPatternResult | null = null;
  if (prosody.breathiness !== undefined || prosody.pauseDuration !== undefined) {
    const highBreathiness = (prosody.breathiness ?? 0) > 0.5;
    const longPauses = (prosody.pauseDuration ?? 0) > 500;

    if (highBreathiness || longPauses) {
      breath = {
        events: [],
        dominantPattern: highBreathiness ? 'sigh' : 'deep',
        breathingQuality: highBreathiness ? 'labored' : 'controlled',
        emotionalState: highBreathiness ? 'fatigue or overwhelm' : 'processing',
        needsSpace: highBreathiness || longPauses,
        guidance: highBreathiness
          ? 'Breathy voice - may be tired or overwhelmed'
          : 'Taking pauses - processing something',
        confidence: 0.6,
      };
    }
  }

  // Derive volume dynamics from energy features
  let volumeDynamics: VolumeDynamicsState | null = null;
  if (prosody.energyMean !== undefined || prosody.energyVariance !== undefined) {
    const lowEnergy = (prosody.energyMean ?? 50) < 40;

    volumeDynamics = {
      baseline: 50,
      currentRelativeVolume: (prosody.energyMean ?? 50) / 50,
      currentLevel: lowEnergy ? 'soft' : 'normal',
      withinUtteranceTrend: lowEnergy ? 'getting_quieter' : 'stable',
      acrossUtterancesTrend: 'stable' as const,
      onSensitiveTopic: lowEnergy,
      intensityIncreasing: false,
      interpretation: lowEnergy ? 'Voice is quieter - may be on sensitive topic' : 'Normal volume',
      suggestedAgentVolume: lowEnergy ? 'softer' : 'match',
      confidence: 0.6,
    };
  }

  // Derive energy dynamics from speech rate and energy
  let energyDynamics: EnergyDynamicsResult | null = null;
  if (prosody.speechRate !== undefined || prosody.energyMean !== undefined) {
    const slowSpeech = (prosody.speechRate ?? 3) < 2;
    const lowEnergy = (prosody.energyMean ?? 50) < 40;

    if (slowSpeech || lowEnergy) {
      const interpretationText = slowSpeech
        ? 'Speech is slowing - they may be uncertain or processing'
        : "Lower energy - don't rush them";
      energyDynamics = {
        withinUtterance: lowEnergy ? 'fading' : 'steady',
        acrossSession: 'stable',
        segments: [],
        startEnergy: prosody.energyMean ?? 50,
        endEnergy: lowEnergy ? (prosody.energyMean ?? 50) * 0.7 : (prosody.energyMean ?? 50),
        fadeDetected: slowSpeech && lowEnergy,
        fadeIndicates: slowSpeech ? 'uncertainty' : 'fatigue',
        interpretation: interpretationText,
        guidance: interpretationText,
        confidence: 0.6,
      };
    }
  }

  log.debug(
    {
      hasJitter: prosody.jitter !== undefined,
      hasBreathiness: prosody.breathiness !== undefined,
      hasEnergy: prosody.energyMean !== undefined,
      derivedTremor: !!tremor,
      derivedBreath: !!breath,
    },
    '🎧 Derived audio analysis from prosody features'
  );

  return { breath, tremor, volumeDynamics, energyDynamics };
}

// ============================================================================
// TEXT ANALYSIS
// ============================================================================

/**
 * Analyze text-based signals
 */
export async function analyzeText(
  sessionId: string,
  context: HumanListeningContext
): Promise<TextAnalysis> {
  const cognitiveLoad = getCognitiveLoadDetector(sessionId).analyzeUtterance(
    context.text,
    context.durationMs ?? 0,
    context.pauseInfo
  );

  const fluency = getFluencyAnalyzer(sessionId).analyze(context.text);

  const hedging = getHedgingDetector(sessionId).analyze(context.text);

  const fillers = getFillerAnalyzer(sessionId).analyze(context.text);

  const selfSoothing = getSelfSoothingDetector(sessionId).analyze(context.text);

  return { cognitiveLoad, fluency, hedging, fillers, selfSoothing };
}

// ============================================================================
// CONVERSATION ANALYSIS
// ============================================================================

/**
 * Analyze conversation-level signals
 */
export async function analyzeConversation(
  sessionId: string,
  context: HumanListeningContext
): Promise<ConversationAnalysis> {
  const narrativeArc = getNarrativeArcTracker(sessionId).analyzeUtterance({
    text: context.text,
    turn: context.turnNumber,
    emotion: context.emotion,
    emotionalIntensity: context.emotionalIntensity,
  });

  const engagement = getEngagementScorer(sessionId).recordResponse(context.text, {
    lastAgentMessageTime: context.timeSinceAgentMessage
      ? Date.now() - context.timeSinceAgentMessage
      : undefined,
    currentTopic: context.currentTopic,
  });

  return { narrativeArc, engagement };
}

// ============================================================================
// ANALYZER RESET
// ============================================================================

/**
 * Reset all analyzers for a session
 */
export function resetAllAnalyzers(sessionId: string): void {
  // Audio
  getBreathDetector(sessionId).reset();
  getVoiceTremorDetector(sessionId).reset();
  getVolumeDynamicsTracker(sessionId).reset();
  getEnergyDynamicsTracker(sessionId).reset();
  getFluencyAnalyzer(sessionId).reset();
  getFillerAnalyzer(sessionId).reset();

  // Text
  getCognitiveLoadDetector(sessionId).reset();
  getHedgingDetector(sessionId).reset();
  getSelfSoothingDetector(sessionId).reset();

  // Conversation
  getNarrativeArcTracker(sessionId).reset();
  getEngagementScorer(sessionId).reset();
}
