/**
 * Celebration Trigger Templates
 *
 * Triggers for recognizing positive momentum and achievements.
 *
 * @module synthesis-trigger-generator/celebration-triggers
 */

import type { TriggerTemplate } from './types.js';

/**
 * Celebration trigger templates - for positive momentum
 */
export const celebrationTriggerTemplates: TriggerTemplate[] = [
  {
    id: 'sleep_habit_foundation',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { sleep } = snapshot.domains;
      const { habits } = snapshot.domains;
      const matches = !!(
        sleep &&
        habits &&
        sleep.averageSleepHours >= 7 &&
        sleep.trend !== 'declining' &&
        !habits.inSlump &&
        habits.adherencePercent > 70
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: `Sleep at ${sleep?.averageSleepHours.toFixed(1)}h and ${habits?.adherencePercent}% habit adherence`,
      };
    },
    suggestedResponses: [
      "Your sleep and habits are holding strong. That's a foundation that supports everything else.",
      "Good sleep, consistent habits - you're building something sustainable here.",
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep', 'habits'],
  },
  {
    id: 'goal_momentum',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { goals } = snapshot.domains;
      const matches = !!(goals?.overallProgress === 'ahead' && goals.motivationLevel === 'high');
      return {
        matches,
        confidence: matches ? 0.85 : 0,
        reasoning: 'Goals ahead of schedule with high motivation',
      };
    },
    suggestedResponses: [
      "You're ahead on your goals and feeling motivated. That momentum is real.",
      "The progress you're making isn't luck - it's showing up consistently.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals'],
  },
  {
    id: 'thriving_relationships',
    category: 'celebration',
    priority: 'low',
    condition: (snapshot) => {
      const { relationships } = snapshot.domains;
      const matches = !!(
        relationships?.relationshipHealth === 'thriving' &&
        !relationships.isolationSignals &&
        relationships.relationshipConcerns.length === 0
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: 'Relationships thriving with no concerns',
      };
    },
    suggestedResponses: [
      'Your relationships seem to be in a good place. That matters more than most things.',
      "Strong connections with people you care about - that's worth noticing.",
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships'],
  },
  {
    id: 'overall_balance',
    category: 'celebration',
    priority: 'low',
    condition: (snapshot) => {
      const matches = snapshot.overallLoadScore < 0.3 && snapshot.wellbeingScore > 0.7;
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: `Load at ${(snapshot.overallLoadScore * 100).toFixed(0)}%, wellbeing at ${(snapshot.wellbeingScore * 100).toFixed(0)}%`,
      };
    },
    suggestedResponses: [
      'Life feels more balanced right now. Worth pausing to appreciate that.',
      'Things seem to be humming along. These moments matter.',
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['sleep', 'calendar', 'goals', 'relationships', 'habits'],
  },
  {
    id: 'schedule_optimization_win',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { calendar } = snapshot.domains;
      const matches = !!(
        calendar &&
        !calendar.isOverloaded &&
        calendar.freeTimeHours >= 4 &&
        calendar.scheduleDensity < 50 &&
        calendar.backToBackChains <= 1
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: `Calendar balanced: ${calendar?.freeTimeHours}h free, ${calendar?.scheduleDensity}% density`,
      };
    },
    suggestedResponses: [
      'Your calendar has some room to breathe. That took intentional choices.',
      "You've carved out actual space this week. That doesn't happen by accident.",
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar'],
  },
  {
    id: 'financial_stability_win',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { finance } = snapshot.domains;
      const matches = !!(
        finance &&
        !finance.expressedAnxiety &&
        finance.stressLevel === 'low' &&
        finance.concernTopics.length === 0 &&
        !finance.pendingDecision.exists
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'No financial anxiety, low stress, no pending concerns',
      };
    },
    suggestedResponses: [
      'Your finances seem to be in a steady place. That kind of stability is worth recognizing.',
      "No financial fires to put out - that's the result of good decisions adding up.",
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance'],
  },
];
