/**
 * Nuanced Trigger Templates
 *
 * Subtle patterns and edge cases that require more sophisticated detection:
 * - Transitional states (things are changing)
 * - Early warnings (catching things before they're problems)
 * - Mixed signals (one area thriving while another struggles)
 * - Recovery recognition (bouncing back deserves acknowledgment)
 * - Partial data (when we only have some domains)
 * - Persona-specific nuances
 *
 * @module synthesis-trigger-generator/nuanced-triggers
 */

import type { TriggerTemplate } from './types.js';

/**
 * Nuanced edge case triggers - subtle patterns and transitions
 */
export const nuancedTriggerTemplates: TriggerTemplate[] = [
  // ===========================================================================
  // TRANSITIONAL STATES - things are changing
  // ===========================================================================
  {
    id: 'sleep_recovery_in_progress',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { sleep } = snapshot.domains;
      const matches = !!(
        sleep &&
        sleep.trend === 'improving' &&
        sleep.averageSleepHours >= 6 &&
        sleep.averageSleepHours < 7
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: `Sleep improving to ${sleep?.averageSleepHours.toFixed(1)}h - recovery in progress`,
      };
    },
    suggestedResponses: [
      "Your sleep is trending better. That's not nothing.",
      "I see you're getting more rest. Keep protecting that.",
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep'],
  },
  {
    id: 'habit_streak_at_risk',
    category: 'warning',
    priority: 'medium',
    condition: (snapshot) => {
      const { habits } = snapshot.domains;
      const matches = !!(
        habits &&
        !habits.inSlump &&
        habits.streaksAtRisk > 0 &&
        habits.adherencePercent >= 50 &&
        habits.adherencePercent < 70
      );
      return {
        matches,
        confidence: matches ? 0.65 : 0,
        reasoning: `${habits?.streaksAtRisk} streaks at risk, adherence at ${habits?.adherencePercent}%`,
      };
    },
    suggestedResponses: [
      'A few of your streaks are getting wobbly. Small course correction?',
      'Notice some habits slipping. Not a crisis - just worth catching early.',
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['habits'],
  },
  {
    id: 'motivation_recovering',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { goals } = snapshot.domains;
      const { habits } = snapshot.domains;
      const matches = !!(
        goals?.motivationLevel === 'medium' &&
        goals.overallProgress !== 'behind' &&
        habits &&
        !habits.inSlump
      );
      return {
        matches,
        confidence: matches ? 0.65 : 0,
        reasoning: 'Motivation at medium level with stable habits - potentially recovering',
      };
    },
    suggestedResponses: [
      "Feels like you're finding your rhythm again.",
      'The energy is coming back. I can hear it.',
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals', 'habits'],
  },

  // ===========================================================================
  // SUBTLE EARLY WARNINGS - catching things before they're problems
  // ===========================================================================
  {
    id: 'calendar_creep',
    category: 'warning',
    priority: 'low',
    condition: (snapshot) => {
      const { calendar } = snapshot.domains;
      const matches = !!(
        calendar &&
        !calendar.isOverloaded &&
        calendar.scheduleDensity > 50 &&
        calendar.scheduleDensity < 70 &&
        calendar.freeTimeHours < 4
      );
      return {
        matches,
        confidence: matches ? 0.6 : 0,
        reasoning: `Schedule at ${calendar?.scheduleDensity}% density, only ${calendar?.freeTimeHours}h free`,
      };
    },
    suggestedResponses: [
      'Your calendar is filling up. Not a problem yet, but worth noticing.',
      'Starting to see less white space in your schedule.',
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar'],
  },
  {
    id: 'relationship_drift',
    category: 'connection',
    priority: 'low',
    condition: (snapshot) => {
      const { relationships } = snapshot.domains;
      const matches = !!(
        relationships &&
        !relationships.isolationSignals &&
        relationships.relationshipHealth === 'stable' &&
        relationships.relationshipConcerns.length > 0 &&
        relationships.relationshipConcerns.length <= 2
      );
      return {
        matches,
        confidence: matches ? 0.55 : 0,
        reasoning: `Relationships stable but ${relationships?.relationshipConcerns.length} concern(s) present`,
      };
    },
    suggestedResponses: [
      'Relationships seem fine, but there might be something worth checking on.',
      'Everything seems okay with the people in your life... anything on your mind there?',
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships'],
  },
  {
    id: 'financial_background_concern',
    category: 'warning',
    priority: 'low',
    condition: (snapshot) => {
      const { finance } = snapshot.domains;
      const matches = !!(
        finance &&
        !finance.expressedAnxiety &&
        finance.stressLevel === 'moderate' &&
        finance.concernTopics.length > 0
      );
      return {
        matches,
        confidence: matches ? 0.6 : 0,
        reasoning: `Financial concerns (${finance?.concernTopics.join(', ')}) at moderate stress`,
      };
    },
    suggestedResponses: [
      'Some money thoughts in the background. Anything worth talking through?',
      "I notice some financial concerns. They don't have to wait until they're urgent.",
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance'],
  },

  // ===========================================================================
  // MIXED SIGNALS - one area thriving while another struggles
  // ===========================================================================
  {
    id: 'work_life_imbalance',
    category: 'warning',
    priority: 'medium',
    condition: (snapshot) => {
      const { calendar } = snapshot.domains;
      const { relationships } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(
        calendar?.isOverloaded &&
        goals?.overallProgress !== 'behind' &&
        (relationships?.relationshipHealth === 'strained' || relationships?.isolationSignals)
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: 'Professional momentum but relationships showing strain',
      };
    },
    suggestedResponses: [
      "You're crushing it at work, but the relationships might need a little oxygen.",
      'Momentum on goals is great. Worth checking if anyone important feels left behind.',
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['calendar', 'goals', 'relationships'],
  },
  {
    id: 'physical_vs_mental',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const { sleep } = snapshot.domains;
      const { habits } = snapshot.domains;
      const { relationships } = snapshot.domains;
      const matches = !!(
        sleep &&
        sleep.averageSleepHours >= 7 &&
        habits &&
        habits.adherencePercent > 70 &&
        (relationships?.isolationSignals || relationships?.relationshipHealth === 'strained')
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'Strong physical habits but emotional/relational signals present',
      };
    },
    suggestedResponses: [
      'Body is being taken care of. Heart might need some attention too.',
      'The physical habits are strong. How are you doing... inside?',
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['sleep', 'habits', 'relationships'],
  },

  // ===========================================================================
  // RECOVERY RECOGNITION - bouncing back deserves acknowledgment
  // ===========================================================================
  {
    id: 'emerging_from_slump',
    category: 'celebration',
    priority: 'high',
    condition: (snapshot) => {
      const { habits } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(
        habits &&
        !habits.inSlump &&
        habits.adherencePercent > 50 &&
        habits.adherencePercent < 70 &&
        goals?.motivationLevel !== 'low'
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: `Emerging from slump: ${habits?.adherencePercent}% adherence, motivation not low`,
      };
    },
    suggestedResponses: [
      "You're coming out of that slump. That took real effort.",
      "The climb back up is harder than people think. You're doing it.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['habits', 'goals'],
  },
  {
    id: 'stress_stabilizing',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const matches =
        snapshot.overallLoadScore >= 0.4 &&
        snapshot.overallLoadScore <= 0.6 &&
        snapshot.wellbeingScore >= 0.4;
      return {
        matches,
        confidence: matches ? 0.65 : 0,
        reasoning: `Load at ${(snapshot.overallLoadScore * 100).toFixed(0)}%, wellbeing at ${(snapshot.wellbeingScore * 100).toFixed(0)}% - stabilizing`,
      };
    },
    suggestedResponses: [
      'Things are starting to settle. Not easy but happening.',
      'The pressure is easing a bit. Worth noticing.',
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['sleep', 'calendar', 'goals'],
  },

  // ===========================================================================
  // PARTIAL DATA EDGE CASES - when we only have some domains
  // ===========================================================================
  {
    id: 'single_domain_high_stress',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const stressedDomains = snapshot.stressIndicators.filter((i) => i.stressLevel > 0.6);
      const totalDomains = Object.values(snapshot.domains).filter((d) => d !== null).length;
      const matches = stressedDomains.length === 1 && totalDomains <= 2;
      return {
        matches,
        confidence: matches ? 0.6 : 0,
        reasoning: `Single high-stress domain (${stressedDomains[0]?.domain}) with limited context`,
      };
    },
    suggestedResponses: [
      "Something's weighing on you. Want to tell me more about what's going on?",
      "I'm picking up on some stress. Help me understand the full picture.",
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['unknown'],
  },
  {
    id: 'new_user_encouragement',
    category: 'celebration',
    priority: 'low',
    condition: (snapshot) => {
      const totalDomains = Object.values(snapshot.domains).filter((d) => d !== null).length;
      const matches =
        totalDomains <= 2 && snapshot.overallLoadScore < 0.4 && snapshot.wellbeingScore > 0.5;
      return {
        matches,
        confidence: matches ? 0.5 : 0,
        reasoning: 'Limited data but positive signals',
      };
    },
    suggestedResponses: [
      "We're still getting to know each other, but things seem good.",
      "Early days, but I like what I'm seeing so far.",
    ],
    recommendedPersona: 'ferni',
    contributingDomains: [],
  },

  // ===========================================================================
  // JORDAN-SPECIFIC - milestone and goal nuances
  // ===========================================================================
  {
    id: 'goal_plateau',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const { goals } = snapshot.domains;
      const matches = !!(
        goals?.overallProgress === 'on_track' && goals.motivationLevel === 'medium'
      );
      return {
        matches,
        confidence: matches ? 0.65 : 0,
        reasoning: 'Goals on track but motivation settling - possible plateau',
      };
    },
    suggestedResponses: [
      "You're on track, but the spark might need some attention.",
      "Progress is happening but maybe feeling automatic? Let's make sure it still feels meaningful.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals'],
  },
  {
    id: 'setback_with_effort',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const { goals } = snapshot.domains;
      const { habits } = snapshot.domains;
      const matches = !!(
        goals?.overallProgress === 'behind' &&
        goals.recentSetbacks.length > 0 &&
        habits &&
        !habits.inSlump &&
        habits.adherencePercent > 50
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: 'Setback on goals but habits show continued effort',
      };
    },
    suggestedResponses: [
      "The setback hurts, but you haven't stopped trying. That matters.",
      "Behind on the goal doesn't mean you're not doing the work. I see the effort.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals', 'habits'],
  },

  // ===========================================================================
  // NAYAN-SPECIFIC - wisdom and existential nuances
  // ===========================================================================
  {
    id: 'contemplative_pause',
    category: 'support',
    priority: 'low',
    condition: (snapshot) => {
      const { relationships } = snapshot.domains;
      const { goals } = snapshot.domains;
      const hasThemes = relationships && relationships.existentialThemes.length > 0;
      const noNihilism = relationships && !relationships.existentialThemes.includes('nihilism');
      const matches = !!(
        hasThemes &&
        noNihilism &&
        goals?.motivationLevel !== 'low' &&
        snapshot.overallLoadScore < 0.5
      );
      return {
        matches,
        confidence: matches ? 0.55 : 0,
        reasoning: `Contemplating ${relationships?.existentialThemes.join(', ')} without crisis`,
      };
    },
    suggestedResponses: [
      "Sounds like you're thinking about the bigger picture. That's worth exploring.",
      'Some deeper questions are surfacing. Want to sit with those for a bit?',
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships', 'goals'],
  },
  {
    id: 'meaning_seeking',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const { relationships } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(
        relationships?.existentialThemes.includes('purpose') && goals?.motivationLevel === 'medium'
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'Purpose questions with lukewarm motivation',
      };
    },
    suggestedResponses: [
      "Asking 'why' is as important as asking 'what'. Let's explore that.",
      "The purpose question is knocking. That's not a problem - it's an invitation.",
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships', 'goals'],
  },
];
