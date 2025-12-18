/**
 * Proactive Values Surfacing
 *
 * > "A truly principal-aligned agent proactively surfaces values conflicts, not just when asked."
 *
 * This system monitors for situations where a user's stated values conflict with their
 * proposed actions or decisions, and surfaces these conflicts before they become problems.
 *
 * Key insight: Users don't always see their own contradictions. A good coach helps them see.
 *
 * @module @ferni/principal-alignment/values-surfacing
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ValuesAlignmentResult, ValuesConflictType } from './types.js';

const log = createLogger({ module: 'ValuesSurfacing' });

// ============================================================================
// VALUE CATEGORIES AND KEYWORDS
// ============================================================================

/**
 * Categories of values and their associated keywords
 */
const VALUE_CATEGORIES: Record<string, string[]> = {
  // Relationships
  family: [
    'family',
    'kids',
    'children',
    'spouse',
    'partner',
    'parents',
    'siblings',
    'marriage',
    'relationship',
  ],
  friendship: ['friends', 'friendship', 'connection', 'community', 'social', 'belonging'],
  love: ['love', 'care', 'affection', 'intimacy', 'closeness', 'bond'],

  // Character
  honesty: [
    'honest',
    'honesty',
    'truth',
    'truthful',
    'authentic',
    'genuine',
    'transparent',
    'integrity',
  ],
  kindness: ['kind', 'kindness', 'compassion', 'empathy', 'caring', 'generous', 'giving'],
  courage: ['courage', 'brave', 'bravery', 'bold', 'fearless', 'risk-taking'],
  responsibility: ['responsible', 'responsibility', 'accountable', 'reliable', 'dependable'],

  // Growth
  learning: ['learn', 'learning', 'growth', 'education', 'knowledge', 'wisdom', 'improvement'],
  creativity: ['creative', 'creativity', 'art', 'expression', 'innovation', 'imagination'],
  achievement: ['achieve', 'achievement', 'success', 'accomplish', 'goals', 'ambition'],

  // Wellbeing
  health: ['health', 'healthy', 'wellness', 'fitness', 'physical', 'mental health', 'self-care'],
  peace: ['peace', 'calm', 'serenity', 'balance', 'mindfulness', 'stress-free'],
  happiness: ['happy', 'happiness', 'joy', 'fulfillment', 'satisfaction', 'contentment'],

  // Security
  financial_security: [
    'financial',
    'security',
    'stability',
    'savings',
    'retirement',
    'money',
    'wealth',
  ],
  safety: ['safe', 'safety', 'security', 'protection', 'stability'],

  // Freedom
  independence: ['independent', 'independence', 'autonomy', 'freedom', 'self-reliant'],
  adventure: ['adventure', 'travel', 'exploration', 'experience', 'spontaneous'],

  // Purpose
  meaning: ['meaning', 'purpose', 'significance', 'impact', 'legacy', 'contribution'],
  spirituality: ['spiritual', 'spirituality', 'faith', 'religion', 'belief', 'soul'],
};

/**
 * Actions that typically conflict with specific values
 */
const VALUE_CONFLICTS: Record<string, Array<{ pattern: RegExp; description: string }>> = {
  family: [
    {
      pattern: /(?:skip|miss|cancel) (?:dinner|time|event) with/i,
      description: 'Prioritizing other things over family time',
    },
    {
      pattern: /(?:too busy|no time) for (?:family|kids|them)/i,
      description: 'Deprioritizing family',
    },
    {
      pattern: /(?:work|job|money) (?:more important|comes first)/i,
      description: 'Putting work above family',
    },
  ],
  honesty: [
    {
      pattern: /(?:don't tell|not tell|hide|keep secret)/i,
      description: 'Withholding truth from someone',
    },
    {
      pattern: /(?:little white lie|just lie|easier to lie)/i,
      description: 'Considering deception',
    },
    { pattern: /(?:doesn't need to know|keep from them)/i, description: 'Planning concealment' },
  ],
  health: [
    {
      pattern: /(?:skip|stop|quit) (?:gym|exercise|workout|medication)/i,
      description: 'Abandoning health habits',
    },
    {
      pattern: /(?:just one|a few|couple) (?:drinks?|cigarettes?|more)/i,
      description: 'Rationalizing unhealthy behavior',
    },
    {
      pattern: /(?:don't have time|too tired) (?:to exercise|to cook|for health)/i,
      description: 'Deprioritizing health',
    },
  ],
  financial_security: [
    {
      pattern: /(?:spend|buy|get) (?:it anyway|even though|don't need)/i,
      description: 'Impulsive spending',
    },
    {
      pattern: /(?:use|tap into|withdraw) (?:savings|retirement|emergency)/i,
      description: 'Depleting safety net',
    },
    {
      pattern: /(?:gamble|bet|invest) (?:everything|all|too much)/i,
      description: 'Risky financial behavior',
    },
  ],
  kindness: [
    {
      pattern: /(?:they deserve|let them|make them) (?:suffer|feel bad|hurt)/i,
      description: 'Vengeful thinking',
    },
    {
      pattern: /(?:don't care|not my problem|their fault)/i,
      description: "Dismissing others' struggles",
    },
  ],
  responsibility: [
    {
      pattern: /(?:not my|someone else's|their) (?:fault|responsibility|problem)/i,
      description: 'Avoiding responsibility',
    },
    { pattern: /(?:blame|let) (?:them|someone else|others)/i, description: 'Deflecting blame' },
  ],
  peace: [
    { pattern: /(?:confront|fight|argue|attack)/i, description: 'Choosing conflict over peace' },
    { pattern: /(?:revenge|get back at|make them pay)/i, description: 'Seeking revenge' },
  ],
  meaning: [
    { pattern: /(?:just a job|doesn't matter|who cares)/i, description: 'Dismissing significance' },
    {
      pattern: /(?:going through motions|just getting by)/i,
      description: 'Disengagement from purpose',
    },
  ],
};

// ============================================================================
// USER VALUES TRACKING
// ============================================================================

interface UserValuesProfile {
  userId: string;
  statedValues: Array<{
    value: string;
    category: string;
    confidence: number;
    lastMentioned: number;
  }>;
  conflictsDetected: Array<{
    value: string;
    action: string;
    timestamp: number;
    surfaced: boolean;
    userResponse?: 'acknowledged' | 'dismissed' | 'thanked';
  }>;
  lastUpdated: number;
}

const userValuesProfiles = new Map<string, UserValuesProfile>();

// ============================================================================
// VALUE EXTRACTION
// ============================================================================

/**
 * Extract values from user message
 */
export function extractValues(userId: string, userMessage: string): string[] {
  const extractedValues: string[] = [];
  const messageLower = userMessage.toLowerCase();

  // Patterns that indicate value statements
  const valueStatementPatterns = [
    /(?:i|really) (?:value|care about|believe in|prioritize)/i,
    /(?:important to me|matters to me|what i care about)/i,
    /(?:family|health|honesty) (?:is|are) (?:important|everything|my priority)/i,
  ];

  const isValueStatement = valueStatementPatterns.some((p) => p.test(userMessage));

  for (const [category, keywords] of Object.entries(VALUE_CATEGORIES)) {
    for (const keyword of keywords) {
      if (messageLower.includes(keyword)) {
        // Higher confidence if explicit value statement
        const confidence = isValueStatement ? 0.9 : 0.5;
        extractedValues.push(category);

        // Update user profile
        updateUserValue(userId, category, keyword, confidence);
        break;
      }
    }
  }

  return [...new Set(extractedValues)];
}

/**
 * Update user's values profile
 */
function updateUserValue(
  userId: string,
  category: string,
  keyword: string,
  confidence: number
): void {
  let profile = userValuesProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      statedValues: [],
      conflictsDetected: [],
      lastUpdated: Date.now(),
    };
    userValuesProfiles.set(userId, profile);
  }

  const existing = profile.statedValues.find((v) => v.category === category);
  if (existing) {
    existing.confidence = Math.min(1, existing.confidence + 0.1);
    existing.lastMentioned = Date.now();
  } else {
    profile.statedValues.push({
      value: keyword,
      category,
      confidence,
      lastMentioned: Date.now(),
    });
  }

  profile.lastUpdated = Date.now();
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Analyze user message for values conflicts
 */
export function analyzeValuesAlignment(
  userId: string,
  userMessage: string,
  context: {
    currentTopic?: string;
    statedValues?: string[];
  } = {}
): ValuesAlignmentResult {
  const profile = userValuesProfiles.get(userId);

  // Combine profile values with context-provided values
  const userValues = [
    ...(profile?.statedValues.map((v) => v.category) || []),
    ...(context.statedValues || []),
  ];

  if (userValues.length === 0) {
    return {
      hasConflict: false,
      conflictType: null,
      conflictingValues: [],
      conflictingAction: null,
      significance: 'minor',
      shouldSurface: false,
      surfacingApproach: null,
      reflectionQuestion: null,
    };
  }

  // Check for conflicts with each stated value
  let detectedConflict: {
    value: string;
    action: string;
    type: ValuesConflictType;
    significance: 'minor' | 'moderate' | 'significant' | 'major';
  } | null = null;

  for (const value of userValues) {
    const conflicts = VALUE_CONFLICTS[value] || [];

    for (const { pattern, description } of conflicts) {
      if (pattern.test(userMessage)) {
        detectedConflict = {
          value,
          action: description,
          type: 'stated_vs_action',
          significance: determineSignificance(value, description, profile),
        };
        break;
      }
    }

    if (detectedConflict) break;
  }

  // Also check for short-term vs long-term conflicts
  if (!detectedConflict) {
    const shortTermConflict = detectShortVsLongTermConflict(userMessage, userValues);
    if (shortTermConflict) {
      detectedConflict = shortTermConflict;
    }
  }

  if (!detectedConflict) {
    return {
      hasConflict: false,
      conflictType: null,
      conflictingValues: [],
      conflictingAction: null,
      significance: 'minor',
      shouldSurface: false,
      surfacingApproach: null,
      reflectionQuestion: null,
    };
  }

  // Determine if we should surface this
  const shouldSurface = detectedConflict.significance !== 'minor';

  // Generate surfacing approach and reflection question
  const surfacingApproach = shouldSurface ? generateSurfacingApproach(detectedConflict) : null;
  const reflectionQuestion = shouldSurface ? generateReflectionQuestion(detectedConflict) : null;

  // Record conflict if detected
  if (profile && detectedConflict) {
    profile.conflictsDetected.push({
      value: detectedConflict.value,
      action: detectedConflict.action,
      timestamp: Date.now(),
      surfaced: shouldSurface,
    });
    profile.lastUpdated = Date.now();
  }

  log.debug(
    {
      userId,
      hasConflict: true,
      value: detectedConflict.value,
      action: detectedConflict.action,
      significance: detectedConflict.significance,
      shouldSurface,
    },
    'Values alignment analyzed'
  );

  return {
    hasConflict: true,
    conflictType: detectedConflict.type,
    conflictingValues: [detectedConflict.value],
    conflictingAction: detectedConflict.action,
    significance: detectedConflict.significance,
    shouldSurface,
    surfacingApproach,
    reflectionQuestion,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function determineSignificance(
  value: string,
  action: string,
  profile: UserValuesProfile | undefined
): 'minor' | 'moderate' | 'significant' | 'major' {
  // High-stakes values
  const highStakesValues = ['family', 'health', 'honesty', 'financial_security'];
  const isHighStakes = highStakesValues.includes(value);

  // Frequent mentions indicate higher importance
  const valueData = profile?.statedValues.find((v) => v.category === value);
  const isHighConfidence = valueData && valueData.confidence > 0.7;

  // Previous conflicts with same value
  const previousConflicts = profile?.conflictsDetected.filter((c) => c.value === value).length || 0;
  const isPattern = previousConflicts >= 2;

  if (isHighStakes && (isHighConfidence || isPattern)) return 'major';
  if (isHighStakes || isPattern) return 'significant';
  if (isHighConfidence) return 'moderate';
  return 'minor';
}

function detectShortVsLongTermConflict(
  message: string,
  values: string[]
): {
  value: string;
  action: string;
  type: ValuesConflictType;
  significance: 'minor' | 'moderate' | 'significant' | 'major';
} | null {
  const shortTermPatterns = [
    {
      pattern: /(?:just this once|one time|won't matter)/i,
      description: 'Rationalizing exception',
    },
    {
      pattern: /(?:deal with|worry about) (?:it|that) later/i,
      description: 'Deferring consequences',
    },
    {
      pattern: /(?:feel like it|want to|need to) (?:now|right now)/i,
      description: 'Prioritizing immediate desire',
    },
  ];

  for (const { pattern, description } of shortTermPatterns) {
    if (pattern.test(message)) {
      // Check if this might conflict with long-term values
      const longTermValues = ['financial_security', 'health', 'family', 'meaning'];
      const relevantValue = values.find((v) => longTermValues.includes(v));

      if (relevantValue) {
        return {
          value: relevantValue,
          action: description,
          type: 'short_vs_long_term',
          significance: 'moderate',
        };
      }
    }
  }

  return null;
}

function generateSurfacingApproach(conflict: {
  value: string;
  action: string;
  type: ValuesConflictType;
}): string {
  const approaches: Record<ValuesConflictType, string[]> = {
    stated_vs_action: [
      `I notice you've said ${conflict.value} is important to you. I'm curious how this connects with that.`,
      `Can I gently ask—you've mentioned valuing ${conflict.value}. How does this fit with that?`,
      `Something feels off between what you're describing and what you've said matters to you. Can we explore that?`,
    ],
    priority_conflict: [
      `It sounds like two things you value might be in tension here. Can we look at that?`,
      `I'm hearing a conflict between two things that matter to you. Want to unpack that?`,
    ],
    means_vs_ends: [
      `The goal makes sense, but I'm wondering about how you're planning to get there.`,
      `What you want is clear—I'm curious if the path aligns with who you want to be.`,
    ],
    short_vs_long_term: [
      `This seems like a trade-off between now and later. What would future you think?`,
      `I hear the pull to do this now. What's the cost to the things you've said matter long-term?`,
    ],
    self_vs_others: [
      `I hear what you want, and I'm also thinking about how this lands for others involved.`,
      `What would this mean for the people affected?`,
    ],
  };

  const options = approaches[conflict.type] || approaches.stated_vs_action;
  return options[Math.floor(Math.random() * options.length)];
}

function generateReflectionQuestion(conflict: { value: string; action: string }): string {
  const questions: Record<string, string[]> = {
    family: [
      'What would this mean for your relationship with your family?',
      'If your kids/family could see this decision, what would they think?',
    ],
    honesty: [
      'What would it mean to handle this with complete honesty?',
      'How would you feel if this came out later?',
    ],
    health: [
      'How does this serve your health goals?',
      'What would choosing differently mean for your wellbeing?',
    ],
    financial_security: [
      'How does this align with your financial goals?',
      'What would this decision look like from a position of financial security?',
    ],
    default: [
      'What would the version of you that fully lives by this value do?',
      'Is this who you want to be?',
    ],
  };

  const options = questions[conflict.value] || questions.default;
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// USER PROFILE ACCESS
// ============================================================================

/**
 * Get user's values profile
 */
export function getUserValuesProfile(userId: string): UserValuesProfile | null {
  return userValuesProfiles.get(userId) || null;
}

/**
 * Get user's top stated values
 */
export function getTopValues(userId: string, count: number = 3): string[] {
  const profile = userValuesProfiles.get(userId);
  if (!profile) return [];

  return profile.statedValues
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
    .map((v) => v.category);
}

/**
 * Set user's stated values (from external source like onboarding)
 */
export function setUserValues(userId: string, values: string[]): void {
  let profile = userValuesProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      statedValues: [],
      conflictsDetected: [],
      lastUpdated: Date.now(),
    };
    userValuesProfiles.set(userId, profile);
  }

  for (const value of values) {
    // Find matching category
    for (const [category, keywords] of Object.entries(VALUE_CATEGORIES)) {
      if (
        keywords.some((k) => value.toLowerCase().includes(k)) ||
        category === value.toLowerCase()
      ) {
        updateUserValue(userId, category, value, 0.9);
        break;
      }
    }
  }
}

/**
 * Clear user data
 */
export function clearUserValuesData(userId: string): void {
  userValuesProfiles.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { VALUE_CATEGORIES, VALUE_CONFLICTS };
