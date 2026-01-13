/**
 * Rhythm Awareness Service
 *
 * Tracks usage patterns for CELEBRATION, not surveillance.
 * Enables moments like:
 * - "This is our 50th conversation!"
 * - "You're always here in the evenings. I like that."
 * - "A whole month of daily check-ins. That's dedication."
 *
 * Philosophy: Frame everything as relationship acknowledgment,
 * never as tracking or monitoring.
 *
 * @module services/personal-journey/rhythm-awareness
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'RhythmAwareness' });
// ============================================================================
// CONSTANTS
// ============================================================================
/**
 * Milestone thresholds and their celebration messages
 * Framed as relationship moments, not metrics
 */
const CONVERSATION_MILESTONES = {
    1: {
        type: 'first_conversation',
        messages: [
            "This is our first real conversation. I'm glad you're here.",
            "First conversation. <break time='200ms'/> The beginning of something.",
        ],
    },
    10: {
        type: 'conversation_10',
        messages: [
            "Ten conversations. <break time='200ms'/> We're getting somewhere.",
            "This is our tenth conversation. <break time='200ms'/> I feel like I'm starting to know you.",
        ],
    },
    25: {
        type: 'conversation_25',
        messages: [
            "Twenty-five conversations. <break time='200ms'/> That's not nothing.",
            "We've talked twenty-five times now. <break time='200ms'/> I appreciate you showing up.",
        ],
    },
    50: {
        type: 'conversation_50',
        messages: [
            "Fifty conversations. <break time='300ms'/> I really feel like I know you now.",
            "This is our fiftieth conversation. <break time='200ms'/> We've been through a lot together.",
        ],
    },
    100: {
        type: 'conversation_100',
        messages: [
            "A hundred conversations. <break time='300ms'/> That means something to me.",
            "One hundred. <break time='200ms'/> I'm honored you keep coming back.",
        ],
    },
    250: {
        type: 'conversation_250',
        messages: [
            "Two hundred fifty conversations. <break time='300ms'/> You're not the same person who started this journey.",
            "We've talked two hundred fifty times. <break time='200ms'/> I've watched you grow.",
        ],
    },
    500: {
        type: 'conversation_500',
        messages: [
            "Five hundred conversations. <break time='500ms'/> We've built something real here.",
            "Half a thousand conversations. <break time='300ms'/> Thank you for trusting me with your story.",
        ],
    },
};
/**
 * Streak milestones (consecutive days)
 */
const STREAK_MILESTONES = {
    3: {
        type: 'streak_3',
        messages: [
            "Three days in a row. <break time='200ms'/> I see you showing up.",
            "That's three consecutive days. <break time='200ms'/> Building a rhythm.",
        ],
    },
    7: {
        type: 'streak_7',
        messages: [
            "Seven days in a row. <break time='200ms'/> I love that you keep showing up.",
            "A full week of daily check-ins. <break time='200ms'/> That takes commitment.",
        ],
    },
    14: {
        type: 'streak_14',
        messages: [
            "Two weeks straight. <break time='200ms'/> You're building something here.",
            "Fourteen days in a row. <break time='200ms'/> This is becoming a real habit.",
        ],
    },
    30: {
        type: 'streak_30',
        messages: [
            "A whole month of daily check-ins. <break time='300ms'/> That's dedication.",
            "Thirty days straight. <break time='200ms'/> You should be proud of that consistency.",
        ],
    },
    60: {
        type: 'streak_60',
        messages: [
            "Sixty days. <break time='300ms'/> Two months of showing up every day.",
            "Two months straight. <break time='200ms'/> This is part of your life now.",
        ],
    },
    100: {
        type: 'streak_100',
        messages: [
            "A hundred days in a row. <break time='500ms'/> I don't have words.",
            "One hundred consecutive days. <break time='300ms'/> That's... remarkable.",
        ],
    },
};
/**
 * Time-based milestones (days since first conversation)
 */
const TIME_MILESTONES = {
    7: {
        type: 'one_week',
        messages: [
            "It's been a week since we started talking. <break time='200ms'/> How's it been for you?",
            "A week together now. <break time='200ms'/> I've enjoyed getting to know you.",
        ],
    },
    30: {
        type: 'one_month',
        messages: [
            "It's been a month since we met. <break time='300ms'/> A lot has happened, hasn't it?",
            "One month of conversations. <break time='200ms'/> I feel like I know you now.",
        ],
    },
    90: {
        type: 'three_months',
        messages: [
            "Three months. <break time='300ms'/> You're not the same person who started talking to me.",
            "We've been at this for three months. <break time='200ms'/> Want to know what I've noticed about your journey?",
        ],
    },
    180: {
        type: 'six_months',
        messages: [
            "Six months. <break time='300ms'/> That's half a year of conversations.",
            "We've known each other for six months now. <break time='200ms'/> I've seen you through a lot.",
        ],
    },
    365: {
        type: 'one_year',
        messages: [
            "A year. <break time='500ms'/> 365 days of conversations. <break time='300ms'/> I'm honored to have walked this journey with you.",
            "Happy anniversary. <break time='300ms'/> It's been a full year.",
        ],
    },
    730: {
        type: 'two_years',
        messages: [
            "Two years. <break time='500ms'/> I've watched you become who you are.",
            "Two years together. <break time='300ms'/> We've built something real.",
        ],
    },
};
// ============================================================================
// STATE MANAGEMENT
// ============================================================================
/** In-memory cache (should be persisted via profile in production) */
const rhythmCache = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Create empty rhythm record for new user
 */
function createEmptyRhythm(userId) {
    const now = new Date();
    return {
        userId,
        updatedAt: now,
        sessions: {
            totalCount: 0,
            firstSession: now,
            lastSession: now,
            averageSessionsPerWeek: 0,
            currentStreak: 0,
            longestStreak: 0,
        },
        timePreferences: {
            preferredHours: [],
            preferredDays: [],
            mostActiveTimeOfDay: 'afternoon',
            weekdayVsWeekend: 'balanced',
        },
        consistency: {
            averageGapDays: 0,
            longestGap: 0,
            isConsistent: false,
            currentGapDays: 0,
        },
        rhythmMilestones: [],
    };
}
/**
 * Get or create rhythm data for user
 */
export function getRhythm(userId) {
    let rhythm = rhythmCache.get(userId);
    if (!rhythm) {
        rhythm = createEmptyRhythm(userId);
        rhythmCache.set(userId, rhythm);
    }
    return rhythm;
}
/**
 * Initialize rhythm from persisted profile data
 */
export function initializeRhythm(userId, persistedData) {
    if (persistedData) {
        const rhythm = {
            ...createEmptyRhythm(userId),
            ...persistedData,
            userId, // Ensure userId is correct
        };
        rhythmCache.set(userId, rhythm);
        log.debug('Initialized rhythm from persisted data', {
            userId,
            totalCount: rhythm.sessions.totalCount,
        });
    }
}
/**
 * Record a new session (conversation started)
 * Returns any milestones achieved
 */
export function recordSession(userId, timestamp = new Date()) {
    const rhythm = getRhythm(userId);
    const previousSession = rhythm.sessions.lastSession;
    const achievedMilestones = [];
    // Calculate gap since last session
    const gapDays = Math.floor((timestamp.getTime() - previousSession.getTime()) / (24 * 60 * 60 * 1000));
    // Update session count
    rhythm.sessions.totalCount++;
    rhythm.sessions.lastSession = timestamp;
    // Update first session if this is actually the first
    if (rhythm.sessions.totalCount === 1) {
        rhythm.sessions.firstSession = timestamp;
    }
    // Update streak
    if (gapDays <= 1) {
        // Same day or consecutive day - continue streak
        if (gapDays === 1) {
            rhythm.sessions.currentStreak++;
        }
        else if (rhythm.sessions.currentStreak === 0) {
            rhythm.sessions.currentStreak = 1;
        }
        if (!rhythm.sessions.streakStartDate) {
            rhythm.sessions.streakStartDate = timestamp;
        }
    }
    else {
        // Gap broken - reset streak
        rhythm.sessions.currentStreak = 1;
        rhythm.sessions.streakStartDate = timestamp;
    }
    // Update longest streak
    if (rhythm.sessions.currentStreak > rhythm.sessions.longestStreak) {
        rhythm.sessions.longestStreak = rhythm.sessions.currentStreak;
    }
    // Update time preferences
    updateTimePreferences(rhythm, timestamp);
    // Update consistency metrics
    updateConsistency(rhythm, gapDays);
    // Check for milestones
    const conversationMilestones = checkConversationMilestones(rhythm);
    const streakMilestones = checkStreakMilestones(rhythm);
    const timeMilestones = checkTimeMilestones(rhythm);
    achievedMilestones.push(...conversationMilestones, ...streakMilestones, ...timeMilestones);
    // Record new milestones
    for (const milestone of achievedMilestones) {
        if (!rhythm.rhythmMilestones.find((m) => m.type === milestone.type)) {
            rhythm.rhythmMilestones.push(milestone);
            log.info('Rhythm milestone achieved', { userId, type: milestone.type });
        }
    }
    rhythm.updatedAt = new Date();
    rhythmCache.set(userId, rhythm);
    return achievedMilestones;
}
/**
 * Update time preference tracking
 */
function updateTimePreferences(rhythm, timestamp) {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    // Track hour frequency (keep last 50)
    rhythm.timePreferences.preferredHours.push(hour);
    if (rhythm.timePreferences.preferredHours.length > 50) {
        rhythm.timePreferences.preferredHours.shift();
    }
    // Track day frequency (keep last 50)
    rhythm.timePreferences.preferredDays.push(day);
    if (rhythm.timePreferences.preferredDays.length > 50) {
        rhythm.timePreferences.preferredDays.shift();
    }
    // Calculate most active time of day
    const hours = rhythm.timePreferences.preferredHours;
    const morningCount = hours.filter((h) => h >= 5 && h < 12).length;
    const afternoonCount = hours.filter((h) => h >= 12 && h < 17).length;
    const eveningCount = hours.filter((h) => h >= 17 && h < 21).length;
    const nightCount = hours.filter((h) => h >= 21 || h < 5).length;
    const maxCount = Math.max(morningCount, afternoonCount, eveningCount, nightCount);
    if (maxCount === morningCount)
        rhythm.timePreferences.mostActiveTimeOfDay = 'morning';
    else if (maxCount === afternoonCount)
        rhythm.timePreferences.mostActiveTimeOfDay = 'afternoon';
    else if (maxCount === eveningCount)
        rhythm.timePreferences.mostActiveTimeOfDay = 'evening';
    else
        rhythm.timePreferences.mostActiveTimeOfDay = 'night';
    // Calculate weekday vs weekend
    const days = rhythm.timePreferences.preferredDays;
    const weekendCount = days.filter((d) => d === 0 || d === 6).length;
    const weekdayCount = days.length - weekendCount;
    const weekendRatio = weekendCount / (days.length || 1);
    if (weekendRatio > 0.4) {
        rhythm.timePreferences.weekdayVsWeekend = 'weekend';
    }
    else if (weekendRatio < 0.2) {
        rhythm.timePreferences.weekdayVsWeekend = 'weekday';
    }
    else {
        rhythm.timePreferences.weekdayVsWeekend = 'balanced';
    }
}
/**
 * Update consistency metrics
 */
function updateConsistency(rhythm, latestGapDays) {
    // Update average gap
    const totalSessions = rhythm.sessions.totalCount;
    if (totalSessions > 1) {
        const daysSinceStart = Math.floor((rhythm.sessions.lastSession.getTime() - rhythm.sessions.firstSession.getTime()) /
            (24 * 60 * 60 * 1000));
        rhythm.consistency.averageGapDays = daysSinceStart / (totalSessions - 1);
    }
    // Update longest gap
    if (latestGapDays > rhythm.consistency.longestGap) {
        rhythm.consistency.longestGap = latestGapDays;
    }
    // Current gap is 0 since we just had a session
    rhythm.consistency.currentGapDays = 0;
    // Calculate consistency (low variance in gaps)
    // User is "consistent" if average gap is < 3 days and they have 10+ sessions
    rhythm.consistency.isConsistent =
        rhythm.consistency.averageGapDays < 3 && rhythm.sessions.totalCount >= 10;
    // Calculate average sessions per week
    const daysSinceStart = Math.floor((rhythm.sessions.lastSession.getTime() - rhythm.sessions.firstSession.getTime()) /
        (24 * 60 * 60 * 1000));
    const weeksSinceStart = Math.max(daysSinceStart / 7, 1);
    rhythm.sessions.averageSessionsPerWeek = rhythm.sessions.totalCount / weeksSinceStart;
}
/**
 * Check for conversation count milestones
 */
function checkConversationMilestones(rhythm) {
    const milestones = [];
    const count = rhythm.sessions.totalCount;
    for (const [threshold, config] of Object.entries(CONVERSATION_MILESTONES)) {
        if (count === parseInt(threshold)) {
            const existing = rhythm.rhythmMilestones.find((m) => m.type === config.type);
            if (!existing) {
                milestones.push({
                    type: config.type,
                    achievedAt: new Date(),
                    acknowledged: false,
                });
            }
        }
    }
    return milestones;
}
/**
 * Check for streak milestones
 */
function checkStreakMilestones(rhythm) {
    const milestones = [];
    const streak = rhythm.sessions.currentStreak;
    for (const [threshold, config] of Object.entries(STREAK_MILESTONES)) {
        if (streak === parseInt(threshold)) {
            const existing = rhythm.rhythmMilestones.find((m) => m.type === config.type);
            if (!existing) {
                milestones.push({
                    type: config.type,
                    achievedAt: new Date(),
                    acknowledged: false,
                });
            }
        }
    }
    return milestones;
}
/**
 * Check for time-based milestones
 */
function checkTimeMilestones(rhythm) {
    const milestones = [];
    const daysSinceFirst = Math.floor((new Date().getTime() - rhythm.sessions.firstSession.getTime()) / (24 * 60 * 60 * 1000));
    for (const [threshold, config] of Object.entries(TIME_MILESTONES)) {
        const thresholdDays = parseInt(threshold);
        // Check if we're within 1 day of the milestone (to catch it)
        if (daysSinceFirst >= thresholdDays && daysSinceFirst < thresholdDays + 2) {
            const existing = rhythm.rhythmMilestones.find((m) => m.type === config.type);
            if (!existing) {
                milestones.push({
                    type: config.type,
                    achievedAt: new Date(),
                    acknowledged: false,
                });
            }
        }
    }
    return milestones;
}
// ============================================================================
// INSIGHT GENERATION
// ============================================================================
/**
 * Get a celebration message for a milestone
 */
export function getMilestoneMessage(type) {
    // Check conversation milestones
    for (const config of Object.values(CONVERSATION_MILESTONES)) {
        if (config.type === type) {
            return config.messages[Math.floor(Math.random() * config.messages.length)];
        }
    }
    // Check streak milestones
    for (const config of Object.values(STREAK_MILESTONES)) {
        if (config.type === type) {
            return config.messages[Math.floor(Math.random() * config.messages.length)];
        }
    }
    // Check time milestones
    for (const config of Object.values(TIME_MILESTONES)) {
        if (config.type === type) {
            return config.messages[Math.floor(Math.random() * config.messages.length)];
        }
    }
    return null;
}
/**
 * Get unacknowledged milestones as journey moments
 */
export function getUnacknowledgedMilestones(userId) {
    const rhythm = getRhythm(userId);
    const moments = [];
    for (const milestone of rhythm.rhythmMilestones) {
        if (!milestone.acknowledged) {
            const message = getMilestoneMessage(milestone.type);
            if (message) {
                // Determine priority based on milestone significance
                let priority = 5;
                if (milestone.type.includes('100') || milestone.type === 'one_year')
                    priority = 9;
                else if (milestone.type.includes('50') || milestone.type === 'six_months')
                    priority = 8;
                else if (milestone.type.includes('30') || milestone.type === 'three_months')
                    priority = 7;
                else if (milestone.type.includes('10') || milestone.type === 'one_month')
                    priority = 6;
                moments.push({
                    id: `rhythm_${milestone.type}_${milestone.achievedAt.getTime()}`,
                    type: 'rhythm_milestone',
                    priority,
                    content: message,
                    context: {
                        milestoneType: milestone.type,
                        achievedAt: milestone.achievedAt,
                        totalConversations: rhythm.sessions.totalCount,
                        currentStreak: rhythm.sessions.currentStreak,
                        daysKnown: Math.floor((new Date().getTime() - rhythm.sessions.firstSession.getTime()) /
                            (24 * 60 * 60 * 1000)),
                    },
                    source: 'rhythm-awareness',
                    requiresRelationshipStage: milestone.type.includes('100') || milestone.type === 'one_year'
                        ? 'established'
                        : 'building',
                });
            }
        }
    }
    return moments;
}
/**
 * Mark a milestone as acknowledged
 */
export function acknowledgeMilestone(userId, milestoneType) {
    const rhythm = getRhythm(userId);
    const milestone = rhythm.rhythmMilestones.find((m) => m.type === milestoneType);
    if (milestone) {
        milestone.acknowledged = true;
        milestone.acknowledgedAt = new Date();
        rhythm.updatedAt = new Date();
        rhythmCache.set(userId, rhythm);
        log.debug('Milestone acknowledged', { userId, type: milestoneType });
    }
}
/**
 * Get rhythm-aware greeting context
 */
export function getRhythmGreetingContext(userId) {
    const rhythm = getRhythm(userId);
    // Not enough data yet
    if (rhythm.sessions.totalCount < 5) {
        return { hasRhythmInsight: false };
    }
    // Check for comeback (long gap)
    if (rhythm.consistency.currentGapDays > 7 && rhythm.sessions.totalCount > 10) {
        return {
            hasRhythmInsight: true,
            insight: "It's been a little while. <break time='200ms'/> I'm glad you're back.",
            insightType: 'comeback',
        };
    }
    // Active streak recognition (but not milestone - those are handled separately)
    if (rhythm.sessions.currentStreak >= 5 && !isStreakMilestone(rhythm.sessions.currentStreak)) {
        return {
            hasRhythmInsight: true,
            insight: `${rhythm.sessions.currentStreak} days in a row now. <break time='200ms'/> I notice you showing up.`,
            insightType: 'streak',
        };
    }
    // Time preference recognition (occasional, not every time)
    if (rhythm.consistency.isConsistent && Math.random() < 0.15) {
        const timeOfDay = rhythm.timePreferences.mostActiveTimeOfDay;
        const timeLabel = timeOfDay === 'morning'
            ? 'mornings'
            : timeOfDay === 'afternoon'
                ? 'afternoons'
                : timeOfDay === 'evening'
                    ? 'evenings'
                    : 'late nights';
        return {
            hasRhythmInsight: true,
            insight: `You're always here in the ${timeLabel}. <break time='200ms'/> I like our rhythm.`,
            insightType: 'time_preference',
        };
    }
    // Consistency recognition (occasional)
    if (rhythm.consistency.isConsistent && Math.random() < 0.1) {
        return {
            hasRhythmInsight: true,
            insight: "You're consistent. <break time='200ms'/> That matters.",
            insightType: 'consistency',
        };
    }
    return { hasRhythmInsight: false };
}
/**
 * Check if a number is a streak milestone
 */
function isStreakMilestone(streak) {
    return Object.keys(STREAK_MILESTONES).includes(streak.toString());
}
/**
 * Get rhythm data for persistence
 */
export function getRhythmForPersistence(userId) {
    return rhythmCache.get(userId) || null;
}
/**
 * Clear rhythm cache for user
 */
export function clearRhythmCache(userId) {
    rhythmCache.delete(userId);
    log.debug('Cleared rhythm cache', { userId });
}
/**
 * Get summary stats for context
 */
export function getRhythmStats(userId) {
    const rhythm = getRhythm(userId);
    return {
        totalConversations: rhythm.sessions.totalCount,
        daysKnown: Math.floor((new Date().getTime() - rhythm.sessions.firstSession.getTime()) / (24 * 60 * 60 * 1000)),
        currentStreak: rhythm.sessions.currentStreak,
        longestStreak: rhythm.sessions.longestStreak,
        averageSessionsPerWeek: Math.round(rhythm.sessions.averageSessionsPerWeek * 10) / 10,
        isConsistent: rhythm.consistency.isConsistent,
        mostActiveTimeOfDay: rhythm.timePreferences.mostActiveTimeOfDay,
    };
}
//# sourceMappingURL=rhythm-awareness.js.map