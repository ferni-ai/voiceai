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

  /** Suggested phrases the AI could use */
  suggestedPhrases: string[];

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
  phrases: string[];
  avoidBehaviors: string[];
  priority: 'high' | 'medium' | 'low';
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
- Gently acknowledge what you're hearing: "I hear you saying you're okay, but..."
- Create space: "You don't have to be fine with me. What's really going on?"
- Slow down. Give them room.

DON'T:
- Take their "I'm fine" at face value
- Rush to problem-solving
- Be too direct/confrontational about the mismatch`,
    phrases: [
      "I hear you. <break time='300ms'/> And I also hear something else in your voice. What's really going on?",
      "You're saying you're okay, but... <break time='400ms'/> something tells me there's more. I'm here.",
      "I'm listening to what you're saying, and <break time='200ms'/> I'm also listening to how you're saying it.",
      "Take your time. <break time='300ms'/> I'm not going anywhere.",
      "You don't have to have it all together with me. <break time='300ms'/> What's underneath this?",
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
- Acknowledge the heaviness: "This sounds like a lot to carry"
- Be present without pushing

DON'T:
- Be overly cheerful or energetic
- Minimize what they're going through
- Fill silence unnecessarily`,
    phrases: [
      "This sounds heavy. <break time='300ms'/> I'm here.",
      "You're carrying a lot right now. <break time='200ms'/> I hear that.",
      "Tell me what's weighing on you.",
      "<volume ratio='0.75'/>I'm listening. <break time='200ms'/> Really listening.",
    ],
    avoidBehaviors: [
      'Being too energetic or upbeat',
      'Rushing them',
      'Offering platitudes like "it\'ll be okay"',
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
- Match their rising energy
- Encourage elaboration: "Wait, tell me more!"
- Celebrate with them

DON'T:
- Underreact to their excitement
- Move past the moment too quickly`,
    phrases: [
      "Wait - <break time='100ms'/> I can hear it in your voice. <break time='200ms'/> What happened?!",
      "There's something there! <break time='200ms'/> Tell me!",
      "I'm picking up on some excitement here... <break time='200ms'/> spill it!",
      "Okay, your voice just lit up. <break time='200ms'/> What is it?",
    ],
    avoidBehaviors: [
      'Being flat or clinical',
      'Not matching their energy',
      'Dismissing subtle excitement',
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
- Acknowledge the frustration: "I can hear how frustrated you are"
- Validate: "That sounds infuriating"
- Stay calm but not dismissive

DON'T:
- Match anger with anger
- Dismiss or minimize
- Be preachy or lecture`,
    phrases: [
      "I can hear the frustration in your voice. <break time='200ms'/> That sounds maddening.",
      "You're holding back, and I get it. <break time='200ms'/> What really happened?",
      "I'm not going to tell you to calm down. <break time='200ms'/> Tell me what's going on.",
      "You have every right to be upset. <break time='200ms'/> I'm listening.",
    ],
    avoidBehaviors: [
      'Telling them to calm down',
      'Being dismissive',
      'Matching their frustration',
      'Being preachy',
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
- Honor their vulnerability: "Thank you for trusting me with this"
- Slow way down
- Hold space, don't fill it
- Be gentle

DON'T:
- Point out they sound upset too directly
- Rush to fix anything
- Break the intimacy of the moment`,
    phrases: [
      "<volume ratio='0.75'/><break time='300ms'/>I'm here.",
      "<volume ratio='0.75'/>Thank you for sharing that with me. <break time='300ms'/> Take your time.",
      "<break time='400ms'/>I hear you. <break time='200ms'/> Really.",
      "<volume ratio='0.75'/>You're safe here. <break time='300ms'/> What do you need?",
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
        suggestedPhrases: pattern.phrases,
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
  const phrases: string[] = [];

  // Add specific guidance based on emotional state
  if (voice.valence > 0.3 && voice.arousal > 0.5) {
    guidance += '\nUser sounds genuinely positive and engaged. Match their energy!';
    phrases.push('I love your energy right now!', 'Yes! Tell me more!');
  } else if (voice.valence < -0.3 && voice.arousal < 0.3) {
    guidance += '\nUser sounds genuinely down. Be present and gentle.';
    phrases.push('I hear you.', 'Take your time.');
  } else if (voice.stressLevel > 0.5) {
    guidance += '\nUser sounds stressed and acknowledges it. Validate and support.';
    phrases.push('That sounds really hard.', "I'm here. What do you need?");
  }

  return {
    shouldAddressDiscrepancy: false,
    guidance,
    suggestedPhrases: phrases,
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

  if (voice.stressLevel > 0.6) {
    guidance += 'User sounds stressed. Be gentle, slow, present.';
  } else if (voice.arousal > 0.6 && voice.valence > 0.3) {
    guidance += 'User sounds excited/positive. Match energy.';
  } else if (voice.arousal < 0.3 && voice.valence < -0.2) {
    guidance += 'User sounds low/tired. Be warm but not overwhelming.';
  } else {
    guidance += 'User sounds neutral/calm. Proceed naturally.';
  }

  return {
    shouldAddressDiscrepancy: false,
    guidance,
    suggestedPhrases: [],
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
    suggestedPhrases: [],
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
 */
export function formatVoiceIntelligenceForPrompt(intelligence: VoiceEmotionIntelligence): string {
  if (!intelligence.guidance || intelligence.confidence < 0.4) {
    return '';
  }

  const sections: string[] = [];

  sections.push(intelligence.guidance);

  if (intelligence.suggestedPhrases.length > 0) {
    sections.push('\nCONSIDER PHRASES LIKE:');
    for (const phrase of intelligence.suggestedPhrases.slice(0, 3)) {
      // Strip SSML for prompt readability
      const cleanPhrase = phrase.replace(/<[^>]+>/g, '').trim();
      sections.push(`• "${cleanPhrase}"`);
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
