/**
 * Revelation Moments Types
 *
 * > "The capability is felt, not explained."
 *
 * Tracks when users FIRST experience Ferni's superhuman capabilities,
 * ensuring we don't overwhelm or feel like surveillance.
 *
 * Philosophy:
 * - A real friend doesn't announce their capabilities
 * - Depth is EARNED through relationship
 * - Make them feel KNOWN, not TRACKED
 * - The best features are invisible infrastructure
 *
 * @module services/revelation-moments/types
 */

// ============================================================================
// REVELATION TYPES
// ============================================================================

/**
 * Types of revelations (moments when a capability is first experienced)
 */
export type RevelationType =
  | 'first_callback' // First time we referenced something from past
  | 'first_pattern_notice' // First time we surfaced a pattern
  | 'first_anticipation' // First time we anticipated their need
  | 'first_growth_reflection' // First time we reflected their growth
  | 'first_gentle_challenge' // First time we lovingly pushed back
  | 'first_life_arc' // First time we synthesized their journey
  | 'first_team_handoff' // First time another persona helped
  | 'first_vulnerability_match' // First time we matched their vulnerability
  | 'first_inside_joke' // First time we created shared humor
  | 'first_proactive_outreach'; // First time we reached out unprompted

/**
 * A single revelation moment
 */
export interface RevelationMoment {
  type: RevelationType;
  occurredAt: number;
  sessionId: string;
  personaId: string;
  /** Brief context of what triggered this revelation */
  context: string;
  /** How they responded (for learning) */
  userResponse?: 'positive' | 'neutral' | 'negative' | 'unknown';
}

/**
 * Complete revelation profile for a user
 */
export interface RevelationProfile {
  userId: string;

  /** Map of revelation type to first occurrence */
  revelations: Partial<Record<RevelationType, RevelationMoment>>;

  /** Current session's capability usage (for throttling) */
  currentSessionCapabilities: string[];

  /** Last session ID (to reset per-session throttling) */
  lastSessionId?: string;

  /** Total capabilities revealed */
  totalRevelations: number;

  /** When profile was created */
  createdAt: number;

  /** Last updated */
  updatedAt: number;
}

// ============================================================================
// THROTTLING TYPES
// ============================================================================

/**
 * Capability categories for throttling
 */
export type CapabilityCategory =
  | 'memory' // Remembering past conversations
  | 'pattern' // Noticing patterns
  | 'anticipation' // Predicting needs
  | 'growth' // Reflecting on their development
  | 'challenge' // Pushing back lovingly
  | 'synthesis' // Big-picture connections
  | 'team'; // Multi-persona coordination

/**
 * Throttling rules per category
 */
export interface ThrottleRule {
  category: CapabilityCategory;
  /** Max uses per session */
  maxPerSession: number;
  /** Min sessions before this category is available */
  minSessionsRequired: number;
  /** Min trust level (0-1) before available */
  minTrustRequired?: number;
}

/**
 * Default throttle rules (conservative - better to under-impress than overwhelm)
 */
export const DEFAULT_THROTTLE_RULES: ThrottleRule[] = [
  { category: 'memory', maxPerSession: 2, minSessionsRequired: 2 },
  { category: 'pattern', maxPerSession: 1, minSessionsRequired: 4 },
  { category: 'anticipation', maxPerSession: 1, minSessionsRequired: 6 },
  { category: 'growth', maxPerSession: 1, minSessionsRequired: 8, minTrustRequired: 0.4 },
  { category: 'challenge', maxPerSession: 1, minSessionsRequired: 10, minTrustRequired: 0.5 },
  { category: 'synthesis', maxPerSession: 1, minSessionsRequired: 15, minTrustRequired: 0.7 },
  { category: 'team', maxPerSession: 2, minSessionsRequired: 3 },
];

// ============================================================================
// ANTI-SURVEILLANCE TYPES
// ============================================================================

/**
 * Categories of surveillance-y language to avoid
 */
export type SurveillanceCategory =
  | 'data_reference' // "Our records show", "Based on your data"
  | 'tracking_language' // "We've tracked", "We've been monitoring"
  | 'statistics' // "In 80% of your sessions", "You've mentioned X times"
  | 'database_speak' // "Your profile indicates", "Our system detected"
  | 'feature_announce'; // "I can help you with", "My capabilities include"

/**
 * Pattern to detect and alternative to use
 */
export interface LanguagePattern {
  category: SurveillanceCategory;
  /** Regex or string to match */
  pattern: string | RegExp;
  /** What to say instead (if applicable) */
  alternative?: string;
  /** Severity: block entirely or just warn */
  severity: 'block' | 'warn';
}

// ============================================================================
// PERMISSION TYPES
// ============================================================================

/**
 * Permission prompt categories
 */
export type PermissionCategory =
  | 'share_observation' // "Can I share something I noticed?"
  | 'go_deeper' // "Want me to go deeper on this?"
  | 'challenge' // "Can I push back a little?"
  | 'pattern_name' // "I'm seeing a pattern. Want me to name it?"
  | 'vulnerability'; // "Can I be honest about something?"

/**
 * Permission prompt with variations
 */
export interface PermissionPrompt {
  category: PermissionCategory;
  /** Variations to choose from (keeps it fresh) */
  prompts: string[];
  /** When this permission should be asked */
  useWhen: {
    minTrustLevel?: number;
    capabilities: CapabilityCategory[];
  };
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create empty revelation profile
 */
export function createEmptyRevelationProfile(userId: string): RevelationProfile {
  return {
    userId,
    revelations: {},
    currentSessionCapabilities: [],
    totalRevelations: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Map revelation type to capability category
 */
export function revelationToCategory(type: RevelationType): CapabilityCategory {
  const mapping: Record<RevelationType, CapabilityCategory> = {
    first_callback: 'memory',
    first_pattern_notice: 'pattern',
    first_anticipation: 'anticipation',
    first_growth_reflection: 'growth',
    first_gentle_challenge: 'challenge',
    first_life_arc: 'synthesis',
    first_team_handoff: 'team',
    first_vulnerability_match: 'growth',
    first_inside_joke: 'memory',
    first_proactive_outreach: 'anticipation',
  };
  return mapping[type];
}

/**
 * Get human-readable name for revelation type
 */
export function getRevelationName(type: RevelationType): string {
  const names: Record<RevelationType, string> = {
    first_callback: 'First Memory Callback',
    first_pattern_notice: 'First Pattern Notice',
    first_anticipation: 'First Anticipation',
    first_growth_reflection: 'First Growth Reflection',
    first_gentle_challenge: 'First Gentle Challenge',
    first_life_arc: 'First Life Arc Synthesis',
    first_team_handoff: 'First Team Handoff',
    first_vulnerability_match: 'First Vulnerability Match',
    first_inside_joke: 'First Inside Joke',
    first_proactive_outreach: 'First Proactive Outreach',
  };
  return names[type];
}
