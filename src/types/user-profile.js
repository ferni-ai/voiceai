/**
 * User Profile Types
 *
 * Comprehensive type definitions for persistent user memory,
 * preferences, relationship history, and financial context.
 */
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
/**
 * Create a new user profile with defaults
 */
export function createUserProfile(id, name) {
    const now = new Date();
    return {
        id,
        name,
        contactInfo: undefined, // Will be populated when user provides phone/email
        firstContact: now,
        lastContact: now,
        totalConversations: 0,
        totalMinutesTalked: 0,
        communicationStyle: 'mixed',
        speakingPace: 'moderate',
        preferredTopics: [],
        avoidTopics: [],
        humorAppreciation: 'medium',
        relationshipStage: 'new_acquaintance',
        familyMembers: [],
        keyMoments: [],
        sharedStories: [],
        emotionalPatterns: [],
        riskProfile: {
            tolerance: 'unknown',
            confidence: 0,
            assessedAt: now,
            factors: [],
        },
        goals: [],
        primaryConcerns: [],
        investmentEvents: [],
        hasInvestments: false,
        investmentExperience: 'unknown',
        financialSituation: undefined,
        financialAnxietyTriggers: [],
        lifeStage: undefined,
        preferences: {
            verbosity: 'balanced',
            topicsToAvoid: [],
            wantsProactiveAdvice: true,
            financialPrivacyLevel: 'moderate',
            // Voice preferences - defaults to American, can be auto-detected or user-set
            preferredAccent: 'american',
            accentAutoDetected: true,
        },
        conversationSummaries: [],
        openQuestions: [],
        pendingFollowUps: [],
        createdAt: now,
        updatedAt: now,
        version: 1,
    };
}
/**
 * Update relationship stage based on interaction count and depth
 */
export function calculateRelationshipStage(profile) {
    const { totalConversations, totalMinutesTalked, keyMoments } = profile;
    const deepMoments = keyMoments.filter((m) => m.emotionalWeight === 'heavy').length;
    if (totalConversations <= 2) {
        return 'new_acquaintance';
    }
    if (totalConversations <= 5 && totalMinutesTalked < 60) {
        return 'getting_to_know';
    }
    if (totalConversations >= 10 && deepMoments >= 3) {
        return 'old_friend';
    }
    if (totalConversations >= 5 || deepMoments >= 1) {
        return 'trusted_advisor';
    }
    return 'getting_to_know';
}
/**
 * Merge new session data into existing profile
 */
export function updateProfileFromSession(profile, sessionData) {
    const updated = { ...profile };
    const now = new Date();
    // Update name - always update if provided (allows name corrections)
    if (sessionData.name) {
        updated.name = sessionData.name;
    }
    updated.lastContact = now;
    updated.totalConversations += 1;
    updated.totalMinutesTalked += sessionData.sessionDurationMinutes || 0;
    // Update current session state
    updated.currentMood = sessionData.mood;
    updated.currentEnergyLevel = sessionData.energyLevel;
    // Learn topics
    if (sessionData.topicsDiscussed) {
        for (const topic of sessionData.topicsDiscussed) {
            if (!updated.preferredTopics.includes(topic)) {
                updated.preferredTopics.push(topic);
            }
        }
    }
    // Track emotional patterns
    if (sessionData.emotionalMoments) {
        updated.emotionalPatterns.push(...sessionData.emotionalMoments);
        // Keep only last 50 patterns
        if (updated.emotionalPatterns.length > 50) {
            updated.emotionalPatterns = updated.emotionalPatterns.slice(-50);
        }
    }
    // Track open questions
    if (sessionData.questionsAsked) {
        updated.openQuestions.push(...sessionData.questionsAsked);
        // Dedupe and limit
        updated.openQuestions = [...new Set(updated.openQuestions)].slice(-20);
    }
    // Update relationship stage
    updated.relationshipStage = calculateRelationshipStage(updated);
    updated.updatedAt = now;
    updated.version += 1;
    return updated;
}
//# sourceMappingURL=user-profile.js.map