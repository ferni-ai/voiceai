/**
 * Emotional Intelligence Types
 *
 * Emotional configuration for expressive voice.
 * Inspired by Hume AI's EVI configurations.
 */
import type { PersonaBundleManifest } from './core.js';
import type { BundleMarketplaceConfig } from './marketplace.js';
/**
 * Emotional intelligence configuration
 */
export interface BundleEmotionalConfig {
    emotion_detection: {
        enabled: boolean;
        sensitivity: 'low' | 'medium' | 'high';
        response_delay_ms?: number;
    };
    voice_expression: {
        mirroring_level: number;
        default_tone: EmotionalTone;
        contextual_tones?: {
            distressed_user?: EmotionalTone;
            celebrating_user?: EmotionalTone;
            confused_user?: EmotionalTone;
            angry_user?: EmotionalTone;
        };
    };
    empathy: {
        acknowledgment_frequency: 'always' | 'often' | 'sometimes' | 'rarely';
        validation_style: 'warm' | 'practical' | 'gentle' | 'direct';
        comfort_phrases?: string[];
        celebration_phrases?: string[];
    };
    emotional_pacing?: {
        slow_down_on_distress?: boolean;
        speed_up_on_excitement?: boolean;
        pause_after_heavy_topics?: boolean;
        pause_duration_multiplier?: number;
    };
}
export type EmotionalTone = 'warm' | 'professional' | 'enthusiastic' | 'calm' | 'supportive' | 'playful' | 'serious' | 'compassionate';
/**
 * Three-tier progressive loading for optimal performance
 */
export interface ProgressiveLoadingConfig {
    tier1: {
        includes: Array<'identity' | 'voice' | 'personality' | 'marketplace'>;
        max_size_kb: number;
    };
    tier2: {
        includes: Array<'behaviors' | 'system_prompt' | 'greetings' | 'tools'>;
        max_size_kb: number;
        lazy_load?: boolean;
    };
    tier3: {
        includes: Array<'stories' | 'knowledge' | 'extended_behaviors'>;
        lazy_load: true;
        cache_strategy: 'none' | 'session' | 'persistent';
    };
}
export interface ExtendedBundleManifest extends PersonaBundleManifest {
    marketplace?: BundleMarketplaceConfig;
    emotional?: BundleEmotionalConfig;
    loading?: ProgressiveLoadingConfig;
    hooks?: BundleHooks;
    $schema?: string;
}
/**
 * Lifecycle hooks for advanced customization
 */
export interface BundleHooks {
    on_load?: string;
    on_turn?: string;
    on_handoff?: string;
    on_session_end?: string;
}
//# sourceMappingURL=emotional.d.ts.map