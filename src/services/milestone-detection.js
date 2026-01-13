/**
 * Milestone Detection Service
 *
 * Detects user milestones, anniversaries, and moments worth celebrating.
 */
import { getLogger } from '../utils/safe-logger.js';
const logger = getLogger().child({ service: 'MilestoneDetection' });
// ============================================================================
// Detection Functions
// ============================================================================
/**
 * Check for conversation count milestones
 */
function checkConversationMilestones(personaId, meetingCount) {
    const milestones = [5, 10, 25, 50, 100, 250, 500];
    if (milestones.includes(meetingCount)) {
        return {
            type: 'conversation_count',
            personaId,
            description: `${meetingCount} conversations together!`,
            value: meetingCount,
            timestamp: new Date(),
            celebrationLevel: meetingCount >= 100 ? 'big' : meetingCount >= 25 ? 'medium' : 'small',
        };
    }
    return null;
}
/**
 * Check for relationship upgrade milestone
 */
function checkRelationshipMilestone(personaId, previousStage, currentStage) {
    if (!previousStage)
        return null;
    const stageOrder = [
        'stranger',
        'acquaintance',
        'friend',
        'trusted_advisor',
    ];
    const prevIndex = stageOrder.indexOf(previousStage);
    const currentIndex = stageOrder.indexOf(currentStage);
    if (currentIndex > prevIndex) {
        const stageNames = {
            stranger: 'first meeting',
            acquaintance: 'getting to know each other',
            friend: 'becoming friends',
            trusted_advisor: 'trusted advisor status',
        };
        return {
            type: 'relationship_upgrade',
            personaId,
            description: stageNames[currentStage],
            timestamp: new Date(),
            celebrationLevel: currentStage === 'trusted_advisor' ? 'big' : 'medium',
        };
    }
    return null;
}
/**
 * Check for time-based anniversaries
 */
function checkAnniversary(personaId, firstInteraction) {
    if (!firstInteraction)
        return null;
    const now = new Date();
    const diffMs = now.getTime() - firstInteraction.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    // Check for week, month, year anniversaries
    const milestones = [
        { days: 7, label: '1 week', level: 'small' },
        { days: 30, label: '1 month', level: 'medium' },
        { days: 90, label: '3 months', level: 'medium' },
        { days: 180, label: '6 months', level: 'big' },
        { days: 365, label: '1 year', level: 'big' },
    ];
    for (const m of milestones) {
        // Check if we're within 1 day of the milestone
        if (Math.abs(diffDays - m.days) <= 1) {
            return {
                type: 'anniversary',
                personaId,
                description: `${m.label} together!`,
                value: m.days,
                timestamp: new Date(),
                celebrationLevel: m.level,
            };
        }
    }
    return null;
}
/**
 * Check for habit streak milestones (Maya-specific)
 */
export function checkHabitStreak(personaId, streakDays) {
    const milestones = [3, 7, 14, 21, 30, 60, 90, 180, 365];
    if (milestones.includes(streakDays)) {
        return {
            type: 'streak',
            personaId,
            description: `${streakDays} day streak!`,
            value: streakDays,
            timestamp: new Date(),
            celebrationLevel: streakDays >= 30 ? 'big' : streakDays >= 14 ? 'medium' : 'small',
        };
    }
    return null;
}
/**
 * Check for first meeting milestone
 */
function checkFirstMeeting(personaId, meetingCount) {
    if (meetingCount === 1) {
        return {
            type: 'first_meeting',
            personaId,
            description: 'First time meeting!',
            value: 1,
            timestamp: new Date(),
            celebrationLevel: 'small',
        };
    }
    return null;
}
// ============================================================================
// Main Detection
// ============================================================================
/**
 * Detect all applicable milestones for current context
 */
export function detectMilestones(context) {
    const milestones = [];
    const { personaId, profile } = context;
    // Get per-persona data
    const meetingCounts = profile.humanizingState?.perPersonaMeetingCounts || {};
    const meetingCount = meetingCounts[personaId] || 0;
    const relationshipData = profile.humanizingState?.perPersonaRelationshipData || {};
    const personaData = relationshipData[personaId];
    const relationshipStages = profile.humanizingState?.perPersonaRelationshipStage || {};
    const currentStage = relationshipStages[personaId] || 'stranger';
    // Check various milestone types
    const firstMeeting = checkFirstMeeting(personaId, meetingCount);
    if (firstMeeting)
        milestones.push(firstMeeting);
    const conversationMilestone = checkConversationMilestones(personaId, meetingCount);
    if (conversationMilestone)
        milestones.push(conversationMilestone);
    const anniversary = checkAnniversary(personaId, personaData?.firstInteraction);
    if (anniversary)
        milestones.push(anniversary);
    // Note: Relationship upgrade detection would need previous stage tracking
    // This would typically be called when relationship stage actually changes
    return milestones;
}
/**
 * Get celebration phrase for a milestone
 */
export function getMilestoneCelebrationPhrase(milestone) {
    const templates = {
        first_meeting: ["Welcome! I'm so glad you're here.", 'Hey! First time meeting - exciting!'],
        conversation_count: [
            `Wow, ${milestone.value} conversations! We've come a long way.`,
            `${milestone.value} conversations together. That's something special.`,
        ],
        relationship_upgrade: [
            `I feel like we've really ${milestone.description}. Thank you for trusting me.`,
            `This is meaningful - we've ${milestone.description}.`,
        ],
        time_spent: [`We've spent real time together. That matters.`],
        streak: [
            `${milestone.value} days! The streak is real!`,
            `${milestone.value} day streak - you're crushing it!`,
        ],
        anniversary: [
            `${milestone.description} Can you believe it?`,
            `${milestone.description} Time flies when you're growing.`,
        ],
        breakthrough: [`That's a breakthrough. Seriously. Remember this moment.`],
        goal_achieved: [`You did it! Goal achieved!`],
        habit_formed: [`It's a habit now. You ARE a person who does this.`],
        vulnerability_shared: [`Thank you for trusting me with that. It means a lot.`],
    };
    const phrases = templates[milestone.type] || ['Congratulations!'];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
/**
 * Check if any milestone was recently celebrated (to avoid spam)
 */
const recentCelebrations = new Map();
export function shouldCelebrate(userId, personaId, milestoneType) {
    const key = `${userId}:${personaId}:${milestoneType}`;
    const lastCelebrated = recentCelebrations.get(key);
    if (!lastCelebrated)
        return true;
    // Don't celebrate same milestone type within 24 hours
    const hoursSince = (Date.now() - lastCelebrated.getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
}
export function markCelebrated(userId, personaId, milestoneType) {
    const key = `${userId}:${personaId}:${milestoneType}`;
    recentCelebrations.set(key, new Date());
}
// Export as service object
export const MilestoneDetectionService = {
    detect: detectMilestones,
    getCelebrationPhrase: getMilestoneCelebrationPhrase,
    checkStreak: checkHabitStreak,
    shouldCelebrate,
    markCelebrated,
};
export default MilestoneDetectionService;
//# sourceMappingURL=milestone-detection.js.map