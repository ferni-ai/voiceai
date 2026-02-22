/**
 * Rich Emotion Model
 *
 * Upgrades Ferni's emotion understanding from a flat "primary emotion" string
 * to a multi-dimensional model worthy of "Better than Human" intelligence.
 *
 * Capabilities:
 * 1. Primary + secondary emotions with confidence scores
 * 2. Continuous valence/arousal dimensions (Russell's circumplex)
 * 3. Sarcasm/irony detection from text patterns
 * 4. Emotional suppression detection (text-voice mismatch)
 * 5. Emotion blending (simultaneous emotions: "bittersweet", "anxious excitement")
 * 6. Temporal context: emotion trajectory within session
 *
 * Integration:
 *   Text emotion (emotion-detection.ts) ─┐
 *   Voice emotion (audio-prosody)        ─┼─→ fuseEmotionSignals() → RichEmotionState
 *   Voice-text mismatch (detectors/)     ─┘
 *
 * @module intelligence/rich-emotion-model
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'rich-emotion-model' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single emotion with confidence and intensity.
 */
export interface EmotionLayer {
  /** Emotion label */
  emotion: string;
  /** Detection confidence (0-1) */
  confidence: number;
  /** Felt intensity (0-1) */
  intensity: number;
  /** Source of detection */
  source: 'text' | 'voice' | 'fused';
}

/**
 * Continuous emotional dimensions (Russell's circumplex model).
 */
export interface EmotionalDimensions {
  /** Pleasure-displeasure axis: -1 (negative) to 1 (positive) */
  valence: number;
  /** Activation axis: -1 (calm/passive) to 1 (excited/active) */
  arousal: number;
  /** Control axis: -1 (submissive) to 1 (dominant) */
  dominance: number;
}

/**
 * Sarcasm/irony detection result.
 */
export interface SarcasmSignal {
  /** Whether sarcasm was detected */
  detected: boolean;
  /** Confidence in detection (0-1) */
  confidence: number;
  /** Type of sarcasm */
  type: 'verbal_irony' | 'situational_irony' | 'self_deprecating' | 'none';
  /** The likely intended meaning (beneath the sarcasm) */
  intendedSentiment: 'positive' | 'negative' | 'neutral';
  /** Textual markers that triggered detection */
  markers: string[];
}

/**
 * Emotional suppression/masking detection.
 */
export interface SuppressionSignal {
  /** Whether suppression was detected */
  detected: boolean;
  /** Confidence (0-1) */
  confidence: number;
  /** What the user is trying to appear as */
  surfaceEmotion: string;
  /** What their voice/patterns reveal underneath */
  underlyingEmotion: string;
  /** Type of suppression behavior */
  strategy: 'masking' | 'understating' | 'deflecting' | 'over_compensating' | 'none';
  /** Suggested therapeutic approach */
  approachGuidance: string;
}

/**
 * Named emotion blend — simultaneous emotions that create a recognizable compound state.
 */
export interface EmotionBlend {
  /** Named blend (e.g., "bittersweet", "anxious_excitement") */
  name: string;
  /** Component emotions */
  components: [string, string];
  /** Intensity of the blend (0-1) */
  intensity: number;
  /** How to acknowledge this blend conversationally */
  acknowledgment: string;
}

/**
 * The complete rich emotion state for a single turn.
 */
export interface RichEmotionState {
  /** Primary emotion (backward-compatible) */
  primary: EmotionLayer;
  /** Secondary emotion(s) — up to 2 */
  secondary: EmotionLayer[];
  /** Continuous dimensions */
  dimensions: EmotionalDimensions;
  /** Sarcasm/irony detection */
  sarcasm: SarcasmSignal;
  /** Emotional suppression detection */
  suppression: SuppressionSignal;
  /** Named blend if two strong emotions coexist */
  blend: EmotionBlend | null;
  /** Emotion trajectory within session */
  trajectory: {
    trend: 'improving' | 'declining' | 'stable' | 'volatile';
    turnsSinceShift: number;
    previousPrimary: string | null;
  };
  /** Overall reliability of this analysis */
  overallConfidence: number;
  /** Timestamp */
  analyzedAt: number;
}

// ============================================================================
// TEXT EMOTION INPUT (from emotion-detection.ts)
// ============================================================================

interface TextEmotionInput {
  primary: string;
  secondary?: string;
  confidence: number;
  energy?: 'low' | 'medium' | 'high';
  keywords?: string[];
}

// ============================================================================
// VOICE EMOTION INPUT (from audio-prosody)
// ============================================================================

interface VoiceEmotionInput {
  primary: string;
  confidence: number;
  valence?: number;
  arousal?: number;
  dominance?: number;
  stressLevel?: number;
  speechRate?: number;
}

// ============================================================================
// MISMATCH INPUT (from detectors/voice-mismatch.ts)
// ============================================================================

interface MismatchInput {
  hasMismatch: boolean;
  confidence: number;
  textEmotion: string;
  voiceEmotion: string;
  type: string;
  interpretation: string;
  suggestedApproach: string;
}

// ============================================================================
// SARCASM DETECTION
// ============================================================================

/**
 * Patterns that indicate sarcasm/irony in text.
 * These are heuristic — not perfect, but signal over noise.
 */
const SARCASM_PATTERNS: Array<{ pattern: RegExp; type: SarcasmSignal['type']; weight: number }> = [
  // Verbal irony markers
  { pattern: /\b(oh\s+great|oh\s+wonderful|oh\s+perfect|oh\s+fantastic)\b/i, type: 'verbal_irony', weight: 0.8 },
  { pattern: /\b(yeah\s+right|sure\s+thing|oh\s+really)\b/i, type: 'verbal_irony', weight: 0.7 },
  { pattern: /\b(thanks?\s+a\s+lot)\b/i, type: 'verbal_irony', weight: 0.5 },
  { pattern: /\b(just\s+what\s+i\s+needed)\b/i, type: 'verbal_irony', weight: 0.7 },
  { pattern: /\b(how\s+lovely|how\s+nice|how\s+delightful)\b/i, type: 'verbal_irony', weight: 0.6 },
  { pattern: /\b(clearly|obviously)\b.*\b(not|never|nobody)\b/i, type: 'verbal_irony', weight: 0.6 },
  { pattern: /\b(because\s+that'?s?\s+(exactly|totally|definitely)\s+what)\b/i, type: 'verbal_irony', weight: 0.8 },

  // Self-deprecating humor
  { pattern: /\b(i'?m?\s+such\s+a\s+(genius|winner|catch))\b/i, type: 'self_deprecating', weight: 0.6 },
  { pattern: /\b(way\s+to\s+go\s+me|brilliant\s+move)\b/i, type: 'self_deprecating', weight: 0.6 },
  { pattern: /\b(nailed\s+it)\b/i, type: 'self_deprecating', weight: 0.4 },

  // Situational markers
  { pattern: /\b(what\s+a\s+surprise|who\s+could\s+have\s+(guessed|predicted|known))\b/i, type: 'situational_irony', weight: 0.7 },
  { pattern: /\b(shocking|shocker)\b/i, type: 'situational_irony', weight: 0.5 },
];

/**
 * Context clues that REDUCE sarcasm probability.
 * Genuine enthusiasm often uses similar words to sarcasm.
 */
const GENUINE_MARKERS = [
  /\b(so\s+excited|really\s+happy|genuinely|honestly|actually\s+great)\b/i,
  /\b(thank\s+you\s+so\s+much|i\s+really\s+appreciate)\b/i,
  /!\s*$/,  // Ends with exclamation — more likely genuine
];

function detectSarcasm(text: string, textEmotion: string, voiceValence?: number): SarcasmSignal {
  const noSignal: SarcasmSignal = {
    detected: false,
    confidence: 0,
    type: 'none',
    intendedSentiment: 'neutral',
    markers: [],
  };

  if (text.length < 5) return noSignal;

  let totalWeight = 0;
  let bestType: SarcasmSignal['type'] = 'none';
  let bestWeight = 0;
  const markers: string[] = [];

  for (const { pattern, type, weight } of SARCASM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      totalWeight += weight;
      markers.push(match[0]);
      if (weight > bestWeight) {
        bestWeight = weight;
        bestType = type;
      }
    }
  }

  if (totalWeight === 0) return noSignal;

  // Reduce confidence if genuine markers present
  let genuineDiscount = 0;
  for (const pattern of GENUINE_MARKERS) {
    if (pattern.test(text)) genuineDiscount += 0.3;
  }

  // Voice-text contradiction boosts sarcasm probability
  let voiceBoost = 0;
  if (voiceValence !== undefined) {
    const textSeemsPositive = ['happy', 'excited', 'grateful'].includes(textEmotion);
    const voiceSeemsNegative = voiceValence < -0.2;
    if (textSeemsPositive && voiceSeemsNegative) {
      voiceBoost = 0.2;
    }
  }

  const confidence = Math.min(0.95, Math.max(0, totalWeight + voiceBoost - genuineDiscount));

  if (confidence < 0.3) return noSignal;

  // Determine intended sentiment (what they really mean)
  const surfaceSentiment = ['happy', 'excited', 'grateful'].includes(textEmotion)
    ? 'positive'
    : ['sad', 'angry', 'frustrated'].includes(textEmotion)
      ? 'negative'
      : 'neutral';
  const intendedSentiment: SarcasmSignal['intendedSentiment'] =
    surfaceSentiment === 'positive' ? 'negative' : surfaceSentiment === 'negative' ? 'positive' : 'neutral';

  return {
    detected: true,
    confidence,
    type: bestType,
    intendedSentiment,
    markers,
  };
}

// ============================================================================
// EMOTION BLENDING
// ============================================================================

/**
 * Named compound emotions that emerge from two co-occurring emotions.
 */
const KNOWN_BLENDS: Array<{
  name: string;
  components: [string, string];
  acknowledgment: string;
}> = [
  {
    name: 'bittersweet',
    components: ['happy', 'sad'],
    acknowledgment: "There's something bittersweet in that — a kind of joy and loss at the same time.",
  },
  {
    name: 'anxious_excitement',
    components: ['excited', 'anxious'],
    acknowledgment: "It sounds like there's excitement mixed with some nerves there.",
  },
  {
    name: 'nostalgic_longing',
    components: ['happy', 'lonely'],
    acknowledgment: 'Remembering good times can bring both warmth and a kind of ache.',
  },
  {
    name: 'frustrated_caring',
    components: ['frustrated', 'grateful'],
    acknowledgment: "It sounds like frustration from something you deeply care about.",
  },
  {
    name: 'hopeful_fear',
    components: ['anticipation', 'fearful'],
    acknowledgment: "Wanting something so much it's scary — that takes courage.",
  },
  {
    name: 'tender_sadness',
    components: ['grateful', 'sad'],
    acknowledgment: "There's a tenderness in that — gratitude and grief holding hands.",
  },
  {
    name: 'defiant_joy',
    components: ['happy', 'angry'],
    acknowledgment: "There's a fierce joy in that — happiness as an act of defiance.",
  },
  {
    name: 'overwhelmed_gratitude',
    components: ['distressed', 'grateful'],
    acknowledgment: "It's a lot, isn't it? So much to handle, and yet you see the good in it.",
  },
];

function detectBlend(
  primary: EmotionLayer,
  secondary: EmotionLayer | undefined
): EmotionBlend | null {
  if (!secondary || secondary.confidence < 0.3 || primary.confidence < 0.3) return null;

  // Both emotions need reasonable intensity
  if (primary.intensity < 0.3 || secondary.intensity < 0.3) return null;

  for (const blend of KNOWN_BLENDS) {
    const [a, b] = blend.components;
    const matchForward = primary.emotion === a && secondary.emotion === b;
    const matchReverse = primary.emotion === b && secondary.emotion === a;

    if (matchForward || matchReverse) {
      const blendIntensity = (primary.intensity + secondary.intensity) / 2;
      return {
        name: blend.name,
        components: blend.components,
        intensity: blendIntensity,
        acknowledgment: blend.acknowledgment,
      };
    }
  }

  return null;
}

// ============================================================================
// VALENCE/AROUSAL MAPPING
// ============================================================================

/**
 * Map discrete emotions to continuous V/A/D dimensions.
 * Based on Russell's circumplex model of affect.
 */
const EMOTION_DIMENSIONS: Record<string, EmotionalDimensions> = {
  happy:       { valence:  0.8, arousal:  0.5, dominance:  0.6 },
  excited:     { valence:  0.7, arousal:  0.9, dominance:  0.6 },
  grateful:    { valence:  0.9, arousal:  0.2, dominance:  0.4 },
  calm:        { valence:  0.5, arousal: -0.5, dominance:  0.3 },
  neutral:     { valence:  0.0, arousal:  0.0, dominance:  0.0 },
  confused:    { valence: -0.2, arousal:  0.2, dominance: -0.4 },
  bored:       { valence: -0.3, arousal: -0.6, dominance: -0.2 },
  sad:         { valence: -0.7, arousal: -0.4, dominance: -0.5 },
  anxious:     { valence: -0.5, arousal:  0.6, dominance: -0.6 },
  frustrated:  { valence: -0.6, arousal:  0.5, dominance: -0.2 },
  angry:       { valence: -0.7, arousal:  0.8, dominance:  0.5 },
  fearful:     { valence: -0.8, arousal:  0.7, dominance: -0.7 },
  distressed:  { valence: -0.8, arousal:  0.6, dominance: -0.5 },
  disgusted:   { valence: -0.6, arousal:  0.3, dominance:  0.2 },
  contempt:    { valence: -0.5, arousal:  0.1, dominance:  0.5 },
  surprised:   { valence:  0.1, arousal:  0.8, dominance: -0.1 },
  anticipation:{ valence:  0.3, arousal:  0.5, dominance:  0.3 },
  trust:       { valence:  0.6, arousal: -0.1, dominance:  0.2 },
  lonely:      { valence: -0.6, arousal: -0.3, dominance: -0.5 },
  confident:   { valence:  0.5, arousal:  0.3, dominance:  0.8 },
};

function getDimensions(emotion: string): EmotionalDimensions {
  return EMOTION_DIMENSIONS[emotion.toLowerCase()] || { valence: 0, arousal: 0, dominance: 0 };
}

// ============================================================================
// SUPPRESSION DETECTION
// ============================================================================

function buildSuppressionSignal(mismatch: MismatchInput | null): SuppressionSignal {
  if (!mismatch || !mismatch.hasMismatch) {
    return {
      detected: false,
      confidence: 0,
      surfaceEmotion: '',
      underlyingEmotion: '',
      strategy: 'none',
      approachGuidance: '',
    };
  }

  const strategyMap: Record<string, SuppressionSignal['strategy']> = {
    masking_negative: 'masking',
    understating_positive: 'understating',
    deflecting: 'deflecting',
    suppressing: 'masking',
    contradicting: 'over_compensating',
    incongruent: 'masking',
  };

  return {
    detected: true,
    confidence: mismatch.confidence,
    surfaceEmotion: mismatch.textEmotion,
    underlyingEmotion: mismatch.voiceEmotion,
    strategy: strategyMap[mismatch.type] || 'masking',
    approachGuidance: mismatch.suggestedApproach,
  };
}

// ============================================================================
// SIGNAL FUSION
// ============================================================================

/**
 * Fuse text emotion, voice emotion, and mismatch signals into a single
 * rich emotion state. This is the main entry point for the module.
 *
 * @param textEmotion - Text-based emotion detection result
 * @param voiceEmotion - Voice prosody emotion result (optional)
 * @param mismatch - Voice-text mismatch result (optional)
 * @param previousState - Previous turn's emotion state (optional, for trajectory)
 */
export function fuseEmotionSignals(
  textEmotion: TextEmotionInput,
  voiceEmotion?: VoiceEmotionInput | null,
  mismatch?: MismatchInput | null,
  previousState?: RichEmotionState | null
): RichEmotionState {
  // 1. BUILD PRIMARY LAYER
  // If voice emotion available and confident, blend text + voice
  let primaryEmotion: string;
  let primaryConfidence: number;
  let primarySource: EmotionLayer['source'];

  if (voiceEmotion && voiceEmotion.confidence > 0.5) {
    // Voice emotion available — fuse with text
    if (voiceEmotion.confidence > textEmotion.confidence) {
      primaryEmotion = voiceEmotion.primary;
      primaryConfidence = voiceEmotion.confidence * 0.6 + textEmotion.confidence * 0.4;
      primarySource = 'fused';
    } else {
      primaryEmotion = textEmotion.primary;
      primaryConfidence = textEmotion.confidence * 0.6 + voiceEmotion.confidence * 0.4;
      primarySource = 'fused';
    }
  } else {
    // Text only
    primaryEmotion = textEmotion.primary;
    primaryConfidence = textEmotion.confidence;
    primarySource = 'text';
  }

  const energyToIntensity: Record<string, number> = { low: 0.3, medium: 0.5, high: 0.8 };
  const primaryIntensity =
    textEmotion.energy ? (energyToIntensity[textEmotion.energy] ?? 0.5) : 0.5;

  const primary: EmotionLayer = {
    emotion: primaryEmotion,
    confidence: Math.min(1, primaryConfidence),
    intensity: primaryIntensity,
    source: primarySource,
  };

  // 2. BUILD SECONDARY LAYERS
  const secondary: EmotionLayer[] = [];

  if (textEmotion.secondary && textEmotion.secondary !== primaryEmotion) {
    secondary.push({
      emotion: textEmotion.secondary,
      confidence: textEmotion.confidence * 0.7,
      intensity: primaryIntensity * 0.6,
      source: 'text',
    });
  }

  // If voice detected a different emotion from text, it's a secondary signal
  if (
    voiceEmotion &&
    voiceEmotion.primary !== primaryEmotion &&
    voiceEmotion.confidence > 0.4 &&
    !secondary.find((s) => s.emotion === voiceEmotion.primary)
  ) {
    secondary.push({
      emotion: voiceEmotion.primary,
      confidence: voiceEmotion.confidence,
      intensity: voiceEmotion.stressLevel ?? 0.5,
      source: 'voice',
    });
  }

  // Cap at 2 secondary emotions
  secondary.sort((a, b) => b.confidence - a.confidence);
  if (secondary.length > 2) secondary.length = 2;

  // 3. CONTINUOUS DIMENSIONS
  const textDimensions = getDimensions(primaryEmotion);
  let dimensions: EmotionalDimensions;

  if (voiceEmotion?.valence !== undefined && voiceEmotion?.arousal !== undefined) {
    // Blend text-mapped dimensions with voice-measured dimensions
    dimensions = {
      valence: textDimensions.valence * 0.4 + voiceEmotion.valence * 0.6,
      arousal: textDimensions.arousal * 0.4 + (voiceEmotion.arousal ?? 0) * 0.6,
      dominance:
        textDimensions.dominance * 0.5 + (voiceEmotion.dominance ?? 0) * 0.5,
    };
  } else {
    dimensions = textDimensions;
  }

  // 4. SARCASM DETECTION
  const userText = textEmotion.keywords?.join(' ') || '';
  const sarcasm = detectSarcasm(
    userText,
    textEmotion.primary,
    voiceEmotion?.valence
  );

  // If sarcasm detected, flip the primary emotion's effective valence
  if (sarcasm.detected && sarcasm.confidence > 0.5) {
    dimensions.valence = -dimensions.valence * 0.5; // Dampen and flip
    log.debug(
      { sarcasmType: sarcasm.type, confidence: sarcasm.confidence },
      'Sarcasm detected — adjusting valence'
    );
  }

  // 5. SUPPRESSION DETECTION
  const suppression = buildSuppressionSignal(mismatch ?? null);

  // 6. EMOTION BLENDING
  const blend = detectBlend(primary, secondary[0]);

  // 7. TRAJECTORY
  const trajectory = computeTrajectory(primary, previousState);

  // 8. OVERALL CONFIDENCE
  const signalCount = voiceEmotion ? 2 : 1;
  const overallConfidence = Math.min(
    1,
    (primary.confidence * 0.6 + (secondary[0]?.confidence ?? 0) * 0.2) *
      (1 + (signalCount - 1) * 0.2)
  );

  return {
    primary,
    secondary,
    dimensions,
    sarcasm,
    suppression,
    blend,
    trajectory,
    overallConfidence,
    analyzedAt: Date.now(),
  };
}

// ============================================================================
// TRAJECTORY
// ============================================================================

function computeTrajectory(
  current: EmotionLayer,
  previous: RichEmotionState | null | undefined
): RichEmotionState['trajectory'] {
  if (!previous) {
    return {
      trend: 'stable',
      turnsSinceShift: 0,
      previousPrimary: null,
    };
  }

  const prevDimensions = previous.dimensions;
  const currDimensions = getDimensions(current.emotion);

  const valenceDelta = currDimensions.valence - prevDimensions.valence;
  const shifted = current.emotion !== previous.primary.emotion;

  let trend: RichEmotionState['trajectory']['trend'];
  if (Math.abs(valenceDelta) < 0.15) {
    trend = 'stable';
  } else if (valenceDelta > 0.3) {
    trend = 'improving';
  } else if (valenceDelta < -0.3) {
    trend = 'declining';
  } else if (shifted && previous.trajectory.turnsSinceShift < 2) {
    trend = 'volatile';
  } else if (valenceDelta > 0) {
    trend = 'improving';
  } else {
    trend = 'declining';
  }

  return {
    trend,
    turnsSinceShift: shifted ? 0 : (previous.trajectory.turnsSinceShift + 1),
    previousPrimary: previous.primary.emotion,
  };
}

// ============================================================================
// SESSION STATE (for trajectory tracking)
// ============================================================================

const sessionEmotionStates = new Map<string, RichEmotionState>();

// ============================================================================
// PUBLIC API: analyzeRichEmotion
// ============================================================================

/**
 * Input shape expected by the turn processor.
 */
export interface AnalyzeRichEmotionInput {
  /** Raw user text */
  text: string;
  /** Text-based emotion detection result */
  textEmotion: {
    primary: string;
    intensity: number;
    secondaryEmotions?: string[];
    confidence?: number;
  };
  /** Voice prosody emotion result (optional) */
  voiceEmotion?: {
    primary: string;
    confidence: number;
    valence?: number;
    arousal?: number;
    dominance?: number;
    stressLevel?: number;
    speechRate?: number;
  };
  /** Session ID for trajectory tracking */
  sessionId: string;
}

/**
 * Analyze user emotion from fused text + voice signals.
 * This is the primary entry point called by turn-processor.ts.
 */
export function analyzeRichEmotion(input: AnalyzeRichEmotionInput): RichEmotionState {
  const { text, textEmotion, voiceEmotion, sessionId } = input;

  // Get previous state for trajectory
  const previousState = sessionEmotionStates.get(sessionId) ?? null;

  // Convert to internal input shapes
  const textInput: TextEmotionInput = {
    primary: textEmotion.primary,
    secondary: textEmotion.secondaryEmotions?.[0],
    confidence: textEmotion.confidence ?? 0.5,
    energy: textEmotion.intensity > 0.7 ? 'high' : textEmotion.intensity < 0.3 ? 'low' : 'medium',
    keywords: text.split(/\s+/).slice(0, 20),
  };

  const voiceInput: VoiceEmotionInput | undefined = voiceEmotion
    ? {
        primary: voiceEmotion.primary,
        confidence: voiceEmotion.confidence,
        valence: voiceEmotion.valence,
        arousal: voiceEmotion.arousal,
        dominance: voiceEmotion.dominance,
        stressLevel: voiceEmotion.stressLevel,
        speechRate: voiceEmotion.speechRate,
      }
    : undefined;

  // Check voice-text mismatch for suppression signal
  let mismatchInput: MismatchInput | null = null;
  if (voiceEmotion && voiceEmotion.confidence > 0.4) {
    const textPositive = ['happy', 'excited', 'grateful', 'calm'].includes(textEmotion.primary.toLowerCase());
    const voiceNegative = ['sad', 'anxious', 'angry', 'fearful', 'distressed'].includes(voiceEmotion.primary.toLowerCase());
    const textNegative = ['sad', 'anxious', 'angry', 'fearful', 'distressed', 'frustrated'].includes(textEmotion.primary.toLowerCase());
    const voicePositive = ['happy', 'excited', 'calm'].includes(voiceEmotion.primary.toLowerCase());

    if ((textPositive && voiceNegative) || (textNegative && voicePositive)) {
      mismatchInput = {
        hasMismatch: true,
        confidence: Math.min(voiceEmotion.confidence, textEmotion.confidence ?? 0.5),
        textEmotion: textEmotion.primary,
        voiceEmotion: voiceEmotion.primary,
        type: textPositive && voiceNegative ? 'masking_negative' : 'understating_positive',
        interpretation: textPositive && voiceNegative
          ? `User says "${textEmotion.primary}" but voice reveals "${voiceEmotion.primary}"`
          : `User understates — text shows "${textEmotion.primary}" but voice is more "${voiceEmotion.primary}"`,
        suggestedApproach: textPositive && voiceNegative
          ? 'Gently acknowledge what you hear beneath the words without calling them out directly.'
          : 'Celebrate what they might be holding back.',
      };
    }
  }

  // Run sarcasm detection on full text
  const sarcasmResult = detectSarcasm(text, textEmotion.primary, voiceEmotion?.valence);

  // Fuse all signals
  const state = fuseEmotionSignals(textInput, voiceInput, mismatchInput, previousState);

  // Override sarcasm with text-based detection (fuseEmotionSignals only gets keywords)
  if (sarcasmResult.detected && sarcasmResult.confidence > state.sarcasm.confidence) {
    state.sarcasm = sarcasmResult;
    // Adjust valence for sarcasm
    if (sarcasmResult.confidence > 0.5) {
      state.dimensions.valence = -state.dimensions.valence * 0.5;
    }
  }

  // Store for trajectory tracking
  sessionEmotionStates.set(sessionId, state);

  // Evict old sessions (keep last 100)
  if (sessionEmotionStates.size > 100) {
    const oldest = Array.from(sessionEmotionStates.keys()).slice(0, 50);
    for (const key of oldest) {
      sessionEmotionStates.delete(key);
    }
  }

  log.debug(
    {
      primary: state.primary.emotion,
      secondary: state.secondary.map((s) => s.emotion).join(','),
      sarcasm: state.sarcasm.detected,
      suppression: state.suppression.detected,
      blend: state.blend?.name,
      trend: state.trajectory.trend,
    },
    'Rich emotion analysis complete'
  );

  return state;
}

/**
 * Clean up session state when session ends.
 */
export function cleanupRichEmotionSession(sessionId: string): void {
  sessionEmotionStates.delete(sessionId);
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format rich emotion state for LLM context injection.
 * Alias for buildRichEmotionContext — used by turn-processor imports.
 */
export function formatRichEmotionForLLM(state: RichEmotionState): string {
  return buildRichEmotionContext(state);
}

/**
 * Build a concise context string from rich emotion state for LLM injection.
 * This replaces the flat "User emotion: happy (0.7)" with multi-dimensional context.
 */
export function buildRichEmotionContext(state: RichEmotionState): string {
  const lines: string[] = [];

  // Primary emotion with dimensions
  const v = state.dimensions.valence > 0 ? 'positive' : state.dimensions.valence < -0.2 ? 'negative' : 'neutral';
  const a = state.dimensions.arousal > 0.3 ? 'activated' : state.dimensions.arousal < -0.3 ? 'calm' : 'moderate';
  lines.push(
    `Emotion: ${state.primary.emotion} (${(state.primary.confidence * 100).toFixed(0)}% confident, ${v} valence, ${a} energy)`
  );

  // Secondary emotions
  if (state.secondary.length > 0) {
    const secondaryStr = state.secondary
      .map((s) => `${s.emotion} (${s.source})`)
      .join(', ');
    lines.push(`Also feeling: ${secondaryStr}`);
  }

  // Emotion blend
  if (state.blend) {
    lines.push(`Emotional blend: ${state.blend.name} — ${state.blend.acknowledgment}`);
  }

  // Sarcasm
  if (state.sarcasm.detected) {
    lines.push(
      `Sarcasm detected (${state.sarcasm.type}): likely means the ${state.sarcasm.intendedSentiment === 'negative' ? 'opposite' : 'same'} of what they said. Don't take surface words literally.`
    );
  }

  // Suppression
  if (state.suppression.detected) {
    lines.push(
      `Emotional suppression: says "${state.suppression.surfaceEmotion}" but voice reveals "${state.suppression.underlyingEmotion}" (${state.suppression.strategy}). ${state.suppression.approachGuidance}`
    );
  }

  // Trajectory
  if (state.trajectory.trend !== 'stable') {
    const trendDescriptions: Record<string, string> = {
      improving: 'Their emotional state is improving',
      declining: 'Their emotional state seems to be declining — be attentive',
      volatile: 'Their emotions are shifting rapidly — provide stability',
    };
    lines.push(trendDescriptions[state.trajectory.trend] || '');
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Downgrade a RichEmotionState to a flat object compatible with existing code.
 * For backward-compatibility with `lastEmotionAnalysis` in UserData.
 */
export function toFlatEmotionAnalysis(state: RichEmotionState): {
  primary: string;
  intensity: number;
  distressLevel?: number;
} {
  const distressEmotions = ['distressed', 'anxious', 'fearful', 'sad'];
  const isDistressed = distressEmotions.includes(state.primary.emotion);

  return {
    primary: state.primary.emotion,
    intensity: state.primary.intensity,
    distressLevel: isDistressed
      ? Math.max(state.primary.intensity, state.suppression.detected ? 0.7 : 0)
      : undefined,
  };
}
