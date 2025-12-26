/**
 * Ambient Context Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Understand their environment from audio cues.
 * "Sounds like you're in a busy place - should we talk later?"
 *
 * We can't hear what's happening around them. Ferni can:
 * - Detect background environment (quiet, noisy, office, outdoor)
 * - Identify contextual signals (baby crying, typing, other voices)
 * - Adjust conversation accordingly
 * - Offer to reschedule if environment isn't conducive
 *
 * @module AmbientContext
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AmbientContext' });

// ============================================================================
// TYPES
// ============================================================================

export type Environment = 'quiet' | 'noisy' | 'office' | 'outdoor' | 'public' | 'home';

export type AmbientSignalType =
  | 'baby_crying'
  | 'child_voice'
  | 'typing'
  | 'other_voices'
  | 'tv_radio'
  | 'traffic'
  | 'nature'
  | 'music'
  | 'phone_ringing'
  | 'door_knock'
  | 'pet';

export interface AmbientSignal {
  type: AmbientSignalType;
  confidence: number;
  timestamp: Date;
}

export interface AmbientContext {
  /** Detected environment */
  environment: Environment;

  /** Confidence in environment detection */
  confidence: number;

  /** Specific signals detected */
  signals: AmbientSignal[];

  /** Privacy concern - others might hear */
  privacyConcern: boolean;

  /** Distraction level (0-1) */
  distractionLevel: number;

  /** Suggested adjustments */
  suggestions: string[];

  /** Whether to offer rescheduling */
  shouldOfferReschedule: boolean;
}

export interface AmbientResponse {
  shouldMention: boolean;
  message: string;
  adjustments: {
    keepShort: boolean;
    avoidSensitiveTopics: boolean;
    speakClearly: boolean;
    offerPause: boolean;
  };
}

// ============================================================================
// SIGNAL DETECTION PATTERNS
// ============================================================================

// Note: In a real implementation, these would be ML models or
// sophisticated audio analysis. Here we define the patterns for
// the interface and basic heuristics.

interface SignalPattern {
  type: AmbientSignalType;
  frequencyRange?: { low: number; high: number };
  characteristics: string[];
  privacyImpact: 'high' | 'medium' | 'low' | 'none';
}

const SIGNAL_PATTERNS: SignalPattern[] = [
  {
    type: 'baby_crying',
    frequencyRange: { low: 300, high: 600 },
    characteristics: ['sustained', 'periodic', 'high_pitch'],
    privacyImpact: 'low',
  },
  {
    type: 'child_voice',
    frequencyRange: { low: 250, high: 500 },
    characteristics: ['speech_pattern', 'high_pitch'],
    privacyImpact: 'medium',
  },
  {
    type: 'typing',
    frequencyRange: { low: 100, high: 200 },
    characteristics: ['rhythmic', 'clicks', 'brief'],
    privacyImpact: 'low',
  },
  {
    type: 'other_voices',
    frequencyRange: { low: 85, high: 255 },
    characteristics: ['speech_pattern', 'multiple_sources'],
    privacyImpact: 'high',
  },
  {
    type: 'tv_radio',
    frequencyRange: { low: 100, high: 400 },
    characteristics: ['compressed', 'consistent_volume', 'background'],
    privacyImpact: 'low',
  },
  {
    type: 'traffic',
    frequencyRange: { low: 50, high: 150 },
    characteristics: ['low_frequency', 'rumble', 'intermittent'],
    privacyImpact: 'low',
  },
  {
    type: 'nature',
    frequencyRange: { low: 1000, high: 8000 },
    characteristics: ['birds', 'wind', 'organic'],
    privacyImpact: 'none',
  },
  {
    type: 'music',
    frequencyRange: { low: 50, high: 4000 },
    characteristics: ['melodic', 'rhythmic', 'harmonic'],
    privacyImpact: 'low',
  },
  {
    type: 'phone_ringing',
    frequencyRange: { low: 500, high: 2000 },
    characteristics: ['periodic', 'attention_grabbing'],
    privacyImpact: 'low',
  },
  {
    type: 'pet',
    frequencyRange: { low: 100, high: 1000 },
    characteristics: ['animal_sounds', 'intermittent'],
    privacyImpact: 'low',
  },
];

// Environment inference from signals
const ENVIRONMENT_SIGNALS: Record<Environment, AmbientSignalType[]> = {
  quiet: [],
  home: ['tv_radio', 'pet', 'child_voice', 'baby_crying'],
  office: ['typing', 'other_voices', 'phone_ringing'],
  public: ['other_voices', 'traffic', 'music'],
  outdoor: ['traffic', 'nature'],
  noisy: ['other_voices', 'music', 'traffic'],
};

// ============================================================================
// RESPONSE PHRASES
// ============================================================================

const AMBIENT_RESPONSES: Record<AmbientSignalType, string[]> = {
  baby_crying: [
    "Sounds like you've got your hands full! We can keep this short, or chat another time.",
    "I hear a little one needs attention. Take care of them - we can talk whenever works.",
    "Baby calls! No worries if you need to go.",
  ],
  child_voice: [
    "Sounds like the kids are around. Should we keep this light, or would another time be better?",
    "I'll keep it brief since you've got company!",
  ],
  typing: [
    "I'll let you focus - sounds like you're in the middle of something.",
    "Multi-tasking? I can keep this quick.",
  ],
  other_voices: [
    "It sounds like others might be around. Should we talk about this another time, or are you comfortable now?",
    "I'll keep my voice down in case you're around others.",
  ],
  tv_radio: [],
  traffic: [
    "Sounds like you're on the move. Drive safe!",
    "On the road? I'll keep this brief.",
  ],
  nature: [
    "Sounds peaceful where you are!",
  ],
  music: [],
  phone_ringing: [
    "Sounds like you might have another call. Do you need to get that?",
  ],
  door_knock: [
    "Was that your door? Take your time.",
  ],
  pet: [
    "Say hi to your furry friend for me!",
  ],
};

const ENVIRONMENT_RESPONSES: Record<Environment, string[]> = {
  quiet: [],
  home: [],
  office: [
    "I'll be mindful that you might be at work.",
  ],
  public: [
    "Sounds like you're in a public place. Let me know if you need me to keep things general.",
  ],
  outdoor: [],
  noisy: [
    "It's a bit noisy there - I'll speak clearly!",
  ],
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Analyze audio for ambient context.
 * In production, this would use audio feature extraction.
 * Here we provide the interface and basic heuristics.
 */
export function analyzeAmbientAudio(
  audioFeatures: {
    backgroundNoiseLevel: number; // 0-1
    speechToNoiseRatio: number; // Higher = clearer speech
    frequencySpread: number; // How spread out the frequencies are
    rhythmicPatterns?: boolean; // Typing, music
    multipleVoices?: boolean;
    outdoorIndicators?: boolean;
  }
): AmbientContext {
  const signals: AmbientSignal[] = [];
  let environment: Environment = 'quiet';
  let privacyConcern = false;
  let distractionLevel = 0;

  // Determine signals from features
  if (audioFeatures.multipleVoices) {
    signals.push({
      type: 'other_voices',
      confidence: 0.7,
      timestamp: new Date(),
    });
    privacyConcern = true;
    distractionLevel += 0.3;
  }

  if (audioFeatures.rhythmicPatterns) {
    signals.push({
      type: 'typing',
      confidence: 0.6,
      timestamp: new Date(),
    });
    environment = 'office';
  }

  if (audioFeatures.outdoorIndicators) {
    environment = 'outdoor';
    signals.push({
      type: 'nature',
      confidence: 0.5,
      timestamp: new Date(),
    });
  }

  // High background noise
  if (audioFeatures.backgroundNoiseLevel > 0.6) {
    environment = 'noisy';
    distractionLevel += 0.3;
  } else if (audioFeatures.backgroundNoiseLevel > 0.4) {
    environment = 'public';
    distractionLevel += 0.2;
  } else if (audioFeatures.backgroundNoiseLevel < 0.2) {
    environment = 'quiet';
  }

  // Low speech-to-noise ratio = harder to communicate
  if (audioFeatures.speechToNoiseRatio < 0.5) {
    distractionLevel += 0.2;
  }

  // Generate suggestions
  const suggestions: string[] = [];

  if (privacyConcern) {
    suggestions.push('Avoid sensitive topics unless they initiate');
  }

  if (distractionLevel > 0.4) {
    suggestions.push('Keep responses concise');
    suggestions.push('Offer to continue later');
  }

  const confidence = calculateConfidence(audioFeatures, signals);

  return {
    environment,
    confidence,
    signals,
    privacyConcern,
    distractionLevel: Math.min(1, distractionLevel),
    suggestions,
    shouldOfferReschedule: distractionLevel > 0.5 || privacyConcern,
  };
}

function calculateConfidence(
  features: { backgroundNoiseLevel: number; speechToNoiseRatio: number },
  signals: AmbientSignal[]
): number {
  // Base confidence from speech quality
  let confidence = features.speechToNoiseRatio * 0.5;

  // Increase if we detected specific signals
  confidence += signals.length * 0.1;

  // Decrease for very noisy environments (harder to be sure)
  if (features.backgroundNoiseLevel > 0.7) {
    confidence *= 0.7;
  }

  return Math.min(0.9, Math.max(0.3, confidence));
}

/**
 * Get a response based on ambient context.
 */
export function getAmbientResponse(context: AmbientContext): AmbientResponse | null {
  const adjustments = {
    keepShort: context.distractionLevel > 0.3,
    avoidSensitiveTopics: context.privacyConcern,
    speakClearly: context.environment === 'noisy',
    offerPause: context.signals.some((s) =>
      ['baby_crying', 'phone_ringing', 'door_knock'].includes(s.type)
    ),
  };

  // Find most relevant signal to respond to
  const prioritySignals: AmbientSignalType[] = [
    'baby_crying',
    'other_voices',
    'phone_ringing',
    'door_knock',
  ];

  for (const signalType of prioritySignals) {
    const signal = context.signals.find((s) => s.type === signalType && s.confidence > 0.5);
    if (signal) {
      const responses = AMBIENT_RESPONSES[signalType];
      if (responses.length > 0) {
        return {
          shouldMention: true,
          message: responses[Math.floor(Math.random() * responses.length)],
          adjustments,
        };
      }
    }
  }

  // Environment-based response
  if (context.environment !== 'quiet' && context.environment !== 'home') {
    const responses = ENVIRONMENT_RESPONSES[context.environment];
    if (responses.length > 0) {
      return {
        shouldMention: true,
        message: responses[Math.floor(Math.random() * responses.length)],
        adjustments,
      };
    }
  }

  // No specific message, but still apply adjustments
  if (adjustments.keepShort || adjustments.avoidSensitiveTopics || adjustments.offerPause) {
    return {
      shouldMention: false,
      message: '',
      adjustments,
    };
  }

  return null;
}

/**
 * Manually record a detected signal (for use when specific detection available).
 */
export function recordAmbientSignal(signalType: AmbientSignalType, confidence: number): AmbientSignal {
  return {
    type: signalType,
    confidence,
    timestamp: new Date(),
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export function buildAmbientContext(context: AmbientContext): string {
  if (!context || context.environment === 'quiet') return '';

  const sections: string[] = ['[AMBIENT CONTEXT]'];

  sections.push(`Environment: ${context.environment}`);
  sections.push(`Distraction level: ${(context.distractionLevel * 100).toFixed(0)}%`);

  if (context.signals.length > 0) {
    sections.push('Detected signals:');
    for (const signal of context.signals) {
      sections.push(`- ${signal.type} (${(signal.confidence * 100).toFixed(0)}% confidence)`);
    }
  }

  sections.push('');

  if (context.privacyConcern) {
    sections.push('⚠️ PRIVACY CONCERN: Others may be listening. Avoid sensitive topics.');
  }

  if (context.suggestions.length > 0) {
    sections.push('Suggestions:');
    for (const suggestion of context.suggestions) {
      sections.push(`- ${suggestion}`);
    }
  }

  const response = getAmbientResponse(context);
  if (response?.shouldMention) {
    sections.push('');
    sections.push(`Consider saying: "${response.message}"`);
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORT
// ============================================================================

export const ambientContext = {
  analyzeAmbientAudio,
  getAmbientResponse,
  recordAmbientSignal,
  buildAmbientContext,
};

export default ambientContext;

