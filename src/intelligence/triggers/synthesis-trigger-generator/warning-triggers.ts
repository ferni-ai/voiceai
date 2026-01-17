/**
 * Warning Trigger Templates
 *
 * Triggers for early intervention on emerging issues.
 *
 * @module synthesis-trigger-generator/warning-triggers
 */

import type { TriggerTemplate } from './types.js';

/**
 * Warning trigger templates - early intervention
 */
export const warningTriggerTemplates: TriggerTemplate[] = [
  {
    id: 'deadline_approaching_behind',
    category: 'warning',
    priority: 'high',
    condition: (snapshot) => {
      const { calendar } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(
        calendar?.upcomingDeadline.exists &&
        calendar.upcomingDeadline.daysUntil !== undefined &&
        calendar.upcomingDeadline.daysUntil <= 2 &&
        goals?.overallProgress === 'behind'
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: `Deadline in ${calendar?.upcomingDeadline.daysUntil} days while behind on goals`,
      };
    },
    suggestedResponses: [
      "A deadline's close and you're feeling behind. Let's figure out what's actually essential.",
      "Crunch time approaching. What's the smallest viable version?",
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar', 'goals'],
  },
  {
    id: 'burnout_warning',
    category: 'warning',
    priority: 'urgent',
    condition: (snapshot) => {
      const { sleep } = snapshot.domains;
      const { calendar } = snapshot.domains;
      const { habits } = snapshot.domains;
      const matches = !!(
        sleep &&
        sleep.averageSleepHours < 6 &&
        sleep.mentionedFatigue &&
        calendar?.isOverloaded &&
        habits?.inSlump
      );
      return {
        matches,
        confidence: matches ? 0.9 : 0,
        reasoning: 'Multiple burnout indicators: poor sleep, fatigue, overload, habit slump',
      };
    },
    suggestedResponses: [
      "I'm seeing signs of burnout. This is worth taking seriously.",
      'Your body and habits are signaling something important. Can we talk about it?',
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep', 'calendar', 'habits'],
  },
  {
    id: 'existential_spiral',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const { relationships } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(
        relationships?.existentialThemes.includes('nihilism') && goals?.motivationLevel === 'low'
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: 'Nihilistic questioning combined with low motivation',
      };
    },
    suggestedResponses: [
      'Questioning meaning while feeling stuck is hard. Both things can be true.',
      "The 'what's the point' feeling deserves space, not dismissal. I'm listening.",
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships', 'goals'],
  },
];
