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
export declare const HERO_HEADLINE_VARIANTS: VariantDefinition<HeroVariant>;
export declare const HERO_CTA_VARIANTS: VariantDefinition<CTAVariant>;
export declare const TRUST_BADGE_VARIANTS: VariantDefinition<TrustBadgeVariant>;
export declare const SOCIAL_PROOF_VARIANTS: VariantDefinition<SocialProofVariant>;
export declare const TEAM_SHOWCASE_VARIANTS: VariantDefinition<TeamShowcaseVariant>;
export declare const PRICING_VARIANTS: VariantDefinition<PricingVariant>;
export declare const EXPERIMENTS: ExperimentDefinition[];
/**
 * Get a specific variant by experiment and variant ID
 */
export declare function getVariant<T>(experimentId: string, variantId: string): T | null;
/**
 * Get the control variant for an experiment
 */
export declare function getControlVariant<T>(experimentId: string): T | null;
/**
 * Get all variants for an experiment
 */
export declare function getAllVariants(experimentId: string): Record<string, unknown> | null;
/**
 * Get variant IDs for an experiment
 */
export declare function getVariantIds(experimentId: string): string[];
/**
 * Get the current default variant for an experiment
 * (Could be updated by auto-optimizer when a winner ships)
 */
export declare function getCurrentDefault(experimentId: string): Promise<string>;
/**
 * Set the current default variant (called when a winner ships)
 */
export declare function setCurrentDefault(experimentId: string, variantId: string): Promise<void>;
/**
 * Add a custom variant to an experiment (for AI-generated variants)
 */
export declare function addCustomVariant(experimentId: string, variantId: string, content: unknown): Promise<void>;
/**
 * Get all custom variants for an experiment
 */
export declare function getCustomVariants(experimentId: string): Promise<Record<string, unknown>>;
/**
 * Get all variants for the frontend in a serializable format
 */
export declare function getVariantsForFrontend(): Record<string, Record<string, unknown>>;
/**
 * Get experiment definitions for the frontend
 */
export declare function getExperimentDefinitions(): Array<{
    id: string;
    name: string;
    element: string;
    variantIds: string[];
}>;
declare const _default: {
    EXPERIMENTS: ExperimentDefinition[];
    HERO_HEADLINE_VARIANTS: VariantDefinition<HeroVariant>;
    HERO_CTA_VARIANTS: VariantDefinition<CTAVariant>;
    TRUST_BADGE_VARIANTS: VariantDefinition<TrustBadgeVariant>;
    SOCIAL_PROOF_VARIANTS: VariantDefinition<SocialProofVariant>;
    TEAM_SHOWCASE_VARIANTS: VariantDefinition<TeamShowcaseVariant>;
    PRICING_VARIANTS: VariantDefinition<PricingVariant>;
    getVariant: typeof getVariant;
    getControlVariant: typeof getControlVariant;
    getAllVariants: typeof getAllVariants;
    getVariantIds: typeof getVariantIds;
    getCurrentDefault: typeof getCurrentDefault;
    setCurrentDefault: typeof setCurrentDefault;
    addCustomVariant: typeof addCustomVariant;
    getCustomVariants: typeof getCustomVariants;
    getVariantsForFrontend: typeof getVariantsForFrontend;
    getExperimentDefinitions: typeof getExperimentDefinitions;
};
export default _default;
//# sourceMappingURL=variant-library.d.ts.map