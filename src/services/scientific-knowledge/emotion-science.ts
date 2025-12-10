/**
 * Emotion Science Knowledge Base
 *
 * Research-backed understanding of emotions based on:
 * - Lisa Feldman Barrett's constructed emotion theory
 * - Emotion granularity research
 * - Affect labeling studies
 * - Emotion regulation science (Gross, 2014)
 *
 * KEY INSIGHT: Emotions are constructed, not triggered.
 * The brain predicts emotions based on past experience + current context.
 *
 * @module EmotionScience
 */

// ============================================================================
// CORE EMOTION SCIENCE
// ============================================================================

export const EMOTION_SCIENCE = {
  /**
   * Constructed Emotion Theory (Barrett, 2017)
   *
   * Emotions aren't triggered—they're constructed by the brain
   * using past experience, body state, and context to predict
   * what's happening and what to do about it.
   */
  constructedEmotion: {
    principle: 'Emotions are predictions, not reactions',
    implications: [
      'Past experiences shape current emotional predictions',
      'Body state (interoception) influences emotion construction',
      'Context dramatically changes how we interpret sensations',
      "The same physical sensations can become different emotions based on how we conceptualize them",
    ],
    coachingApplication: [
      'Help users develop richer emotional vocabulary (emotion granularity)',
      'Explore what past experiences might be shaping current feelings',
      'Notice how body state (tired, hungry) affects emotional experience',
      'Reframe by offering alternative interpretations of sensations',
    ],
  },

  /**
   * Emotion Granularity Research
   *
   * People who can distinguish between similar emotions
   * (sad vs disappointed vs melancholy) regulate better.
   */
  emotionGranularity: {
    finding: 'Higher emotion differentiation = better regulation',
    research: 'Kashdan et al., 2015; Barrett, 2017',
    granularVocabulary: {
      anxiety_family: [
        'anxious', 'worried', 'nervous', 'apprehensive', 'uneasy',
        'on edge', 'tense', 'jittery', 'panicky', 'dread',
      ],
      sadness_family: [
        'sad', 'down', 'blue', 'melancholy', 'sorrowful', 'grieving',
        'disappointed', 'discouraged', 'dejected', 'lonely', 'empty',
      ],
      anger_family: [
        'angry', 'frustrated', 'irritated', 'annoyed', 'resentful',
        'bitter', 'indignant', 'furious', 'enraged', 'aggravated',
      ],
      fear_family: [
        'scared', 'afraid', 'frightened', 'terrified', 'alarmed',
        'panicked', 'threatened', 'vulnerable', 'insecure',
      ],
      joy_family: [
        'happy', 'joyful', 'content', 'pleased', 'delighted',
        'grateful', 'hopeful', 'excited', 'peaceful', 'satisfied',
      ],
    },
    coachingApplication: [
      "When someone says 'bad', help them get more specific",
      'Offer emotion words: "Sounds like it might be more disappointment than sadness?"',
      'Build vocabulary over time through gentle labeling',
    ],
  },

  /**
   * Affect Labeling (Lieberman et al., 2007)
   *
   * Simply naming an emotion reduces amygdala activation.
   * "Name it to tame it."
   */
  affectLabeling: {
    finding: 'Putting feelings into words reduces emotional intensity',
    research: 'Lieberman et al., 2007; Kircanski et al., 2012',
    mechanism: 'Activates prefrontal cortex, regulates amygdala',
    coachingApplication: [
      'Reflect emotions back: "It sounds like you\'re feeling..."',
      "Don't rush past the naming—the labeling itself is therapeutic",
      'Use precise labels, not generic ones (frustrated > upset)',
      "If they say 'fine' but seem not fine, gently explore",
    ],
  },

  /**
   * Emotion Regulation Strategies (Gross, 2014)
   *
   * Different strategies work at different points in the
   * emotion generation process.
   */
  regulationStrategies: {
    situationSelection: {
      timing: 'Before situation',
      description: 'Avoiding or approaching situations',
      example: "Choosing not to check social media when you're feeling vulnerable",
      effectiveness: 'Highly effective for known triggers',
    },
    situationModification: {
      timing: 'In situation',
      description: 'Changing aspects of the situation',
      example: 'Leaving a party early instead of staying and suffering',
      effectiveness: 'Effective when possible',
    },
    attentionalDeployment: {
      timing: 'During experience',
      description: 'Directing attention (distraction, concentration)',
      example: 'Focusing on breath instead of worry',
      effectiveness: 'Good short-term, less sustainable',
    },
    cognitiveReappraisal: {
      timing: 'Before response',
      description: 'Changing how we think about situation',
      example: 'Reframing rejection as redirection',
      effectiveness: 'Highly effective, most studied',
      techniques: [
        'Perspective taking: "How would my friend see this?"',
        'Temporal distancing: "Will this matter in 5 years?"',
        'Benefit finding: "What could I learn from this?"',
        'Normalizing: "Anyone would feel this way"',
      ],
    },
    expressionSuppression: {
      timing: 'After response',
      description: 'Hiding emotional expression',
      example: 'Putting on a brave face',
      effectiveness: 'Generally ineffective, can backfire',
      warning: 'Increases physiological arousal, impairs memory',
    },
  },

  /**
   * Emotions and the Body
   *
   * Interoception (sensing body signals) is foundational
   * to emotional experience.
   */
  interoception: {
    principle: 'Body sensations are the raw material of emotions',
    research: 'Craig, 2015; Barrett, 2017',
    commonPatterns: {
      anxiety: ['chest tightness', 'shallow breathing', 'racing heart', 'stomach knots'],
      sadness: ['heaviness', 'low energy', 'throat tightness', 'tears'],
      anger: ['heat', 'muscle tension', 'clenched jaw', 'racing heart'],
      fear: ['cold', 'trembling', 'hypervigilance', 'urge to flee'],
      joy: ['lightness', 'openness', 'relaxed muscles', 'warmth'],
    },
    coachingApplication: [
      'Help users notice body sensations before labeling emotions',
      "Ask 'Where do you feel that in your body?'",
      'Validate that emotions are physical experiences',
      'Use body awareness as early warning system',
    ],
  },
};

// ============================================================================
// EMOTION GUIDANCE FUNCTIONS
// ============================================================================

export interface EmotionGuidance {
  validation: string;
  techniques: string[];
  doNot: string[];
  granularOptions: string[];
  bodyConnection: string;
}

export function getEmotionGuidance(
  emotionCategory: 'anxiety' | 'sadness' | 'anger' | 'fear' | 'joy' | 'general'
): EmotionGuidance {
  const base: EmotionGuidance = {
    validation: '',
    techniques: [],
    doNot: [],
    granularOptions: [],
    bodyConnection: '',
  };

  switch (emotionCategory) {
    case 'anxiety':
      return {
        validation: 'Anxiety makes sense when your brain is trying to protect you from uncertainty',
        techniques: [
          'Name the specific flavor of anxiety (worried vs nervous vs dread)',
          'Notice where it lives in the body',
          "Ask: 'What is my brain trying to protect me from?'",
          'Reappraisal: "What\'s another way to see this situation?"',
        ],
        doNot: [
          "Don't say 'just relax' - dismisses the experience",
          "Don't immediately problem-solve - validate first",
          "Don't reassure without exploring",
        ],
        granularOptions: EMOTION_SCIENCE.emotionGranularity.granularVocabulary.anxiety_family,
        bodyConnection: 'Anxiety often shows up as chest tightness, shallow breathing, or stomach knots',
      };

    case 'sadness':
      return {
        validation: 'Sadness tells us something mattered. It deserves acknowledgment.',
        techniques: [
          'Sit with it before trying to fix it',
          'Distinguish sadness from disappointment, grief, loneliness',
          "Ask: 'What loss or longing is underneath this?'",
          'Behavioral activation: One tiny positive action',
        ],
        doNot: [
          "Don't try to cheer them up too quickly",
          "Don't minimize ('at least...')",
          "Don't compare to others' pain",
        ],
        granularOptions: EMOTION_SCIENCE.emotionGranularity.granularVocabulary.sadness_family,
        bodyConnection: 'Sadness often feels heavy, low-energy, with a tight throat or chest',
      };

    case 'anger':
      return {
        validation: 'Anger often signals a boundary crossed or a value violated',
        techniques: [
          'Explore what boundary or value feels threatened',
          'Distinguish anger from frustration, resentment, indignation',
          "Ask: 'What need isn't being met here?'",
          'Notice the urge to act before acting',
        ],
        doNot: [
          "Don't tell them to calm down",
          "Don't dismiss the anger as overreaction",
          "Don't immediately defend the other person",
        ],
        granularOptions: EMOTION_SCIENCE.emotionGranularity.granularVocabulary.anger_family,
        bodyConnection: 'Anger often shows up as heat, muscle tension, or a clenched jaw',
      };

    case 'fear':
      return {
        validation: 'Fear is your brain trying to keep you safe. It means something matters.',
        techniques: [
          'Distinguish real danger from perceived threat',
          'Name the specific fear (rejection, failure, loss)',
          "Ask: 'What would courage look like here?'",
          'Gradual exposure if appropriate',
        ],
        doNot: [
          "Don't dismiss the fear",
          "Don't push them to 'just do it'",
          "Don't shame fear as weakness",
        ],
        granularOptions: EMOTION_SCIENCE.emotionGranularity.granularVocabulary.fear_family,
        bodyConnection: 'Fear often feels cold, trembling, with hypervigilance',
      };

    case 'joy':
      return {
        validation: 'Joy is worth savoring. Let it land fully.',
        techniques: [
          'Encourage savoring - don\'t rush past good feelings',
          'Notice the urge to deflect or minimize',
          "Ask: 'What about this brought you joy?'",
          'Connect joy to values - why this matters',
        ],
        doNot: [
          "Don't immediately move to next problem",
          "Don't let them dismiss it as 'no big deal'",
        ],
        granularOptions: EMOTION_SCIENCE.emotionGranularity.granularVocabulary.joy_family,
        bodyConnection: 'Joy often feels light, open, with relaxed muscles',
      };

    default:
      return {
        validation: 'All emotions carry information worth understanding',
        techniques: [
          'Help identify the specific emotion',
          'Explore what the emotion is signaling',
          'Notice body sensations',
          'Name it to tame it',
        ],
        doNot: [
          "Don't judge emotions as good or bad",
          "Don't rush to fix",
        ],
        granularOptions: [],
        bodyConnection: 'Notice where this shows up in your body',
      };
  }
}

/**
 * Get emotion vocabulary for affect labeling.
 */
export function getEmotionVocabulary(intensity: 'low' | 'medium' | 'high'): {
  positive: string[];
  negative: string[];
  mixed: string[];
} {
  if (intensity === 'low') {
    return {
      positive: ['content', 'calm', 'okay', 'fine', 'peaceful'],
      negative: ['uneasy', 'off', 'blah', 'meh', 'flat'],
      mixed: ['uncertain', 'ambivalent', 'conflicted'],
    };
  }

  if (intensity === 'high') {
    return {
      positive: ['ecstatic', 'elated', 'overjoyed', 'thrilled', 'euphoric'],
      negative: ['devastated', 'anguished', 'distraught', 'crushed', 'despairing'],
      mixed: ['overwhelmed', 'torn', 'agonized'],
    };
  }

  // Medium intensity
  return {
    positive: ['happy', 'grateful', 'hopeful', 'excited', 'pleased'],
    negative: ['sad', 'anxious', 'frustrated', 'disappointed', 'hurt'],
    mixed: ['confused', 'nervous', 'hesitant'],
  };
}


