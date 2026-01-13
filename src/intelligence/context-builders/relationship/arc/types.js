/**
 * Relationship Arc Types
 *
 * > "Better than human" means tracking the full arc of a relationship,
 * > not just individual moments.
 *
 * These types define the data structures for tracking a relationship
 * from first meeting through deep partnership.
 *
 * @module intelligence/context-builders/relationship/arc/types
 */
export const STAGE_CONFIGS = {
    stranger: {
        stage: 'stranger',
        minSessions: 0,
        description: 'First meeting - build safety and rapport',
        behaviors: [
            'Model vulnerability first',
            'Match their energy exactly',
            'Gift of noticing',
            'No feature explaining',
            'Unhurried presence',
        ],
    },
    acquaintance: {
        stage: 'acquaintance',
        minSessions: 2,
        description: 'Getting to know each other - build trust through consistency',
        behaviors: [
            'Reference shared history',
            'Remember their preferences',
            'Gentle pattern observations',
            'Build shared vocabulary',
            'Notice what they care about',
        ],
    },
    friend: {
        stage: 'friend',
        minSessions: 6,
        minTrustScore: 0.4,
        description: 'Established friendship - deeper connection',
        behaviors: [
            'Inside jokes and callbacks',
            'Challenge gently when needed',
            'Notice growth before they do',
            'Anticipate their needs',
            'Share more personal observations',
        ],
    },
    trusted_advisor: {
        stage: 'trusted_advisor',
        minSessions: 15,
        minTrustScore: 0.7,
        description: 'Deep partnership - authentic depth',
        behaviors: [
            'Life arc awareness',
            'Challenge appropriately',
            'Synthesize across domains',
            'Hold them accountable (lovingly)',
            'Be their institutional memory',
        ],
    },
};
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
/**
 * Create default relationship arc data for a new user
 */
export function createDefaultRelationshipArcData(userId) {
    return {
        userId,
        currentStage: 'stranger',
        stageTransitions: [],
        firstMeeting: null,
        keyMoments: [],
        sharedVocabulary: [],
        totalSessions: 0,
        totalTurns: 0,
        firstSessionDate: Date.now(),
        lastSessionDate: Date.now(),
        vulnerabilityCount: 0,
        breakthroughCount: 0,
        celebrationCount: 0,
        referencedMilestones: [],
    };
}
/**
 * Determine the appropriate stage based on stats
 */
export function determineStage(totalSessions, trustScore) {
    // Check stages from highest to lowest
    if (totalSessions >= STAGE_CONFIGS.trusted_advisor.minSessions &&
        (trustScore === undefined || trustScore >= (STAGE_CONFIGS.trusted_advisor.minTrustScore ?? 0))) {
        return 'trusted_advisor';
    }
    if (totalSessions >= STAGE_CONFIGS.friend.minSessions &&
        (trustScore === undefined || trustScore >= (STAGE_CONFIGS.friend.minTrustScore ?? 0))) {
        return 'friend';
    }
    if (totalSessions >= STAGE_CONFIGS.acquaintance.minSessions) {
        return 'acquaintance';
    }
    return 'stranger';
}
/**
 * Generate a unique moment ID
 */
export function generateMomentId() {
    return `moment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
//# sourceMappingURL=types.js.map