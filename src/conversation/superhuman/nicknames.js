/**
 * Nicknames & Terms of Endearment
 *
 * Personal touches that make relationships feel real.
 *
 * Using someone's name or a gentle term of endearment at the right moment
 * creates connection. This system manages when and how to use them.
 *
 * @module conversation/superhuman/nicknames
 */
import { seededFloat, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'Nicknames' });
// ============================================================================
// ENDEARMENT POOLS
// ============================================================================
const ENDEARMENTS = {
    none: [],
    gentle: ['friend', 'my friend'],
    warm: ['friend', 'my friend', 'sweetie', 'dear'],
    affectionate: ['friend', 'my friend', 'sweetie', 'dear', 'love', 'sweetheart', 'honey'],
};
// When to use each type of naming
const NAME_OCCASIONS = {
    // Use their actual name
    actualName: {
        triggers: ['serious_moment', 'important_point', 'getting_attention', 'celebration'],
        probability: 0.3, // 30% of the time when triggered
    },
    // Use an endearment
    endearment: {
        triggers: ['support_moment', 'celebration', 'emotional_support', 'encouragement'],
        probability: 0.2, // 20% of the time when triggered
    },
};
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const namingStore = new Map();
// ============================================================================
// NAME MANAGEMENT
// ============================================================================
/**
 * Get or create user naming preferences
 */
export function getUserNaming(userId) {
    let naming = namingStore.get(userId);
    if (!naming) {
        naming = {
            userId,
            nicknames: [],
            allowedEndearments: 'none',
            nameUsageCount: 0,
        };
        namingStore.set(userId, naming);
    }
    return naming;
}
/**
 * Set the user's name
 */
export function setUserName(userId, firstName, preferredName) {
    const naming = getUserNaming(userId);
    naming.firstName = firstName;
    naming.preferredName = preferredName || firstName;
    namingStore.set(userId, naming);
    log.info({ userId, name: naming.preferredName }, '👤 User name set');
}
/**
 * Add a nickname for the user
 */
export function addNickname(userId, nickname) {
    const naming = getUserNaming(userId);
    if (!naming.nicknames.includes(nickname)) {
        naming.nicknames.push(nickname);
        namingStore.set(userId, naming);
        log.info({ userId, nickname }, '🏷️ Nickname added');
    }
}
/**
 * Update endearment level based on relationship stage
 */
export function updateEndearmentLevel(userId, stage) {
    const naming = getUserNaming(userId);
    const levelMap = {
        stranger: 'none',
        acquaintance: 'none',
        friend: 'gentle',
        trusted: 'warm',
    };
    naming.allowedEndearments = levelMap[stage];
    namingStore.set(userId, naming);
}
// ============================================================================
// NAME USAGE DECISIONS
// ============================================================================
/**
 * Decide if we should use the user's name in this response
 */
export function shouldUseName(userId, context) {
    const naming = getUserNaming(userId);
    // Can't use name if we don't know it
    if (!naming.preferredName) {
        return { useName: false, useEndearment: false };
    }
    // Don't overuse names
    if (naming.lastNameUsed) {
        const minutesSince = (Date.now() - naming.lastNameUsed.getTime()) / (1000 * 60);
        if (minutesSince < 5) {
            return { useName: false, useEndearment: false };
        }
    }
    // Check if this is an occasion for using name
    const isNameOccasion = context.emotionalMoment || context.celebrationMoment || context.supportMoment;
    if (!isNameOccasion) {
        return { useName: false, useEndearment: false };
    }
    // Decide between name and endearment
    const roll = seededFloat(`${Date.now()}:nickname`);
    // Endearment for support moments (if allowed)
    if (context.supportMoment &&
        naming.allowedEndearments !== 'none' &&
        roll < NAME_OCCASIONS.endearment.probability) {
        const endearments = ENDEARMENTS[naming.allowedEndearments];
        const suggestion = seededPick(`${Date.now()}:endearment`, endearments) ?? endearments[0];
        return { useName: false, useEndearment: true, suggestion };
    }
    // Name for important moments
    if (roll < NAME_OCCASIONS.actualName.probability) {
        return { useName: true, useEndearment: false, suggestion: naming.preferredName };
    }
    return { useName: false, useEndearment: false };
}
/**
 * Record that we used the name
 */
export function recordNameUsage(userId) {
    const naming = getUserNaming(userId);
    naming.lastNameUsed = new Date();
    naming.nameUsageCount++;
    namingStore.set(userId, naming);
}
// ============================================================================
// NAME EXTRACTION
// ============================================================================
/**
 * Try to extract the user's name from their message
 */
export function extractNameFromMessage(message) {
    // Common patterns for sharing names
    const patterns = [
        /my name is (\w+)/i,
        /I'm (\w+)/i,
        /call me (\w+)/i,
        /I go by (\w+)/i,
        /everyone calls me (\w+)/i,
        /^(\w+) here/i,
        /this is (\w+)/i,
    ];
    // CRITICAL: Never confuse persona names with user names!
    // When user says "Hi Maya" after Maya introduces herself, that's NOT the user's name
    const personaNames = new Set([
        'ferni',
        'maya',
        'peter',
        'alex',
        'jordan',
        'nayan',
        'santos',
        'chen',
        'taylor',
        'john',
        'patel',
    ]);
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            const name = match[1];
            // Basic validation - names are usually 2-15 chars
            // Also reject persona names (don't confuse "Hi Maya" as user's name)
            if (name.length >= 2 && name.length <= 15 && !personaNames.has(name.toLowerCase())) {
                // Check if it's a preferred name indicator
                const isPreferred = /call me|go by|everyone calls/i.test(message);
                return {
                    firstName: name,
                    preferredName: isPreferred ? name : undefined,
                };
            }
        }
    }
    return null;
}
// ============================================================================
// PROMPT FORMATTING
// ============================================================================
/**
 * Format naming guidance for prompt
 */
export function formatNamingGuidance(userId, context) {
    const decision = shouldUseName(userId, context);
    const naming = getUserNaming(userId);
    if (!decision.useName && !decision.useEndearment) {
        return null;
    }
    if (decision.useName && naming.preferredName) {
        return [
            '[👤 NAME MOMENT]',
            '',
            `Use their name "${naming.preferredName}" in this response.`,
            '',
            'Examples:',
            `- "${naming.preferredName}, I'm really proud of you."`,
            `- "You know what, ${naming.preferredName}?"`,
            `- "I hear you, ${naming.preferredName}."`,
            '',
            'Use it naturally, not awkwardly.',
        ].join('\n');
    }
    if (decision.useEndearment && decision.suggestion) {
        return [
            '[💕 ENDEARMENT MOMENT]',
            '',
            `Consider using "${decision.suggestion}" in this response.`,
            '',
            'Examples:',
            `- "Oh ${decision.suggestion}, I\'m so sorry."`,
            `- "I\'m here for you, ${decision.suggestion}."`,
            '',
            "Only if it feels natural. Don't force it.",
        ].join('\n');
    }
    return null;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getUserNaming,
    setUserName,
    addNickname,
    updateEndearmentLevel,
    shouldUseName,
    recordNameUsage,
    extractNameFromMessage,
    formatNamingGuidance,
};
//# sourceMappingURL=nicknames.js.map