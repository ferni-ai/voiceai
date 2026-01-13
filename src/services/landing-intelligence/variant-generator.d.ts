/**
 * Variant Generator
 *
 * Dynamically generates landing page variants using Gemini,
 * informed by winning A/B test patterns and visitor context.
 *
 * @module services/landing-intelligence/variant-generator
 */
import type { ExperimentPattern } from '../experiments/hypothesis-generator.js';
import type { VisitorIntent } from './intent-detector.js';
import type { TimeMode } from './time-aware.js';
export interface VariantGenerationContext {
    /** Winning patterns from past experiments */
    winningPatterns?: ExperimentPattern[];
    /** Detected visitor intent */
    visitorIntent?: VisitorIntent;
    /** Time of day mode */
    timeMode?: TimeMode;
    /** Device type */
    device?: 'mobile' | 'tablet' | 'desktop';
    /** Referrer category */
    referrer?: string;
    /** Is returning visitor */
    isReturning?: boolean;
    /** Previous variant IDs shown */
    previousVariants?: string[];
}
export interface GeneratedVariant {
    /** Unique ID for this variant */
    id: string;
    /** Variant type */
    type: 'headline' | 'cta' | 'subhead' | 'full';
    /** Generated content */
    content: {
        tagline?: string;
        headline?: string;
        subhead?: string;
        ctaText?: string;
        ctaStyle?: 'primary' | 'secondary' | 'ghost';
    };
    /** Why this variant was generated */
    reasoning: string;
    /** Confidence in this variant (0-1) */
    confidence: number;
    /** Patterns this was based on */
    basedOnPatterns: string[];
    /** Generation timestamp */
    generatedAt: Date;
}
export declare function generateHeadlineVariant(context: VariantGenerationContext): Promise<GeneratedVariant | null>;
export declare function generateCTAVariant(context: VariantGenerationContext): Promise<GeneratedVariant | null>;
export declare function generatePersonalizedVariant(context: VariantGenerationContext): Promise<GeneratedVariant | null>;
//# sourceMappingURL=variant-generator.d.ts.map