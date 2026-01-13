/**
 * Seasonal Awareness
 *
 * Anticipates and responds to seasonal patterns in user's emotional
 * wellbeing, including holidays, weather changes, and personal anniversaries.
 *
 * Philosophy: A great friend knows that December is hard for you,
 * or that spring makes you feel alive. Seasons affect us deeply.
 *
 * Pattern Types:
 * - Calendar seasons (winter, spring, summer, fall)
 * - Holidays (cultural, religious, personal)
 * - Personal anniversaries (both positive and difficult)
 * - Weather patterns
 * - Day length (SAD awareness)
 *
 * @module SeasonalAwareness
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'SeasonalAwareness' });
// ============================================================================
// HOLIDAY DEFINITIONS
// ============================================================================
const UNIVERSAL_HOLIDAYS = [
    { name: "New Year's Day", month: 1, day: 1, type: 'universal' },
    { name: "Valentine's Day", month: 2, day: 14, type: 'cultural' },
    { name: "Mother's Day", month: 5, weekday: { week: 2, day: 0 }, type: 'cultural' },
    { name: "Father's Day", month: 6, weekday: { week: 3, day: 0 }, type: 'cultural' },
    { name: 'Independence Day (US)', month: 7, day: 4, type: 'cultural' },
    { name: 'Halloween', month: 10, day: 31, type: 'cultural' },
    { name: 'Thanksgiving (US)', month: 11, weekday: { week: 4, day: 4 }, type: 'cultural' },
    { name: 'Christmas Eve', month: 12, day: 24, type: 'cultural' },
    { name: 'Christmas Day', month: 12, day: 25, type: 'cultural' },
    { name: "New Year's Eve", month: 12, day: 31, type: 'universal' },
];
// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================
const seasonalProfiles = new Map();
// ============================================================================
// SEASON DETECTION
// ============================================================================
/**
 * Get current season
 */
export function getCurrentSeason(hemisphere = 'northern', date = new Date()) {
    const month = date.getMonth() + 1; // 1-12
    // Northern hemisphere
    const northernSeasons = {
        1: 'winter',
        2: 'winter',
        3: 'spring',
        4: 'spring',
        5: 'spring',
        6: 'summer',
        7: 'summer',
        8: 'summer',
        9: 'fall',
        10: 'fall',
        11: 'fall',
        12: 'winter',
    };
    const season = northernSeasons[month];
    // Flip for southern hemisphere
    if (hemisphere === 'southern') {
        const flip = {
            winter: 'summer',
            spring: 'fall',
            summer: 'winter',
            fall: 'spring',
        };
        return flip[season];
    }
    return season;
}
/**
 * Get days into current season
 */
function getDaysIntoSeason(date = new Date()) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    // Approximate season start dates (northern)
    const seasonStarts = {
        spring: { month: 3, day: 20 },
        summer: { month: 6, day: 21 },
        fall: { month: 9, day: 22 },
        winter: { month: 12, day: 21 },
    };
    const season = getCurrentSeason('northern', date);
    const start = seasonStarts[season];
    // Calculate days since season start
    const seasonStart = new Date(date.getFullYear(), start.month - 1, start.day);
    if (date < seasonStart) {
        seasonStart.setFullYear(date.getFullYear() - 1);
    }
    return Math.floor((date.getTime() - seasonStart.getTime()) / (24 * 60 * 60 * 1000));
}
// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================
/**
 * Get or create seasonal profile
 */
function getOrCreateProfile(userId) {
    let profile = seasonalProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            seasonPatterns: [],
            holidayPreferences: [],
            personalDates: [],
            sadIndicators: [],
            insights: [],
            timezone: 'America/Los_Angeles', // Default, should be detected
            hemisphere: 'northern',
            lastUpdated: new Date(),
        };
        seasonalProfiles.set(userId, profile);
    }
    return profile;
}
/**
 * Record seasonal mood data
 */
export function recordSeasonalData(userId, data) {
    const profile = getOrCreateProfile(userId);
    const season = getCurrentSeason(profile.hemisphere);
    // Find or create season pattern
    let pattern = profile.seasonPatterns.find((p) => p.season === season);
    if (!pattern) {
        pattern = {
            season,
            avgMood: 0,
            energyLevel: 'normal',
            challenges: [],
            strengths: [],
            sampleCount: 0,
        };
        profile.seasonPatterns.push(pattern);
    }
    // Update with exponential moving average
    const alpha = 0.2;
    pattern.avgMood = pattern.avgMood * (1 - alpha) + data.mood * alpha;
    pattern.sampleCount++;
    // Update energy (mode over recent samples)
    pattern.energyLevel = data.energy;
    profile.lastUpdated = new Date();
    // Check for patterns
    detectSeasonalPatterns(profile);
    log.debug({ userId, season, mood: data.mood }, '🍂 Seasonal data recorded');
}
/**
 * Add personal date
 */
export function addPersonalDate(userId, date) {
    const profile = getOrCreateProfile(userId);
    const personalDate = {
        ...date,
        id: `pd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    profile.personalDates.push(personalDate);
    log.info({ userId, name: date.name, type: date.type }, '📅 Personal date added');
    return personalDate;
}
/**
 * Update holiday preference
 */
export function updateHolidayPreference(userId, holiday, preference) {
    const profile = getOrCreateProfile(userId);
    const existing = profile.holidayPreferences.find((p) => p.holiday === holiday);
    if (existing) {
        Object.assign(existing, preference);
    }
    else {
        profile.holidayPreferences.push({
            holiday,
            type: 'cultural',
            sentiment: 'neutral',
            ...preference,
        });
    }
    log.debug({ userId, holiday, sentiment: preference.sentiment }, '🎄 Holiday preference updated');
}
// ============================================================================
// PATTERN DETECTION
// ============================================================================
/**
 * Detect seasonal patterns
 */
function detectSeasonalPatterns(profile) {
    // Need data from multiple seasons
    if (profile.seasonPatterns.length < 2)
        return;
    const insights = [];
    // Find challenging seasons
    for (const pattern of profile.seasonPatterns) {
        if (pattern.avgMood < -0.3 && pattern.sampleCount >= 5) {
            insights.push({
                type: 'pattern',
                insight: `${pattern.season} tends to be a harder season for you`,
                relevantSeason: pattern.season,
                confidence: Math.min(1, pattern.sampleCount / 20),
            });
        }
        if (pattern.avgMood > 0.3 && pattern.sampleCount >= 5) {
            insights.push({
                type: 'opportunity',
                insight: `You tend to thrive in ${pattern.season}`,
                relevantSeason: pattern.season,
                confidence: Math.min(1, pattern.sampleCount / 20),
            });
        }
        if (pattern.energyLevel === 'low' && pattern.sampleCount >= 5) {
            insights.push({
                type: 'warning',
                insight: `Energy tends to dip in ${pattern.season}`,
                relevantSeason: pattern.season,
                confidence: Math.min(1, pattern.sampleCount / 20),
            });
        }
    }
    profile.insights = insights;
}
/**
 * Detect potential SAD patterns
 */
export function detectSADPatterns(userId) {
    const profile = seasonalProfiles.get(userId);
    if (!profile || profile.sadIndicators.length < 10) {
        return { likely: false, correlation: 0 };
    }
    // Calculate correlation between daylight and mood
    const shortDayMoods = profile.sadIndicators
        .filter((i) => i.daylight === 'short')
        .map((i) => i.moodScore);
    const longDayMoods = profile.sadIndicators
        .filter((i) => i.daylight === 'long')
        .map((i) => i.moodScore);
    if (shortDayMoods.length < 3 || longDayMoods.length < 3) {
        return { likely: false, correlation: 0 };
    }
    const shortAvg = shortDayMoods.reduce((a, b) => a + b, 0) / shortDayMoods.length;
    const longAvg = longDayMoods.reduce((a, b) => a + b, 0) / longDayMoods.length;
    const difference = longAvg - shortAvg;
    // If mood is significantly lower on short days
    if (difference > 0.3) {
        return {
            likely: true,
            correlation: Math.min(1, difference),
            recommendation: 'Daylight seems to significantly affect your mood. Consider light therapy or prioritizing outdoor time in winter.',
        };
    }
    return { likely: false, correlation: difference };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build seasonal context for user
 */
export function buildSeasonalContext(userId) {
    const profile = getOrCreateProfile(userId);
    const now = new Date();
    const currentSeason = getCurrentSeason(profile.hemisphere, now);
    const daysIntoSeason = getDaysIntoSeason(now);
    // Get upcoming holidays
    const upcomingHolidays = getUpcomingHolidays(profile, now);
    // Get upcoming personal dates
    const upcomingPersonalDates = getUpcomingPersonalDates(profile, now);
    // Build warnings
    const seasonalWarnings = [];
    // Check if entering a challenging season
    const currentPattern = profile.seasonPatterns.find((p) => p.season === currentSeason);
    if (currentPattern && currentPattern.avgMood < -0.2 && daysIntoSeason < 30) {
        seasonalWarnings.push(`Entering ${currentSeason} - historically a harder season for you`);
    }
    // Check SAD
    if (currentSeason === 'winter') {
        const sadCheck = detectSADPatterns(userId);
        if (sadCheck.likely) {
            seasonalWarnings.push('Shorter days may affect your mood - consider extra self-care');
        }
    }
    // Check for difficult upcoming dates
    for (const pd of upcomingPersonalDates) {
        if (pd.type === 'difficult' && pd.daysUntil <= 14) {
            seasonalWarnings.push(`${pd.name} is coming up in ${pd.daysUntil} days`);
        }
    }
    // Build suggestions
    const proactiveSuggestions = [];
    // Holiday suggestions
    for (const holiday of upcomingHolidays) {
        if (holiday.daysUntil <= 7 && holiday.userSentiment === 'negative') {
            proactiveSuggestions.push(`${holiday.name} is approaching - we can talk about how to navigate it`);
        }
        if (holiday.daysUntil <= 3 && holiday.userSentiment === 'positive') {
            proactiveSuggestions.push(`${holiday.name} is almost here! How are you feeling about it?`);
        }
    }
    return {
        currentSeason,
        daysIntoSeason,
        upcomingHolidays,
        upcomingPersonalDates,
        seasonalWarnings,
        proactiveSuggestions,
    };
}
/**
 * Get upcoming holidays
 */
function getUpcomingHolidays(profile, from) {
    const upcoming = [];
    const lookAhead = 30; // days
    for (const holiday of UNIVERSAL_HOLIDAYS) {
        const holidayDate = getNextOccurrence(holiday, from);
        const daysUntil = Math.floor((holidayDate.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
        if (daysUntil >= 0 && daysUntil <= lookAhead) {
            const pref = profile.holidayPreferences.find((p) => p.holiday === holiday.name);
            upcoming.push({
                name: holiday.name,
                date: holidayDate,
                daysUntil,
                userSentiment: pref?.sentiment || 'unknown',
                suggestedApproach: getSuggestedApproach(pref),
            });
        }
    }
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}
/**
 * Get next occurrence of a holiday
 */
function getNextOccurrence(holiday, from) {
    const year = from.getFullYear();
    if (holiday.day) {
        // Fixed date
        let date = new Date(year, holiday.month - 1, holiday.day);
        if (date < from) {
            date = new Date(year + 1, holiday.month - 1, holiday.day);
        }
        return date;
    }
    if (holiday.weekday) {
        // Nth weekday of month
        const { week, day } = holiday.weekday;
        let date = getNthWeekday(year, holiday.month, week, day);
        if (date < from) {
            date = getNthWeekday(year + 1, holiday.month, week, day);
        }
        return date;
    }
    return from;
}
/**
 * Get nth weekday of a month
 */
function getNthWeekday(year, month, week, weekday) {
    const firstOfMonth = new Date(year, month - 1, 1);
    const firstWeekday = firstOfMonth.getDay();
    let dayOffset = weekday - firstWeekday;
    if (dayOffset < 0)
        dayOffset += 7;
    const day = 1 + dayOffset + (week - 1) * 7;
    return new Date(year, month - 1, day);
}
/**
 * Get upcoming personal dates
 */
function getUpcomingPersonalDates(profile, from) {
    const upcoming = [];
    const lookAhead = 30;
    for (const pd of profile.personalDates) {
        const thisYear = new Date(from.getFullYear(), pd.date.month - 1, pd.date.day);
        let nextOccurrence = thisYear;
        if (thisYear < from) {
            nextOccurrence = new Date(from.getFullYear() + 1, pd.date.month - 1, pd.date.day);
        }
        const daysUntil = Math.floor((nextOccurrence.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
        if (daysUntil >= 0 && daysUntil <= lookAhead) {
            upcoming.push({
                name: pd.name,
                date: nextOccurrence,
                daysUntil,
                type: pd.type,
                approach: getPersonalDateApproach(pd),
            });
        }
    }
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}
/**
 * Get suggested approach for holiday
 */
function getSuggestedApproach(pref) {
    if (!pref)
        return 'Ask how they feel about it';
    if (pref.avoidMentioning)
        return 'Avoid bringing it up';
    switch (pref.sentiment) {
        case 'positive':
            return 'Acknowledge with warmth';
        case 'negative':
            return 'Offer support, acknowledge difficulty';
        case 'mixed':
            return 'Check in gently';
        default:
            return 'Ask how they feel about it';
    }
}
/**
 * Get approach for personal date
 */
function getPersonalDateApproach(pd) {
    switch (pd.approach) {
        case 'celebrate':
            return `Celebrate ${pd.name}!`;
        case 'acknowledge':
            return `Warmly acknowledge ${pd.name}`;
        case 'gentle':
            return `Gently mention ${pd.name}, offer support`;
        case 'avoid':
            return 'Do not mention';
        default:
            return 'Check in about it';
    }
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Get seasonal profile
 */
export function getSeasonalProfile(userId) {
    return seasonalProfiles.get(userId) || null;
}
/**
 * Generate seasonal context for LLM
 */
export function generateSeasonalContextForLLM(userId) {
    const context = buildSeasonalContext(userId);
    const profile = seasonalProfiles.get(userId);
    if (!profile || (profile.seasonPatterns.length === 0 && profile.personalDates.length === 0)) {
        return null;
    }
    const sections = [];
    sections.push('[SEASONAL AWARENESS]');
    sections.push(`Current season: ${context.currentSeason}`);
    if (context.seasonalWarnings.length > 0) {
        sections.push('');
        sections.push('Seasonal considerations:');
        for (const warning of context.seasonalWarnings) {
            sections.push(`• ${warning}`);
        }
    }
    if (context.upcomingHolidays.length > 0) {
        const notable = context.upcomingHolidays.filter((h) => h.daysUntil <= 7 && h.userSentiment !== 'unknown');
        if (notable.length > 0) {
            sections.push('');
            sections.push('Upcoming:');
            for (const h of notable) {
                sections.push(`• ${h.name} (${h.daysUntil} days) - ${h.suggestedApproach}`);
            }
        }
    }
    if (context.upcomingPersonalDates.length > 0) {
        const notable = context.upcomingPersonalDates.filter((p) => p.daysUntil <= 14);
        if (notable.length > 0) {
            sections.push('');
            sections.push('Personal dates:');
            for (const p of notable) {
                sections.push(`• ${p.name} (${p.daysUntil} days) - ${p.approach}`);
            }
        }
    }
    return sections.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getCurrentSeason,
    recordSeasonalData,
    addPersonalDate,
    updateHolidayPreference,
    buildSeasonalContext,
    detectSADPatterns,
    getSeasonalProfile,
    generateSeasonalContextForLLM,
};
//# sourceMappingURL=seasonal-awareness.js.map