/**
 * Four Tendencies Framework
 *
 * Gretchen Rubin's personality framework for understanding
 * how people respond to expectations.
 *
 * @module habit-coaching/tendencies
 */

// ============================================================================
// FOUR TENDENCIES - Gretchen Rubin's personality framework
// ============================================================================

export const FOUR_TENDENCIES_STRATEGIES = {
  upholder: {
    name: 'Upholder',
    description:
      'You meet both outer expectations (from others) and inner expectations (from yourself). You love schedules, to-do lists, and clear rules.',
    habitStrategies: [
      'Set clear rules and schedules for yourself',
      'Create detailed to-do lists and check them off',
      'Use habit tracking apps religiously',
      'Set personal deadlines and honor them',
      'Create routines and stick to them',
    ],
    avoid: [
      "Don't be too rigid - allow for flexibility",
      'Watch out for "tightening" - making rules stricter over time',
      'Remember that rest and fun are also "productive"',
    ],
    motivationTip:
      'You respond to clear expectations. Put your habits on your calendar and treat them as non-negotiable appointments.',
  },
  questioner: {
    name: 'Questioner',
    description:
      'You question all expectations and only follow through if you have good reasons. You need to understand WHY before you commit.',
    habitStrategies: [
      'Research the science behind habits before starting',
      'Understand exactly WHY this habit matters',
      'Set your own goals based on your reasoning',
      'Question advice and customize to fit your logic',
      'Track data to prove the habit is working',
    ],
    avoid: [
      'Analysis paralysis - at some point, just start',
      'Questioning to the point of decision fatigue',
      "Rejecting good advice just because you didn't come up with it",
    ],
    motivationTip:
      "You need to buy into the WHY. Once you truly believe a habit serves your goals, you'll follow through. Do the research first.",
  },
  obliger: {
    name: 'Obliger',
    description:
      'You meet outer expectations (for others) but struggle with inner expectations (for yourself). You need external accountability.',
    habitStrategies: [
      'Get an accountability partner or coach',
      'Join a group or class with attendance expectations',
      "Make appointments you can't cancel",
      'Tell others about your goals publicly',
      'Set up external consequences (like charitable donations if you miss)',
    ],
    avoid: [
      'Obliger rebellion - pushing yourself too hard until you snap',
      "Saying yes to everyone else's needs before your own",
      'Feeling guilty for needing external accountability',
    ],
    motivationTip:
      "Your superpower is following through for others. Harness this by creating external accountability structures. This isn't weakness - it's self-knowledge.",
  },
  rebel: {
    name: 'Rebel',
    description:
      'You resist ALL expectations, both outer and inner. You want to act from freedom and choice, doing things your way.',
    habitStrategies: [
      'Frame habits as choices, not rules ("I can" not "I must")',
      'Connect habits to your identity ("I\'m someone who...")',
      'Maintain freedom and options within the habit',
      'Challenge yourself to prove you CAN do it',
      'Make the habit feel like defiance of limitation',
    ],
    avoid: [
      "Don't set rigid rules - they'll trigger resistance",
      'Avoid tracking streaks - they feel like obligations',
      "Don't let others tell you what to do",
    ],
    motivationTip:
      'Frame every habit as YOUR choice that expresses who you are. "I\'m the kind of person who..." works better than any rule. You do things because you WANT to, not because you should.',
  },
} as const;

export type FourTendency = keyof typeof FOUR_TENDENCIES_STRATEGIES;

// ============================================================================
// TENDENCY DETECTION HELPERS
// ============================================================================

/**
 * Get strategy recommendations based on tendency
 */
export function getTendencyStrategies(tendency: FourTendency): readonly string[] {
  return FOUR_TENDENCIES_STRATEGIES[tendency].habitStrategies;
}

/**
 * Get things to avoid based on tendency
 */
export function getTendencyAvoid(tendency: FourTendency): readonly string[] {
  return FOUR_TENDENCIES_STRATEGIES[tendency].avoid;
}

/**
 * Get motivation tip for tendency
 */
export function getTendencyMotivation(tendency: FourTendency): string {
  return FOUR_TENDENCIES_STRATEGIES[tendency].motivationTip;
}
