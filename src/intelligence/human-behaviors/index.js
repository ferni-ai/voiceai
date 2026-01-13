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
// Re-export all sub-modules
export { detectCulturalMoment } from './cultural-moments.js';
export { detectUserEngagement } from './engagement-detection.js';
export { getRunningJokeCallback } from './running-jokes.js';
export { getSpontaneousThought } from './spontaneous-thoughts.js';
export { inferUserPreferences, getPreferenceGuidance, } from './preference-learning.js';
export { getVoiceProsodyResponse } from './voice-prosody.js';
export { shouldInjectBackchannel } from './backchannels.js';
export { verifyTopicThreading, getProactiveGoalReference } from './topic-management.js';
// Consolidated export for backward compatibility
export const HumanBehaviors = {
    detectCulturalMoment: async () => (await import('./cultural-moments.js')).detectCulturalMoment(),
    detectUserEngagement: async (msgs, avgTime) => (await import('./engagement-detection.js')).detectUserEngagement(msgs, avgTime),
    getRunningJokeCallback: async (profile, topic, personaId) => (await import('./running-jokes.js')).getRunningJokeCallback(profile, topic, personaId),
    getSpontaneousThought: async (personaId) => (await import('./spontaneous-thoughts.js')).getSpontaneousThought(personaId),
    inferUserPreferences: async (msgs, profile) => (await import('./preference-learning.js')).inferUserPreferences(msgs, profile),
    getPreferenceGuidance: async (prefs) => (await import('./preference-learning.js')).getPreferenceGuidance(prefs),
    getVoiceProsodyResponse: async (voice) => (await import('./voice-prosody.js')).getVoiceProsodyResponse(voice),
    shouldInjectBackchannel: async (state, silenceMs) => (await import('./backchannels.js')).shouldInjectBackchannel(state, silenceMs),
    verifyTopicThreading: async (history, topics) => (await import('./topic-management.js')).verifyTopicThreading(history, topics),
    getProactiveGoalReference: async (profile, topic) => (await import('./topic-management.js')).getProactiveGoalReference(profile, topic),
};
export default HumanBehaviors;
//# sourceMappingURL=index.js.map