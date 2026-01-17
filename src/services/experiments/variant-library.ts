/**
 * Variant Library
 *
 * Centralized storage for landing page experiment variants.
 * Provides type-safe access to all testable content variations.
 *
 * Better than human: We systematically test every word.
 *
 * @module services/experiments/variant-library
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'VariantLibrary' });

// ============================================================================
// TYPES
// ============================================================================

export interface HeroVariant {
  tagline: string;
  headline: string;
  subhead?: string;
}

export interface CTAVariant {
  text: string;
  style: 'primary' | 'secondary' | 'ghost';
  icon?: 'arrow' | 'phone' | 'none';
}

export interface TrustBadgeVariant {
  position: 'above-cta' | 'below-cta' | 'inline-cta';
  style: 'minimal' | 'prominent' | 'hidden';
}

export interface SocialProofVariant {
  type: 'stats' | 'testimonials' | 'logos' | 'combined';
  position: 'hero' | 'below-hero' | 'floating';
}

export interface TeamShowcaseVariant {
  order: 'ferni-first' | 'random' | 'by-specialty';
  style: 'cards' | 'carousel' | 'grid';
  showQuotes: boolean;
}

export interface PricingVariant {
  anchor: 'free' | 'friend' | 'partner';
  style: 'cards' | 'table' | 'slider';
  emphasis: 'value' | 'features' | 'social-proof';
}

export interface VariantDefinition<T> {
  control: T;
  [variantId: string]: T;
}

export interface ExperimentDefinition {
  id: string;
  name: string;
  description: string;
  element: string;
  primaryGoal: string;
  secondaryGoals?: string[];
  variants: VariantDefinition<unknown>;
}

// ============================================================================
// HERO HEADLINE VARIANTS
// ============================================================================

export const HERO_HEADLINE_VARIANTS: VariantDefinition<HeroVariant> = {
  control: {
    tagline: 'Better than human.',
    headline: 'Finally, someone who gets it.',
    subhead:
      "Someone who remembers your whole story, hears what you're not saying, and shows up at 2am with the same presence as noon.",
  },
  emotional_question: {
    tagline: 'Your AI life coach.',
    headline: 'What if someone actually understood?',
    subhead:
      'Six AI specialists who listen without judgment, remember everything, and help you grow. Available whenever you need them.',
  },
  team_focus: {
    tagline: 'Better than human.',
    headline: 'Six brilliant minds. One conversation.',
    subhead:
      'A life coach, mentor, researcher, strategist, habit expert, and planner—all working together for you.',
  },
  memory_focus: {
    tagline: 'Beyond human limitations.',
    headline: 'Someone who never forgets.',
    subhead:
      'That thing you mentioned six months ago? We remember. Every detail, every context, every nuance of your story.',
  },
  presence_focus: {
    tagline: 'Always here for you.',
    headline: 'Never too busy. Never too tired.',
    subhead:
      "Your best friend has their own problems. Your therapist has other patients. We're fully present, every time.",
  },
};

// ============================================================================
// CTA VARIANTS
// ============================================================================

export const HERO_CTA_VARIANTS: VariantDefinition<CTAVariant> = {
  control: {
    text: 'Start Free',
    style: 'primary',
    icon: 'arrow',
  },
  meet_ferni: {
    text: 'Meet Ferni',
    style: 'primary',
    icon: 'arrow',
  },
  begin_conversation: {
    text: 'Begin a Real Conversation',
    style: 'primary',
    icon: 'arrow',
  },
  try_now: {
    text: 'Try Ferni Now',
    style: 'primary',
    icon: 'arrow',
  },
  no_icon: {
    text: 'Start Free',
    style: 'primary',
    icon: 'none',
  },
  secondary_style: {
    text: 'Start Free',
    style: 'secondary',
    icon: 'arrow',
  },
};

// ============================================================================
// TRUST BADGE VARIANTS
// ============================================================================

export const TRUST_BADGE_VARIANTS: VariantDefinition<TrustBadgeVariant> = {
  control: {
    position: 'below-cta',
    style: 'minimal',
  },
  above_cta: {
    position: 'above-cta',
    style: 'minimal',
  },
  prominent: {
    position: 'below-cta',
    style: 'prominent',
  },
  hidden: {
    position: 'below-cta',
    style: 'hidden',
  },
};

// ============================================================================
// SOCIAL PROOF VARIANTS
// ============================================================================

export const SOCIAL_PROOF_VARIANTS: VariantDefinition<SocialProofVariant> = {
  control: {
    type: 'stats',
    position: 'below-hero',
  },
  testimonials_hero: {
    type: 'testimonials',
    position: 'hero',
  },
  combined: {
    type: 'combined',
    position: 'below-hero',
  },
  floating: {
    type: 'testimonials',
    position: 'floating',
  },
};

// ============================================================================
// TEAM SHOWCASE VARIANTS
// ============================================================================

export const TEAM_SHOWCASE_VARIANTS: VariantDefinition<TeamShowcaseVariant> = {
  control: {
    order: 'ferni-first',
    style: 'cards',
    showQuotes: true,
  },
  random_order: {
    order: 'random',
    style: 'cards',
    showQuotes: true,
  },
  carousel: {
    order: 'ferni-first',
    style: 'carousel',
    showQuotes: true,
  },
  no_quotes: {
    order: 'ferni-first',
    style: 'cards',
    showQuotes: false,
  },
};

// ============================================================================
// PRICING VARIANTS
// ============================================================================

export const PRICING_VARIANTS: VariantDefinition<PricingVariant> = {
  control: {
    anchor: 'free',
    style: 'cards',
    emphasis: 'value',
  },
  friend_anchor: {
    anchor: 'friend',
    style: 'cards',
    emphasis: 'value',
  },
  feature_emphasis: {
    anchor: 'free',
    style: 'cards',
    emphasis: 'features',
  },
  social_emphasis: {
    anchor: 'free',
    style: 'cards',
    emphasis: 'social-proof',
  },
};

// ============================================================================
// EXPERIMENT DEFINITIONS
// ============================================================================

export const EXPERIMENTS: ExperimentDefinition[] = [
  {
    id: 'hero-headline',
    name: 'Hero Headline Test',
    description: 'Test different headline and tagline combinations',
    element: 'hero',
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_50', 'time_30s'],
    variants: HERO_HEADLINE_VARIANTS,
  },
  {
    id: 'hero-cta',
    name: 'Hero CTA Test',
    description: 'Test different CTA button text and styles',
    element: 'hero-cta',
    primaryGoal: 'cta_click',
    variants: HERO_CTA_VARIANTS,
  },
  {
    id: 'trust-badges',
    name: 'Trust Badges Position Test',
    description: 'Test trust badge placement and prominence',
    element: 'trust-badges',
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_50'],
    variants: TRUST_BADGE_VARIANTS,
  },
  {
    id: 'social-proof',
    name: 'Social Proof Test',
    description: 'Test social proof type and placement',
    element: 'social-proof',
    primaryGoal: 'cta_click',
    secondaryGoals: ['scroll_75', 'time_60s'],
    variants: SOCIAL_PROOF_VARIANTS,
  },
  {
    id: 'team-showcase',
    name: 'Team Showcase Test',
    description: 'Test team section presentation',
    element: 'team',
    primaryGoal: 'team_click',
    secondaryGoals: ['cta_click'],
    variants: TEAM_SHOWCASE_VARIANTS,
  },
  {
    id: 'pricing',
    name: 'Pricing Presentation Test',
    description: 'Test pricing anchor and emphasis',
    element: 'pricing',
    primaryGoal: 'pricing_click',
    secondaryGoals: ['cta_click'],
    variants: PRICING_VARIANTS,
  },
];

// ============================================================================
// VARIANT ACCESS
// ============================================================================

/**
 * Get a specific variant by experiment and variant ID
 */
export function getVariant<T>(experimentId: string, variantId: string): T | null {
  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment) {
    log.warn({ experimentId }, 'Experiment not found');
    return null;
  }

  const variants = experiment.variants as VariantDefinition<T>;
  const variant = variants[variantId];

  if (!variant) {
    log.warn({ experimentId, variantId }, 'Variant not found');
    return null;
  }

  return variant;
}

/**
 * Get the control variant for an experiment
 */
export function getControlVariant<T>(experimentId: string): T | null {
  return getVariant<T>(experimentId, 'control');
}

/**
 * Get all variants for an experiment
 */
export function getAllVariants(experimentId: string): Record<string, unknown> | null {
  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment) {
    return null;
  }
  return experiment.variants;
}

/**
 * Get variant IDs for an experiment
 */
export function getVariantIds(experimentId: string): string[] {
  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment) {
    return [];
  }
  return Object.keys(experiment.variants);
}

// ============================================================================
// DYNAMIC VARIANT MANAGEMENT
// ============================================================================

/**
 * Get the current default variant for an experiment
 * (Could be updated by auto-optimizer when a winner ships)
 */
export async function getCurrentDefault(experimentId: string): Promise<string> {
  const db = getFirestore();

  try {
    const doc = await db.collection('variant_library').doc(experimentId).get();

    if (doc.exists) {
      return doc.data()?.currentDefault || 'control';
    }
  } catch (error) {
    log.warn({ error, experimentId }, 'Failed to get current default');
  }

  return 'control';
}

/**
 * Set the current default variant (called when a winner ships)
 */
export async function setCurrentDefault(experimentId: string, variantId: string): Promise<void> {
  const db = getFirestore();

  await db
    .collection('variant_library')
    .doc(experimentId)
    .set(
      cleanForFirestore({
        currentDefault: variantId,
        updatedAt: FieldValue.serverTimestamp(),
        history: FieldValue.arrayUnion({
          variantId,
          promotedAt: new Date().toISOString(),
        }),
      }),
      { merge: true }
    );

  log.info({ experimentId, variantId }, 'Default variant updated');
}

/**
 * Add a custom variant to an experiment (for AI-generated variants)
 */
export async function addCustomVariant(
  experimentId: string,
  variantId: string,
  content: unknown
): Promise<void> {
  const db = getFirestore();

  await db
    .collection('variant_library')
    .doc(experimentId)
    .collection('custom_variants')
    .doc(variantId)
    .set(
      removeUndefined({
        content,
        createdAt: FieldValue.serverTimestamp(),
        source: 'ai-generated',
      })
    );

  log.info({ experimentId, variantId }, 'Custom variant added');
}

/**
 * Get all custom variants for an experiment
 */
export async function getCustomVariants(experimentId: string): Promise<Record<string, unknown>> {
  const db = getFirestore();

  const snapshot = await db
    .collection('variant_library')
    .doc(experimentId)
    .collection('custom_variants')
    .get();

  const variants: Record<string, unknown> = {};
  for (const doc of snapshot.docs) {
    variants[doc.id] = doc.data().content;
  }

  return variants;
}

// ============================================================================
// SERIALIZATION FOR FRONTEND
// ============================================================================

/**
 * Get all variants for the frontend in a serializable format
 */
export function getVariantsForFrontend(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const experiment of EXPERIMENTS) {
    result[experiment.id] = experiment.variants as Record<string, unknown>;
  }

  return result;
}

/**
 * Get experiment definitions for the frontend
 */
export function getExperimentDefinitions(): Array<{
  id: string;
  name: string;
  element: string;
  variantIds: string[];
}> {
  return EXPERIMENTS.map((exp) => ({
    id: exp.id,
    name: exp.name,
    element: exp.element,
    variantIds: Object.keys(exp.variants),
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EXPERIMENTS,
  HERO_HEADLINE_VARIANTS,
  HERO_CTA_VARIANTS,
  TRUST_BADGE_VARIANTS,
  SOCIAL_PROOF_VARIANTS,
  TEAM_SHOWCASE_VARIANTS,
  PRICING_VARIANTS,
  getVariant,
  getControlVariant,
  getAllVariants,
  getVariantIds,
  getCurrentDefault,
  setCurrentDefault,
  addCustomVariant,
  getCustomVariants,
  getVariantsForFrontend,
  getExperimentDefinitions,
};
