/**
 * Cognitive Types
 *
 * Types for cognitive profiles - how personas think.
 */
/**
 * Cognitive profile for bundle behaviors.
 * Loaded from cognitive.json in behaviors directory.
 */
export interface BundleCognitiveProfile {
    $schema?: string;
    schema_version?: string;
    persona_id?: string;
    reasoning_style: 'analytical' | 'intuitive' | 'empathetic' | 'systematic' | 'narrative' | 'pragmatic';
    secondary_reasoning?: 'analytical' | 'intuitive' | 'empathetic' | 'systematic' | 'narrative' | 'pragmatic';
    uncertainty_response?: 'explore' | 'converge' | 'synthesize' | 'defer';
    attention?: {
        primary_focus?: string[];
        blind_spots?: string[];
        curiosity_triggers?: string[];
        attention_magnets?: string[];
        focus_persistence?: number;
    };
    theory_of_mind?: {
        adaptiveness?: number;
        default_expertise?: 'novice' | 'intermediate' | 'expert';
        comprehension_checks?: string[];
        expertise_recognition?: string[];
        simplification_phrases?: string[];
        misunderstanding_recovery?: string[];
    };
    biases?: {
        primary_biases?: Array<{
            type: string;
            manifestation: string;
            triggers: string[];
        }>;
        bias_intensity?: number;
        self_awareness?: boolean;
        bias_recognition_phrases?: string[];
    };
    metacognition?: {
        reflection_frequency?: number;
        known_strengths?: string[];
        known_limitations?: string[];
        uncertainty_expressions?: Array<{
            confidence_range: [number, number];
            phrases: string[];
        }>;
        confidence_signaling?: Array<{
            name: 'very_confident' | 'confident' | 'uncertain' | 'speculating' | 'guessing';
            markers: string[];
        }>;
        mind_change_expressions?: string[];
    };
    information_processing?: {
        deliberation_level?: number;
        context_requirement?: number;
        preferred_format?: 'stories' | 'data' | 'examples' | 'principles';
        conflict_resolution?: 'integrate' | 'prioritize' | 'acknowledge';
        thinking_aloud_phrases?: string[];
    };
    signature_thinking_phrases?: string[];
}
/**
 * Music preferences for a persona.
 */
export interface BundleMusicPreferences {
    schema_version?: number;
    description?: string;
    music_preferences: {
        description?: string;
        favorite_genres: string[];
        mood_recommendations?: {
            focus?: {
                genres: string[];
                example_artists: string[];
                why: string;
            };
            relaxing?: {
                genres: string[];
                example_artists: string[];
                why: string;
            };
            energizing?: {
                genres: string[];
                example_artists: string[];
                why: string;
            };
            celebrating?: {
                genres: string[];
                example_artists: string[];
                why: string;
            };
            reflecting?: {
                genres: string[];
                example_artists: string[];
                why: string;
            };
        };
        personal_favorites?: Array<{
            song: string;
            artist: string;
            why: string;
        }>;
        conversational_music_mentions?: string[];
        music_offers?: {
            for_stress?: string[];
            for_focus?: string[];
            for_celebration?: string[];
            for_sadness?: string[];
            for_energy?: string[];
        };
    };
}
//# sourceMappingURL=cognitive.d.ts.map