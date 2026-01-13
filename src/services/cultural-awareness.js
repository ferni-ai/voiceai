/**
 * Cultural Awareness Service
 *
 * Handles holiday awareness, seasonal adjustments, and cultural moment
 * integration into persona responses.
 */
import { getLogger } from '../utils/safe-logger.js';
import { loadPersonaBehaviors } from './persona-behavior-manager.js';
const _logger = getLogger().child({ service: 'CulturalAwareness' }); // Reserved for future debug logging
// ============================================================================
// Holiday Data
// ============================================================================
function getHolidays(year) {
    return [
        // Major US holidays
        {
            name: "New Year's Day",
            date: new Date(year, 0, 1),
            type: 'major',
            greetings: ['Happy New Year!', 'New year, fresh start!'],
        },
        {
            name: "Valentine's Day",
            date: new Date(year, 1, 14),
            type: 'minor',
            greetings: ["Happy Valentine's Day!"],
        },
        { name: 'Memorial Day', date: new Date(year, 4, 27), type: 'major' },
        {
            name: 'Independence Day',
            date: new Date(year, 6, 4),
            type: 'major',
            greetings: ['Happy Fourth of July!'],
        },
        { name: 'Labor Day', date: new Date(year, 8, 2), type: 'major' },
        {
            name: 'Thanksgiving',
            date: new Date(year, 10, 28),
            type: 'major',
            greetings: ['Happy Thanksgiving!', 'Hope you have a wonderful Thanksgiving!'],
        },
        {
            name: 'Christmas',
            date: new Date(year, 11, 25),
            type: 'major',
            greetings: ['Merry Christmas!', 'Happy holidays!'],
        },
        {
            name: "New Year's Eve",
            date: new Date(year, 11, 31),
            type: 'major',
            greetings: ["Happy New Year's Eve!"],
        },
        // Financial/Investing relevant
        { name: 'Tax Day', date: new Date(year, 3, 15), type: 'observance' },
        // Other notable days
        {
            name: "Mother's Day",
            date: new Date(year, 4, 12),
            type: 'minor',
            greetings: ["Happy Mother's Day!"],
        },
        {
            name: "Father's Day",
            date: new Date(year, 5, 16),
            type: 'minor',
            greetings: ["Happy Father's Day!"],
        },
        {
            name: 'Halloween',
            date: new Date(year, 9, 31),
            type: 'minor',
            greetings: ['Happy Halloween!'],
        },
    ];
}
// ============================================================================
// Season Detection
// ============================================================================
function getSeason() {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4)
        return 'spring';
    if (month >= 5 && month <= 7)
        return 'summer';
    if (month >= 8 && month <= 10)
        return 'fall';
    return 'winter';
}
function _getSeasonalContext(season) {
    // Reserved for future seasonal messaging
    const contexts = {
        spring: ['fresh start energy', 'spring cleaning vibes', 'renewal'],
        summer: ['summer mode', 'vacation energy', 'long days'],
        fall: ['back to routine', 'harvest energy', 'cozy season approaching'],
        winter: ['holiday season', 'reflection time', 'cozy vibes'],
    };
    const options = contexts[season];
    return options[Math.floor(Math.random() * options.length)];
}
// ============================================================================
// Month Context
// ============================================================================
function getMonthContext() {
    const month = new Date().getMonth();
    const contexts = {
        0: 'new year resolution energy',
        1: 'still early in the year',
        2: 'spring is coming',
        3: 'tax season awareness',
        4: 'spring energy',
        5: 'summer approaching',
        6: 'mid-year check-in',
        7: 'summer in full swing',
        8: 'back to school energy',
        9: 'fall settling in',
        10: 'end of year approaching',
        11: 'holiday season',
    };
    return contexts[month] || '';
}
// ============================================================================
// Holiday Detection
// ============================================================================
function findCurrentOrUpcomingHoliday() {
    const now = new Date();
    const year = now.getFullYear();
    const holidays = getHolidays(year);
    let current;
    let upcoming;
    for (const holiday of holidays) {
        const diffDays = Math.floor((holiday.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        // Current if within 1 day
        if (Math.abs(diffDays) <= 1) {
            current = holiday;
        }
        // Upcoming if within 7 days
        else if (diffDays > 0 && diffDays <= 7 && !upcoming) {
            upcoming = holiday;
        }
    }
    return { current, upcoming };
}
// ============================================================================
// Main Functions
// ============================================================================
/**
 * Get current cultural context
 */
export function getCulturalContext() {
    const { current, upcoming } = findCurrentOrUpcomingHoliday();
    return {
        currentHoliday: current,
        upcomingHoliday: upcoming,
        season: getSeason(),
        monthContext: getMonthContext(),
    };
}
/**
 * Get a holiday greeting if appropriate
 */
export function getHolidayGreeting() {
    const { current } = findCurrentOrUpcomingHoliday();
    if (!current?.greetings)
        return null;
    // Only greet on major holidays or with low probability on minor ones
    if (current.type === 'minor' && Math.random() > 0.3)
        return null;
    return current.greetings[Math.floor(Math.random() * current.greetings.length)];
}
/**
 * Get upcoming holiday mention for conversation
 */
export function getUpcomingHolidayMention() {
    const { upcoming } = findCurrentOrUpcomingHoliday();
    if (!upcoming)
        return null;
    const daysUntil = Math.floor((upcoming.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const mentions = [
        `${upcoming.name} is coming up in ${daysUntil} days!`,
        `Almost ${upcoming.name}!`,
        `${upcoming.name} is just around the corner.`,
    ];
    return mentions[Math.floor(Math.random() * mentions.length)];
}
/**
 * Get seasonal behavior adjustments
 */
export function getSeasonalAdjustment() {
    const season = getSeason();
    const adjustments = {
        spring: {
            energyModifier: 1.1,
            topicSuggestions: ['spring cleaning finances', 'new beginnings', 'fresh goals'],
        },
        summer: {
            energyModifier: 1.0,
            topicSuggestions: ['vacation planning', 'summer projects', 'mid-year review'],
        },
        fall: {
            energyModifier: 1.05,
            topicSuggestions: ['year-end planning', 'back to routine', "harvest what you've planted"],
        },
        winter: {
            energyModifier: 0.95,
            topicSuggestions: ['year reflection', 'holiday budgeting', 'new year planning'],
        },
    };
    return adjustments[season];
}
/**
 * Get cultural moment from persona behaviors
 */
export async function getCulturalMoment(personaId) {
    const behaviors = await loadPersonaBehaviors(personaId);
    if (!behaviors)
        return null;
    const cultural = behaviors['cultural-moments'];
    if (!cultural)
        return null;
    const context = getCulturalContext();
    // Try season-specific content
    const seasonal = cultural['seasonal'];
    if (seasonal?.[context.season]) {
        const phrases = seasonal[context.season];
        if (Math.random() > 0.7) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    // Try month-specific content
    const monthly = cultural['monthly'];
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
    const currentMonth = monthNames[new Date().getMonth()];
    if (monthly?.[currentMonth]) {
        const phrases = monthly[currentMonth];
        if (Math.random() > 0.8) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    return null;
}
/**
 * Check if financial/market-relevant date
 */
export function isFinanciallyRelevantDate() {
    const now = new Date();
    const month = now.getMonth();
    const day = now.getDate();
    const dayOfWeek = now.getDay();
    // Tax season (March 15 - April 15)
    if ((month === 2 && day >= 15) || (month === 3 && day <= 15)) {
        return { relevant: true, reason: 'tax season' };
    }
    // End of quarter
    if ((month === 2 || month === 5 || month === 8 || month === 11) && day >= 25) {
        return { relevant: true, reason: 'end of quarter' };
    }
    // Market closed weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { relevant: true, reason: 'market closed for weekend' };
    }
    return { relevant: false };
}
// Export as service object
export const CulturalAwarenessService = {
    getContext: getCulturalContext,
    getHolidayGreeting,
    getUpcomingHolidayMention,
    getSeasonalAdjustment,
    getCulturalMoment,
    isFinanciallyRelevantDate,
    getSeason,
};
export default CulturalAwarenessService;
//# sourceMappingURL=cultural-awareness.js.map