/**
 * Contextual Variant Selection for Superhuman Experiments
 *
 * Selects experiment variants based on user context:
 * - Device type (mobile/tablet/desktop)
 * - Time of day and day of week
 * - User engagement level
 * - Traffic source
 * - Emotional state (if detected)
 * - Geographic context
 *
 * This enables personalized experiments where different users see
 * variants optimized for their context - a "better than human" capability.
 *
 * @module experiments/contextual-selector
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'contextual-selector' });

// ============================================================================
// Types
// ============================================================================

export interface UserContext {
  // Device context
  device?: 'mobile' | 'tablet' | 'desktop';
  browser?: string;
  os?: string;

  // Temporal context
  localHour?: number; // 0-23
  dayOfWeek?: number; // 0-6, Sunday = 0
  timezone?: string;

  // User behavior
  isNewUser?: boolean;
  isReturningToday?: boolean;
  sessionCount?: number;
  engagementLevel?: 'low' | 'medium' | 'high';
  timeOnSite?: number; // seconds

  // Traffic source
  source?: string; // 'organic' | 'paid' | 'social' | 'email' | 'direct'
  campaign?: string;
  referrer?: string;

  // Geographic
  country?: string;
  region?: string;
  language?: string;

  // Emotional (if detected from conversation)
  emotionalState?: 'curious' | 'skeptical' | 'excited' | 'anxious' | 'neutral';
  sentimentScore?: number; // -1 to 1

  // Custom attributes
  attributes?: Record<string, string | number | boolean>;
}

export interface ContextualVariant {
  id: string;
  baseWeight: number; // Base probability weight (0-100)
  contextConditions?: ContextCondition[];
}

export interface ContextCondition {
  field: keyof UserContext | string; // Field to check
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
  value: unknown;
  weightModifier: number; // Multiply weight by this when condition matches
}

export interface ContextModifier {
  name: string;
  description: string;
  conditions: ContextCondition[];
  apply: (context: UserContext) => number; // Returns weight multiplier
}

export interface ContextualVariantSelection {
  variantId: string;
  baseWeight: number;
  adjustedWeight: number;
  contextFactors: string[]; // Which context factors influenced selection
  confidence: number;
}

// ============================================================================
// Context Condition Evaluation
// ============================================================================

/**
 * Evaluate a single context condition against user context
 */
export function evaluateCondition(
  condition: ContextCondition,
  context: UserContext
): boolean {
  const fieldValue = getContextValue(context, condition.field);

  if (fieldValue === undefined || fieldValue === null) {
    return false;
  }

  switch (condition.operator) {
    case 'eq':
      return fieldValue === condition.value;
    case 'neq':
      return fieldValue !== condition.value;
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > (condition.value as number);
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < (condition.value as number);
    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= (condition.value as number);
    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= (condition.value as number);
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(condition.value as string);
    default:
      return false;
  }
}

/**
 * Get a value from context, supporting nested paths like "attributes.plan"
 */
function getContextValue(context: UserContext, field: string): unknown {
  const parts = field.split('.');
  let value: unknown = context;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

// ============================================================================
// Weight Calculation
// ============================================================================

/**
 * Calculate adjusted weights for all variants based on user context
 */
export function calculateContextualWeights(
  variants: ContextualVariant[],
  context: UserContext,
  modifiers: ContextModifier[] = []
): Map<string, { weight: number; factors: string[] }> {
  const result = new Map<string, { weight: number; factors: string[] }>();

  for (const variant of variants) {
    let weight = variant.baseWeight;
    const factors: string[] = [];

    // Apply variant-specific conditions
    if (variant.contextConditions) {
      for (const condition of variant.contextConditions) {
        if (evaluateCondition(condition, context)) {
          weight *= condition.weightModifier;
          factors.push(`${condition.field}:${condition.value}`);
        }
      }
    }

    // Apply global modifiers
    for (const modifier of modifiers) {
      const multiplier = modifier.apply(context);
      if (multiplier !== 1) {
        weight *= multiplier;
        factors.push(modifier.name);
      }
    }

    result.set(variant.id, { weight: Math.max(0, weight), factors });
  }

  return result;
}

/**
 * Select a variant using weighted random selection with context adjustments
 */
export function selectContextualVariant(
  variants: ContextualVariant[],
  context: UserContext,
  modifiers: ContextModifier[] = []
): ContextualVariantSelection {
  if (variants.length === 0) {
    throw new Error('Cannot select from empty variant list');
  }

  const weightedVariants = calculateContextualWeights(variants, context, modifiers);

  // Calculate total weight
  let totalWeight = 0;
  for (const { weight } of weightedVariants.values()) {
    totalWeight += weight;
  }

  // Handle edge case where all weights are 0
  if (totalWeight === 0) {
    const randomIndex = Math.floor(Math.random() * variants.length);
    return {
      variantId: variants[randomIndex].id,
      baseWeight: variants[randomIndex].baseWeight,
      adjustedWeight: 0,
      contextFactors: ['fallback:zero-weights'],
      confidence: 0.5,
    };
  }

  // Weighted random selection
  const random = Math.random() * totalWeight;
  let cumulative = 0;

  for (const variant of variants) {
    const { weight, factors } = weightedVariants.get(variant.id)!;
    cumulative += weight;

    if (random <= cumulative) {
      const confidence = weight / totalWeight;

      log.debug(
        {
          selectedVariant: variant.id,
          baseWeight: variant.baseWeight,
          adjustedWeight: weight.toFixed(2),
          factors,
          confidence: confidence.toFixed(4),
        },
        'Contextual variant selection'
      );

      return {
        variantId: variant.id,
        baseWeight: variant.baseWeight,
        adjustedWeight: weight,
        contextFactors: factors,
        confidence,
      };
    }
  }

  // Fallback to last variant (shouldn't happen)
  const lastVariant = variants[variants.length - 1];
  const lastData = weightedVariants.get(lastVariant.id)!;
  return {
    variantId: lastVariant.id,
    baseWeight: lastVariant.baseWeight,
    adjustedWeight: lastData.weight,
    contextFactors: lastData.factors,
    confidence: lastData.weight / totalWeight,
  };
}

// ============================================================================
// Predefined Context Modifiers
// ============================================================================

/**
 * Boost mobile-optimized variants for mobile users
 */
export const mobileBoost: ContextModifier = {
  name: 'mobile-boost',
  description: 'Boost variants optimized for mobile devices',
  conditions: [{ field: 'device', operator: 'eq', value: 'mobile', weightModifier: 1.5 }],
  apply: (context) => (context.device === 'mobile' ? 1.3 : 1),
};

/**
 * Boost calmer variants for evening users (after 8pm)
 */
export const eveningBoost: ContextModifier = {
  name: 'evening-boost',
  description: 'Boost reflective variants for evening visitors',
  conditions: [{ field: 'localHour', operator: 'gte', value: 20, weightModifier: 1.5 }],
  apply: (context) => {
    if (context.localHour === undefined) return 1;
    // Evening hours: 8pm-midnight
    if (context.localHour >= 20 || context.localHour < 1) return 1.3;
    // Late night: 1am-5am
    if (context.localHour >= 1 && context.localHour < 5) return 1.5;
    return 1;
  },
};

/**
 * Boost onboarding variants for new users
 */
export const newUserBoost: ContextModifier = {
  name: 'new-user-boost',
  description: 'Boost introductory variants for new visitors',
  conditions: [{ field: 'isNewUser', operator: 'eq', value: true, weightModifier: 1.4 }],
  apply: (context) => (context.isNewUser ? 1.4 : 1),
};

/**
 * Boost engagement variants for highly engaged users
 */
export const highEngagementBoost: ContextModifier = {
  name: 'high-engagement-boost',
  description: 'Boost advanced variants for engaged users',
  conditions: [{ field: 'engagementLevel', operator: 'eq', value: 'high', weightModifier: 1.3 }],
  apply: (context) => (context.engagementLevel === 'high' ? 1.3 : 1),
};

/**
 * Boost social-proof variants for skeptical users
 */
export const skepticalUserBoost: ContextModifier = {
  name: 'skeptical-user-boost',
  description: 'Boost trust-building variants for skeptical users',
  conditions: [{ field: 'emotionalState', operator: 'eq', value: 'skeptical', weightModifier: 1.5 }],
  apply: (context) => (context.emotionalState === 'skeptical' ? 1.5 : 1),
};

/**
 * Boost weekend-appropriate variants
 */
export const weekendBoost: ContextModifier = {
  name: 'weekend-boost',
  description: 'Boost leisure-focused variants on weekends',
  conditions: [{ field: 'dayOfWeek', operator: 'in', value: [0, 6], weightModifier: 1.2 }],
  apply: (context) => {
    if (context.dayOfWeek === undefined) return 1;
    return context.dayOfWeek === 0 || context.dayOfWeek === 6 ? 1.2 : 1;
  },
};

/**
 * All predefined modifiers
 */
export const PREDEFINED_MODIFIERS: ContextModifier[] = [
  mobileBoost,
  eveningBoost,
  newUserBoost,
  highEngagementBoost,
  skepticalUserBoost,
  weekendBoost,
];

// ============================================================================
// Context Extraction Helpers
// ============================================================================

/**
 * Extract user context from request headers and query params
 */
export function extractContextFromRequest(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | undefined>
): Partial<UserContext> {
  const context: Partial<UserContext> = {};

  // Device detection from User-Agent
  const userAgent = headers['user-agent'];
  if (typeof userAgent === 'string') {
    if (/mobile/i.test(userAgent)) context.device = 'mobile';
    else if (/tablet/i.test(userAgent)) context.device = 'tablet';
    else context.device = 'desktop';
  }

  // Time context
  const now = new Date();
  context.localHour = now.getHours();
  context.dayOfWeek = now.getDay();

  // Query params
  if (query.source) context.source = query.source;
  if (query.campaign) context.campaign = query.campaign;
  if (query.new_user === 'true') context.isNewUser = true;
  if (query.new_user === 'false') context.isNewUser = false;

  // Accept-Language header for language
  const acceptLang = headers['accept-language'];
  if (typeof acceptLang === 'string') {
    context.language = acceptLang.split(',')[0]?.split('-')[0];
  }

  return context;
}

/**
 * Merge multiple context sources
 */
export function mergeContexts(...contexts: Partial<UserContext>[]): UserContext {
  const merged: UserContext = {};

  for (const ctx of contexts) {
    for (const [key, value] of Object.entries(ctx)) {
      if (value !== undefined && value !== null) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  return merged;
}

export default {
  evaluateCondition,
  calculateContextualWeights,
  selectContextualVariant,
  extractContextFromRequest,
  mergeContexts,
  mobileBoost,
  eveningBoost,
  newUserBoost,
  highEngagementBoost,
  skepticalUserBoost,
  weekendBoost,
  PREDEFINED_MODIFIERS,
};
