/**
 * Seasonal & Contextual Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Awareness of time, seasons, holidays, and contextual factors
 * that affect people's emotional states and needs.
 *
 * Philosophy:
 * - Time affects mood
 * - Holidays aren't universal (nor universally happy)
 * - Context shapes everything
 *
 * @module SeasonalAwareness
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'SeasonalAwareness' });
// ============================================================================
// HOLIDAY DATA
// ============================================================================
const MAJOR_HOLIDAYS = [
    {
        name: "New Year's Day",
        date: null, // Variable by year
        type: 'major_secular',
        cultural_context: ['global'],
        emotional_notes: 'Reflection, pressure to change, hope or dread',
        checkInBefore: "New Year's coming up. How are you feeling about it?",
        checkInAfter: 'How are you feeling now that the new year has started?',
    },
    {
        name: "Valentine's Day",
        date: null,
        type: 'major_secular',
        cultural_context: ['western'],
        emotional_notes: 'Can be difficult for single people or those grieving',
        checkInBefore: "Valentine's Day is coming. That can bring up a lot for people.",
        checkInAfter: 'How was yesterday for you?',
    },
    {
        name: 'Thanksgiving',
        date: null,
        type: 'major_secular',
        cultural_context: ['us'],
        emotional_notes: 'Family stress, gratitude pressure, grief for missing people',
        checkInBefore: 'Thanksgiving is coming. How are you feeling about family time?',
        checkInAfter: 'How was Thanksgiving for you?',
    },
    {
        name: 'Christmas',
        date: null,
        type: 'religious',
        cultural_context: ['christian', 'western_secular'],
        emotional_notes: 'Family expectations, loneliness, financial stress',
        checkInBefore: 'The holidays can be a lot. How are you holding up?',
        checkInAfter: 'How was the holiday for you?',
    },
    {
        name: 'Hanukkah',
        date: null,
        type: 'religious',
        cultural_context: ['jewish'],
        emotional_notes: 'Community, family, sometimes feeling othered',
        checkInBefore: 'Hanukkah is coming up. Any plans?',
        checkInAfter: 'How was your Hanukkah?',
    },
    {
        name: 'Eid',
        date: null,
        type: 'religious',
        cultural_context: ['muslim'],
        emotional_notes: 'Celebration after fasting, community, gratitude',
        checkInBefore: 'Eid is approaching. How are you feeling?',
        checkInAfter: 'Eid Mubarak! How was your celebration?',
    },
    {
        name: 'Diwali',
        date: null,
        type: 'religious',
        cultural_context: ['hindu', 'sikh', 'jain'],
        emotional_notes: 'Festival of lights, family, new beginnings',
        checkInBefore: 'Diwali is coming. Any special plans?',
        checkInAfter: 'How was your Diwali celebration?',
    },
    {
        name: "Mother's Day",
        date: null,
        type: 'major_secular',
        cultural_context: ['western'],
        emotional_notes: 'Can be painful for those with difficult relationships or loss',
        checkInBefore: "Mother's Day can bring up a lot. How are you doing?",
        checkInAfter: 'How was yesterday for you?',
    },
    {
        name: "Father's Day",
        date: null,
        type: 'major_secular',
        cultural_context: ['western'],
        emotional_notes: 'Can be painful for those with difficult relationships or loss',
        checkInBefore: "Father's Day can bring up complicated feelings. How are you?",
        checkInAfter: 'How was yesterday?',
    },
];
// ============================================================================
// SEASONAL DATA
// ============================================================================
const SEASONAL_THEMES = {
    spring: [
        'renewal',
        'new beginnings',
        'growth',
        'energy returning',
        'cleaning/clearing',
        'allergies affecting mood',
    ],
    summer: [
        'energy',
        'social pressure',
        'body image concerns',
        'vacation planning stress',
        'fear of missing out',
        'heat affecting mood',
    ],
    fall: [
        'back to routine',
        'nostalgia',
        'preparation',
        'days shortening',
        'seasonal depression onset',
        'academic stress',
    ],
    winter: [
        'seasonal affective disorder',
        'holiday stress',
        'year-end reflection',
        'isolation',
        'financial stress',
        'hibernation instinct',
    ],
};
const SEASONAL_AWARENESS = {
    spring: 'Spring energy can feel like pressure to "bloom" - not everyone feels ready.',
    summer: 'Summer has a lot of "should" energy - should be happy, should be social, should be outside.',
    fall: 'Fall brings transition. Shorter days affect many people more than they realize.',
    winter: "Winter asks us to slow down, but society often doesn't let us. That's hard.",
};
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const userProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            timezone: 'America/Los_Angeles', // Default
            knownDifficultTimes: [],
            preferredHolidays: [],
            avoidHolidays: [],
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// SEASONAL DETECTION
// ============================================================================
/**
 * Get current season (Northern Hemisphere default)
 */
export function getCurrentSeason(date = new Date()) {
    const month = date.getMonth();
    if (month >= 2 && month <= 4)
        return 'spring';
    if (month >= 5 && month <= 7)
        return 'summer';
    if (month >= 8 && month <= 10)
        return 'fall';
    return 'winter';
}
/**
 * Get day length category
 */
export function getDayLength(date = new Date()) {
    const month = date.getMonth();
    // Northern hemisphere approximation
    if (month >= 10 || month <= 1)
        return 'short';
    if (month >= 4 && month <= 7)
        return 'long';
    return 'medium';
}
/**
 * Get upcoming holidays (next 30 days)
 */
export function getUpcomingHolidays(userId, date = new Date()) {
    const profile = getOrCreateProfile(userId);
    const upcoming = [];
    // Filter out holidays user doesn't want mentioned
    const relevantHolidays = MAJOR_HOLIDAYS.filter((h) => !profile.avoidHolidays.includes(h.name));
    // For simplicity, return contextually appropriate holidays
    // In production, calculate actual dates
    const month = date.getMonth();
    const day = date.getDate();
    for (const holiday of relevantHolidays) {
        // Approximate matching based on month
        if (holiday.name === "New Year's Day" && (month === 11 || month === 0)) {
            upcoming.push(holiday);
        }
        if (holiday.name === "Valentine's Day" && month === 1) {
            upcoming.push(holiday);
        }
        if (holiday.name === "Mother's Day" && month === 4) {
            upcoming.push(holiday);
        }
        if (holiday.name === "Father's Day" && month === 5) {
            upcoming.push(holiday);
        }
        if (holiday.name === 'Thanksgiving' && month === 10) {
            upcoming.push(holiday);
        }
        if (holiday.name === 'Christmas' && month === 11) {
            upcoming.push(holiday);
        }
    }
    return upcoming;
}
/**
 * Get full seasonal context
 */
export function getSeasonalContext(userId) {
    const now = new Date();
    const season = getCurrentSeason(now);
    return {
        season,
        seasonalThemes: SEASONAL_THEMES[season],
        dayLength: getDayLength(now),
        holidayProximity: getUpcomingHolidays(userId, now),
        timeOfYear: getTimeOfYearDescription(now),
    };
}
function getTimeOfYearDescription(date) {
    const month = date.getMonth();
    const descriptions = [
        'early winter, post-holiday',
        'deep winter',
        'late winter, spring approaching',
        'early spring',
        'mid spring',
        'late spring, summer approaching',
        'early summer',
        'mid summer',
        'late summer, fall approaching',
        'early fall',
        'mid fall, holidays approaching',
        'holiday season',
    ];
    return descriptions[month];
}
// ============================================================================
// DIFFICULT TIME TRACKING
// ============================================================================
/**
 * Record a difficult time of year for a user
 */
export function recordDifficultTime(userId, period, reason) {
    const profile = getOrCreateProfile(userId);
    const existing = profile.knownDifficultTimes.find((t) => t.period === period);
    if (existing) {
        existing.lastMentioned = new Date();
        if (reason)
            existing.reason = reason;
    }
    else {
        profile.knownDifficultTimes.push({
            period,
            reason,
            lastMentioned: new Date(),
        });
    }
    log.info({ userId, period }, '📅 Recorded difficult time period');
}
/**
 * Check if current time is difficult for user
 */
export function isCurrentlyDifficultTime(userId) {
    const profile = userProfiles.get(userId);
    if (!profile || profile.knownDifficultTimes.length === 0) {
        return { isDifficult: false };
    }
    const now = new Date();
    const month = now.getMonth();
    const monthNames = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december',
    ];
    const currentMonth = monthNames[month];
    const season = getCurrentSeason(now);
    for (const difficult of profile.knownDifficultTimes) {
        const lower = difficult.period.toLowerCase();
        if (lower.includes(currentMonth) ||
            lower.includes(season) ||
            (lower.includes('holiday') && (month === 10 || month === 11))) {
            return {
                isDifficult: true,
                period: difficult.period,
                reason: difficult.reason,
            };
        }
    }
    return { isDifficult: false };
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build LLM context for seasonal awareness
 */
export function buildSeasonalContext(userId) {
    const context = getSeasonalContext(userId);
    const difficultTime = isCurrentlyDifficultTime(userId);
    const lines = ['[🍂 SEASONAL AWARENESS]'];
    lines.push(`Current: ${context.timeOfYear} (${context.season})`);
    lines.push(`Day length: ${context.dayLength}`);
    lines.push('');
    lines.push(`Seasonal note: ${SEASONAL_AWARENESS[context.season]}`);
    // Add upcoming holidays
    if (context.holidayProximity.length > 0) {
        lines.push('');
        lines.push('Upcoming:');
        for (const holiday of context.holidayProximity.slice(0, 2)) {
            lines.push(`• ${holiday.name}: ${holiday.emotional_notes}`);
            if (holiday.checkInBefore) {
                lines.push(`  Consider: "${holiday.checkInBefore}"`);
            }
        }
    }
    // Add difficult time awareness
    if (difficultTime.isDifficult) {
        lines.push('');
        lines.push(`⚠️ KNOWN DIFFICULT TIME: ${difficultTime.period}`);
        if (difficultTime.reason) {
            lines.push(`Reason: ${difficultTime.reason}`);
        }
        lines.push('Be extra gentle and check in about how they are doing.');
    }
    return lines.join('\n');
}
// ============================================================================
// PREFERENCES
// ============================================================================
/**
 * Set user's holiday preferences
 */
export function setHolidayPreferences(userId, preferences) {
    const profile = getOrCreateProfile(userId);
    if (preferences.celebrate) {
        profile.preferredHolidays = preferences.celebrate;
    }
    if (preferences.avoid) {
        profile.avoidHolidays = preferences.avoid;
    }
    if (preferences.culturalBackground) {
        profile.culturalBackground = preferences.culturalBackground;
    }
    if (preferences.religiousBackground) {
        profile.religiousBackground = preferences.religiousBackground;
    }
    log.debug({ userId }, 'Updated holiday preferences');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function exportSeasonalProfile(userId) {
    return userProfiles.get(userId) || null;
}
export function importSeasonalProfile(profile) {
    profile.knownDifficultTimes.forEach((t) => {
        t.lastMentioned = new Date(t.lastMentioned);
    });
    userProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId }, 'Imported seasonal profile');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getCurrentSeason,
    getDayLength,
    getUpcomingHolidays,
    getSeasonalContext,
    recordDifficultTime,
    isCurrentlyDifficultTime,
    buildSeasonalContext,
    setHolidayPreferences,
    exportSeasonalProfile,
    importSeasonalProfile,
};
//# sourceMappingURL=seasonal-awareness.js.map