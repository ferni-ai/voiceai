/**
 * Persona Content Loader Service
 *
 * Loads and caches persona behavior content from JSON files.
 * This enables context builders and tools to access rich, persona-specific
 * content without hardcoding phrases.
 *
 * USAGE:
 *   const trustPhrases = await loadFerniContent('trust-phrases');
 *   const lateNight = await loadFerniContent('late-night-presence');
 *
 * @module PersonaContentLoader
 */
import type { BundleBehaviors } from '../personas/bundles/types.js';
export interface TrustPhrases {
    schema_version?: number;
    description?: string;
    reading_between_lines?: {
        false_fine?: string[];
        deflection?: string[];
        permission_seeking?: string[];
        minimizing_pain?: string[];
        topic_avoidance?: string[];
    };
    boundary_awareness?: {
        approaching_sensitive?: string[];
        respecting_established?: string[];
    };
    growth_reflection?: {
        noticing_change?: string[];
        celebrating_evolution?: string[];
    };
    inside_jokes_callbacks?: {
        referencing_shared_moment?: string[];
        building_continuity?: string[];
    };
    small_wins_celebration?: {
        noticing_effort?: string[];
        celebrating_without_overwhelming?: string[];
        effort_over_outcome?: string[];
    };
    thinking_of_you_proactive?: {
        genuine_checkin?: string[];
        following_up?: string[];
        anticipating_hard_date?: string[];
    };
}
export interface LateNightPresence {
    schema_version?: number;
    description?: string;
    late_night_greetings?: string[];
    holding_space_in_darkness?: string[];
    cant_sleep_patterns?: {
        anxiety?: string[];
        heavy_thoughts?: string[];
        processing_day?: string[];
    };
    grounding_exercises?: string[];
    morning_will_come_hope?: string[];
}
export interface EmotionalIntelligence {
    schema_version?: number;
    [key: string]: {
        verbal_cues?: string[];
        response_style?: string;
        phrases?: string[];
    } | number | string | undefined;
}
export interface INoticePower {
    schema_version?: number;
    opening_frames?: {
        gentle_openers?: string[];
        with_permission?: string[];
    };
    surfacing_phrases?: {
        patterns?: string[];
        contradictions?: string[];
        emotional?: string[];
    };
}
export interface SuperhumanInsights {
    schema_version?: number;
    pattern_surfacing?: {
        behavioral_patterns?: string[];
        linguistic_patterns?: string[];
        emotional_patterns?: string[];
    };
    the_mirror?: {
        reflecting_past_phrases?: string[];
        contradiction_call_outs?: string[];
    };
    predictive_care?: {
        before_hard_dates?: string[];
        anticipating_struggle?: string[];
    };
}
/**
 * Silence response content for meaningful silence moments.
 * Makes quiet moments feel like genuine human connection.
 */
export interface SilenceResponses {
    schema_version?: number;
    description?: string;
    philosophy?: string;
    comfortable_presence?: {
        general?: string[];
        after_heavy_topic?: string[];
        late_conversation?: string[];
    };
    memory_callback_templates?: string[];
    thinking_out_loud?: {
        after_personal_share?: string[];
        after_question?: string[];
        general?: string[];
    };
    micro_stories?: string[];
    thoughtful_questions?: {
        persona_voice?: string[];
        family?: string[];
        work?: string[];
        general?: string[];
    };
    gentle_observations?: string[];
    gentle_humor?: string[];
    music_offerings?: string[];
    game_suggestions?: string[];
    time_aware?: {
        late_night?: string[];
        early_morning?: string[];
        evening?: string[];
        weekend?: string[];
    };
    topic_specific?: Record<string, string[]>;
    llm_guidance?: {
        presence?: {
            instruction_template?: string;
            examples?: string[];
        };
        memory_callback?: {
            instruction_template?: string;
            examples?: string[];
        };
        thoughtful_question?: {
            instruction_template?: string;
            examples?: string[];
        };
        check_in?: {
            instruction_template?: string;
            examples?: string[];
        };
    };
    usage_rules?: {
        first_silence_threshold_sec?: number;
        second_silence_threshold_sec?: number;
        extended_silence_threshold_sec?: number;
        music_playing_minimum_sec?: number;
        game_active_minimum_sec?: number;
        presence_after_heavy_topic?: boolean;
        no_humor_when_heavy?: boolean;
        micro_story_min_turn_count?: number;
        thoughtful_question_min_turn_count?: number;
    };
}
export interface SecondChancesVoice {
    schema_version?: number;
    description?: string;
    holding_hope?: {
        when_they_cant?: string[];
        comeback_stories?: string[];
    };
    acknowledging_loss?: {
        what_was_lost?: string[];
        permission_to_grieve?: string[];
    };
    first_steps?: {
        tiny_beginnings?: string[];
        courage_building?: string[];
    };
    reframing?: {
        from_failure_to_data?: string[];
        new_chapter?: string[];
    };
    celebrating_wins?: {
        acknowledging_progress?: string[];
        normalizing_setbacks?: string[];
    };
    wisdom_sharing?: {
        resilience?: string[];
        second_chances?: string[];
    };
}
export interface ConnectionVoice {
    schema_version?: number;
    description?: string;
    acknowledging_loneliness?: {
        validation?: string[];
        normalizing?: string[];
        permission?: string[];
    };
    adult_friendship?: {
        reality_check?: string[];
        quality_over_quantity?: string[];
        maintenance?: string[];
    };
    belonging?: {
        finding_your_people?: string[];
        being_seen?: string[];
        community?: string[];
    };
    connection_rituals?: {
        small_gestures?: string[];
        maintaining_bonds?: string[];
    };
    solitude_vs_loneliness?: {
        reframing?: string[];
        alone_but_whole?: string[];
    };
    late_night_loneliness?: {
        presence?: string[];
        grounding?: string[];
    };
}
export interface DifficultConversationsVoice {
    schema_version?: number;
    description?: string;
    validation?: {
        acknowledging_fear?: string[];
        normalizing_avoidance?: string[];
        courage?: string[];
    };
    preparation?: {
        before_conversation?: string[];
        grounding?: string[];
        intentions?: string[];
    };
    practice_mode?: {
        invitation?: string[];
        during_practice?: string[];
        debriefing?: string[];
    };
    boundaries?: {
        setting?: string[];
        maintaining?: string[];
        when_crossed?: string[];
    };
    repair?: {
        after_went_wrong?: string[];
        apology?: string[];
        moving_forward?: string[];
    };
    wisdom?: {
        relationship_truths?: string[];
        communication?: string[];
    };
}
export interface LifeTransitionsVoice {
    schema_version?: number;
    description?: string;
    acknowledging_transitions?: {
        validation?: string[];
        normalizing?: string[];
    };
    stages?: {
        the_ending?: string[];
        neutral_zone?: string[];
        new_beginning?: string[];
    };
    dual_emotions?: {
        both_and?: string[];
        permission?: string[];
    };
    identity?: {
        honoring_past?: string[];
        becoming?: string[];
    };
    grief_in_transition?: {
        even_happy_transitions?: string[];
        no_timeline?: string[];
    };
    uncertainty?: {
        sitting_with_not_knowing?: string[];
        one_fixed_point?: string[];
    };
    wisdom?: {
        meaning_making?: string[];
        seasonal?: string[];
    };
}
export interface QuietGrowthVoice {
    schema_version?: number;
    description?: string;
    permission_to_rest?: {
        enough_for_today?: string[];
        rest_is_growth?: string[];
    };
    celebrating_maintenance?: {
        holding_steady?: string[];
        the_plateau?: string[];
    };
    anti_hustle?: {
        slow_is_okay?: string[];
        your_pace?: string[];
    };
    seasonal_wisdom?: {
        winter_season?: string[];
        honoring_cycles?: string[];
    };
    sufficiency?: {
        enough?: string[];
        good_enough?: string[];
    };
}
/**
 * Get cache statistics for monitoring
 */
export declare function getContentCacheStats(): {
    behaviors: {
        size: number;
        hits: number;
        misses: number;
        evictions: number;
        hitRate: number;
    };
    content: {
        size: number;
        hits: number;
        misses: number;
        evictions: number;
        hitRate: number;
    };
};
/**
 * Prune expired entries from caches
 */
export declare function pruneExpiredContent(): {
    behaviors: number;
    content: number;
};
/**
 * Load all behaviors for a persona (cached with LRU eviction)
 */
export declare function loadPersonaBehaviors(personaId: string): Promise<BundleBehaviors | null>;
/**
 * Load specific behavior content for Ferni (legacy, use loadPersonaContent instead)
 * @deprecated Use loadPersonaContent(personaId, behaviorName) instead
 */
export declare function loadFerniContent<T>(behaviorName: keyof BundleBehaviors): Promise<T | null>;
/**
 * Load specific behavior content for ANY persona (cached with LRU eviction)
 * This is the primary way to access persona-specific 200% content
 */
export declare function loadPersonaContent<T>(personaId: string, behaviorName: keyof BundleBehaviors): Promise<T | null>;
/**
 * Load trust phrases for a specific persona
 * Falls back to Ferni if not available for the requested persona
 */
export declare function loadTrustPhrases(personaId?: string): Promise<TrustPhrases | null>;
/**
 * Load late-night presence content for a specific persona
 */
export declare function loadLateNightPresence(personaId?: string): Promise<LateNightPresence | null>;
/**
 * Load emotional intelligence patterns for a specific persona
 */
export declare function loadEmotionalIntelligence(personaId?: string): Promise<EmotionalIntelligence | null>;
/**
 * Load I-notice power content for a specific persona
 */
export declare function loadINoticePower(personaId?: string): Promise<INoticePower | null>;
/**
 * Load superhuman insights content for a specific persona
 */
export declare function loadSuperhumanInsights(personaId?: string): Promise<SuperhumanInsights | null>;
/**
 * Load silence responses content for a specific persona
 * Used for meaningful silence moments that feel like genuine human connection
 */
export declare function loadSilenceResponses(personaId?: string): Promise<SilenceResponses | null>;
/**
 * Load second-chances voice content for life coaching
 */
export declare function loadSecondChancesVoice(personaId?: string): Promise<SecondChancesVoice | null>;
/**
 * Load connection voice content for life coaching
 */
export declare function loadConnectionVoice(personaId?: string): Promise<ConnectionVoice | null>;
/**
 * Load difficult-conversations voice content for life coaching
 */
export declare function loadDifficultConversationsVoice(personaId?: string): Promise<DifficultConversationsVoice | null>;
/**
 * Load life-transitions voice content for life coaching
 */
export declare function loadLifeTransitionsVoice(personaId?: string): Promise<LifeTransitionsVoice | null>;
/**
 * Load quiet-growth voice content for life coaching
 */
export declare function loadQuietGrowthVoice(personaId?: string): Promise<QuietGrowthVoice | null>;
/**
 * Get a random phrase from an array (with SSML support)
 */
export declare function getRandomPhrase(phrases: string[] | undefined): string | null;
/**
 * Strip SSML tags from a phrase for context injection
 * (SSML is for TTS, not for LLM context)
 */
export declare function stripSsml(phrase: string): string;
/**
 * Get a random phrase, stripped of SSML for LLM context
 */
export declare function getRandomPhraseClean(phrases: string[] | undefined): string | null;
export declare function clearContentCache(): void;
declare const _default: {
    loadPersonaBehaviors: typeof loadPersonaBehaviors;
    loadPersonaContent: typeof loadPersonaContent;
    loadFerniContent: typeof loadFerniContent;
    loadTrustPhrases: typeof loadTrustPhrases;
    loadLateNightPresence: typeof loadLateNightPresence;
    loadEmotionalIntelligence: typeof loadEmotionalIntelligence;
    loadINoticePower: typeof loadINoticePower;
    loadSuperhumanInsights: typeof loadSuperhumanInsights;
    loadSilenceResponses: typeof loadSilenceResponses;
    loadSecondChancesVoice: typeof loadSecondChancesVoice;
    loadConnectionVoice: typeof loadConnectionVoice;
    loadDifficultConversationsVoice: typeof loadDifficultConversationsVoice;
    loadLifeTransitionsVoice: typeof loadLifeTransitionsVoice;
    loadQuietGrowthVoice: typeof loadQuietGrowthVoice;
    getRandomPhrase: typeof getRandomPhrase;
    getRandomPhraseClean: typeof getRandomPhraseClean;
    stripSsml: typeof stripSsml;
    clearContentCache: typeof clearContentCache;
    getContentCacheStats: typeof getContentCacheStats;
    pruneExpiredContent: typeof pruneExpiredContent;
};
export default _default;
//# sourceMappingURL=persona-content-loader.d.ts.map