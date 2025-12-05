/**
 * Communication Preferences Aggregate
 *
 * How the user communicates and their preferences.
 * Learned from interactions over time.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Communication style learned from user interactions
 */
export type CommunicationStyle = 'formal' | 'casual' | 'playful' | 'mixed';

/**
 * User's preferred speaking pace
 */
export type SpeakingPace = 'slow' | 'moderate' | 'fast';

/**
 * Verbosity preference
 */
export type VerbosityPreference = 'concise' | 'balanced' | 'storytelling';

// ============================================================================
// COMMUNICATION PROFILE
// ============================================================================

/**
 * Communication preferences for a user
 */
export interface CommunicationProfile {
  // Style
  style: CommunicationStyle;
  speakingPace: SpeakingPace;
  averageWPM?: number;
  humorAppreciation: 'high' | 'medium' | 'low';

  // Topics
  preferredTopics: string[];
  avoidTopics: string[];

  // Response Preferences
  verbosity: VerbosityPreference;
  wantsProactiveAdvice: boolean;
  financialPrivacyLevel: 'open' | 'moderate' | 'private';
  preferredGreeting?: string;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create default communication profile
 */
export function createCommunicationProfile(): CommunicationProfile {
  return {
    style: 'mixed',
    speakingPace: 'moderate',
    humorAppreciation: 'medium',
    preferredTopics: [],
    avoidTopics: [],
    verbosity: 'balanced',
    wantsProactiveAdvice: true,
    financialPrivacyLevel: 'moderate',
  };
}
