/**
 * Therapeutic Frameworks Index
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Evidence-based therapeutic frameworks adapted for voice coaching.
 * These aren't replacements for therapy—they're tools that help
 * Ferni offer research-backed support in everyday conversation.
 *
 * FRAMEWORKS:
 * 1. ACT (Acceptance & Commitment Therapy)
 *    - Values clarification
 *    - Cognitive defusion
 *    - Present moment awareness
 *
 * 2. DBT (Dialectical Behavior Therapy)
 *    - Distress tolerance (TIPP, STOP, ACCEPTS)
 *    - Emotion regulation (PLEASE, Opposite Action)
 *    - Interpersonal effectiveness (DEAR MAN, GIVE, FAST)
 *    - Mindfulness (Wise Mind)
 *
 * 3. Motivational Interviewing
 *    - Change talk detection
 *    - OARS responses
 *    - Rolling with resistance
 *
 * @module TherapeuticFrameworks
 */
export type { ActivityLogEntry, ACTProcess, ACTValue, BehavioralActivation, ChangeTalk, ChangeTalkInstance, CognitiveRestructuring, CommittedAction, DBTModule, DBTSkill, DefusionTechnique, MoodEntry, OARSSkills, PleasantActivity, TherapeuticFrameworksConfig, TherapeuticProfile, ValueDomain, } from './types.js';
export { DEFAULT_CONFIG } from './types.js';
export { buildValuesContext, checkValuesAlignment, completeAction, detectValuesInSpeech, generateValuesPrompt, getPendingActions, getTopValues, getUserValues, getValueExamples, getValuesByDomain, getValuesQuestion, recordCommittedAction, recordValue, VALUE_EXAMPLES, VALUES_QUESTIONS, type DetectedValue, type ValuesAlignment, } from './act-values.js';
export { buildDefusionContext, DEFUSION_TECHNIQUES, getAllDefusionTechniques, getDefusionTechnique, getMostEffectiveDefusion, getRecentDefusionTechniques, recordDefusionUse, selectDefusionTechnique, } from './act-defusion.js';
export { ALL_DBT_SKILLS, buildDBTContext, DISTRESS_TOLERANCE_SKILLS, EMOTION_REGULATION_SKILLS, getDBTSkill, getLearnedSkills, getMostEffectiveSkills, getSkillsByModule, INTERPERSONAL_SKILLS, MINDFULNESS_SKILLS, recordSkillUse, selectDBTSkill, } from './dbt-skills.js';
export { AFFIRMATIONS, analyzeAmbivalence, buildMIContext, CHANGE_TALK_PATTERNS, detectChangeTalk, detectSustainTalk, generateOARSResponse, getChangeTalkHistory, getStrongestChangeTalk, getTopChangeTalkTopics, OPEN_QUESTIONS, recordChangeTalk, REFLECTION_TEMPLATES, type OARSResponse, type Reflection, } from './motivational-interviewing.js';
import type { DBTSkill, DefusionTechnique } from './types.js';
/**
 * Build complete therapeutic context for a conversation turn.
 */
export declare function buildTherapeuticContext(userId: string, userText: string, context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    enableACT?: boolean;
    enableDBT?: boolean;
    enableMI?: boolean;
}): TherapeuticContextResult;
export interface TherapeuticContextResult {
    hasContext: boolean;
    frameworks: string[];
    contextParts: string[];
    primaryRecommendation: 'dbt_skill' | 'reflect_change_talk' | 'values_alignment' | 'defusion' | null;
    /** Recommended DBT skill when high distress detected */
    recommendedSkill?: DBTSkill;
    /** Recommended ACT defusion technique */
    recommendedDefusion?: DefusionTechnique;
    /** Whether sustain talk (resistance) was detected */
    hasSustainTalk?: boolean;
    /** Detected sustain talk patterns */
    sustainTalkPatterns?: string[];
}
/**
 * Get a summary of therapeutic work with a user.
 */
export declare function getTherapeuticSummary(userId: string): TherapeuticSummary;
export interface TherapeuticSummary {
    hasData: boolean;
    valuesIdentified: number;
    topValues: string[];
    changeTalkTopics: string[];
}
//# sourceMappingURL=index.d.ts.map