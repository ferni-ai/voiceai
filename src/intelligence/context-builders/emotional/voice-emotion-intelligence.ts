/**
 * Voice Emotion Intelligence
 *
 * Translates voice prosody analysis into actionable LLM guidance.
 * When someone's voice tells a different story than their words,
 * the AI should notice and respond to the REAL emotion.
 *
 * This is what separates a good AI from a great one:
 * "I hear you saying you're fine, but something in your voice..."
 */

import type { VoiceEmotionResult } from '../../../speech/audio-prosody.js';
import type { EmotionResult } from '../../emotion-detector.js';

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceEmotionIntelligence {
  /** Should the AI address the voice-text mismatch? */
  shouldAddressDiscrepancy: boolean;

  /** The guidance to inject into the LLM context */
  guidance: string;

  /** @deprecated Use doBehaviors instead - behavioral guidance, not literal phrases */
  suggestedPhrases: string[];

  /** Behavioral DO patterns - what to express, not literal phrases */
  doBehaviors: string[];

  /** What the AI should NOT do */
  avoidBehaviors: string[];

  /** Voice-specific adjustments for response delivery */
  deliveryAdjustments: {
    speed: 'slower' | 'normal' | 'faster';
    volume: 'softer' | 'normal' | 'louder';
    warmth: 'high' | 'medium' | 'low';
    pauseFrequency: 'more' | 'normal' | 'less';
  };

  /** Confidence in this analysis */
  confidence: number;

  /** Debug info */
  analysis: {
    voiceSaysStressed: boolean;
    voiceSaysExcited: boolean;
    voiceSaysSad: boolean;
    voiceSaysAngry: boolean;
    textSaysOpposite: boolean;
    mismatchType?: string;
  };
}

// ============================================================================
// MISMATCH DETECTION PATTERNS
// ============================================================================

interface MismatchPattern {
  voiceCondition: (voice: VoiceEmotionResult) => boolean;
  textCondition: (text: EmotionResult) => boolean;
  guidance: string;
  /** @deprecated Use behavioral guidance in 'guidance' instead of static phrases */
  phrases: string[];
  avoidBehaviors: string[];
  priority: 'high' | 'medium' | 'low';
  /** Behavioral DO patterns - what to express, not literal phrases */
  doBehaviors?: string[];
}

const MISMATCH_PATTERNS: MismatchPattern[] = [
  // Voice stressed, text says "fine" - MOST IMPORTANT
  {
    voiceCondition: (v) => v.stressLevel > 0.6 || (v.arousal > 0.7 && v.valence < -0.2),
    textCondition: (t) => t.primary === 'neutral' || t.valence === 'positive',
    guidance: `
[VOICE EMOTION OVERRIDE - HIGH PRIORITY]
The user's VOICE sounds stressed/anxious, but their words say they're fine.
This is a critical moment. They may be holding back or not ready to open up.

DO:
- Gently acknowledge the gap between words and voice
- Create safety and space for them to open up if ready
- Slow your pace, use pauses, give them room
- Be warm but not pushy

DON'T:
- Take their "I'm fine" at face value
- Rush to problem-solving
- Be too direct/confrontational about the mismatch
- Be clinical or distant`,
    phrases: [], // Deprecated: use doBehaviors instead
    doBehaviors: [
      'Acknowledge what you sense in their voice without being confrontational',
      'Create emotional safety - they should feel they can share more if ready',
      'Slow your pacing and add thoughtful pauses',
      'Stay present without pushing for disclosure',
    ],
    avoidBehaviors: [
      'Accepting "I\'m fine" without gentle probing',
      'Jumping to advice or solutions',
      'Being clinical or distant',
      'Ignoring the emotional undertone',
    ],
    priority: 'high',
  },

  // Voice sounds sad/low, text is neutral
  {
    voiceCondition: (v) => v.arousal < 0.3 && v.valence < -0.3,
    textCondition: (t) => t.primary === 'neutral' || t.distressLevel < 0.3,
    guidance: `
[VOICE EMOTION INSIGHT]
User's voice sounds low/heavy/sad, but words are neutral.
They may be tired, discouraged, or processing something difficult.

DO:
- Match their energy level - don't be too upbeat
- Acknowledge the heaviness without overdoing it
- Be present without pushing
- Use a gentler, slower pace

DON'T:
- Be overly cheerful or energetic
- Minimize what they're going through
- Fill silence unnecessarily
- Offer empty platitudes`,
    phrases: [], // Deprecated: use doBehaviors instead
    doBehaviors: [
      'Mirror their lower energy - be calm and grounded',
      'Acknowledge what you sense without labeling it',
      'Create space for them to share if they want',
      'Be present and patient - don\'t fill silence',
    ],
    avoidBehaviors: [
      'Being too energetic or upbeat',
      'Rushing them',
      'Offering platitudes like "it\'ll be okay"',
      'Trying to cheer them up forcefully',
    ],
    priority: 'medium',
  },

  // Voice sounds excited, text is flat
  {
    voiceCondition: (v) => v.arousal > 0.6 && v.valence > 0.3,
    textCondition: (t) => t.primary === 'neutral' && t.intensity < 0.5,
    guidance: `
[VOICE EMOTION INSIGHT - POSITIVE]
User's voice sounds excited/energized but words are understated.
They may be sharing good news modestly or building up to something.

DO:
- Match their rising energy with your response
- Notice the excitement in their voice and reflect it back
- Invite them to elaborate - show you picked up on something
- Celebrate the moment with them

DON'T:
- Underreact to their excitement
- Move past the moment too quickly
- Be flat or clinical in your response`,
    phrases: [], // Deprecated: use doBehaviors instead
    doBehaviors: [
      'Show you noticed the shift in their voice energy',
      'Express genuine curiosity about what sparked the excitement',
      'Match their elevated energy in your tone and pacing',
      'Create space for them to share more',
    ],
    avoidBehaviors: [
      'Being flat or clinical',
      'Not matching their energy',
      'Dismissing subtle excitement',
      'Using overly casual slang',
    ],
    priority: 'medium',
  },

  // Voice sounds angry/frustrated, text is controlled
  {
    voiceCondition: (v) => v.arousal > 0.7 && v.valence < -0.4 && (v.dominance ?? 0.5) > 0.6,
    textCondition: (t) => t.primary !== 'anger' && t.intensity < 0.6,
    guidance: `
[VOICE EMOTION INSIGHT - FRUSTRATION]
User's voice sounds frustrated/angry but words are controlled.
They're holding back. Give them permission to express it.

DO:
- Acknowledge the frustration you hear
- Validate their feelings without judgment
- Stay calm but engaged - don't be dismissive
- Give them space to vent if needed

DON'T:
- Match anger with anger
- Dismiss or minimize
- Be preachy or lecture
- Tell them to calm down`,
    phrases: [], // Deprecated: use doBehaviors instead
    doBehaviors: [
      'Acknowledge the frustration you sense in their voice',
      'Validate without trying to immediately fix',
      'Stay grounded and present - be a steady presence',
      'Create space for them to express what they\'re holding back',
    ],
    avoidBehaviors: [
      'Telling them to calm down',
      'Being dismissive',
      'Matching their frustration',
      'Being preachy or lecturing',
    ],
    priority: 'high',
  },

  // Voice trembling/vulnerable, trying to sound composed
  {
    voiceCondition: (v) => v.stressLevel > 0.5 && v.arousal > 0.4 && v.valence < 0,
    textCondition: (t) => t.confidence > 0.5 && t.distressLevel < 0.4,
    guidance: `
[VOICE EMOTION INSIGHT - VULNERABILITY]
User's voice has a vulnerable quality (trembling, cracking, strained)
but they're trying to sound composed. This is a sacred moment.

DO:
- Honor their vulnerability with gentleness
- Slow way down - use pauses thoughtfully
- Hold space, don't fill it
- Be gentle and present

DON'T:
- Point out they sound upset too directly
- Rush to fix anything
- Break the intimacy of the moment
- Be clinical or distant`,
    phrases: [], // Deprecated: use doBehaviors instead
    doBehaviors: [
      'Honor this vulnerable moment with your presence',
      'Slow your pace significantly - let pauses breathe',
      'Be gentle - both in words and delivery',
      'Hold space without needing to fill it',
    ],
    avoidBehaviors: [
      'Being too clinical',
      'Rushing to solutions',
      'Breaking the emotional moment',
      'Making them feel self-conscious',
    ],
    priority: 'high',
  },
];

// ============================================================================
// VOICE INTELLIGENCE ENGINE
// ============================================================================

/**
 * Analyze voice emotion against text emotion and generate intelligent guidance
 */
export function analyzeVoiceEmotionIntelligence(
  voiceEmotion: VoiceEmotionResult | null,
  textEmotion: EmotionResult | null,
  _turnCount = 0
): VoiceEmotionIntelligence {
  // Default response when no voice data
  if (!voiceEmotion || voiceEmotion.confidence < 0.4) {
    return createDefaultResponse();
  }

  // If no text emotion, just use voice
  if (!textEmotion) {
    return createVoiceOnlyResponse(voiceEmotion);
  }

  // Check for mismatches
  for (const pattern of MISMATCH_PATTERNS) {
    if (pattern.voiceCondition(voiceEmotion) && pattern.textCondition(textEmotion)) {
      return {
        shouldAddressDiscrepancy: true,
        guidance: pattern.guidance,
        suggestedPhrases: [], // Deprecated - kept empty for backward compatibility
        doBehaviors: pattern.doBehaviors ?? [],
        avoidBehaviors: pattern.avoidBehaviors,
        deliveryAdjustments: getDeliveryAdjustments(voiceEmotion, pattern.priority),
        confidence: voiceEmotion.confidence * 0.9,
        analysis: {
          voiceSaysStressed: voiceEmotion.stressLevel > 0.5,
          voiceSaysExcited: voiceEmotion.arousal > 0.6 && voiceEmotion.valence > 0.3,
          voiceSaysSad: voiceEmotion.valence < -0.3 && voiceEmotion.arousal < 0.4,
          voiceSaysAngry: voiceEmotion.valence < -0.4 && voiceEmotion.arousal > 0.6,
          textSaysOpposite: true,
          mismatchType: pattern.priority,
        },
      };
    }
  }

  // No mismatch - return alignment guidance
  return createAlignedResponse(voiceEmotion, textEmotion);
}

/**
 * Get delivery adjustments based on voice emotion
 */
function getDeliveryAdjustments(
  voice: VoiceEmotionResult,
  priority: 'high' | 'medium' | 'low'
): VoiceEmotionIntelligence['deliveryAdjustments'] {
  // High stress = slow down, softer, more pauses
  if (voice.stressLevel > 0.6) {
    return {
      speed: 'slower',
      volume: 'softer',
      warmth: 'high',
      pauseFrequency: 'more',
    };
  }

  // High excitement = match energy
  if (voice.arousal > 0.7 && voice.valence > 0.3) {
    return {
      speed: 'normal',
      volume: 'normal',
      warmth: 'high',
      pauseFrequency: 'less',
    };
  }

  // Low energy = gentle, don't overwhelm
  if (voice.arousal < 0.3) {
    return {
      speed: 'slower',
      volume: 'softer',
      warmth: 'high',
      pauseFrequency: 'normal',
    };
  }

  // Default based on priority
  if (priority === 'high') {
    return {
      speed: 'slower',
      volume: 'softer',
      warmth: 'high',
      pauseFrequency: 'more',
    };
  }

  return {
    speed: 'normal',
    volume: 'normal',
    warmth: 'medium',
    pauseFrequency: 'normal',
  };
}

/**
 * Create response when voice and text are aligned
 */
function createAlignedResponse(
  voice: VoiceEmotionResult,
  text: EmotionResult
): VoiceEmotionIntelligence {
  let guidance = "[VOICE-TEXT ALIGNED]\nUser's voice and words match. Respond naturally.";
  const doBehaviors: string[] = [];

  // Add specific behavioral guidance based on emotional state
  if (voice.valence > 0.3 && voice.arousal > 0.5) {
    guidance += '\nUser sounds genuinely positive and engaged. Match their energy!';
    doBehaviors.push('Match their elevated energy and enthusiasm', 'Encourage them to share more');
  } else if (voice.valence < -0.3 && voice.arousal < 0.3) {
    guidance += '\nUser sounds genuinely down. Be present and gentle.';
    doBehaviors.push('Be present and gentle', 'Give them space and time');
  } else if (voice.stressLevel > 0.5) {
    guidance += '\nUser sounds stressed and acknowledges it. Validate and support.';
    doBehaviors.push('Validate their experience', 'Be supportive and present');
  }

  return {
    shouldAddressDiscrepancy: false,
    guidance,
    suggestedPhrases: [], // Deprecated
    doBehaviors,
    avoidBehaviors: [],
    deliveryAdjustments: getDeliveryAdjustments(voice, 'low'),
    confidence: Math.min(voice.confidence, text.confidence),
    analysis: {
      voiceSaysStressed: voice.stressLevel > 0.5,
      voiceSaysExcited: voice.arousal > 0.6 && voice.valence > 0.3,
      voiceSaysSad: voice.valence < -0.3 && voice.arousal < 0.4,
      voiceSaysAngry: voice.valence < -0.4 && voice.arousal > 0.6,
      textSaysOpposite: false,
    },
  };
}

/**
 * Create response when only voice data is available
 */
function createVoiceOnlyResponse(voice: VoiceEmotionResult): VoiceEmotionIntelligence {
  let guidance = '[VOICE EMOTION DETECTED]\n';
  const doBehaviors: string[] = [];

  if (voice.stressLevel > 0.6) {
    guidance += 'User sounds stressed. Be gentle, slow, present.';
    doBehaviors.push('Be gentle and slow your pace', 'Stay present and supportive');
  } else if (voice.arousal > 0.6 && voice.valence > 0.3) {
    guidance += 'User sounds excited/positive. Match energy.';
    doBehaviors.push('Match their positive energy', 'Be engaged and responsive');
  } else if (voice.arousal < 0.3 && voice.valence < -0.2) {
    guidance += 'User sounds low/tired. Be warm but not overwhelming.';
    doBehaviors.push('Be warm but measured', 'Don\'t overwhelm with energy');
  } else {
    guidance += 'User sounds neutral/calm. Proceed naturally.';
  }

  return {
    shouldAddressDiscrepancy: false,
    guidance,
    suggestedPhrases: [], // Deprecated
    doBehaviors,
    avoidBehaviors: [],
    deliveryAdjustments: getDeliveryAdjustments(voice, 'low'),
    confidence: voice.confidence,
    analysis: {
      voiceSaysStressed: voice.stressLevel > 0.5,
      voiceSaysExcited: voice.arousal > 0.6 && voice.valence > 0.3,
      voiceSaysSad: voice.valence < -0.3 && voice.arousal < 0.4,
      voiceSaysAngry: voice.valence < -0.4 && voice.arousal > 0.6,
      textSaysOpposite: false,
    },
  };
}

/**
 * Create default response when no voice data
 */
function createDefaultResponse(): VoiceEmotionIntelligence {
  return {
    shouldAddressDiscrepancy: false,
    guidance: '',
    suggestedPhrases: [], // Deprecated
    doBehaviors: [],
    avoidBehaviors: [],
    deliveryAdjustments: {
      speed: 'normal',
      volume: 'normal',
      warmth: 'medium',
      pauseFrequency: 'normal',
    },
    confidence: 0,
    analysis: {
      voiceSaysStressed: false,
      voiceSaysExcited: false,
      voiceSaysSad: false,
      voiceSaysAngry: false,
      textSaysOpposite: false,
    },
  };
}

/**
 * Format voice intelligence for prompt injection
 *
 * NOTE: We no longer inject static "CONSIDER PHRASES LIKE" because:
 * 1. Static phrases don't fit all personas (Joel shouldn't say "spill it!")
 * 2. The guidance section already tells the LLM HOW to behave
 * 3. LLM should generate persona-appropriate phrasing based on behavioral guidance
 */
export function formatVoiceIntelligenceForPrompt(intelligence: VoiceEmotionIntelligence): string {
  if (!intelligence.guidance || intelligence.confidence < 0.4) {
    return '';
  }

  const sections: string[] = [];

  sections.push(intelligence.guidance);

  // Add behavioral DO guidance (what to express, not literal phrases)
  if (intelligence.doBehaviors && intelligence.doBehaviors.length > 0) {
    sections.push('\nBEHAVIORAL GUIDANCE:');
    for (const behavior of intelligence.doBehaviors.slice(0, 4)) {
      sections.push(`• ${behavior}`);
    }
  }

  if (intelligence.avoidBehaviors.length > 0) {
    sections.push('\nAVOID:');
    for (const avoid of intelligence.avoidBehaviors) {
      sections.push(`• ${avoid}`);
    }
  }

  return sections.join('\n');
}

export default analyzeVoiceEmotionIntelligence;
