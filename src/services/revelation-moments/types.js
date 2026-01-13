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
/**
 * Default throttle rules (conservative - better to under-impress than overwhelm)
 */
export const DEFAULT_THROTTLE_RULES = [
    { category: 'memory', maxPerSession: 2, minSessionsRequired: 2 },
    { category: 'pattern', maxPerSession: 1, minSessionsRequired: 4 },
    { category: 'anticipation', maxPerSession: 1, minSessionsRequired: 6 },
    { category: 'growth', maxPerSession: 1, minSessionsRequired: 8, minTrustRequired: 0.4 },
    { category: 'challenge', maxPerSession: 1, minSessionsRequired: 10, minTrustRequired: 0.5 },
    { category: 'synthesis', maxPerSession: 1, minSessionsRequired: 15, minTrustRequired: 0.7 },
    { category: 'team', maxPerSession: 2, minSessionsRequired: 3 },
];
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
/**
 * Create empty revelation profile
 */
export function createEmptyRevelationProfile(userId) {
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
export function revelationToCategory(type) {
    const mapping = {
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
export function getRevelationName(type) {
    const names = {
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
//# sourceMappingURL=types.js.map