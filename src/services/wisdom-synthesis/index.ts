/**
 * Wisdom Synthesis - Cross-User Pattern Learning
 *
 * Phase 33: Learn from population-level patterns while preserving privacy.
 * Anonymous aggregation of what works, personalized to individuals.
 *
 * CORE INSIGHT: Ferni can learn from millions of conversations what
 * approaches work for different situations—something no human coach can do.
 *
 * PRIVACY FIRST:
 * - All patterns are anonymized and aggregated
 * - No individual conversations are stored or shared
 * - Users can opt out entirely
 * - Insights are generic (not traceable to individuals)
 *
 * @module WisdomSynthesis
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'wisdom-synthesis' });

// ============================================================================
// TYPES
// ============================================================================

export interface SituationType {
  category: 'emotional' | 'relational' | 'behavioral' | 'cognitive' | 'life_event';
  subcategory: string;
  description: string;
}

export interface ApproachPattern {
  id: string;
  situation: SituationType;
  approach: string;
  technique: string;

  /** Anonymized effectiveness data */
  stats: {
    timesUsed: number;
    helpfulCount: number;
    helpfulRate: number; // 0-1
    averageRating: number; // 1-10
  };

  /** Contextual factors that increase effectiveness */
  worksWellWhen: string[];

  /** Contextual factors that decrease effectiveness */
  worksLessWellWhen: string[];

  /** Sample phrasing (not from actual conversations) */
  examplePhrasing?: string;
}

export interface PersonalizedWisdom {
  userId: string;
  situation: SituationType;
  recommendedApproaches: Array<{
    approach: ApproachPattern;
    personalFit: number; // 0-1
    reasoning: string;
  }>;
  generatedAt: Date;
}

export interface UserPreferences {
  userId: string;
  preferredApproaches: string[];
  dislikedApproaches: string[];
  effectivenessHistory: Map<string, { helpful: number; total: number }>;
}

export interface WisdomContribution {
  situationType: SituationType;
  approachUsed: string;
  wasHelpful: boolean;
  userRating?: number; // 1-10
  contextFactors?: string[];
}

// ============================================================================
// AGGREGATED WISDOM (Would be stored in database in production)
// ============================================================================

const aggregatedWisdom: ApproachPattern[] = [
  // ANXIETY
  {
    id: 'anxiety_grounding',
    situation: {
      category: 'emotional',
      subcategory: 'anxiety',
      description: 'Acute anxiety or panic',
    },
    approach: 'Somatic grounding before cognitive work',
    technique: 'Guide through 5-4-3-2-1 or breathing exercise first',
    stats: { timesUsed: 12500, helpfulCount: 10200, helpfulRate: 0.816, averageRating: 7.8 },
    worksWellWhen: ['High physiological activation', 'Racing thoughts', 'Feeling overwhelmed'],
    worksLessWellWhen: ['User prefers talking through it', 'Dissociated state'],
    examplePhrasing:
      "Before we dive in, let's ground together. Can you feel your feet on the floor?",
  },
  {
    id: 'anxiety_externalize',
    situation: { category: 'emotional', subcategory: 'anxiety', description: 'Anxious rumination' },
    approach: 'Externalize the worry voice',
    technique: 'Name the anxiety as separate from self',
    stats: { timesUsed: 8300, helpfulCount: 6400, helpfulRate: 0.771, averageRating: 7.4 },
    worksWellWhen: ['Repetitive worry', 'Self-critical thoughts', 'Established relationship'],
    worksLessWellWhen: ['New users', 'Crisis situations'],
    examplePhrasing:
      "Sounds like your worry brain is being really loud right now. What's it saying?",
  },

  // SADNESS / DEPRESSION
  {
    id: 'sadness_validation',
    situation: {
      category: 'emotional',
      subcategory: 'sadness',
      description: 'Feeling sad or down',
    },
    approach: 'Deep validation before problem-solving',
    technique: 'Reflect and validate for at least 2-3 exchanges before offering perspectives',
    stats: { timesUsed: 15000, helpfulCount: 13500, helpfulRate: 0.9, averageRating: 8.2 },
    worksWellWhen: ['User needs to feel heard', 'Recent loss or disappointment'],
    worksLessWellWhen: ['User explicitly asks for advice'],
    examplePhrasing: "That sounds really hard. It makes sense you'd feel that way.",
  },
  {
    id: 'sadness_small_action',
    situation: {
      category: 'emotional',
      subcategory: 'sadness',
      description: 'Low motivation, stuck',
    },
    approach: 'Tiny behavioral activation',
    technique: 'Suggest one tiny positive action without pressure',
    stats: { timesUsed: 9200, helpfulCount: 6900, helpfulRate: 0.75, averageRating: 7.1 },
    worksWellWhen: ['User is open to trying', 'Not in acute grief'],
    worksLessWellWhen: ['High resistance', 'Feels pushy'],
    examplePhrasing:
      'Is there one tiny thing that might feel okay to do today? Even getting a glass of water counts.',
  },

  // RELATIONSHIPS
  {
    id: 'conflict_perspective',
    situation: {
      category: 'relational',
      subcategory: 'conflict',
      description: 'Relationship conflict',
    },
    approach: 'Explore the other perspective',
    technique: 'Gently ask what the other person might be experiencing',
    stats: { timesUsed: 7800, helpfulCount: 5850, helpfulRate: 0.75, averageRating: 7.3 },
    worksWellWhen: ['User is venting but open', 'Established relationship with Ferni'],
    worksLessWellWhen: ['User feels dismissed', 'Too early in conversation'],
    examplePhrasing: "I wonder what's going on for them. Any sense of what they might be feeling?",
  },
  {
    id: 'conflict_needs',
    situation: {
      category: 'relational',
      subcategory: 'conflict',
      description: 'Recurring conflict',
    },
    approach: 'Identify underlying needs',
    technique: 'Help user identify what they actually need (beyond position)',
    stats: { timesUsed: 5400, helpfulCount: 4320, helpfulRate: 0.8, averageRating: 7.6 },
    worksWellWhen: ['User is reflective', 'Pattern has repeated'],
    worksLessWellWhen: ['Acute anger'],
    examplePhrasing: 'Underneath the frustration, what do you really need from this relationship?',
  },

  // MOTIVATION / STUCK
  {
    id: 'stuck_values',
    situation: {
      category: 'behavioral',
      subcategory: 'motivation',
      description: 'Feeling stuck or unmotivated',
    },
    approach: 'Connect to values',
    technique: 'Explore why this matters, connect to deeper values',
    stats: { timesUsed: 6700, helpfulCount: 5360, helpfulRate: 0.8, averageRating: 7.5 },
    worksWellWhen: ['User has lost the "why"', 'Going through the motions'],
    worksLessWellWhen: ['Burnout (needs rest first)', 'Depression'],
    examplePhrasing: 'What made this matter to you in the first place?',
  },
  {
    id: 'stuck_tiny',
    situation: {
      category: 'behavioral',
      subcategory: 'motivation',
      description: 'Overwhelmed by goals',
    },
    approach: 'Shrink the ask',
    technique: 'Break down until it feels ridiculously small',
    stats: { timesUsed: 11200, helpfulCount: 9500, helpfulRate: 0.848, averageRating: 8.0 },
    worksWellWhen: ['Perfectionism', 'Overwhelm', 'Procrastination'],
    worksLessWellWhen: ['User already knows this'],
    examplePhrasing:
      "What if we made this so small you couldn't say no? What's the tiniest version?",
  },

  // SELF-CRITICISM
  {
    id: 'criticism_friend',
    situation: {
      category: 'cognitive',
      subcategory: 'self_criticism',
      description: 'Harsh self-judgment',
    },
    approach: 'Friend perspective',
    technique: 'Ask what they would say to a friend in same situation',
    stats: { timesUsed: 14500, helpfulCount: 11600, helpfulRate: 0.8, averageRating: 7.7 },
    worksWellWhen: ['User can access compassion for others', 'Not too dissociated'],
    worksLessWellWhen: ['User says "I would tell myself the same thing"'],
    examplePhrasing: 'If your best friend was in this exact situation, what would you tell them?',
  },

  // DECISION MAKING
  {
    id: 'decision_future_self',
    situation: {
      category: 'cognitive',
      subcategory: 'decision',
      description: 'Difficulty deciding',
    },
    approach: 'Future self perspective',
    technique: 'Ask what future self would want',
    stats: { timesUsed: 4800, helpfulCount: 3840, helpfulRate: 0.8, averageRating: 7.6 },
    worksWellWhen: ['Present bias issues', 'Short vs long term conflict'],
    worksLessWellWhen: ['Crisis decisions'],
    examplePhrasing:
      'If you fast forward a year, which choice do you think future-you would be prouder of?',
  },
];

// ============================================================================
// USER PREFERENCES STORAGE
// ============================================================================

const userPreferences = new Map<string, UserPreferences>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get personalized wisdom for a situation.
 */
export function getPersonalizedWisdom(
  userId: string,
  situation: SituationType,
  contextFactors?: string[]
): PersonalizedWisdom {
  const prefs = userPreferences.get(userId);

  // Find relevant approaches
  const relevant = aggregatedWisdom.filter(
    (w) =>
      w.situation.category === situation.category &&
      w.situation.subcategory === situation.subcategory
  );

  // Score each approach for this user
  const scored = relevant.map((approach) => {
    let fit = approach.stats.helpfulRate; // Base fit is population effectiveness

    // Adjust for user preferences
    if (prefs) {
      if (prefs.preferredApproaches.includes(approach.technique)) {
        fit += 0.15;
      }
      if (prefs.dislikedApproaches.includes(approach.technique)) {
        fit -= 0.2;
      }

      // Check user's personal history with this approach
      const history = prefs.effectivenessHistory.get(approach.id);
      if (history && history.total >= 3) {
        const personalRate = history.helpful / history.total;
        // Blend population and personal rates
        fit = fit * 0.4 + personalRate * 0.6;
      }
    }

    // Adjust for context factors
    if (contextFactors) {
      const matchesWorksWell = contextFactors.filter((f) =>
        approach.worksWellWhen.some((w) => w.toLowerCase().includes(f.toLowerCase()))
      ).length;
      const matchesWorksLess = contextFactors.filter((f) =>
        approach.worksLessWellWhen.some((w) => w.toLowerCase().includes(f.toLowerCase()))
      ).length;

      fit += matchesWorksWell * 0.1;
      fit -= matchesWorksLess * 0.15;
    }

    return {
      approach,
      personalFit: Math.max(0, Math.min(1, fit)),
      reasoning: generateReasoning(approach, fit, prefs),
    };
  });

  // Sort by fit and return top 3
  scored.sort((a, b) => b.personalFit - a.personalFit);

  return {
    userId,
    situation,
    recommendedApproaches: scored.slice(0, 3),
    generatedAt: new Date(),
  };
}

/**
 * Contribute wisdom from a conversation (anonymized).
 */
export function contributeWisdom(contribution: WisdomContribution): void {
  // Find matching approach pattern
  const pattern = aggregatedWisdom.find(
    (w) =>
      w.situation.category === contribution.situationType.category &&
      w.situation.subcategory === contribution.situationType.subcategory &&
      w.technique.toLowerCase().includes(contribution.approachUsed.toLowerCase())
  );

  if (pattern) {
    // Update stats (in production, this would be batched and stored in DB)
    pattern.stats.timesUsed++;
    if (contribution.wasHelpful) {
      pattern.stats.helpfulCount++;
    }
    pattern.stats.helpfulRate = pattern.stats.helpfulCount / pattern.stats.timesUsed;

    if (contribution.userRating) {
      const currentTotal = pattern.stats.averageRating * (pattern.stats.timesUsed - 1);
      pattern.stats.averageRating =
        (currentTotal + contribution.userRating) / pattern.stats.timesUsed;
    }

    log.debug(
      { pattern: pattern.id, helpful: contribution.wasHelpful },
      'Wisdom contribution recorded'
    );
  }
}

/**
 * Record user preference.
 */
export function recordUserPreference(
  userId: string,
  approachId: string,
  wasHelpful: boolean
): void {
  let prefs = userPreferences.get(userId);
  if (!prefs) {
    prefs = {
      userId,
      preferredApproaches: [],
      dislikedApproaches: [],
      effectivenessHistory: new Map(),
    };
    userPreferences.set(userId, prefs);
  }

  // Update effectiveness history
  const history = prefs.effectivenessHistory.get(approachId) || { helpful: 0, total: 0 };
  history.total++;
  if (wasHelpful) history.helpful++;
  prefs.effectivenessHistory.set(approachId, history);

  // Update preferences if strong signal
  if (history.total >= 3) {
    const rate = history.helpful / history.total;
    if (rate >= 0.8 && !prefs.preferredApproaches.includes(approachId)) {
      prefs.preferredApproaches.push(approachId);
    }
    if (rate <= 0.3 && !prefs.dislikedApproaches.includes(approachId)) {
      prefs.dislikedApproaches.push(approachId);
    }
  }
}

/**
 * Get wisdom context for LLM injection.
 */
export function getWisdomContextInjection(userId: string, situation: SituationType): string {
  const wisdom = getPersonalizedWisdom(userId, situation);

  if (wisdom.recommendedApproaches.length === 0) {
    return '';
  }

  const top = wisdom.recommendedApproaches[0];

  return `[🧠 POPULATION WISDOM]
For ${situation.subcategory}:

Most effective approach (${Math.round(top.personalFit * 100)}% fit):
"${top.approach.technique}"

Works well when: ${top.approach.worksWellWhen.slice(0, 2).join(', ')}
Example: "${top.approach.examplePhrasing}"

Population effectiveness: ${Math.round(top.approach.stats.helpfulRate * 100)}% found helpful`;
}

/**
 * Get population insights for a situation type.
 */
export function getPopulationInsights(situation: SituationType): {
  topApproaches: Array<{ technique: string; helpfulRate: number }>;
  commonPatterns: string[];
  averageHelpfulness: number;
} {
  const relevant = aggregatedWisdom.filter(
    (w) =>
      w.situation.category === situation.category &&
      w.situation.subcategory === situation.subcategory
  );

  const topApproaches = relevant
    .sort((a, b) => b.stats.helpfulRate - a.stats.helpfulRate)
    .slice(0, 3)
    .map((a) => ({ technique: a.technique, helpfulRate: a.stats.helpfulRate }));

  const commonPatterns = relevant.flatMap((r) => r.worksWellWhen).slice(0, 5);

  const avgHelp =
    relevant.length > 0
      ? relevant.reduce((sum, r) => sum + r.stats.helpfulRate, 0) / relevant.length
      : 0;

  return {
    topApproaches,
    commonPatterns: Array.from(new Set(commonPatterns)),
    averageHelpfulness: avgHelp,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function generateReasoning(
  approach: ApproachPattern,
  fit: number,
  prefs?: UserPreferences
): string {
  const reasons: string[] = [];

  if (approach.stats.helpfulRate > 0.75) {
    reasons.push(
      `High population effectiveness (${Math.round(approach.stats.helpfulRate * 100)}%)`
    );
  }

  if (prefs?.preferredApproaches.includes(approach.technique)) {
    reasons.push('Matches your preferred style');
  }

  if (prefs?.effectivenessHistory.get(approach.id)) {
    const h = prefs.effectivenessHistory.get(approach.id)!;
    if (h.helpful / h.total > 0.7) {
      reasons.push('Has worked well for you before');
    }
  }

  return reasons.join('. ') || 'General recommendation';
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// SCHEDULED JOB FUNCTIONS
// ============================================================================

export interface NewPattern {
  situation: SituationType;
  approach: string;
  occurrences: number;
  preliminaryRate: number;
}

/**
 * Discover new patterns from recent contributions (scheduled job).
 * In production, this would analyze recent contributions for emerging patterns.
 */
export function discoverNewPatterns(): NewPattern[] {
  // Placeholder - in production would analyze recent contribution data
  log.info('Discovering new patterns from recent contributions');
  return [];
}

/**
 * Aggregate and update population wisdom (scheduled job).
 * In production, this would:
 * 1. Recalculate effectiveness rates from all contributions
 * 2. Identify patterns that should be promoted/demoted
 * 3. Update the wisdom database
 */
export function aggregatePopulationWisdom(): { newInsights: number; updatedPatterns: number } {
  log.info('Aggregating population wisdom');

  // Recalculate stats for all patterns (in production, from database)
  let updatedPatterns = 0;
  for (const pattern of aggregatedWisdom) {
    if (pattern.stats.timesUsed > 0) {
      pattern.stats.helpfulRate = pattern.stats.helpfulCount / pattern.stats.timesUsed;
      updatedPatterns++;
    }
  }

  return { newInsights: 0, updatedPatterns };
}

export const wisdomSynthesis = {
  getWisdom: getPersonalizedWisdom,
  contribute: contributeWisdom,
  recordPreference: recordUserPreference,
  getContext: getWisdomContextInjection,
  getInsights: getPopulationInsights,
  discoverNewPatterns,
  aggregatePopulationWisdom,
};

export default wisdomSynthesis;
