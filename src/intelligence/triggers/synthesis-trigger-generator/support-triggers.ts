/**
 * Support Trigger Templates
 *
 * Triggers for when the user needs help, emotional support, or practical assistance.
 *
 * @module synthesis-trigger-generator/support-triggers
 */

import type { TriggerTemplate } from './types.js';

/**
 * Support trigger templates - for when user needs help
 */
export const supportTriggerTemplates: TriggerTemplate[] = [
  {
    id: 'overwhelm_cascade',
    category: 'support',
    priority: 'urgent',
    condition: (snapshot) => {
      const highStress = snapshot.stressIndicators.filter((i) => i.stressLevel > 0.5);
      const matches = highStress.length >= 3 && snapshot.overallLoadScore > 0.7;
      return {
        matches,
        confidence: matches ? 0.85 : 0,
        reasoning: `${highStress.length} domains showing high stress, overall load ${(snapshot.overallLoadScore * 100).toFixed(0)}%`,
      };
    },
    suggestedResponses: [
      "You're carrying a lot right now. I can hear it.",
      "There's a lot on your plate. Want to just... breathe for a moment?",
      "I'm noticing pressure from several directions. You don't have to figure it all out today.",
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['sleep', 'calendar', 'finance', 'goals', 'relationships'],
  },
  {
    id: 'sleep_calendar_collision',
    category: 'rest',
    priority: 'high',
    condition: (snapshot) => {
      const { sleep } = snapshot.domains;
      const { calendar } = snapshot.domains;
      const matches = !!(
        sleep &&
        calendar &&
        sleep.averageSleepHours < 6 &&
        calendar.scheduleDensity > 60
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: `Sleep at ${sleep?.averageSleepHours.toFixed(1)}h with ${calendar?.scheduleDensity}% schedule density`,
      };
    },
    suggestedResponses: [
      "Your body's asking for rest while your calendar's asking for more. Something might need to give.",
      "Running on fumes with a packed schedule... that's not sustainable. What can we protect?",
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep', 'calendar'],
  },
  {
    id: 'financial_sleep_disruption',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const { finance } = snapshot.domains;
      const { sleep } = snapshot.domains;
      const matches = !!(finance?.expressedAnxiety && sleep?.trend === 'declining');
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: 'Financial anxiety correlating with declining sleep',
      };
    },
    suggestedResponses: [
      "Money worries have a way of following us to bed. Want to talk through what's weighing on you?",
      'I notice the financial concerns might be affecting your rest. Both deserve attention.',
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance', 'sleep'],
  },
  {
    id: 'isolation_motivation_spiral',
    category: 'connection',
    priority: 'urgent',
    condition: (snapshot) => {
      const { relationships } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(relationships?.isolationSignals && goals?.motivationLevel === 'low');
      return {
        matches,
        confidence: matches ? 0.85 : 0,
        reasoning: 'Isolation signals combined with low motivation',
      };
    },
    suggestedResponses: [
      "It can be hard to keep going when we feel alone. You're not alone right now.",
      "Isolation and low motivation often travel together. I'm here.",
      'When we feel disconnected, everything feels harder. Want to tell me more?',
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships', 'goals'],
  },
  {
    id: 'goal_habit_reinforcement_loop',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const { goals } = snapshot.domains;
      const { habits } = snapshot.domains;
      const matches = !!(goals?.overallProgress === 'behind' && habits?.inSlump);
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'Goal struggles and habit slump may be reinforcing each other',
      };
    },
    suggestedResponses: [
      "Goals and habits have gotten tangled up. Let's find one small thread to pull.",
      "When everything slips, the fix isn't doing more - it's choosing one tiny thing.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals', 'habits'],
  },
  {
    id: 'calendar_relationship_strain',
    category: 'warning',
    priority: 'medium',
    condition: (snapshot) => {
      const { calendar } = snapshot.domains;
      const { relationships } = snapshot.domains;
      const matches = !!(
        calendar?.isOverloaded && relationships?.relationshipHealth === 'strained'
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'Overloaded schedule correlating with relationship strain',
      };
    },
    suggestedResponses: [
      'A packed calendar can crowd out the people we care about. Worth checking in on that.',
      'Busy schedules and relationship strain often go together. Something to be aware of.',
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar', 'relationships'],
  },
  {
    id: 'productivity_recovery_support',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const { calendar } = snapshot.domains;
      const { goals } = snapshot.domains;
      const matches = !!(
        calendar &&
        calendar.freeTimeHours < 2 &&
        calendar.backToBackChains > 3 &&
        goals?.overallProgress === 'behind'
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: `Only ${calendar?.freeTimeHours}h free time with ${calendar?.backToBackChains} back-to-back chains`,
      };
    },
    suggestedResponses: [
      "Your calendar is wall-to-wall. Let's find some breathing room.",
      "Productivity isn't about more meetings. What can we protect or delegate?",
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar', 'goals'],
  },
  {
    id: 'financial_decision_support',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const { finance } = snapshot.domains;
      const matches = !!(
        finance?.pendingDecision.exists &&
        finance.pendingDecision.urgency === 'high' &&
        finance.stressLevel === 'high'
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: 'High-urgency financial decision with elevated stress',
      };
    },
    suggestedResponses: [
      "A big financial decision is weighing on you. Let's think through it together.",
      "When money decisions feel heavy, slowing down can actually help. What's the core question?",
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance'],
  },
];
