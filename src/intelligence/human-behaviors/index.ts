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
export { detectCulturalMoment, type CulturalMoment } from './cultural-moments.js';

export { detectUserEngagement, type EngagementSignals } from './engagement-detection.js';

export { getRunningJokeCallback, type RunningJoke } from './running-jokes.js';

export { getSpontaneousThought, type SpontaneousThought } from './spontaneous-thoughts.js';

export {
  inferUserPreferences,
  getPreferenceGuidance,
  type UserPreferences,
} from './preference-learning.js';

export { getVoiceProsodyResponse, type ProsodyResponse } from './voice-prosody.js';

export { shouldInjectBackchannel, type BackchannelState } from './backchannels.js';

export { verifyTopicThreading, getProactiveGoalReference } from './topic-management.js';

// Consolidated export for backward compatibility
export const HumanBehaviors = {
  detectCulturalMoment: async () => (await import('./cultural-moments.js')).detectCulturalMoment(),
  detectUserEngagement: async (
    msgs: Array<{ role: 'user' | 'assistant'; content: string }>,
    avgTime?: number
  ) => (await import('./engagement-detection.js')).detectUserEngagement(msgs, avgTime),
  getRunningJokeCallback: async (profile: unknown, topic: string, personaId?: string) =>
    (await import('./running-jokes.js')).getRunningJokeCallback(
      profile as import('../../types/user-profile.js').UserProfile | null,
      topic,
      personaId
    ),
  getSpontaneousThought: async (personaId?: string) =>
    (await import('./spontaneous-thoughts.js')).getSpontaneousThought(personaId),
  inferUserPreferences: async (msgs: string[], profile: unknown) =>
    (await import('./preference-learning.js')).inferUserPreferences(
      msgs,
      profile as import('../../types/user-profile.js').UserProfile | null
    ),
  getPreferenceGuidance: async (prefs: import('./preference-learning.js').UserPreferences) =>
    (await import('./preference-learning.js')).getPreferenceGuidance(prefs),
  getVoiceProsodyResponse: async (voice: unknown) =>
    (await import('./voice-prosody.js')).getVoiceProsodyResponse(
      voice as Parameters<typeof import('./voice-prosody.js').getVoiceProsodyResponse>[0]
    ),
  shouldInjectBackchannel: async (
    state: import('./backchannels.js').BackchannelState,
    silenceMs: number
  ) => (await import('./backchannels.js')).shouldInjectBackchannel(state, silenceMs),
  verifyTopicThreading: async (
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    topics: string[]
  ) => (await import('./topic-management.js')).verifyTopicThreading(history, topics),
  getProactiveGoalReference: async (profile: unknown, topic: string) =>
    (await import('./topic-management.js')).getProactiveGoalReference(
      profile as import('../../types/user-profile.js').UserProfile | null,
      topic
    ),
};

export default HumanBehaviors;
