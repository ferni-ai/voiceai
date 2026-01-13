/**
 * Human-Like Behaviors Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module implements sophisticated human behaviors that make Ferni feel alive.
 * Split into focused sub-modules for maintainability.
 *
 * @module intelligence/human-behaviors
 */
export { detectCulturalMoment, type CulturalMoment } from './cultural-moments.js';
export { detectUserEngagement, type EngagementSignals } from './engagement-detection.js';
export { getRunningJokeCallback, type RunningJoke } from './running-jokes.js';
export { getSpontaneousThought, type SpontaneousThought } from './spontaneous-thoughts.js';
export { inferUserPreferences, getPreferenceGuidance, type UserPreferences, } from './preference-learning.js';
export { getVoiceProsodyResponse, type ProsodyResponse } from './voice-prosody.js';
export { shouldInjectBackchannel, type BackchannelState } from './backchannels.js';
export { verifyTopicThreading, getProactiveGoalReference } from './topic-management.js';
export declare const HumanBehaviors: {
    detectCulturalMoment: () => Promise<import("./cultural-moments.js").CulturalMoment | null>;
    detectUserEngagement: (msgs: Array<{
        role: "user" | "assistant";
        content: string;
    }>, avgTime?: number) => Promise<import("./engagement-detection.js").EngagementSignals>;
    getRunningJokeCallback: (profile: unknown, topic: string, personaId?: string) => Promise<{
        joke: string;
        isCallback: boolean;
    } | null>;
    getSpontaneousThought: (personaId?: string) => Promise<import("./spontaneous-thoughts.js").SpontaneousThought | null>;
    inferUserPreferences: (msgs: string[], profile: unknown) => Promise<import("./preference-learning.js").UserPreferences>;
    getPreferenceGuidance: (prefs: import("./preference-learning.js").UserPreferences) => Promise<string>;
    getVoiceProsodyResponse: (voice: unknown) => Promise<import("./voice-prosody.js").ProsodyResponse>;
    shouldInjectBackchannel: (state: import("./backchannels.js").BackchannelState, silenceMs: number) => Promise<{
        inject: boolean;
        sound: string;
    } | null>;
    verifyTopicThreading: (history: Array<{
        role: "user" | "assistant";
        content: string;
    }>, topics: string[]) => Promise<{
        working: boolean;
        circledBackTopics: string[];
        missedTopics: string[];
        suggestion: string | null;
    }>;
    getProactiveGoalReference: (profile: unknown, topic: string) => Promise<string | null>;
};
export default HumanBehaviors;
//# sourceMappingURL=index.d.ts.map