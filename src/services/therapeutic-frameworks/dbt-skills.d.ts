/**
 * DBT Skills Library
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Dialectical Behavior Therapy skills for crisis management,
 * emotion regulation, and interpersonal effectiveness.
 *
 * PHILOSOPHY:
 * DBT was designed for people with big emotions. These skills
 * are practical, memorable, and can be used in the moment.
 * Perfect for voice coaching.
 *
 * @module TherapeuticFrameworks/DBTSkills
 */
import type { DBTSkill, DBTModule } from './types.js';
export declare const DISTRESS_TOLERANCE_SKILLS: Record<string, DBTSkill>;
export declare const EMOTION_REGULATION_SKILLS: Record<string, DBTSkill>;
export declare const INTERPERSONAL_SKILLS: Record<string, DBTSkill>;
export declare const MINDFULNESS_SKILLS: Record<string, DBTSkill>;
export declare const ALL_DBT_SKILLS: Record<string, DBTSkill>;
/**
 * Select appropriate DBT skill for the situation.
 */
export declare function selectDBTSkill(context: {
    situation?: string;
    emotionIntensity?: number;
    goal?: 'survive_crisis' | 'regulate_emotion' | 'communicate' | 'be_present';
    keywords?: string[];
}): DBTSkill;
/**
 * Get skills by module.
 */
export declare function getSkillsByModule(module: DBTModule): DBTSkill[];
/**
 * Get skill by ID.
 */
export declare function getDBTSkill(id: string): DBTSkill | null;
/**
 * Record DBT skill use.
 */
export declare function recordSkillUse(userId: string, skillId: string, options?: {
    helpfulnessRating?: number;
    situation?: string;
}): void;
/**
 * Get most effective skills for a user.
 */
export declare function getMostEffectiveSkills(userId: string): string[];
/**
 * Get skills user has learned.
 */
export declare function getLearnedSkills(userId: string): string[];
/**
 * Build DBT context for LLM.
 */
export declare function buildDBTContext(userId: string, context: {
    emotionIntensity?: number;
    situation?: string;
    keywords?: string[];
}): string | null;
//# sourceMappingURL=dbt-skills.d.ts.map