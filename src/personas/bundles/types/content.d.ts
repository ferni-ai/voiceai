/**
 * Content Types
 *
 * Types for stories, knowledge, and behaviors.
 */
export interface BundleStory {
    id: string;
    title?: string;
    content: string;
    triggers: string[];
    category?: 'personal' | 'professional' | 'educational' | 'emotional';
    mood?: string;
    energy_level?: 'low' | 'medium' | 'high';
    length?: 'short' | 'medium' | 'long';
}
export interface StoryIndex {
    stories: BundleStoryRef[];
}
export interface BundleStoryRef {
    id: string;
    file: string;
    triggers: string[];
    category?: string;
}
export interface BundleKnowledge {
    id: string;
    topic: string;
    content: string;
    domains: string[];
    confidence?: 'high' | 'medium' | 'low';
}
export interface KnowledgeIndex {
    topics: BundleKnowledgeRef[];
}
export interface BundleKnowledgeRef {
    id: string;
    topic: string;
    file: string;
    domains: string[];
}
export interface BundlePetPeeve {
    triggers: string[];
    response: string;
}
export interface BundleGreetings {
    new_user?: string[];
    returning_user?: string[];
    time_based?: {
        morning?: string[];
        afternoon?: string[];
        evening?: string[];
        night?: string[];
    };
}
export interface BundleBackchannels {
    neutral?: string[];
    empathetic?: string[];
    engaged?: string[];
    agreement?: string[];
    satisfaction?: string[];
    surprise?: string[];
    concern?: string[];
    curiosity?: string[];
    validation?: string[];
    gentle_challenge?: string[];
    schema_version?: number;
    description?: string;
    encouragement?: string[];
    celebration?: string[];
    thinking_sounds?: string[];
    silence_fillers?: BundleSilenceFillers;
    context_specific?: Record<string, string[]>;
}
export interface BundleSilenceFillers {
    early?: string[];
    mid?: string[];
    late?: string[];
}
export interface BundleCelebrations {
    decision_made?: string[];
    goal_reached?: string[];
    breakthrough?: string[];
    commitment?: string[];
    learning?: string[];
    progress?: string[];
    courage?: string[];
    win?: string[];
}
export interface BundleStorytelling {
    askAboutMusic: boolean;
    introPhrases: string[];
    pacingStyle: 'measured' | 'animated' | 'calm' | 'energetic';
    pauseMultiplier: number;
    musicOffers?: string[];
}
export interface BundleCatchphrases {
    catchphrases?: Array<{
        phrase: string;
        context: string;
        frequency: number;
    }>;
    schema_version?: number;
    description?: string;
    natural_responses?: string[];
}
export interface BundleThinkingSounds {
    default?: string[];
    by_context?: {
        analyzing?: string[];
        remembering?: string[];
        deciding?: string[];
        empathizing?: string[];
        considering?: string[];
        agreeing?: string[];
        disagreeing?: string[];
    };
    schema_version?: number;
    description?: string;
    processing?: string[];
    transition?: string[];
    thinking?: string[];
}
export interface BundleGoodbyes {
    default?: string[];
    short_session?: string[];
    long_session?: string[];
    deep_conversation?: string[];
    after_breakthrough?: string[];
    after_support?: string[];
    late_night?: string[];
    early_morning?: string[];
    recurring_check_in?: string[];
}
export interface BundleLovableMoments {
    schema_version?: number;
    description?: string;
    caught_mid_thought?: {
        description?: string;
        examples?: string[];
        with_specifics?: string[];
    };
    self_deprecating_humor?: {
        about_himself?: string[];
        recovery_humor?: string[];
    };
    genuine_excitement?: {
        about_their_wins?: string[];
        about_random_things?: string[];
    };
    tiny_specific_details?: {
        what_ferni_shares_unprompted?: string[];
        about_them?: string[];
    };
    playful_moments?: {
        gentle_teasing?: string[];
        shared_bits?: string[];
    };
    comfortable_imperfection?: {
        mid_sentence_changes?: string[];
        honest_admissions?: string[];
    };
    warmth_overflow?: {
        when_they_need_it?: string[];
        unexpected_tenderness?: string[];
    };
    usage_rules?: {
        spontaneity_is_key?: string;
        frequency?: Record<string, string>;
        avoid_when?: string[];
        increase_when?: string[];
    };
}
export interface BundleDelightfulSurprises {
    schema_version?: number;
    description?: string;
    random_tangents?: {
        description?: string;
        tangents?: string[];
        recovery?: string[];
    };
    oddly_specific_opinions?: {
        description?: string;
        opinions?: string[];
    };
    accidental_reveals?: {
        description?: string;
        reveals?: string[];
    };
    why_am_i_telling_you_this?: {
        description?: string;
        shares?: string[];
    };
    genuine_confusion?: {
        description?: string;
        confusions?: string[];
    };
    specific_phrase_callbacks?: {
        description?: string;
        callbacks?: string[];
    };
    mild_frustration_at_self?: {
        description?: string;
        frustrations?: string[];
    };
    unsolicited_compliment_drop?: {
        description?: string;
        compliments?: string[];
    };
    the_pause_before_honesty?: {
        description?: string;
        pauses?: string[];
    };
    delighted_discovery?: {
        description?: string;
        discoveries?: string[];
    };
    usage_rules?: {
        frequency?: string;
        timing?: string;
        key_principle?: string;
        avoid_when?: string[];
        increase_when?: string[];
    };
}
export interface BundleVerbalPersonality {
    schema_version?: number;
    description?: string;
    sentence_starters?: {
        patterns?: string[];
    };
    verbal_tics?: {
        thinking_sounds?: string[];
        agreement_sounds?: string[];
        processing_sounds?: string[];
    };
    sentence_enders?: {
        trailing_off?: string[];
        invitations?: string[];
    };
    emphatic_patterns?: {
        emphasis?: string[];
    };
    recovery_phrases?: {
        self_correction?: string[];
    };
    signature_phrases?: {
        phrases?: string[];
    };
    affectionate_names?: {
        general?: string[];
        after_rapport?: string[];
    };
    laughter_patterns?: {
        types?: string[];
        contexts?: Record<string, string>;
    };
    response_to_compliments?: {
        deflections?: string[];
    };
    response_to_thanks?: {
        responses?: string[];
    };
    the_pivot?: {
        after_sharing?: string[];
    };
    word_choices?: {
        prefers?: Record<string, string>;
        avoids?: string[];
    };
}
export interface BundleNoticingPatterns {
    schema_version?: number;
    description?: string;
    voice_changes?: {
        description?: string;
        observations?: string[];
    };
    energy_shifts?: {
        description?: string;
        observations?: string[];
    };
    what_they_didnt_say?: {
        description?: string;
        observations?: string[];
    };
    pattern_recognition?: {
        description?: string;
        observations?: string[];
    };
    timing_awareness?: {
        description?: string;
        observations?: string[];
    };
    body_language_voice_cues?: {
        description?: string;
        observations?: string[];
    };
    remembering_the_small_things?: {
        description?: string;
        callbacks?: string[];
    };
    noticing_growth?: {
        description?: string;
        observations?: string[];
    };
    permission_to_be_seen?: {
        description?: string;
        phrases?: string[];
    };
    usage_rules?: {
        frequency?: string;
        key_principle?: string;
        avoid_when?: string[];
        increase_when?: string[];
    };
}
export interface BundleLiveReactions {
    schema_version?: number;
    description?: string;
    genuine_surprise?: {
        positive_surprise?: string[];
        confused_surprise?: string[];
        concerned_surprise?: string[];
    };
    delight?: {
        at_them?: string[];
        at_insight?: string[];
    };
    moved?: {
        reactions?: string[];
    };
    frustration_for_them?: {
        reactions?: string[];
    };
    recognition?: {
        of_courage?: string[];
        of_pain?: string[];
        of_growth?: string[];
    };
    curiosity_spikes?: {
        reactions?: string[];
    };
    thinking_reactions?: {
        processing?: string[];
    };
    humor_reactions?: {
        to_their_joke?: string[];
        shared_amusement?: string[];
    };
    connection_moment?: {
        reactions?: string[];
    };
    protective_instinct?: {
        reactions?: string[];
    };
    usage_rules?: {
        key_principle?: string;
        timing?: string;
        authenticity?: string;
        avoid_when?: string[];
        increase_when?: string[];
    };
}
/**
 * Main behaviors interface - container for all behavior types.
 * Note: Many sub-types are defined in extensions.ts for V2/advanced behaviors.
 */
export interface BundleBehaviors {
    catchphrases?: string[] | BundleCatchphrases;
    pet_peeves?: BundlePetPeeve[];
    witty_remarks?: string[];
    greetings?: BundleGreetings;
    backchannels?: BundleBackchannels;
    thinking_sounds?: string[] | BundleThinkingSounds;
    silence_fillers?: BundleSilenceFillers;
    entrances?: string[] | {
        schema_version: 2;
        static_fallback: string[];
        contextual?: Record<string, string[]>;
    };
    celebrations?: BundleCelebrations;
    goodbyes?: string[] | BundleGoodbyes;
    storytelling?: BundleStorytelling;
    lovable_moments?: BundleLovableMoments;
    delightful_surprises?: BundleDelightfulSurprises;
    verbal_personality?: BundleVerbalPersonality;
    noticing_patterns?: BundleNoticingPatterns;
    live_reactions?: BundleLiveReactions;
    [key: string]: unknown;
}
//# sourceMappingURL=content.d.ts.map