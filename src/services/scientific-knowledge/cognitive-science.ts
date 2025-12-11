/**
 * Cognitive Science Knowledge Base
 *
 * Research-backed understanding of thinking patterns based on:
 * - Cognitive Behavioral Therapy (Beck, 1976; Burns, 1980)
 * - Growth Mindset (Dweck, 2006)
 * - Metacognition research
 * - Decision science
 * - Rumination research (Nolen-Hoeksema)
 *
 * KEY INSIGHT: Thoughts are not facts.
 * We can notice thoughts without believing them,
 * and we can change our relationship to thoughts.
 *
 * @module CognitiveScience
 */

// ============================================================================
// COGNITIVE SCIENCE
// ============================================================================

export const COGNITIVE_SCIENCE = {
  /**
   * Cognitive Behavioral Therapy Foundation (Beck, 1976)
   *
   * Our thoughts influence our feelings and behaviors.
   * By changing thoughts, we can change how we feel and act.
   */
  cbtFoundation: {
    cognitiveTriad: {
      negativeSelfView: 'I am worthless/incompetent',
      negativeWorldView: 'The world is unfair/hostile',
      negativeFutureView: 'Things will never get better',
      implication: 'Depression involves negative views of self, world, future',
    },

    thoughtFeelingConnection: {
      principle: 'Situation → Thought → Feeling → Behavior',
      implication: 'Same situation, different thoughts = different feelings',
      coachingUse: 'Help identify the thought between situation and feeling',
    },

    automaticThoughts: {
      description: 'Quick, involuntary thoughts that pop up',
      characteristics: [
        'Often negative and self-critical',
        'Feel believable in the moment',
        'Often distorted or exaggerated',
        'Can be identified and examined',
      ],
    },
  },

  /**
   * Cognitive Distortions (Burns, 1980)
   * Already detailed in distortion-detector.ts
   * Key distortions summarized here for quick reference.
   */
  cognitiveDistortions: {
    summary: [
      { name: 'All-or-nothing thinking', essence: 'Black and white, no gray' },
      { name: 'Overgeneralization', essence: 'One event = universal pattern' },
      { name: 'Mental filter', essence: 'Focus only on negative' },
      { name: 'Disqualifying positive', essence: "Good stuff doesn't count" },
      { name: 'Jumping to conclusions', essence: 'Mind-reading or fortune-telling' },
      { name: 'Magnification/minimization', essence: 'Blowing up or shrinking importance' },
      { name: 'Emotional reasoning', essence: 'I feel it so it must be true' },
      { name: 'Should statements', essence: 'Rules about how things must be' },
      { name: 'Labeling', essence: 'Global labels from single events' },
      { name: 'Personalization', essence: 'Taking blame for external events' },
    ],

    interventionPrinciple: 'Notice → Name → Question → Reframe',
  },

  /**
   * Socratic Questioning (Beck)
   *
   * Guided discovery through questions rather than telling.
   */
  socraticQuestioning: {
    purpose: 'Help people discover alternative perspectives themselves',
    types: {
      evidenceQuestions: [
        'What evidence supports this thought?',
        'What evidence contradicts it?',
        'Am I basing this on facts or feelings?',
      ],
      alternativeQuestions: [
        "What's another way to look at this?",
        'What would I tell a friend in this situation?',
        'How might someone else see this?',
      ],
      consequenceQuestions: [
        "What's the worst that could happen? Could I cope?",
        "What's the best that could happen?",
        "What's most likely to happen?",
      ],
      utilityQuestions: [
        'Is this thought helping or hurting me?',
        'What would happen if I let go of this thought?',
        'What could I think instead that would be more helpful?',
      ],
    },
    key: "Don't tell them the answer—help them discover it",
  },

  /**
   * Growth Mindset (Dweck, 2006)
   *
   * Beliefs about ability affect motivation and resilience.
   */
  growthMindset: {
    fixedMindset: {
      belief: 'Abilities are fixed traits',
      avoids: 'Challenges (might fail)',
      response_to_failure: 'Give up (proves I lack ability)',
      effort_view: 'Effort means lack of talent',
      criticism: 'Defensive, ignores',
      others_success: 'Feels threatening',
    },

    growthMindset: {
      belief: 'Abilities can be developed',
      seeks: 'Challenges (opportunity to grow)',
      response_to_failure: 'Learn and try again',
      effort_view: 'Effort is path to mastery',
      criticism: 'Learns from it',
      others_success: 'Finds inspiration',
    },

    languageThatPromotesGrowth: [
      'Yet - "You haven\'t figured it out YET"',
      'Process praise - "You worked really hard on that"',
      'Strategy focus - "What else could you try?"',
      "Normalize struggle - 'This is supposed to be hard'",
    ],

    languageThatUnderminesGrowth: [
      "You're so smart/talented", // Ties identity to fixed trait
      "You're not good at this", // Fixed label
      'This should be easy', // Pathologizes struggle
    ],
  },

  /**
   * Rumination Research (Nolen-Hoeksema)
   *
   * Repetitive negative thinking maintains and worsens depression.
   */
  rumination: {
    definition: 'Repetitively focusing on symptoms of distress and their causes and consequences',

    types: {
      brooding: {
        description: 'Passive comparison to unachieved standards',
        example: 'Why do I always feel this way?',
        harmful: true,
      },
      reflection: {
        description: 'Active problem-solving focus',
        example: 'What can I learn from this?',
        harmful: false,
      },
    },

    whyItPersists: [
      'Feels like productive thinking',
      'Hope that understanding will solve it',
      'Difficulty disengaging from unfinished goals',
    ],

    interventions: [
      'Behavioral activation - do something, anything',
      'Attention training - practice redirecting focus',
      'Worry time - scheduled worry rather than constant',
      'Metacognitive awareness - "I notice I\'m ruminating"',
      'Defusion - see thoughts as thoughts, not truths',
    ],

    coachingApproach: [
      'Gently interrupt rumination cycles',
      "Don't engage with the content of rumination",
      'Redirect to action or present moment',
      'Validate the distress without feeding the loop',
    ],
  },

  /**
   * Metacognition
   *
   * Thinking about thinking.
   */
  metacognition: {
    definition: 'Awareness and understanding of own thought processes',

    skills: {
      monitoring: "Noticing what you're thinking",
      evaluating: 'Assessing whether thoughts are helpful/accurate',
      regulating: 'Choosing where to direct attention',
    },

    metaCognitiveStatements: [
      "I notice I'm having the thought that...",
      'My mind is doing that thing again where...',
      "There's that worry pattern showing up",
      'I see my brain trying to protect me by...',
    ],

    coachingUse: 'Help users develop meta-awareness of thought patterns',
  },

  /**
   * Decision Making Science
   */
  decisionScience: {
    biases: {
      confirmationBias: {
        description: 'Seeking info that confirms existing beliefs',
        counter: 'Actively seek disconfirming evidence',
      },
      availabilityHeuristic: {
        description: 'Judging probability by ease of recall',
        counter: 'Look at actual base rates, not memorable examples',
      },
      anchoringBias: {
        description: 'Over-relying on first piece of information',
        counter: 'Consider multiple starting points',
      },
      sunkCostFallacy: {
        description: 'Continuing due to past investment',
        counter: 'Evaluate future value, not past cost',
      },
    },

    improvingDecisions: [
      'Consider the opposite',
      'Pre-mortem: Why might this fail?',
      'Decision journal: Track predictions vs. outcomes',
      'Separate deciding from doing—decide when calm',
    ],
  },
};

// ============================================================================
// COGNITIVE INTERVENTION FUNCTIONS
// ============================================================================

export interface CognitiveIntervention {
  situation: string;
  techniques: string[];
  questions: string[];
  doNot: string[];
  underlyingPrinciple: string;
}

export function getCognitiveIntervention(
  situation:
    | 'anxiety'
    | 'depression'
    | 'rumination'
    | 'decision'
    | 'self_criticism'
    | 'perfectionism'
): CognitiveIntervention {
  switch (situation) {
    case 'anxiety':
      return {
        situation: 'Anxious thinking patterns',
        techniques: [
          'Examine the evidence for catastrophic predictions',
          'Calculate realistic probability (not feeling-based)',
          'Decatastrophize: "Even if the worst happens, then what?"',
          'Distinguish "possible" from "probable"',
        ],
        questions: [
          "What's the evidence this will happen?",
          "How many times have you worried like this and it didn't happen?",
          "What's most likely to happen?",
          'If it did happen, could you cope?',
        ],
        doNot: [
          "Don't immediately reassure—explore first",
          "Don't dismiss the worry as silly",
          "Don't provide false certainty",
        ],
        underlyingPrinciple: 'Anxiety overestimates threat and underestimates coping',
      };

    case 'depression':
      return {
        situation: 'Depressive thinking patterns',
        techniques: [
          'Behavioral activation before cognitive work',
          'Challenge all-or-nothing thinking',
          'Look for disqualified positives',
          'Use behavioral experiments to test beliefs',
        ],
        questions: [
          "What's the evidence things will never get better?",
          'When have things been different?',
          'What would you tell a friend who felt this way?',
        ],
        doNot: [
          "Don't use logic to fight emotion—validate first",
          "Don't push toxic positivity",
          "Don't suggest they should 'just think positive'",
        ],
        underlyingPrinciple: 'Depression filters out positive and amplifies negative',
      };

    case 'rumination':
      return {
        situation: 'Stuck in repetitive negative thinking',
        techniques: [
          "Metacognitive awareness: 'I notice I'm ruminating'",
          'Redirect to action—any action',
          'Schedule worry time instead of constant rumination',
          'Attention training—practice shifting focus',
        ],
        questions: [
          'Is this thinking solving a problem or just spinning?',
          'What would happen if you let this thought go for now?',
          'What could you do right now instead of thinking about this?',
        ],
        doNot: [
          "Don't engage with rumination content",
          "Don't try to solve the problem they're ruminating about",
          "Don't tell them to 'just stop thinking about it'",
        ],
        underlyingPrinciple: 'Rumination feels productive but maintains distress',
      };

    case 'decision':
      return {
        situation: 'Difficulty making decisions',
        techniques: [
          'Separate deciding from doing',
          'Consider: "What would I advise a friend?"',
          'Pre-mortem: How might this go wrong?',
          'Identify the reversible vs. irreversible',
        ],
        questions: [
          "What's the cost of not deciding?",
          'What would you need to know to feel ready?',
          'What does your gut say underneath the analysis?',
        ],
        doNot: [
          "Don't decide for them",
          "Don't add more information to consider",
          "Don't rush the process",
        ],
        underlyingPrinciple: 'Indecision is often about fear, not information',
      };

    case 'self_criticism':
      return {
        situation: 'Harsh self-judgment',
        techniques: [
          'Notice the double standard (harsher to self than others)',
          'Ask what a compassionate friend would say',
          'Separate behavior from identity',
          'Use self-compassion: common humanity, kindness, mindfulness',
        ],
        questions: [
          'What would you say to a friend in this situation?',
          'Is this criticism helping or hurting you?',
          'What do you need to hear right now?',
        ],
        doNot: [
          "Don't immediately counter the criticism (validates the frame)",
          "Don't say 'you shouldn't feel that way'",
          "Don't pile on with reassurance",
        ],
        underlyingPrinciple: 'Self-criticism often comes from a protective place but backfires',
      };

    case 'perfectionism':
      return {
        situation: 'Unrealistic standards and fear of failure',
        techniques: [
          'Examine the cost-benefit of perfectionism',
          'Practice "good enough" in low-stakes areas',
          'Distinguish high standards from perfectionism',
          'Embrace "perfectly imperfect"',
        ],
        questions: [
          "What's the cost of this standard?",
          'What would be good enough?',
          "What are you afraid will happen if you're not perfect?",
        ],
        doNot: [
          "Don't say 'nobody's perfect'",
          "Don't minimize their standards",
          "Don't push imperfection too fast",
        ],
        underlyingPrinciple: 'Perfectionism protects from failure but prevents living',
      };
  }
}

/**
 * Get growth mindset reframe for a situation.
 */
export function getGrowthMindsetReframe(
  situation: 'failure' | 'criticism' | 'comparison' | 'difficulty'
): { fixed: string; growth: string; bridgePhrase: string } {
  const reframes = {
    failure: {
      fixed: "I failed because I'm not good enough",
      growth: "I haven't succeeded YET—what can I learn?",
      bridgePhrase: 'Failure is information, not identity',
    },
    criticism: {
      fixed: "They think I'm incompetent",
      growth: 'There might be something useful here for my growth',
      bridgePhrase: 'Feedback is a gift, even when it stings',
    },
    comparison: {
      fixed: "They're better than me—I'll never catch up",
      growth: "Their success shows what's possible—what can I learn from them?",
      bridgePhrase: "Someone else's success doesn't diminish your potential",
    },
    difficulty: {
      fixed: 'If I have to struggle, I must not be cut out for this',
      growth: 'Struggle is the feeling of my brain growing',
      bridgePhrase: "Hard doesn't mean impossible—it means you're learning",
    },
  };

  return reframes[situation];
}
