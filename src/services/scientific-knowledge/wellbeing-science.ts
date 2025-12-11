/**
 * Wellbeing Science Knowledge Base
 *
 * Research-backed understanding of flourishing based on:
 * - PERMA Model (Seligman, 2011)
 * - Self-Compassion (Neff, 2011)
 * - Gratitude Research (Emmons)
 * - Flow State (Csikszentmihalyi)
 * - Meaning & Purpose research
 *
 * @module WellbeingScience
 */

// ============================================================================
// WELLBEING SCIENCE
// ============================================================================

export const WELLBEING_SCIENCE = {
  /**
   * PERMA Model (Seligman, 2011)
   * Five pillars of flourishing.
   */
  perma: {
    positiveEmotion: {
      description: 'Experiencing joy, gratitude, hope, love',
      interventions: ['Gratitude practice', 'Savoring', 'Best possible self'],
    },
    engagement: {
      description: 'Being absorbed in activities (flow)',
      interventions: ['Use signature strengths', 'Find flow activities', 'Challenge-skill balance'],
    },
    relationships: {
      description: 'Feeling connected and supported',
      interventions: ['Active constructive responding', 'Quality time', 'Acts of kindness'],
    },
    meaning: {
      description: 'Belonging to something bigger than self',
      interventions: ['Values clarification', 'Purpose exploration', 'Contribution focus'],
    },
    accomplishment: {
      description: 'Pursuing and achieving goals',
      interventions: ['Goal setting', 'Small wins', 'Progress tracking'],
    },
  },

  /**
   * Self-Compassion (Kristin Neff)
   */
  selfCompassion: {
    components: {
      kindness: 'Treating yourself as you would a friend',
      commonHumanity: 'Recognizing suffering is part of being human',
      mindfulness: 'Observing pain without over-identification',
    },
    phrases: [
      'What would you say to a friend in this situation?',
      "You're not alone in feeling this way",
      'This is a moment of suffering—can you be gentle with yourself?',
    ],
    notSelfPity: 'Self-compassion reduces rumination; self-pity increases it',
  },

  /**
   * Gratitude Research
   */
  gratitude: {
    benefits: [
      'Increases life satisfaction',
      'Improves sleep',
      'Reduces depression',
      'Strengthens relationships',
    ],
    interventions: {
      threeGoodThings: 'Write 3 good things that happened and why',
      gratitudeLetter: 'Write to someone who helped you',
      mentalSubtraction: 'Imagine life without something you value',
    },
    frequency: '2-3x per week more effective than daily (adaptation)',
  },
};

// ============================================================================
// WELLBEING INTERVENTION FUNCTIONS
// ============================================================================

export interface WellbeingIntervention {
  techniques: string[];
  questions: string[];
  research: string;
}

export function getWellbeingIntervention(
  focus: 'general' | 'meaning' | 'gratitude' | 'self_compassion' | 'engagement'
): WellbeingIntervention {
  switch (focus) {
    case 'meaning':
      return {
        techniques: [
          'Explore values: What matters most to you?',
          'Connect daily actions to larger purpose',
          'Find contribution opportunities',
        ],
        questions: [
          'What would make today feel meaningful?',
          'When do you feel most aligned with who you want to be?',
          "What's something bigger than yourself that you care about?",
        ],
        research: 'Viktor Frankl: Those who have a "why" can bear almost any "how"',
      };

    case 'gratitude':
      return {
        techniques: [
          'Three good things practice',
          'Gratitude savoring—slow down with good moments',
          'Express appreciation to someone',
        ],
        questions: [
          "What's something small that went well today?",
          "Who's someone you're grateful for?",
          'What would you miss if it was gone?',
        ],
        research: 'Emmons: Regular gratitude increases wellbeing 25%',
      };

    case 'self_compassion':
      return {
        techniques: [
          'Self-compassion break: suffering + common humanity + kindness',
          'Write to yourself as you would to a friend',
          'Notice self-critical voice without believing it',
        ],
        questions: [
          'What would you say to a friend in this exact situation?',
          'Can you acknowledge this is hard without making it worse?',
          'What do you need to hear right now?',
        ],
        research: 'Neff: Self-compassion more effective than self-esteem for resilience',
      };

    case 'engagement':
      return {
        techniques: [
          'Identify flow activities—where time disappears',
          'Match challenge to skill level',
          'Use signature strengths daily',
        ],
        questions: [
          'When do you lose track of time in a good way?',
          'What activities energize rather than drain you?',
          'What are you naturally good at?',
        ],
        research: 'Csikszentmihalyi: Flow is optimal human experience',
      };

    default:
      return {
        techniques: [
          'Build positive emotions through gratitude',
          'Find engagement through strengths',
          'Nurture meaningful relationships',
        ],
        questions: [
          "What's going well in your life right now?",
          'What gives your life meaning?',
          'Who helps you feel like yourself?',
        ],
        research: 'PERMA: Wellbeing is multidimensional, not just happiness',
      };
  }
}
