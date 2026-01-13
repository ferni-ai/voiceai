/**
 * Content Databases for Life Coaching
 *
 * Evidence-based scripts, frameworks, and techniques
 * sourced from psychological research and clinical practice.
 *
 * Sources:
 * - Gretchen Rubin (Four Tendencies, habits)
 * - Brené Brown (vulnerability, shame, boundaries)
 * - John Gottman (relationships, conflict)
 * - Kristin Neff (self-compassion)
 * - Evelyn Tribole (Intuitive Eating)
 * - Harriet Lerner (anger, communication)
 * - Dan Siegel (window of tolerance, regulation)
 */
import type { FourTendency, CopingTechnique, Framework, ScriptTemplate } from './types.js';
export declare const BOUNDARY_SCRIPTS: ScriptTemplate[];
export declare const ANGER_FRAMEWORKS: Framework[];
export declare const SOCIAL_FRAMEWORKS: Framework[];
export declare const BODY_FRAMEWORKS: Framework[];
export declare const COPING_TECHNIQUES: CopingTechnique[];
export declare const TENDENCY_STRATEGIES: Record<FourTendency, {
    boundaries: string[];
    motivation: string[];
    pitfalls: string[];
}>;
export declare const REFLECTION_QUESTIONS: {
    boundaries: string[];
    anger: string[];
    socialSkills: string[];
    bodyImage: string[];
};
/**
 * Get a random script template for a category
 */
export declare function getScriptForCategory(category: string, firmness: 'soft' | 'firm' | 'assertive'): string[];
/**
 * Get tendency-adapted script
 */
export declare function getAdaptedScript(category: string, tendency?: FourTendency): string | null;
/**
 * Get coping technique for situation
 */
export declare function getCopingTechnique(situation: string): CopingTechnique | null;
//# sourceMappingURL=content-databases.d.ts.map