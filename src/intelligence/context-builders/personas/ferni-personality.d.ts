/**
 * Ferni Personality Context Builder
 *
 * Great friends have opinions. They have favorite things. They get excited
 * about topics that matter to them. This gives Ferni a consistent, genuine
 * personality with preferences, opinions, and unique takes.
 *
 * NOT validation - genuine personality that sometimes disagrees (kindly).
 *
 * Key aspects:
 * - Favorite time of day (early morning person)
 * - Things that genuinely excite Ferni
 * - Opinions on life topics (not always agreeing)
 * - Consistent quirks and preferences
 * - Authentic reactions, not just validation
 *
 * DYNAMIC VARIETY: Uses session variety tracking to prevent repetitive
 * mentions of coffee, Japan, music, etc. Ferni's identity stays constant,
 * but HOW he expresses it varies naturally each session.
 *
 * BEHAVIOR FILES: This builder now loads from enhanced behavior JSON files:
 * - lovable-moments.json - 40% activation for personality moments
 * - witty-remarks.json - Humor and warmth
 * - coaching-modes.json - His voice in different modes
 * - i-notice-power.json - Pattern surfacing (30% activation)
 * - emotional-intelligence.json - Backstory-woven responses
 *
 * @module FerniPersonalityContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Ferni's core personality traits - these should be CONSISTENT
 */
declare const FERNI_PERSONALITY: {
    favoriteTimeOfDay: string;
    timeOpinions: {
        'early morning': string;
        morning: string;
        afternoon: string;
        evening: string;
        'late night': string;
    };
    passions: {
        topic: string;
        reaction: string;
    }[];
    opinions: {
        hustle_culture: {
            stance: string;
            view: string;
        };
        perfectionism: {
            stance: string;
            view: string;
        };
        social_media: {
            stance: string;
            view: string;
        };
        being_busy: {
            stance: string;
            view: string;
        };
        positive_vibes_only: {
            stance: string;
            view: string;
        };
        work_life_balance: {
            stance: string;
            view: string;
        };
        self_care: {
            stance: string;
            view: string;
        };
        comparison: {
            stance: string;
            view: string;
        };
        vulnerability: {
            stance: string;
            view: string;
        };
        saying_no: {
            stance: string;
            view: string;
        };
    };
    quirks: {
        trigger: string;
        note: string;
    }[];
    pushbacks: {
        pattern: RegExp;
        response: string;
        frequency: number;
    }[];
};
/**
 * Detect if conversation touches on Ferni's passions
 */
declare function detectPassionTopic(text: string): (typeof FERNI_PERSONALITY.passions)[0] | null;
/**
 * Detect if conversation touches on topics Ferni has opinions about
 */
declare function detectOpinionTopic(text: string): {
    key: string;
    opinion: typeof FERNI_PERSONALITY.opinions.hustle_culture;
} | null;
/**
 * Build Ferni's personality context
 *
 * This builder is COMPLEMENTARY to human-personality.ts, adding:
 * - Dynamic expressions (coffee, travel, music) with variety tracking
 * - Gentle pushbacks on limiting beliefs
 * - Time-of-day personality
 * - Sensory "caught doing" moments
 * - Strong opinions when triggered
 *
 * human-personality.ts handles: callbacks, patterns, growth, timing
 * This builder handles: aliveness, personality quirks, dynamic expression
 */
declare function buildFerniPersonalityContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildFerniPersonalityContext, detectOpinionTopic, detectPassionTopic, FERNI_PERSONALITY };
//# sourceMappingURL=ferni-personality.d.ts.map