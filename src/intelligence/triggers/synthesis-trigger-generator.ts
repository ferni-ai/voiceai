/**
 * Synthesis Trigger Generator
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Generates synthesis triggers based on life context patterns.
 * These triggers respond to LIFE CONTEXT, not just words.
 *
 * Example:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Generate trigger: "support" with "You're carrying a lot right now"
 *
 * Key categories:
 * - support: User needs emotional/practical support
 * - celebration: Positive momentum worth acknowledging
 * - warning: Early intervention for emerging issues
 * - connection: User may need social connection
 * - rest: User needs to slow down
 *
 * @module synthesis-trigger-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  LifeContextSnapshot,
  SynthesisTrigger,
  DomainStressIndicator,
  AggregatorConfig,
} from './life-context-snapshot.js';

const log = createLogger({ module: 'synthesis-trigger-generator' });

// ============================================================================
// TRIGGER TEMPLATES
// ============================================================================

interface TriggerTemplate {
  id: string;
  category: SynthesisTrigger['category'];
  priority: SynthesisTrigger['priority'];
  condition: (snapshot: LifeContextSnapshot) => {
    matches: boolean;
    confidence: number;
    reasoning: string;
  };
  suggestedResponses: string[];
  recommendedPersona: string;
  contributingDomains: string[];
}

/**
 * Support trigger templates - for when user needs help
 */
const supportTriggerTemplates: TriggerTemplate[] = [
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
  // Alex support trigger for productivity recovery
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
  // Peter support trigger for financial decision support
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

/**
 * Celebration trigger templates - for positive momentum
 */
const celebrationTriggerTemplates: TriggerTemplate[] = [
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
  // Alex celebration trigger for schedule optimization
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
  // Peter celebration trigger for financial stability
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

/**
 * Nuanced edge case triggers - subtle patterns and transitions
 */
const nuancedTriggerTemplates: TriggerTemplate[] = [
  // ===========================================================================
  // TRANSITIONAL STATES - things are changing
  // ===========================================================================
  {
    id: 'sleep_recovery_in_progress',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const { sleep } = snapshot.domains;
      // Improving from bad but not fully recovered
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
      // Has good streaks but starting to slip
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
      // Motivation returning while habits stabilizing
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
      // Not overloaded yet, but density is climbing
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
      // Not isolated, but health is just 'stable' (not thriving) with some concerns
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
      // Has concerns but stress isn't high yet
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
      // Calendar packed and goals progressing, but relationships suffering
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
      // Good physical habits but emotional/relational struggle
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
      // Was in slump, now showing signs of recovery
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
      // Overall load coming down from high but not yet low
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
      // Only one domain with high stress, others have no data
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
      // Limited data but what we have looks positive
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
      // On track but motivation is medium - potential plateau
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
      // Behind on goals but habits show effort
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
      // Existential themes without crisis
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
      // Asking purpose questions while goals feel hollow
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

/**
 * Warning trigger templates - early intervention
 */
const warningTriggerTemplates: TriggerTemplate[] = [
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

/**
 * All trigger templates combined
 */
const allTriggerTemplates: TriggerTemplate[] = [
  ...supportTriggerTemplates,
  ...celebrationTriggerTemplates,
  ...warningTriggerTemplates,
  ...nuancedTriggerTemplates,
];

// ============================================================================
// TRIGGER GENERATION
// ============================================================================

/**
 * Generate synthesis triggers from life context snapshot
 */
export function generateSynthesisTriggers(
  snapshot: LifeContextSnapshot,
  config: Partial<AggregatorConfig> = {}
): SynthesisTrigger[] {
  const maxTriggers = config.maxTriggers || 5;
  const supportThreshold = config.supportTriggerThreshold || 0.6;
  const celebrationThreshold = config.celebrationThreshold || 0.7;

  const triggers: SynthesisTrigger[] = [];

  // Evaluate all templates
  for (const template of allTriggerTemplates) {
    const result = template.condition(snapshot);

    if (!result.matches) continue;

    // Apply category-specific confidence thresholds
    const threshold = template.category === 'celebration' ? celebrationThreshold : supportThreshold;
    if (result.confidence < threshold) continue;

    // Select a response (cycle through for variety)
    const responseIndex = Math.floor(Math.random() * template.suggestedResponses.length);
    const suggestedResponse = template.suggestedResponses[responseIndex];

    triggers.push({
      id: template.id,
      category: template.category,
      suggestedResponse,
      reasoning: result.reasoning,
      confidence: result.confidence,
      priority: template.priority,
      contributingDomains: template.contributingDomains,
      recommendedPersona: template.recommendedPersona,
    });
  }

  // Sort by priority and confidence
  const priorityOrder: Record<SynthesisTrigger['priority'], number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  triggers.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  // Limit to max triggers
  const selectedTriggers = triggers.slice(0, maxTriggers);

  log.info(
    {
      userId: snapshot.userId,
      triggersGenerated: selectedTriggers.length,
      categories: selectedTriggers.map((t) => t.category),
      priorities: selectedTriggers.map((t) => t.priority),
    },
    'Synthesis triggers generated'
  );

  return selectedTriggers;
}

/**
 * Populate synthesizedTriggers field in a life context snapshot
 */
export function populateSynthesisTriggers(
  snapshot: LifeContextSnapshot,
  config: Partial<AggregatorConfig> = {}
): LifeContextSnapshot {
  const triggers = generateSynthesisTriggers(snapshot, config);
  return {
    ...snapshot,
    synthesizedTriggers: triggers,
  };
}

/**
 * Get the most important trigger from a snapshot
 */
export function getMostImportantTrigger(snapshot: LifeContextSnapshot): SynthesisTrigger | null {
  if (snapshot.synthesizedTriggers.length === 0) return null;
  return snapshot.synthesizedTriggers[0]; // Already sorted by priority/confidence
}

/**
 * Get triggers by category
 */
export function getTriggersByCategory(
  snapshot: LifeContextSnapshot,
  category: SynthesisTrigger['category']
): SynthesisTrigger[] {
  return snapshot.synthesizedTriggers.filter((t) => t.category === category);
}

/**
 * Get triggers recommended for a specific persona
 */
export function getTriggersForPersona(
  snapshot: LifeContextSnapshot,
  personaId: string
): SynthesisTrigger[] {
  return snapshot.synthesizedTriggers.filter((t) => t.recommendedPersona === personaId);
}

// ============================================================================
// ANALYTICS
// ============================================================================

interface SynthesisAnalytics {
  totalTriggersGenerated: number;
  byCategory: Record<SynthesisTrigger['category'], number>;
  byPriority: Record<SynthesisTrigger['priority'], number>;
  byPersona: Record<string, number>;
  averageConfidence: number;
  mostCommonTriggers: Array<{ id: string; count: number }>;
}

// Simple in-memory analytics store
let analyticsData: {
  triggerCounts: Record<string, number>;
  totalGenerated: number;
  categoryBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  personaBreakdown: Record<string, number>;
  confidenceSum: number;
} = {
  triggerCounts: {},
  totalGenerated: 0,
  categoryBreakdown: {},
  priorityBreakdown: {},
  personaBreakdown: {},
  confidenceSum: 0,
};

/**
 * Record triggers for analytics
 */
export function recordSynthesisTriggers(triggers: SynthesisTrigger[]): void {
  for (const trigger of triggers) {
    analyticsData.totalGenerated++;
    analyticsData.triggerCounts[trigger.id] = (analyticsData.triggerCounts[trigger.id] || 0) + 1;
    analyticsData.categoryBreakdown[trigger.category] =
      (analyticsData.categoryBreakdown[trigger.category] || 0) + 1;
    analyticsData.priorityBreakdown[trigger.priority] =
      (analyticsData.priorityBreakdown[trigger.priority] || 0) + 1;
    analyticsData.personaBreakdown[trigger.recommendedPersona] =
      (analyticsData.personaBreakdown[trigger.recommendedPersona] || 0) + 1;
    analyticsData.confidenceSum += trigger.confidence;
  }
}

/**
 * Get synthesis analytics
 */
export function getSynthesisAnalytics(): SynthesisAnalytics {
  const mostCommonTriggers = Object.entries(analyticsData.triggerCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalTriggersGenerated: analyticsData.totalGenerated,
    byCategory: analyticsData.categoryBreakdown as Record<SynthesisTrigger['category'], number>,
    byPriority: analyticsData.priorityBreakdown as Record<SynthesisTrigger['priority'], number>,
    byPersona: analyticsData.personaBreakdown,
    averageConfidence:
      analyticsData.totalGenerated > 0
        ? analyticsData.confidenceSum / analyticsData.totalGenerated
        : 0,
    mostCommonTriggers,
  };
}

/**
 * Reset analytics (for testing)
 */
export function resetSynthesisAnalytics(): void {
  analyticsData = {
    triggerCounts: {},
    totalGenerated: 0,
    categoryBreakdown: {},
    priorityBreakdown: {},
    personaBreakdown: {},
    confidenceSum: 0,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  allTriggerTemplates,
  supportTriggerTemplates,
  celebrationTriggerTemplates,
  warningTriggerTemplates,
  nuancedTriggerTemplates,
};

export type { TriggerTemplate, SynthesisAnalytics };
