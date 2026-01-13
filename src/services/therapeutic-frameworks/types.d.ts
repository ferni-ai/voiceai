/**
 * Therapeutic Frameworks Types
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Core types for evidence-based therapeutic frameworks.
 * These aren't replacements for therapy—they're tools that help
 * Ferni offer research-backed support in everyday conversation.
 *
 * PHILOSOPHY:
 * Real therapeutic frameworks have decades of research behind them.
 * We adapt their essence for conversational coaching while being
 * clear that Ferni is a coach, not a therapist.
 *
 * @module TherapeuticFrameworks/Types
 */
/**
 * ACT's six core processes for psychological flexibility.
 */
export type ACTProcess = 'acceptance' | 'defusion' | 'present_moment' | 'self_as_context' | 'values' | 'committed_action';
/**
 * A value identified through ACT values work.
 */
export interface ACTValue {
    /** The value itself */
    value: string;
    /** Domain of life */
    domain: ValueDomain;
    /** Why this matters (in their words) */
    meaning?: string;
    /** Current satisfaction with living this value (0-10) */
    currentAlignment?: number;
    /** Importance rating (0-10) */
    importance?: number;
    /** When first identified */
    identifiedAt: Date;
    /** Actions taken toward this value */
    committedActions?: CommittedAction[];
}
export type ValueDomain = 'relationships' | 'work' | 'health' | 'growth' | 'leisure' | 'spirituality' | 'community' | 'environment';
/**
 * An action committed to in service of a value.
 */
export interface CommittedAction {
    action: string;
    valueId: string;
    targetDate?: Date;
    completed: boolean;
    completedAt?: Date;
    /** How aligned did taking this action feel? (0-10) */
    alignmentRating?: number;
    /** Reflection after completion */
    reflection?: string;
}
/**
 * A defusion technique for handling difficult thoughts.
 */
export interface DefusionTechnique {
    id: string;
    name: string;
    description: string;
    /** The script/instructions */
    guidance: string;
    /** Best for which kinds of thoughts */
    bestFor: string[];
    /** Example thought to defuse */
    exampleThought?: string;
    /** Example defusion */
    exampleDefusion?: string;
}
/**
 * DBT's four skill modules.
 */
export type DBTModule = 'mindfulness' | 'distress_tolerance' | 'emotion_regulation' | 'interpersonal';
/**
 * A specific DBT skill.
 */
export interface DBTSkill {
    id: string;
    name: string;
    module: DBTModule;
    description: string;
    /** Acronym if it has one (TIPP, STOP, etc.) */
    acronym?: string;
    /** What each letter stands for */
    acronymMeaning?: Record<string, string>;
    /** When to use this skill */
    whenToUse: string[];
    /** Step-by-step guidance */
    steps: string[];
    /** Voice-guidable version for Ferni */
    voiceGuidance?: string;
}
/**
 * DBT's TIPP skills for crisis.
 */
export declare const TIPP_SKILL: DBTSkill;
/**
 * DBT's STOP skill for when you're about to do something impulsive.
 */
export declare const STOP_SKILL: DBTSkill;
/**
 * Core spirit of Motivational Interviewing.
 */
export type MISpirit = 'partnership' | 'acceptance' | 'compassion' | 'evocation';
/**
 * OARS: Core skills of MI.
 */
export interface OARSSkills {
    openQuestions: string[];
    affirmations: string[];
    reflections: string[];
    summaries: string[];
}
/**
 * Change talk types to listen for.
 */
export type ChangeTalk = 'desire' | 'ability' | 'reasons' | 'need' | 'commitment' | 'taking_steps';
/**
 * A piece of change talk detected in conversation.
 */
export interface ChangeTalkInstance {
    type: ChangeTalk;
    statement: string;
    strength: number;
    topic?: string;
    timestamp: Date;
}
/**
 * Cognitive restructuring process.
 * Already partially implemented in cognitive-intelligence.
 */
export interface CognitiveRestructuring {
    automaticThought: string;
    emotion: string;
    emotionIntensity: number;
    /** Evidence for the thought */
    evidenceFor?: string[];
    /** Evidence against the thought */
    evidenceAgainst?: string[];
    /** Balanced/alternative thought */
    balancedThought?: string;
    /** New emotion and intensity */
    newEmotion?: string;
    newIntensity?: number;
}
/**
 * Behavioral activation for low mood.
 */
export interface BehavioralActivation {
    /** Values-aligned activities to try */
    activities: PleasantActivity[];
    /** Activity log */
    activityLog: ActivityLogEntry[];
    /** Mood tracking over time */
    moodOverTime: MoodEntry[];
}
export interface PleasantActivity {
    activity: string;
    domain: ValueDomain;
    effort: 'low' | 'medium' | 'high';
    social: boolean;
    outdoors: boolean;
}
export interface ActivityLogEntry {
    activity: string;
    timestamp: Date;
    moodBefore: number;
    moodAfter: number;
    masteryRating?: number;
    pleasureRating?: number;
    notes?: string;
}
export interface MoodEntry {
    timestamp: Date;
    mood: number;
    notes?: string;
}
/**
 * A user's therapeutic profile - what we've learned about what helps them.
 */
export interface TherapeuticProfile {
    userId: string;
    values: ACTValue[];
    defusionTechniquesUsed: string[];
    acceptanceLevel: number;
    dbtSkillsLearned: string[];
    crisisToolsTried: string[];
    changeTalkHistory: ChangeTalkInstance[];
    ambivalenceTopics: string[];
    restructuringProgress?: {
        thoughtRecordsCompleted: number;
        averageEmotionReduction: number;
        topDistortions: string[];
    };
    behavioralActivation?: BehavioralActivation;
    updatedAt: Date;
    sessionsWithFrameworkUse: number;
}
export interface TherapeuticFrameworksConfig {
    /** Enable ACT values work */
    enableACT: boolean;
    /** Enable DBT skills */
    enableDBT: boolean;
    /** Enable Motivational Interviewing patterns */
    enableMI: boolean;
    /** Enable Behavioral Activation */
    enableBehavioralActivation: boolean;
    /** Minimum relationship stage to introduce frameworks */
    minRelationshipStage: 'new' | 'building' | 'established' | 'deep';
}
export declare const DEFAULT_CONFIG: TherapeuticFrameworksConfig;
//# sourceMappingURL=types.d.ts.map