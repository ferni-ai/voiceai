/**
 * Relationship Adapter Service
 *
 * Adapts outreach tone, formality, and style based on relationship depth.
 * As relationships deepen, communication becomes more casual and personal.
 *
 * Relationship Stages:
 * - New: Formal, permission-seeking, careful
 * - Building: Friendly, warming up, learning
 * - Established: Casual, comfortable, familiar
 * - Deep: Intimate, inside jokes, friend-like
 *
 * Philosophy: How we talk to someone should reflect how well we know them.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { loadOutreachProfile, saveOutreachProfile } from './firestore-persistence.js';
// ============================================================================
// STAGE DEFINITIONS
// ============================================================================
const STAGE_THRESHOLDS = {
    building: {
        minConversations: 3,
        minDays: 2,
    },
    established: {
        minConversations: 10,
        minDays: 7,
        minEmotionalMoments: 2,
    },
    deep: {
        minConversations: 30,
        minDays: 30,
        minEmotionalMoments: 5,
        minCelebrations: 3,
    },
};
const STAGE_TONE_SETTINGS = {
    new: {
        formality: 'formal',
        emojiLevel: 'minimal',
        humorAllowed: false,
        canUseNickname: false,
        canReferenceHistory: false,
        canBeVulnerable: false,
        canBeDirect: false,
        shouldAskPermission: true,
    },
    building: {
        formality: 'friendly',
        emojiLevel: 'minimal',
        humorAllowed: true,
        canUseNickname: false,
        canReferenceHistory: true,
        canBeVulnerable: false,
        canBeDirect: false,
        shouldAskPermission: false,
    },
    established: {
        formality: 'casual',
        emojiLevel: 'moderate',
        humorAllowed: true,
        canUseNickname: true,
        canReferenceHistory: true,
        canBeVulnerable: true,
        canBeDirect: true,
        shouldAskPermission: false,
    },
    deep: {
        formality: 'intimate',
        emojiLevel: 'expressive',
        humorAllowed: true,
        canUseNickname: true,
        canReferenceHistory: true,
        canBeVulnerable: true,
        canBeDirect: true,
        shouldAskPermission: false,
    },
};
// ============================================================================
// STORAGE
// ============================================================================
const relationshipStore = new Map();
// ============================================================================
// SERVICE
// ============================================================================
const log = getLogger().child({ service: 'relationship-adapter' });
/**
 * Get or create relationship profile
 */
export function getRelationshipProfile(userId) {
    let profile = relationshipStore.get(userId);
    if (!profile) {
        profile = createNewProfile(userId);
        relationshipStore.set(userId, profile);
        // Async load from Firestore (fire and forget)
        loadRelationshipProfileFromFirestore(userId).catch((err) => {
            log.warn({ userId, error: String(err) }, 'Failed to load relationship profile from Firestore');
        });
    }
    return profile;
}
/**
 * Load relationship profile from Firestore
 */
async function loadRelationshipProfileFromFirestore(userId) {
    try {
        const outreachProfile = await loadOutreachProfile(userId);
        if (outreachProfile?.relationship) {
            const existing = relationshipStore.get(userId);
            if (existing) {
                const merged = { ...existing, ...outreachProfile.relationship };
                relationshipStore.set(userId, merged);
                log.debug({ userId }, 'Loaded relationship profile from Firestore');
            }
        }
    }
    catch (err) {
        log.debug({ err, userId }, 'Failed to load relationship profile from Firestore');
    }
}
/**
 * Persist relationship profile to Firestore
 */
function persistRelationshipProfile(userId, profile) {
    saveOutreachProfile(userId, { relationship: profile }).catch((err) => {
        log.debug({ err, userId }, 'Failed to persist relationship profile (non-fatal)');
    });
}
function createNewProfile(userId) {
    return {
        userId,
        stage: 'new',
        metrics: {
            totalConversations: 0,
            daysSinceFirst: 0,
            emotionalMomentsShared: 0,
            achievementsCelebrated: 0,
            strugglesDiscussed: 0,
            insideJokesCount: 0,
        },
        memory: {
            startDate: new Date(),
            insideJokes: [],
            sharedReferences: [],
            nicknames: [],
            significantMoments: [],
        },
        communicationStyle: {
            prefersFormal: false,
            likesEmoji: true,
            appreciatesHumor: true,
            respondsToDirectness: true,
            needsGentleness: false,
        },
    };
}
// ============================================================================
// STAGE CALCULATION
// ============================================================================
/**
 * Calculate relationship stage from metrics
 */
export function calculateStage(profile) {
    const { metrics, memory } = profile;
    // Calculate days since first interaction
    const daysSince = (Date.now() - memory.startDate.getTime()) / (1000 * 60 * 60 * 24);
    metrics.daysSinceFirst = daysSince;
    // Check deep relationship
    if (metrics.totalConversations >= STAGE_THRESHOLDS.deep.minConversations &&
        daysSince >= STAGE_THRESHOLDS.deep.minDays &&
        metrics.emotionalMomentsShared >= STAGE_THRESHOLDS.deep.minEmotionalMoments &&
        metrics.achievementsCelebrated >= STAGE_THRESHOLDS.deep.minCelebrations) {
        return 'deep';
    }
    // Check established relationship
    if (metrics.totalConversations >= STAGE_THRESHOLDS.established.minConversations &&
        daysSince >= STAGE_THRESHOLDS.established.minDays &&
        metrics.emotionalMomentsShared >= STAGE_THRESHOLDS.established.minEmotionalMoments) {
        return 'established';
    }
    // Check building relationship
    if (metrics.totalConversations >= STAGE_THRESHOLDS.building.minConversations &&
        daysSince >= STAGE_THRESHOLDS.building.minDays) {
        return 'building';
    }
    return 'new';
}
/**
 * Update stage based on current metrics
 */
export function updateStage(userId) {
    const profile = getRelationshipProfile(userId);
    const newStage = calculateStage(profile);
    if (newStage !== profile.stage) {
        const oldStage = profile.stage;
        profile.stage = newStage;
        relationshipStore.set(userId, profile);
        persistRelationshipProfile(userId, profile);
        log.info({ userId, oldStage, newStage, metrics: profile.metrics }, '🎉 Relationship stage changed');
    }
    return profile.stage;
}
// ============================================================================
// METRIC UPDATES
// ============================================================================
/**
 * Record a conversation
 */
export function recordConversation(userId, data) {
    const profile = getRelationshipProfile(userId);
    profile.metrics.totalConversations++;
    profile.memory.lastInteractionDate = new Date();
    if (data.persona) {
        profile.memory.preferredPersona = data.persona;
    }
    if (data.hadEmotionalMoment) {
        profile.metrics.emotionalMomentsShared++;
    }
    if (data.celebratedAchievement) {
        profile.metrics.achievementsCelebrated++;
    }
    if (data.discussedStruggle) {
        profile.metrics.strugglesDiscussed++;
    }
    relationshipStore.set(userId, profile);
    persistRelationshipProfile(userId, profile);
    updateStage(userId);
}
/**
 * Add an inside joke
 */
export function addInsideJoke(userId, joke) {
    const profile = getRelationshipProfile(userId);
    if (!profile.memory.insideJokes.includes(joke)) {
        profile.memory.insideJokes.push(joke);
        profile.metrics.insideJokesCount++;
        relationshipStore.set(userId, profile);
        persistRelationshipProfile(userId, profile);
        log.debug({ userId, joke }, 'Added inside joke');
    }
}
/**
 * Add a nickname
 */
export function addNickname(userId, nickname) {
    const profile = getRelationshipProfile(userId);
    if (!profile.memory.nicknames.includes(nickname)) {
        profile.memory.nicknames.push(nickname);
        relationshipStore.set(userId, profile);
        log.debug({ userId, nickname }, 'Added nickname');
    }
}
/**
 * Add a shared reference
 */
export function addSharedReference(userId, reference) {
    const profile = getRelationshipProfile(userId);
    if (!profile.memory.sharedReferences.includes(reference)) {
        profile.memory.sharedReferences.push(reference);
        relationshipStore.set(userId, profile);
        persistRelationshipProfile(userId, profile);
    }
}
/**
 * Record a significant moment
 */
export function recordSignificantMoment(userId, moment) {
    const profile = getRelationshipProfile(userId);
    const id = `moment_${Date.now()}`;
    profile.memory.significantMoments.push({
        ...moment,
        id,
    });
    // Update metrics based on moment type
    if (moment.type === 'breakthrough' || moment.type === 'vulnerable_moment') {
        profile.metrics.emotionalMomentsShared++;
    }
    if (moment.type === 'celebration' || moment.type === 'milestone') {
        profile.metrics.achievementsCelebrated++;
    }
    if (moment.type === 'funny') {
        // Could become an inside joke
    }
    relationshipStore.set(userId, profile);
    persistRelationshipProfile(userId, profile);
    updateStage(userId);
    return id;
}
/**
 * Update communication style preferences
 */
export function updateCommunicationStyle(userId, style) {
    const profile = getRelationshipProfile(userId);
    profile.communicationStyle = { ...profile.communicationStyle, ...style };
    relationshipStore.set(userId, profile);
    persistRelationshipProfile(userId, profile);
}
// ============================================================================
// TONE ADAPTATION
// ============================================================================
/**
 * Get tone adjustment for current relationship stage
 */
export function getToneAdjustment(userId) {
    const profile = getRelationshipProfile(userId);
    const baseTone = STAGE_TONE_SETTINGS[profile.stage];
    // Apply user-specific adjustments
    const adjusted = { ...baseTone };
    // If user prefers formal, stay more formal
    if (profile.communicationStyle.prefersFormal) {
        adjusted.formality = profile.stage === 'deep' ? 'casual' : 'formal';
    }
    // Adjust emoji based on preference
    if (!profile.communicationStyle.likesEmoji) {
        adjusted.emojiLevel = 'none';
    }
    // Adjust humor
    if (!profile.communicationStyle.appreciatesHumor) {
        adjusted.humorAllowed = false;
    }
    // Adjust directness
    if (!profile.communicationStyle.respondsToDirectness) {
        adjusted.canBeDirect = false;
    }
    // If they need gentleness, always be softer
    if (profile.communicationStyle.needsGentleness) {
        adjusted.canBeDirect = false;
        adjusted.shouldAskPermission = profile.stage !== 'deep';
    }
    return adjusted;
}
/**
 * Get message adjustment for personalizing outreach
 */
export function getMessageAdjustment(userId, userName, preferredName) {
    const profile = getRelationshipProfile(userId);
    const tone = getToneAdjustment(userId);
    const adjustment = {
        greeting: generateGreeting(profile.stage, tone),
        closingStyle: generateClosing(profile.stage),
        nameUsage: determineNameUsage(profile, tone, preferredName),
        addedWarmth: [],
        addedReferences: [],
        toneModifiers: [],
    };
    // Add warmth elements based on stage
    if (profile.stage === 'established' || profile.stage === 'deep') {
        adjustment.addedWarmth.push('I was thinking about you');
        adjustment.addedWarmth.push('Hope you are doing well');
    }
    if (profile.stage === 'deep') {
        adjustment.addedWarmth.push('Miss talking to you');
        adjustment.addedWarmth.push('Been meaning to check in');
    }
    // Add references we can use
    if (tone.canReferenceHistory && profile.memory.sharedReferences.length > 0) {
        adjustment.addedReferences.push(...profile.memory.sharedReferences.slice(-3));
    }
    // Add tone modifiers
    if (tone.humorAllowed && profile.communicationStyle.appreciatesHumor) {
        adjustment.toneModifiers.push('can_be_playful');
    }
    if (tone.canBeDirect && profile.communicationStyle.respondsToDirectness) {
        adjustment.toneModifiers.push('can_be_direct');
    }
    if (profile.communicationStyle.needsGentleness) {
        adjustment.toneModifiers.push('be_gentle');
    }
    return adjustment;
}
function generateGreeting(stage, tone) {
    switch (stage) {
        case 'new':
            return tone.shouldAskPermission
                ? 'Hi! I hope it is okay that I am reaching out.'
                : 'Hi there!';
        case 'building':
            return 'Hey!';
        case 'established':
            return 'Hey!';
        case 'deep':
            return 'Hey friend!';
        default:
            return 'Hey!';
    }
}
function generateClosing(stage) {
    switch (stage) {
        case 'new':
            return 'Take care';
        case 'building':
            return 'Talk soon!';
        case 'established':
            return 'Talk soon!';
        case 'deep':
            return '❤️';
        default:
            return 'Talk soon!';
    }
}
function determineNameUsage(profile, tone, preferredName) {
    // Deep relationship with nickname
    if (tone.canUseNickname && profile.memory.nicknames.length > 0) {
        return 'nickname';
    }
    // Use preferred name if provided
    if (preferredName) {
        return 'first_name';
    }
    // New relationships use full name
    if (profile.stage === 'new') {
        return 'full_name';
    }
    // Default to first name
    return 'first_name';
}
// ============================================================================
// MESSAGE TRANSFORMATION
// ============================================================================
/**
 * Transform a message based on relationship
 */
export function adaptMessage(userId, message, context) {
    const profile = getRelationshipProfile(userId);
    const tone = getToneAdjustment(userId);
    const adjustment = getMessageAdjustment(userId, context.userName, context.preferredName);
    let adapted = message;
    // Adjust greeting
    if (context.isGreeting) {
        // Replace generic greetings with relationship-appropriate ones
        adapted = adapted.replace(/^(Hey!|Hi!|Hello!)/i, adjustment.greeting);
    }
    // Add nickname if appropriate
    if (adjustment.nameUsage === 'nickname' && profile.memory.nicknames.length > 0) {
        const nickname = profile.memory.nicknames[0];
        adapted = adapted.replace(new RegExp(`\\b${context.userName}\\b`, 'g'), nickname);
    }
    // Adjust formality
    if (tone.formality === 'formal') {
        // Make contractions formal
        adapted = adapted
            .replace(/don't/g, 'do not')
            .replace(/can't/g, 'cannot')
            .replace(/won't/g, 'will not')
            .replace(/I'm/g, 'I am')
            .replace(/you're/g, 'you are');
    }
    // Add or remove emoji based on preference
    if (tone.emojiLevel === 'none') {
        // Remove emoji
        adapted = adapted.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    }
    // Add permission language for new relationships
    if (tone.shouldAskPermission &&
        !adapted.toLowerCase().includes('hope') &&
        !adapted.toLowerCase().includes('okay')) {
        adapted = adapted.replace(/^(.*?)([.!?])/, '$1 - I hope this is okay to share.$2');
    }
    return adapted.trim();
}
/**
 * Get a random inside joke or reference for deep relationships
 */
export function getRandomReference(userId) {
    const profile = getRelationshipProfile(userId);
    if (profile.stage !== 'deep' && profile.stage !== 'established') {
        return null;
    }
    const references = [...profile.memory.insideJokes, ...profile.memory.sharedReferences];
    if (references.length === 0) {
        return null;
    }
    return references[Math.floor(Math.random() * references.length)];
}
/**
 * Get a significant moment we can reference
 */
export function getReferenceableMoment(userId, type) {
    const profile = getRelationshipProfile(userId);
    if (profile.stage === 'new') {
        return null;
    }
    const moments = profile.memory.significantMoments.filter((m) => {
        if (!m.canReference)
            return false;
        if (type && m.type !== type)
            return false;
        return true;
    });
    if (moments.length === 0) {
        return null;
    }
    // Return most recent
    return moments[moments.length - 1];
}
// ============================================================================
// PERMISSION CHECKS
// ============================================================================
/**
 * Check if a specific action is appropriate for the relationship
 */
export function canDoAction(userId, action) {
    const tone = getToneAdjustment(userId);
    switch (action) {
        case 'call':
            return tone.formality !== 'formal';
        case 'use_nickname':
            return tone.canUseNickname;
        case 'reference_history':
            return tone.canReferenceHistory;
        case 'be_vulnerable':
            return tone.canBeVulnerable;
        case 'be_direct':
            return tone.canBeDirect;
        case 'use_humor':
            return tone.humorAllowed;
        case 'send_emoji':
            return tone.emojiLevel !== 'none';
        default:
            return false;
    }
}
// ============================================================================
// CLEANUP
// ============================================================================
export function clearRelationshipData(userId) {
    relationshipStore.delete(userId);
    log.debug({ userId }, 'Cleared relationship data');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getRelationshipProfile,
    calculateStage,
    updateStage,
    recordConversation,
    addInsideJoke,
    addNickname,
    addSharedReference,
    recordSignificantMoment,
    updateCommunicationStyle,
    getToneAdjustment,
    getMessageAdjustment,
    adaptMessage,
    getRandomReference,
    getReferenceableMoment,
    canDoAction,
    clearRelationshipData,
};
//# sourceMappingURL=relationship-adapter.js.map