/**
 * Somatic Science Knowledge Base
 *
 * Research-backed understanding of body-based regulation based on:
 * - Polyvagal Theory (Porges, 2011)
 * - Interoception research
 * - Breathwork science
 * - Grounding techniques
 * - Somatic experiencing
 *
 * KEY INSIGHT: The body keeps the score.
 * We can't think our way out of dysregulation—we have to regulate
 * through the body first, then the mind can come online.
 *
 * @module SomaticScience
 */

// ============================================================================
// SOMATIC SCIENCE
// ============================================================================

export const SOMATIC_SCIENCE = {
  /**
   * Polyvagal Theory (Porges, 2011)
   *
   * The vagus nerve creates three states of autonomic nervous system
   * activation. Understanding these helps match interventions to state.
   */
  polyvagalTheory: {
    overview: 'The autonomic nervous system has three evolutionary branches',

    states: {
      ventral_vagal: {
        name: 'Social Engagement (Safe)',
        activation: 'Parasympathetic - ventral vagal complex',
        characteristics: [
          'Feeling safe and connected',
          'Able to think clearly and problem-solve',
          'Open facial expression, melodic voice',
          'Curious, playful, creative',
        ],
        physiology: [
          'Slow, regular heart rate',
          'Full, easy breathing',
          'Relaxed muscles',
          'Good digestion',
        ],
        coachingImplication: 'Cognitive work can happen here',
      },

      sympathetic: {
        name: 'Fight or Flight (Danger)',
        activation: 'Sympathetic nervous system',
        characteristics: [
          'Mobilized for action',
          'Scanning for threat',
          'Difficulty thinking clearly',
          'Irritable, anxious, defensive',
        ],
        physiology: [
          'Rapid heart rate',
          'Shallow, fast breathing',
          'Tense muscles (ready to run)',
          'Sweating, shaking',
        ],
        coachingImplication: 'Regulate body BEFORE trying to think or talk',
      },

      dorsal_vagal: {
        name: 'Shutdown (Life Threat)',
        activation: 'Parasympathetic - dorsal vagal complex',
        characteristics: [
          'Collapsed, disconnected',
          'Numb, foggy, dissociated',
          'Hopeless, helpless',
          'Hard to move or speak',
        ],
        physiology: [
          'Very slow heart rate',
          'Shallow breathing',
          'Low muscle tone',
          'Feeling heavy, frozen',
        ],
        coachingImplication: 'Activate gently - orienting, movement, warmth',
      },
    },

    neuroception: {
      definition: 'Unconscious detection of safety or danger',
      implication: "The body decides safety before the mind knows",
      cues_of_safety: [
        'Prosodic voice (melodic, not monotone)',
        'Soft eye contact',
        'Open, relaxed posture',
        'Slow movements',
        "Warmth (temperature and emotional)",
      ],
    },

    vagalTone: {
      definition: 'Flexibility of the vagus nerve response',
      highVagalTone: 'Quickly recovers from stress, returns to calm',
      lowVagalTone: 'Gets stuck in stress states, slow recovery',
      howToImprove: [
        'Regular breathwork (especially extended exhales)',
        'Cold exposure (carefully)',
        'Social connection',
        'Exercise',
        'Singing, humming, gargling',
      ],
    },

    coregulation: {
      principle: "We regulate each other's nervous systems",
      implication: 'Ferni\'s calm presence helps users regulate',
      technique: 'Model calm, slow speech when user is dysregulated',
    },
  },

  /**
   * Breathwork Science
   *
   * Breathing is the only autonomic function we can voluntarily control,
   * making it a powerful regulation tool.
   */
  breathwork: {
    science: {
      exhaleFocus: {
        principle: 'Extended exhales activate parasympathetic',
        mechanism: 'Stimulates vagus nerve via heart rate variability',
        technique: 'Exhale longer than inhale (e.g., 4 in, 6 out)',
      },
      physiologicalSigh: {
        principle: 'Double inhale + long exhale rapidly calms',
        mechanism: 'Reinflates collapsed alveoli, triggers relaxation',
        technique: 'Inhale, inhale again (top up), long slow exhale',
        research: 'Huberman Lab - most effective for real-time calm',
      },
    },

    techniques: {
      fourSevenEight: {
        name: '4-7-8 Breathing',
        pattern: 'Inhale 4, hold 7, exhale 8',
        use: 'General calming, sleep',
        caution: 'Start gently if anxious (holding can feel scary)',
      },
      boxBreathing: {
        name: 'Box Breathing',
        pattern: 'Inhale 4, hold 4, exhale 4, hold 4',
        use: 'Grounding, focus',
        origin: 'Navy SEALs',
      },
      coherentBreathing: {
        name: 'Coherent Breathing',
        pattern: '5 seconds in, 5 seconds out (6 breaths/minute)',
        use: 'Heart rate variability training',
        research: 'Optimal for HRV improvement',
      },
      physiologicalSigh: {
        name: 'Physiological Sigh',
        pattern: 'Double inhale through nose, long exhale through mouth',
        use: 'Rapid real-time stress relief',
        duration: 'Just 1-3 cycles effective',
      },
    },

    contraindications: [
      'Severe panic—may feel like more to control',
      'Trauma history with breath holding',
      'Respiratory conditions',
    ],

    voiceGuidance: {
      pacing: 'Guide breathing at slightly slower pace than current',
      cueing: 'Use "let" language: "Let the breath come in"',
      modeling: 'Breathe with them (can hear in voice)',
    },
  },

  /**
   * Grounding Techniques
   *
   * Using sensory engagement to anchor in present moment.
   */
  grounding: {
    fiveFourThreeTwoOne: {
      name: '5-4-3-2-1 Technique',
      steps: [
        '5 things you can SEE',
        '4 things you can TOUCH',
        '3 things you can HEAR',
        '2 things you can SMELL',
        '1 thing you can TASTE',
      ],
      mechanism: 'Engages external senses, pulls out of internal spiral',
      voiceAdaptation: 'For voice-only: focus on touch, sound, breath',
    },

    physicalGrounding: {
      feet: 'Feel feet on floor, push down slightly',
      hands: 'Press palms together firmly, or grip arms of chair',
      cold: 'Hold ice, splash cold water on face',
      movement: 'Shake out hands, roll shoulders, sway',
    },

    orientingResponse: {
      description: 'Slowly look around environment, naming objects',
      mechanism: 'Activates "this is now, not then"',
      use: 'Flashbacks, dissociation, panic',
    },
  },

  /**
   * Interoception
   *
   * Sensing internal body signals.
   */
  interoception: {
    definition: 'Perceiving internal body sensations',

    importance: 'Foundation of emotional awareness',

    components: [
      'Heartbeat awareness',
      'Breath sensing',
      'Hunger/fullness',
      'Temperature',
      'Muscle tension',
      'Gut feelings',
    ],

    building_interoception: [
      'Body scans (systematic attention)',
      'Noticing before eating: "How hungry am I?"',
      "Emotion check: 'Where do I feel this in my body?'",
      'Post-exercise: noticing heart, breath, muscles',
    ],

    disrupted_interoception: {
      conditions: ['Trauma', 'Anxiety disorders', 'Eating disorders'],
      signs: ['Difficulty identifying emotions', 'Not noticing hunger/fullness', 'Disconnection from body'],
      approach: 'Build slowly, don\'t push past tolerance',
    },
  },

  /**
   * Window of Tolerance (Siegel)
   *
   * The zone of optimal arousal for processing.
   */
  windowOfTolerance: {
    definition: 'The zone where we can process experience without overwhelm',

    zones: {
      hyperarousal: {
        signs: ['Anxious', 'Racing thoughts', 'Reactive', 'Overwhelmed'],
        outside_window: 'Above the window',
        intervention: 'Down-regulate: breathing, grounding, cold',
      },
      optimalZone: {
        signs: ['Present', 'Able to think', 'Connected', 'Curious'],
        in_window: 'Within window of tolerance',
        intervention: 'This is where cognitive work can happen',
      },
      hypoarousal: {
        signs: ['Numb', 'Foggy', 'Disconnected', 'Collapsed'],
        outside_window: 'Below the window',
        intervention: 'Up-regulate: movement, orienting, warmth, stimulation',
      },
    },

    expanding_window: 'Regular practice of titrated exposure + regulation',

    coachingImplication: 'Check window state before choosing intervention',
  },
};

// ============================================================================
// SOMATIC TECHNIQUE FUNCTIONS
// ============================================================================

export interface SomaticTechnique {
  situation: string;
  techniques: string[];
  voiceGuidance: string[];
  doNot: string[];
  duration: string;
}

export function getSomaticTechnique(
  situation: 'acute_distress' | 'anxiety' | 'shutdown' | 'grounding' | 'sleep' | 'anger'
): SomaticTechnique {
  switch (situation) {
    case 'acute_distress':
      return {
        situation: 'High activation, fight-or-flight',
        techniques: [
          'Physiological sigh: Double inhale, long exhale',
          'Cold stimulus if available (water on face)',
          'Feet on ground, feel the floor',
          'Name 3 things you can hear right now',
        ],
        voiceGuidance: [
          'Speak slowly and warmly',
          "I'm here with you. Let's slow down together.",
          'Can you feel your feet on the ground?',
          "Let's take a breath. In through your nose...",
        ],
        doNot: [
          "Don't try to problem-solve yet",
          "Don't ask them to think or analyze",
          "Don't match their energy—stay calm",
        ],
        duration: '2-5 minutes to stabilize',
      };

    case 'anxiety':
      return {
        situation: 'Elevated worry, moderate activation',
        techniques: [
          'Extended exhale breathing (4 in, 6 out)',
          'Box breathing (4-4-4-4)',
          '5-4-3-2-1 grounding',
          'Progressive muscle relaxation',
        ],
        voiceGuidance: [
          'Slower speech pace than normal',
          "Your body is trying to protect you. Let's help it settle.",
          'Notice where you feel the anxiety in your body',
          'Breathe with me...',
        ],
        doNot: [
          "Don't dismiss ('just relax')",
          "Don't rush to cognitive reframe",
          "Don't hold breath techniques if scary",
        ],
        duration: '5-10 minutes',
      };

    case 'shutdown':
      return {
        situation: 'Dorsal vagal collapse, dissociation',
        techniques: [
          'Orienting: Slowly look around, name objects',
          'Gentle movement: wiggle fingers, roll shoulders',
          'Warmth: hands on heart, warm drink',
          'Social engagement: soft eye contact, warm voice',
        ],
        voiceGuidance: [
          'Warm, melodic voice (activates social engagement)',
          "You're safe here. I'm with you.",
          'Can you feel the chair supporting you?',
          'No need to do anything—just notice.',
        ],
        doNot: [
          "Don't ask complex questions",
          "Don't push for eye contact",
          "Don't startle with sudden sounds",
        ],
        duration: 'Go slowly, 5-15 minutes',
      };

    case 'grounding':
      return {
        situation: 'Need for present-moment anchoring',
        techniques: [
          '5-4-3-2-1 sensory grounding',
          'Feet flat on floor, notice pressure',
          'Name 5 things you can see around you',
          'Feel texture of something nearby',
        ],
        voiceGuidance: [
          'What are you noticing in your body right now?',
          'Let\'s anchor into this moment together',
          'What sounds can you hear?',
          'Feel the weight of your body being held',
        ],
        doNot: [
          "Don't skip sensory engagement",
          "Don't rush through it",
        ],
        duration: '3-5 minutes',
      };

    case 'sleep':
      return {
        situation: 'Preparing for sleep, calming activation',
        techniques: [
          '4-7-8 breathing (natural sedative)',
          'Body scan from feet to head',
          'Progressive relaxation',
          'Parasympathetic activation (extended exhale)',
        ],
        voiceGuidance: [
          'Speak very slowly, lower pitch',
          'Let your eyes close when they\'re ready',
          'With each exhale, let yourself sink deeper',
          'There\'s nothing you need to do right now',
        ],
        doNot: [
          "Don't introduce stimulating content",
          "Don't use alerting tones",
          "Don't ask engaging questions",
        ],
        duration: '10-20 minutes',
      };

    case 'anger':
      return {
        situation: 'High sympathetic activation, anger',
        techniques: [
          'Physical discharge: shake hands, stomp feet',
          'Cold water on face (dive reflex)',
          'Extended exhales to down-regulate',
          'TIPP from DBT: Temperature, Intense exercise, Paced breathing, Progressive relaxation',
        ],
        voiceGuidance: [
          'Anger makes sense—let\'s help your body settle',
          'Can you shake your hands out for me?',
          'Take a big breath in... and let it whoosh out',
          'Notice where the anger lives in your body',
        ],
        doNot: [
          "Don't tell them to calm down",
          "Don't try to reason with high activation",
          "Don't validate the anger into escalation",
        ],
        duration: '5-10 minutes physical first, then talk',
      };
  }
}

/**
 * Get breath guidance for voice delivery.
 */
export function getBreathGuidance(
  pattern: 'calming' | 'energizing' | 'balancing'
): { inhale: number; hold?: number; exhale: number; cycles: number; voiceCue: string } {
  switch (pattern) {
    case 'calming':
      return {
        inhale: 4,
        exhale: 6,
        cycles: 5,
        voiceCue: 'Breathe in... and slowly let it out...',
      };
    case 'energizing':
      return {
        inhale: 4,
        hold: 4,
        exhale: 4,
        cycles: 4,
        voiceCue: 'Fill up... hold... and release...',
      };
    case 'balancing':
      return {
        inhale: 5,
        exhale: 5,
        cycles: 6,
        voiceCue: 'In for five... and out for five...',
      };
  }
}

/**
 * Determine nervous system state from signals.
 */
export function assessNervousSystemState(signals: {
  speechRate?: 'fast' | 'normal' | 'slow' | 'minimal';
  voiceEnergy?: 'high' | 'normal' | 'low';
  breathing?: 'rapid' | 'normal' | 'shallow';
  content?: string[];
}): 'ventral' | 'sympathetic' | 'dorsal' {
  const { speechRate, voiceEnergy, breathing, content = [] } = signals;

  // Check for shutdown (dorsal vagal)
  const shutdownSignals = [
    speechRate === 'minimal' || speechRate === 'slow',
    voiceEnergy === 'low',
    breathing === 'shallow',
    content.some((c) => /numb|foggy|disconnected|can't move|nothing matters/i.test(c)),
  ];
  if (shutdownSignals.filter(Boolean).length >= 2) {
    return 'dorsal';
  }

  // Check for fight/flight (sympathetic)
  const activationSignals = [
    speechRate === 'fast',
    voiceEnergy === 'high',
    breathing === 'rapid',
    content.some((c) => /panic|can't breathe|heart racing|terrified|furious/i.test(c)),
  ];
  if (activationSignals.filter(Boolean).length >= 2) {
    return 'sympathetic';
  }

  // Default to ventral (safe and social)
  return 'ventral';
}


