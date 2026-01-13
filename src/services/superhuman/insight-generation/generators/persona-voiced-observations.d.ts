/**
 * Persona-Voiced Observations Generator
 *
 * "Better Than Human" principle: Insights should feel like they come from
 * real friends who've been paying attention - not a dashboard.
 *
 * This generator produces observations voiced by specific team members:
 * - Peter notices patterns and data
 * - Maya notices habits and energy
 * - Jordan notices milestones and celebrations
 * - Alex notices communication and calendar patterns
 * - Nayan notices deeper meanings and growth
 * - Ferni coordinates and notices the whole picture
 *
 * Each observation is phrased in that persona's voice and style.
 *
 * @module services/superhuman/insight-generation/generators/persona-voiced-observations
 */
import type { GeneratedInsight, InsightGeneratorContext, InsightPriority, InsightTone, SurfacingMoment } from '../types.js';
interface PersonaVoice {
    name: string;
    openings: string[];
    style: string;
    domains: string[];
    tone: InsightTone;
}
declare const PERSONA_VOICES: Record<string, PersonaVoice>;
interface ObservationTemplate {
    persona: string;
    pattern: string;
    template: string;
    priority: InsightPriority;
    surfacingMoment: SurfacingMoment;
    minDataPoints: number;
}
declare const OBSERVATION_TEMPLATES: ObservationTemplate[];
declare function generateObservations(userId: string, context: InsightGeneratorContext): Promise<GeneratedInsight[]>;
export { generateObservations, PERSONA_VOICES, OBSERVATION_TEMPLATES };
//# sourceMappingURL=persona-voiced-observations.d.ts.map