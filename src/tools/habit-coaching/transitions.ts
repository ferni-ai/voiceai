/**
 * Life Transition Support
 *
 * Coaching support for major life transitions that disrupt habits.
 *
 * @module habit-coaching/transitions
 */

import type { LifeTransitionSupport } from './types.js';

// ============================================================================
// LIFE TRANSITION SUPPORT
// ============================================================================

export const LIFE_TRANSITION_SUPPORT: Record<string, LifeTransitionSupport> = {
  new_job: {
    name: 'New Job',
    validation:
      'Starting a new job is exciting AND exhausting. Your entire routine has been disrupted.',
    expectations: [
      'First 90 days are the hardest',
      'Energy will be depleted from learning',
      'Old habits may slip - this is normal',
      "You'll need to rebuild your routine around new schedule",
    ],
    habitsToProtect: ['Sleep (non-negotiable)', 'One form of exercise', 'One stress relief habit'],
    habitsToPause: ['Ambitious new habits', 'Complex routines', 'Anything non-essential'],
    habitsToAdd: [
      'Evening decompression ritual',
      'Weekly planning session',
      'Simple morning anchor',
    ],
    priorityOrder: ['Sleep', 'Basic health', 'Job performance', 'Everything else later'],
    adjustmentPeriod: '3-6 months for full adjustment',
    selfCareNote:
      "Be gentle with yourself. You're not lazy - you're adapting. Survival mode is okay temporarily.",
  },

  job_loss: {
    name: 'Job Loss',
    validation:
      "Losing a job is a grief experience. Even if you're relieved, the loss of structure and identity is real.",
    expectations: [
      'Emotional rollercoaster is normal',
      'Structure disappears - this can be disorienting',
      'Self-worth may feel shaky',
      'This is temporary, even when it feels permanent',
    ],
    habitsToProtect: [
      'Daily structure (wake time, meals)',
      'Social connection',
      'Physical movement',
    ],
    habitsToPause: ['Expensive habits', 'Energy-draining commitments'],
    habitsToAdd: [
      'Daily job search routine (2-3 hours max)',
      'Self-care non-negotiables',
      'Weekly reflection and adjustment',
    ],
    priorityOrder: ['Mental health', 'Daily structure', 'Job search', 'Self-care'],
    adjustmentPeriod: 'Variable - focus on daily wins',
    selfCareNote:
      "Job searching IS a job. Limit it to prevent burnout. You're more than your employment status.",
  },

  new_baby: {
    name: 'New Baby',
    validation:
      'Having a baby changes everything. Literally everything. Your old life is gone - a new one is beginning.',
    expectations: [
      'Sleep deprivation is real and affects everything',
      'Your old routines are not possible right now',
      'Survival mode is the only mode',
      'This intense phase is temporary (even though it feels endless)',
    ],
    habitsToProtect: ['Sleep whenever possible', 'Basic nutrition', 'Partner connection'],
    habitsToPause: ['Exercise goals', 'Career ambitions', 'Social obligations', 'Perfect anything'],
    habitsToAdd: [
      'Micro-moments of self-care (5 min max)',
      'Asking for help',
      'Celebrating small wins',
    ],
    priorityOrder: ['Baby survival', 'Your survival', 'Relationship', 'Everything else can wait'],
    adjustmentPeriod: '12-18 months for "new normal"',
    selfCareNote:
      'You are doing the hardest job in the world. Showering counts as an accomplishment. Lower the bar radically.',
  },

  new_relationship: {
    name: 'New Relationship',
    validation:
      "New relationships are wonderful AND can disrupt routines. It's normal to want to spend all your time together.",
    expectations: [
      'Honeymoon phase affects priorities',
      "Your solo routines may slip - that's okay",
      'Finding balance takes time',
      'Your identity and habits matter too',
    ],
    habitsToProtect: [
      'Non-negotiable health habits',
      'Friend connections',
      'Personal identity habits',
    ],
    habitsToPause: ['Rigid solo routines'],
    habitsToAdd: [
      'Shared habits with partner',
      'Communication rituals',
      'Maintaining individual time',
    ],
    priorityOrder: ['Relationship investment', 'Core identity habits', 'Health', 'Social balance'],
    adjustmentPeriod: '3-6 months to find balance',
    selfCareNote:
      "It's okay to be obsessed at first. Just don't lose yourself completely. You were amazing before this person too.",
  },

  breakup: {
    name: 'Breakup/Divorce',
    validation:
      "Ending a relationship is a loss, even if it's the right choice. Grief, relief, and everything in between are valid.",
    expectations: [
      'Emotional waves will come and go',
      'Routines built around the relationship will feel empty',
      'Identity reconstruction takes time',
      'Loneliness is part of the process',
    ],
    habitsToProtect: ['Social connection (reach out)', 'Physical health basics', 'Daily structure'],
    habitsToPause: ['Major decisions', 'New relationships (rebound alert)'],
    habitsToAdd: [
      'Processing rituals (journal, therapy)',
      'Self-discovery activities',
      'Friend time',
    ],
    priorityOrder: [
      'Emotional processing',
      'Basic self-care',
      'Social support',
      'Future planning later',
    ],
    adjustmentPeriod: '6-12 months for healing (varies widely)',
    selfCareNote:
      "There's no timeline for healing. Some days will feel like progress, others like setbacks. Both are part of it.",
  },

  moving: {
    name: 'Moving',
    validation:
      "Moving disrupts everything - your physical space, your routines, your sense of place. It's a bigger deal than people acknowledge.",
    expectations: [
      'Chaos before, during, and after the move',
      'Old habits have no cues in new environment',
      "It takes months to feel 'home'",
      'Rebuilding routines takes intentional effort',
    ],
    habitsToProtect: ['Sleep schedule', 'One health habit', 'Connection to support system'],
    habitsToPause: ['Perfection in any area', 'Non-essential commitments'],
    habitsToAdd: [
      'Exploring new environment',
      'Creating new cues for habits',
      'Building new community',
    ],
    priorityOrder: [
      'Basic functioning',
      'Making space livable',
      'Rebuilding routines',
      'Community',
    ],
    adjustmentPeriod: '3-6 months to feel settled',
    selfCareNote:
      'Living in chaos is temporary. Lower expectations radically during the transition.',
  },

  empty_nest: {
    name: 'Empty Nest',
    validation:
      'When kids leave, it can feel like losing your purpose. This is a real transition, not "just" an emotion.',
    expectations: [
      'Identity shift from parent-of-kids-at-home',
      'Unexpected grief even if you were ready',
      'Suddenly, you have time (and may not know what to do with it)',
      'Relationship with partner needs reinvention',
    ],
    habitsToProtect: [
      'Health (you have time now!)',
      'Relationship with partner',
      'Connection with kids (new form)',
    ],
    habitsToPause: ['Parent-identity habits'],
    habitsToAdd: ['New hobbies', 'Couple rituals', 'Personal rediscovery', 'Health focus'],
    priorityOrder: [
      'Relationship with partner',
      'Personal identity',
      'New interests',
      'Staying connected with kids',
    ],
    adjustmentPeriod: '6-12 months for major adjustment',
    selfCareNote: "You've earned this time. Reinventing yourself now isn't selfish, it's healthy.",
  },

  retirement: {
    name: 'Retirement',
    validation: 'Retirement is a massive transition. The loss of structure can be disorienting.',
    expectations: [
      'Identity shift from "doing" to "being"',
      'Days without structure can feel empty',
      'Health becomes primary focus',
      'This is a chance to live intentionally',
    ],
    habitsToProtect: [
      'Daily structure',
      'Social connection',
      'Physical activity',
      'Mental stimulation',
    ],
    habitsToPause: ['Work habits (obviously)'],
    habitsToAdd: ['Morning routine', 'Social calendar', 'Health appointments', 'Purpose projects'],
    priorityOrder: ['Health', 'Relationships', 'Purpose', 'Fun'],
    adjustmentPeriod: '1-2 years for full adjustment to retired identity',
    selfCareNote: 'Create structure intentionally. Without it, days can blur together.',
  },

  health_diagnosis: {
    name: 'Health Diagnosis',
    validation:
      "A health diagnosis changes everything. Whatever you're feeling is completely valid.",
    expectations: [
      'Overwhelm is normal',
      'Priorities will shift dramatically',
      'Some habits become essential, others irrelevant',
      'One day at a time',
    ],
    habitsToProtect: ['Medical adherence', 'Rest', 'Support system'],
    habitsToPause: ['Strenuous habits', 'Non-essential commitments'],
    habitsToAdd: ['Medical routine', 'Stress management', 'Support check-ins'],
    priorityOrder: [
      'Medical needs',
      'Rest and recovery',
      'Support system',
      'Everything else when ready',
    ],
    adjustmentPeriod: 'Varies widely by diagnosis',
    selfCareNote: 'Your only job right now is to take care of yourself. Everything else can wait.',
  },

  loss_grief: {
    name: 'Loss & Grief',
    validation:
      "Loss changes you forever. There's no timeline for grief, and no wrong way to feel.",
    expectations: [
      'Grief comes in waves',
      'Energy and motivation will vary wildly',
      'Habits may feel meaningless temporarily',
      "Slowly, you'll find new normal",
    ],
    habitsToProtect: ['Basic self-care', 'Connection with supporters', 'Sleep when possible'],
    habitsToPause: ['Ambitious goals', 'Anything that feels heavy'],
    habitsToAdd: [
      'Grief processing (therapy, journaling, rituals)',
      'Gentle movement',
      'Support check-ins',
    ],
    priorityOrder: [
      'Basic survival',
      'Processing grief',
      'Support network',
      'Everything else later',
    ],
    adjustmentPeriod: 'Grief has no timeline. Be patient with yourself.',
    selfCareNote:
      'There\'s no "getting over it." There\'s growing around it. Take all the time you need.',
  },

  graduation: {
    name: 'Graduation',
    validation: 'Graduation is exciting and terrifying. Suddenly, structure disappears.',
    expectations: [
      'Loss of built-in structure',
      'Identity in flux',
      'Comparison trap is real',
      'Building your own life takes time',
    ],
    habitsToProtect: ['Morning routine', 'Social connection', 'Physical health'],
    habitsToPause: ['School-related habits'],
    habitsToAdd: [
      'Daily structure',
      'Job search routine',
      'Financial awareness',
      'Adult life skills',
    ],
    priorityOrder: [
      'Basic structure',
      'Next step (job, grad school)',
      'Relationships',
      'Personal development',
    ],
    adjustmentPeriod: '6-12 months for post-graduation adjustment',
    selfCareNote: "Everyone's path looks different. Focus on your own journey.",
  },

  promotion: {
    name: 'Promotion',
    validation: 'Congrats on the promotion! New responsibility = new capacity demands.',
    expectations: [
      'Learning curve ahead',
      'More demands on time and energy',
      'Imposter syndrome is normal',
      'Old routines may need to evolve',
    ],
    habitsToProtect: ['Recovery time', 'Relationships', 'Health basics'],
    habitsToPause: ['Time-intensive side projects'],
    habitsToAdd: ['Leadership development', 'Delegation skills', 'Boundary setting'],
    priorityOrder: ['Mastering new role', 'Health', 'Relationships', 'Personal growth'],
    adjustmentPeriod: '3-6 months to feel comfortable in new role',
    selfCareNote: "You were promoted because you're capable. Trust yourself.",
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get transition support by type
 */
export function getTransitionSupport(transition: string): LifeTransitionSupport | undefined {
  return LIFE_TRANSITION_SUPPORT[transition];
}

/**
 * Get all available transition types
 */
export function getTransitionTypes(): string[] {
  return Object.keys(LIFE_TRANSITION_SUPPORT);
}
