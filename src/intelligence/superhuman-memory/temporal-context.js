/**
 * Seasonal/Temporal Awareness
 *
 * Time-based context awareness.
 *
 * @module superhuman-memory/temporal-context
 */
import { checkUpcomingDates } from './date-awareness.js';
/**
 * Get temporal context for the current moment
 */
export function getTemporalContext(humanMemory) {
    const result = {
        isSpecialDate: false,
        specialDateInfo: undefined,
        seasonalPattern: undefined,
        promptInjection: undefined,
    };
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    // Check for seasonal patterns
    if (humanMemory?.temporal?.seasonal?.length) {
        const currentSeason = getSeason(currentMonth);
        for (const pattern of humanMemory.temporal.seasonal) {
            if (pattern.timing === currentSeason || isTimingMatch(pattern.timing, currentMonth)) {
                result.seasonalPattern = pattern.pattern;
                if (pattern.emotionalTone === 'challenging') {
                    result.promptInjection = `[SEASONAL AWARENESS] User typically experiences ${pattern.pattern} during this time. Approach: ${pattern.approach || 'be supportive'}`;
                }
                break;
            }
        }
    }
    // Check for today being a special date
    const dateInsights = checkUpcomingDates(humanMemory, 0);
    if (dateInsights.length > 0) {
        result.isSpecialDate = true;
        result.specialDateInfo = dateInsights[0].naturalPhrase;
    }
    return result;
}
function getSeason(month) {
    if (month >= 3 && month <= 5)
        return 'spring';
    if (month >= 6 && month <= 8)
        return 'summer';
    if (month >= 9 && month <= 11)
        return 'fall';
    return 'winter';
}
function isTimingMatch(timing, month) {
    switch (timing) {
        case 'tax_season':
            return month >= 2 && month <= 4;
        case 'holidays':
            return month === 11 || month === 12;
        case 'school_year':
            return month >= 9 || month <= 5;
        default:
            return false;
    }
}
//# sourceMappingURL=temporal-context.js.map