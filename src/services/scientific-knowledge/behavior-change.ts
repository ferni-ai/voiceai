/**
 * Behavior Change Science Knowledge Base
 *
 * Research-backed approaches to behavior change based on:
 * - Motivational Interviewing (Miller & Rollnick, 2012)
 * - Self-Determination Theory (Deci & Ryan, 2000)
 * - Habit Science (Clear, 2018; Wood, 2019; Fogg, 2020)
 * - Behavioral Economics (Kahneman, 2011; Thaler & Sunstein, 2008)
 * - Implementation Intentions (Gollwitzer, 1999)
 * - Stages of Change (Prochaska & DiClemente, 1983)
 *
 * KEY INSIGHT: People don't change because you tell them to.
 * Change happens when intrinsic motivation meets reduced friction.
 *
 * @module BehaviorChange
 */

// ============================================================================
// BEHAVIOR CHANGE SCIENCE
// ============================================================================

export const BEHAVIOR_CHANGE = {
  /**
   * Motivational Interviewing (Miller & Rollnick, 2012)
   *
   * A collaborative conversation style for strengthening
   * a person's own motivation and commitment to change.
   */
  motivationalInterviewing: {
    spirit: {
      partnership: "We work together—I'm not the expert on their life",
      acceptance: 'Unconditional positive regard + autonomy support',
      compassion: 'Prioritize their wellbeing over our agenda',
      evocation: "Draw out their motivation, don't install it",
    },

    oarsSkills: {
      openQuestions: {
        description: 'Questions that invite exploration',
        examples: [
          'What would be different if you made this change?',
          "What's important to you about this?",
          'What have you tried before?',
          'What would need to happen for you to consider change?',
        ],
        avoid: 'Questions that can be answered yes/no',
      },
      affirmations: {
        description: 'Statements that recognize strengths and efforts',
        examples: [
          "You've shown real courage by even talking about this",
          'It takes self-awareness to notice that pattern',
          "You've been through hard things before and gotten through",
        ],
        note: 'Must be genuine, not manipulative',
      },
      reflections: {
        description: 'Statements that mirror and deepen what they said',
        types: {
          simple: 'Restating what they said',
          complex: 'Adding meaning or emotion',
          amplified: 'Slightly overstating to invite correction',
          doubleSided: 'On one hand... and on the other...',
        },
        examples: [
          "So you're feeling torn between comfort and growth",
          'It sounds like part of you wants to change and part of you is scared',
          'The frustration is really about feeling stuck',
        ],
      },
      summaries: {
        description: "Pulling together what they've shared",
        purpose: 'Shows listening, creates momentum',
        example:
          "So far you've mentioned wanting to feel healthier, but time and energy are barriers...",
      },
    },

    changeTalk: {
      description: 'Statements indicating movement toward change',
      types: {
        desire: 'I want to...',
        ability: 'I could...',
        reason: 'I need to because...',
        need: 'I have to...',
        commitment: 'I will...',
        activation: "I'm ready to...",
        takingSteps: "I've already started...",
      },
      response: 'Reflect it, explore it, affirm it',
    },

    sustainTalk: {
      description: 'Statements indicating staying the same',
      response: "Roll with it, don't argue. Reflect and explore.",
      technique:
        'Double-sided reflection: "Part of you wants to stay the same because it\'s safe, AND part of you wants something different"',
    },

    resistance: {
      principle: 'Resistance is information, not opposition',
      signs: ['Arguing', 'Interrupting', 'Denying', 'Ignoring'],
      response: [
        'Back off—you pushed too hard',
        'Reflect the resistance with empathy',
        'Emphasize autonomy: "Only you can decide"',
        'Shift focus if needed',
      ],
    },
  },

  /**
   * Self-Determination Theory (Deci & Ryan, 2000)
   *
   * Intrinsic motivation requires three psychological needs:
   * Autonomy, Competence, and Relatedness.
   */
  selfDeterminationTheory: {
    coreNeeds: {
      autonomy: {
        definition: 'Feeling in control of own behavior and goals',
        supportingPhrases: [
          "It's completely your choice",
          'What feels right to you?',
          "Only you know what's best for your life",
          'What would you like to do with this?',
        ],
        underminingPhrases: [
          'You should...', // Creates external pressure
          'You have to...', // Removes choice
          'The right thing to do is...', // Imposes values
        ],
      },
      competence: {
        definition: 'Feeling effective and capable',
        supportingPhrases: [
          "You've done hard things before",
          'What helped you succeed in the past?',
          'What skills do you already have for this?',
          "Let's break this into smaller steps",
        ],
        underminingPhrases: [
          'This is easy, just...',
          "I don't know why you're struggling",
          'Everyone else manages to...',
        ],
      },
      relatedness: {
        definition: 'Feeling connected and belonging',
        supportingPhrases: [
          "I'm here with you in this",
          "You're not alone in feeling this way",
          'Many people struggle with this',
          "We'll figure this out together",
        ],
        underminingPhrases: ["It's your problem to solve", "I can't help you with that"],
      },
    },

    motivationSpectrum: [
      { type: 'amotivation', quality: 'Absent', description: 'No intention to act' },
      { type: 'external', quality: 'Controlled', description: 'To get reward or avoid punishment' },
      { type: 'introjected', quality: 'Controlled', description: 'To avoid guilt or boost ego' },
      { type: 'identified', quality: 'Autonomous', description: 'Because it aligns with values' },
      { type: 'integrated', quality: 'Autonomous', description: 'Fully assimilated with self' },
      { type: 'intrinsic', quality: 'Autonomous', description: 'For inherent enjoyment' },
    ],

    coachingImplication:
      'Help shift motivation from external to identified by connecting behaviors to values',
  },

  /**
   * Habit Science (Clear, 2018; Wood, 2019; Fogg, 2020)
   */
  habitScience: {
    habitLoop: {
      cue: 'The trigger that initiates the behavior',
      craving: 'The motivational force',
      response: 'The actual behavior',
      reward: 'The benefit that satisfies the craving',
    },

    lawsOfBehaviorChange: {
      makeItObvious: {
        principle: 'Cue clarity and environment design',
        techniques: [
          'Implementation intention: "I will [BEHAVIOR] at [TIME] in [LOCATION]"',
          'Habit stacking: "After [CURRENT HABIT], I will [NEW HABIT]"',
          'Environment design: Make cues visible',
        ],
      },
      makeItAttractive: {
        principle: 'Increase motivation and craving',
        techniques: [
          'Temptation bundling: Pair wanted with needed',
          'Join a culture where behavior is normal',
          'Create a motivation ritual',
        ],
      },
      makeItEasy: {
        principle: 'Reduce friction',
        techniques: [
          'Two-minute rule: Scale down to 2 minutes',
          'Reduce steps between you and good behaviors',
          'Prepare environment in advance',
          'Automate when possible',
        ],
      },
      makeItSatisfying: {
        principle: 'Immediate reward',
        techniques: [
          "Use habit trackers (don't break the chain)",
          'Celebrate small wins immediately',
          'Never miss twice in a row',
        ],
      },
    },

    tinyHabits: {
      source: 'BJ Fogg, 2020',
      formula: 'After I [ANCHOR HABIT], I will [TINY BEHAVIOR]',
      celebration: 'Immediately celebrate to wire in the habit',
      key: 'Start ridiculously small—motivation follows action',
      examples: [
        'After I pour my coffee, I will write one sentence',
        'After I sit down at my desk, I will take one deep breath',
        'After I put on my running shoes, I will step outside',
      ],
    },

    habitFormationTimeline: {
      myth: '21 days to form a habit',
      reality: 'Average 66 days, range 18-254 days (Lally et al., 2010)',
      implication: 'Focus on consistency, not perfection or speed',
    },
  },

  /**
   * Behavioral Economics (Kahneman, 2011; Thaler & Sunstein, 2008)
   */
  behavioralEconomics: {
    keyBiases: {
      presentBias: {
        description: 'Overvaluing immediate rewards vs. future benefits',
        application: 'Make future rewards more concrete and vivid',
        technique: 'Future self visualization',
      },
      lossAversion: {
        description: 'Losses hurt ~2x more than equivalent gains feel good',
        application: "Frame change in terms of what they'll lose by not changing",
        example: '"What will you lose if nothing changes?"',
      },
      statusQuoBias: {
        description: 'Preference for current state of affairs',
        application: 'Make new behavior the default',
        technique: 'Opt-out vs. opt-in framing',
      },
      socialProof: {
        description: 'Looking to others for how to behave',
        application: 'Normalize the desired behavior',
        example: '"Many people in your situation have found..."',
      },
      commitmentConsistency: {
        description: 'Desire to be consistent with past commitments',
        application: 'Get small commitments that lead to larger ones',
        technique: 'Foot-in-the-door technique',
      },
    },

    nudges: {
      defaultEffect: 'Make the healthy choice the default',
      framing: 'Present information in gain vs. loss frames strategically',
      simplification: 'Reduce cognitive load required for good choices',
      timingIntervention: 'Intervene at decision points, not after',
      feedback: 'Provide immediate feedback on choices',
    },

    commitmentDevices: {
      description: 'Voluntary restrictions on future choices',
      examples: [
        'Telling others about your goal (social commitment)',
        'Putting money on the line (financial commitment)',
        'Removing temptations from environment (restriction)',
        'Scheduling appointments in advance (pre-commitment)',
      ],
    },
  },

  /**
   * Implementation Intentions (Gollwitzer, 1999)
   */
  implementationIntentions: {
    formula: 'If [SITUATION], then [BEHAVIOR]',
    effectiveness: '2-3x more likely to follow through',
    types: {
      initiation: "If it's 7am, then I'll go for a walk",
      prevention: "If I feel the urge to snack, then I'll drink water",
      escalation: "If I've exercised 3 days in a row, then I'll add 5 minutes",
    },
    key: 'Be specific about situation AND behavior',
  },

  /**
   * Stages of Change (Prochaska & DiClemente, 1983)
   */
  stagesOfChange: {
    stages: {
      precontemplation: {
        description: 'Not considering change',
        approach: "Don't push. Raise awareness gently.",
        questions: ['What would need to happen for this to become a concern?'],
      },
      contemplation: {
        description: 'Thinking about change but ambivalent',
        approach: 'Explore ambivalence. Tip the decisional balance.',
        questions: ['What are the pros and cons of changing?', 'What would be different?'],
      },
      preparation: {
        description: 'Intending to change soon',
        approach: 'Help plan. Identify barriers. Build confidence.',
        questions: ["What's your plan?", 'What might get in the way?'],
      },
      action: {
        description: 'Actively modifying behavior',
        approach: 'Support. Problem-solve barriers. Celebrate wins.',
        questions: ["How's it going?", "What's working?", "What's hard?"],
      },
      maintenance: {
        description: 'Sustaining change over time',
        approach: 'Prevent relapse. Consolidate identity shift.',
        questions: ["What's helping you maintain?", 'What are your triggers?'],
      },
      relapse: {
        description: 'Returned to old patterns',
        approach: "Normalize. It's part of the process. Learn and restart.",
        questions: ['What can we learn from this?', 'What will you do differently?'],
      },
    },
    key: "Match your approach to their stage. Don't push action on someone in contemplation.",
  },
};

// ============================================================================
// BEHAVIOR CHANGE GUIDANCE FUNCTIONS
// ============================================================================

export interface BehaviorChangeStrategy {
  stage: string;
  techniques: string[];
  questions: string[];
  doNot: string[];
  frameworkFocus: string;
}

export function getBehaviorChangeStrategy(
  situation: 'ambivalence' | 'resistance' | 'motivation' | 'habit_building' | 'relapse' | 'stuck'
): BehaviorChangeStrategy {
  switch (situation) {
    case 'ambivalence':
      return {
        stage: 'Contemplation',
        techniques: [
          'Use double-sided reflections: "Part of you... and part of you..."',
          'Explore the decisional balance',
          'Connect to values: "What matters most to you here?"',
          "Don't push—ambivalence is normal",
        ],
        questions: [
          'What would be different if you made this change?',
          'What concerns you about changing?',
          'On a scale of 1-10, how important is this to you?',
        ],
        doNot: [
          "Don't argue for change",
          "Don't provide unsolicited advice",
          "Don't rush to action planning",
        ],
        frameworkFocus: 'Motivational Interviewing',
      };

    case 'resistance':
      return {
        stage: 'Pre-contemplation or Contemplation',
        techniques: [
          "Roll with resistance—don't fight it",
          'Emphasize autonomy: "Only you can decide"',
          'Reflect the resistance with empathy',
          'Back off if pushing too hard',
        ],
        questions: [
          'What would need to happen for this to become important?',
          'What do you see as the benefits of things staying the same?',
          'Help me understand your perspective',
        ],
        doNot: [
          "Don't argue or debate",
          "Don't label them as resistant",
          "Don't increase pressure",
        ],
        frameworkFocus: 'Motivational Interviewing - Rolling with Resistance',
      };

    case 'motivation':
      return {
        stage: 'Preparation/Action',
        techniques: [
          'Connect to autonomy, competence, relatedness',
          'Explore intrinsic reasons (not just external pressure)',
          'Connect behavior to identity: "I am someone who..."',
          'Make it about values, not rules',
        ],
        questions: [
          'What personally matters to you about this?',
          'Who do you want to be in relation to this?',
          'What would make this feel like YOUR choice?',
        ],
        doNot: [
          "Don't rely on external motivation",
          "Don't use guilt or shame",
          "Don't compare to others",
        ],
        frameworkFocus: 'Self-Determination Theory',
      };

    case 'habit_building':
      return {
        stage: 'Action',
        techniques: [
          'Start tiny—ridiculously small',
          'Attach to existing habit (habit stacking)',
          'Make it obvious, attractive, easy, satisfying',
          'Focus on consistency over intensity',
          'Celebrate immediately after completing',
        ],
        questions: [
          'What existing habit could you attach this to?',
          "How can we make this so easy you can't say no?",
          'What would success look like in the first week?',
        ],
        doNot: [
          "Don't set ambitious goals too early",
          "Don't rely on motivation",
          "Don't skip the celebration",
        ],
        frameworkFocus: 'Habit Science (Clear, Fogg)',
      };

    case 'relapse':
      return {
        stage: 'Relapse/Maintenance',
        techniques: [
          'Normalize: "This is part of the process, not failure"',
          'Extract learning: "What can we learn?"',
          'Restart without shame',
          "Don't catastrophize one slip",
        ],
        questions: [
          'What was happening right before?',
          'What might have helped prevent this?',
          'What will you do differently next time?',
        ],
        doNot: [
          "Don't shame or blame",
          "Don't catastrophize ('all progress lost')",
          "Don't give up on them",
        ],
        frameworkFocus: 'Stages of Change - Relapse Prevention',
      };

    case 'stuck':
      return {
        stage: 'Various',
        techniques: [
          "Check which stage they're actually in",
          "Reduce friction—what's one tiny step?",
          'Address underlying ambivalence first',
          'Connect to identity and values',
        ],
        questions: [
          "What's getting in the way?",
          'What would make this feel possible?',
          "What's the smallest version of this you could do?",
        ],
        doNot: [
          "Don't assume they're lazy or unmotivated",
          "Don't add more to their plate",
          "Don't skip stage assessment",
        ],
        frameworkFocus: 'Stage-matched intervention',
      };
  }
}

/**
 * Create an implementation intention.
 */
export function createImplementationIntention(
  goal: string,
  context: { when?: string; where?: string; trigger?: string }
): string {
  if (context.trigger) {
    return `If ${context.trigger}, then I will ${goal}`;
  }

  const parts = [];
  if (context.when) parts.push(`at ${context.when}`);
  if (context.where) parts.push(`in ${context.where}`);

  return `I will ${goal} ${parts.join(' ')}`;
}
