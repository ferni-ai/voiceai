/**
 * Seasonal Planning Intelligence
 *
 * "Humans don't track optimal timing across cultures and seasons."
 *
 * This service provides cultural and seasonal intelligence for event planning:
 * - Cultural dates to embrace or avoid
 * - Seasonal patterns (wedding season, graduation season, etc.)
 * - User's personal seasonal patterns (low energy months, peak months)
 * - Optimal timing recommendations
 *
 * Better Than Human: We know every cultural date, seasonal pattern, and your
 * personal rhythms to suggest perfect timing.
 *
 * @module services/superhuman/seasonal-planning-intelligence
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
const log = createLogger({ module: 'superhuman:seasonal-planning-intelligence' });
// ============================================================================
// CULTURAL & SEASONAL DATA
// ============================================================================
const CULTURAL_DATES = [
    // Major US Holidays
    { date: '01-01', name: 'New Year\'s Day', cultures: ['US', 'Western'], planningAdvice: 'avoid', notes: 'Recovery day, venues closed', moveable: false },
    { date: '07-04', name: 'Independence Day', cultures: ['US'], planningAdvice: 'be_aware', notes: 'Great for patriotic themes, but outdoor events compete with fireworks', moveable: false },
    { date: '11-28', name: 'Thanksgiving (US)', cultures: ['US'], planningAdvice: 'avoid', notes: 'Family time, travel chaos', moveable: true },
    { date: '12-25', name: 'Christmas', cultures: ['Christian', 'Western'], planningAdvice: 'avoid', notes: 'Family holiday, most venues closed', moveable: false },
    { date: '12-31', name: 'New Year\'s Eve', cultures: ['US', 'Western'], planningAdvice: 'premium_pricing', notes: 'Premium pricing, high demand', moveable: false },
    // Religious Holidays (approximate - many are moveable)
    { date: '03-17', name: 'St. Patrick\'s Day', cultures: ['Irish', 'US'], planningAdvice: 'be_aware', notes: 'Great for Irish themes, but venues busy', moveable: false },
    { date: '04-01', name: 'Easter (approximate)', cultures: ['Christian'], planningAdvice: 'avoid', notes: 'Religious observance, family gatherings', moveable: true },
    { date: '09-15', name: 'Rosh Hashanah (approximate)', cultures: ['Jewish'], planningAdvice: 'avoid', notes: 'Jewish New Year - be respectful', moveable: true },
    { date: '09-25', name: 'Yom Kippur (approximate)', cultures: ['Jewish'], planningAdvice: 'avoid', notes: 'Holiest day in Judaism', moveable: true },
    { date: '10-31', name: 'Halloween', cultures: ['US', 'Western'], planningAdvice: 'embrace', notes: 'Great for themed events', moveable: false },
    { date: '11-01', name: 'Día de los Muertos', cultures: ['Mexican', 'Latin American'], planningAdvice: 'be_aware', notes: 'Important cultural observance', moveable: false },
    // Cultural Celebrations
    { date: '02-14', name: 'Valentine\'s Day', cultures: ['Western'], planningAdvice: 'premium_pricing', notes: 'High demand for romantic venues', moveable: false },
    { date: '05-05', name: 'Cinco de Mayo', cultures: ['Mexican', 'US'], planningAdvice: 'embrace', notes: 'Great for festive celebrations', moveable: false },
    // Cultural Events (approximate dates)
    { date: '01-25', name: 'Lunar New Year (approximate)', cultures: ['Chinese', 'Vietnamese', 'Korean', 'Asian'], planningAdvice: 'be_aware', notes: 'Major celebration - embrace or respect', moveable: true },
    { date: '10-15', name: 'Diwali (approximate)', cultures: ['Hindu', 'Indian'], planningAdvice: 'embrace', notes: 'Festival of lights - beautiful for events', moveable: true },
    { date: '03-20', name: 'Nowruz', cultures: ['Persian', 'Iranian'], planningAdvice: 'be_aware', notes: 'Persian New Year', moveable: false },
];
const SEASONAL_PATTERNS = [
    // Wedding Season
    {
        name: 'Peak Wedding Season',
        months: [5, 6, 9, 10],
        affectedEventTypes: ['wedding', 'engagement'],
        impact: 'premium_pricing',
        notes: 'Book 12-18 months ahead, premium pricing for vendors',
    },
    {
        name: 'Off-Peak Wedding Season',
        months: [1, 2, 3, 11, 12],
        affectedEventTypes: ['wedding', 'engagement'],
        impact: 'optimal',
        notes: 'Better pricing, more availability, but weather considerations',
    },
    // Graduation Season
    {
        name: 'Graduation Season',
        months: [5, 6],
        affectedEventTypes: ['graduation', 'party'],
        impact: 'high_demand',
        notes: 'Venues book early, restaurant reservations tough',
    },
    // Holiday Season
    {
        name: 'Holiday Party Season',
        months: [11, 12],
        affectedEventTypes: ['corporate', 'party', 'dinner-party'],
        impact: 'high_demand',
        notes: 'Venues and caterers in high demand, book early',
    },
    // Summer Events
    {
        name: 'Summer Outdoor Season',
        months: [6, 7, 8],
        affectedEventTypes: ['outdoor', 'bbq', 'garden-party'],
        impact: 'weather_risk',
        notes: 'Great for outdoor events but have backup plans',
    },
    // Tax Season
    {
        name: 'Tax Season',
        months: [3, 4],
        affectedEventTypes: ['financial', 'corporate'],
        impact: 'low_availability',
        notes: 'Financial professionals busy, avoid financial-themed events',
    },
];
// ============================================================================
// STORAGE
// ============================================================================
const COLLECTION = 'seasonal_planning';
async function loadSeasonalProfile(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db.collection('bogle_users').doc(userId).collection(COLLECTION).doc('profile').get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to load seasonal planning profile');
        return null;
    }
}
async function saveSeasonalProfile(userId, profile) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .doc('profile')
            .set({
            ...profile,
            lastUpdated: new Date().toISOString(),
        });
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to save seasonal planning profile');
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Get cultural dates relevant to a user
 */
export async function getRelevantCulturalDates(userId, startDate, endDate) {
    const profile = await loadSeasonalProfile(userId);
    const cultures = profile?.culturalBackgrounds || ['US', 'Western'];
    const start = new Date(startDate);
    const end = new Date(endDate);
    return CULTURAL_DATES.filter((date) => {
        // Check if relevant to user's cultures
        const isRelevant = date.cultures.some((c) => cultures.includes(c) || cultures.includes('all'));
        if (!isRelevant)
            return false;
        // Check if date falls within range
        const [month, day] = date.date.split('-').map(Number);
        // Check each year in range
        for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
            const dateThisYear = new Date(year, month - 1, day);
            if (dateThisYear >= start && dateThisYear <= end) {
                return true;
            }
        }
        return false;
    });
}
/**
 * Get seasonal patterns affecting a date range
 */
export function getSeasonalPatterns(startDate, endDate, eventType) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = new Set();
    // Collect all months in range
    const current = new Date(start);
    while (current <= end) {
        months.add(current.getMonth() + 1);
        current.setMonth(current.getMonth() + 1);
    }
    return SEASONAL_PATTERNS.filter((pattern) => {
        // Check if any months overlap
        const hasOverlap = pattern.months.some((m) => months.has(m));
        if (!hasOverlap)
            return false;
        // Check if event type matches (if specified)
        if (eventType) {
            return pattern.affectedEventTypes.some((t) => t === eventType || eventType.includes(t));
        }
        return true;
    });
}
/**
 * Update user's cultural backgrounds
 */
export async function updateCulturalBackgrounds(userId, cultures) {
    const profile = (await loadSeasonalProfile(userId)) || createDefaultProfile(userId);
    profile.culturalBackgrounds = cultures;
    await saveSeasonalProfile(userId, profile);
    log.info({ userId, cultures }, 'Updated cultural backgrounds');
}
/**
 * Update user's personal seasonal patterns
 */
export async function updatePersonalPatterns(userId, patterns) {
    const profile = (await loadSeasonalProfile(userId)) || createDefaultProfile(userId);
    profile.personalPatterns = { ...profile.personalPatterns, ...patterns };
    await saveSeasonalProfile(userId, profile);
    log.info({ userId }, 'Updated personal seasonal patterns');
}
/**
 * Record event outcome for pattern learning
 */
export async function recordEventOutcome(userId, eventType, date, satisfactionScore, notes) {
    const profile = (await loadSeasonalProfile(userId)) || createDefaultProfile(userId);
    const eventDate = new Date(date);
    profile.eventHistory.push({
        eventType,
        month: eventDate.getMonth() + 1,
        year: eventDate.getFullYear(),
        satisfactionScore,
        notes,
    });
    // Learn from history - update preferred months
    const successfulMonths = profile.eventHistory
        .filter((e) => e.satisfactionScore >= 8)
        .map((e) => e.month);
    const monthCounts = successfulMonths.reduce((acc, month) => {
        acc[month] = (acc[month] || 0) + 1;
        return acc;
    }, {});
    // Months with 2+ successful events become preferred
    profile.personalPatterns.preferredCelebrationMonths = Object.entries(monthCounts)
        .filter(([_, count]) => count >= 2)
        .map(([month]) => parseInt(month));
    await saveSeasonalProfile(userId, profile);
    log.info({ userId, eventType, month: eventDate.getMonth() + 1, satisfactionScore }, 'Recorded event outcome');
}
/**
 * Get optimal timing for an event
 */
export async function suggestOptimalTiming(userId, eventType, preferredMonths, avoidMonths) {
    const profile = await loadSeasonalProfile(userId);
    const personalPatterns = profile?.personalPatterns || createDefaultPersonalPatterns();
    const recommendations = [];
    const now = new Date();
    // Check next 12 months
    for (let monthOffset = 1; monthOffset <= 12; monthOffset++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        const month = targetDate.getMonth() + 1;
        const year = targetDate.getFullYear();
        let score = 70; // Base score
        const reasons = [];
        const warnings = [];
        const culturalNotes = [];
        // Check preferred months
        if (preferredMonths?.includes(month)) {
            score += 15;
            reasons.push('In your preferred time range');
        }
        // Check avoid months
        if (avoidMonths?.includes(month)) {
            score -= 30;
            warnings.push('In your avoid time range');
        }
        // Check personal patterns
        if (personalPatterns.lowEnergyMonths.includes(month)) {
            score -= 15;
            warnings.push('You typically have lower energy this month');
        }
        if (personalPatterns.highEnergyMonths.includes(month)) {
            score += 10;
            reasons.push('You typically have great energy this month');
        }
        if (personalPatterns.difficultMonths.includes(month)) {
            score -= 25;
            warnings.push('This month has difficult associations for you');
        }
        if (personalPatterns.preferredCelebrationMonths.includes(month)) {
            score += 10;
            reasons.push('Your past events this month were successful');
        }
        // Check seasonal patterns
        const seasonalEffects = SEASONAL_PATTERNS.filter((p) => p.months.includes(month) &&
            p.affectedEventTypes.some((t) => eventType.includes(t) || t === eventType));
        for (const effect of seasonalEffects) {
            switch (effect.impact) {
                case 'premium_pricing':
                    score -= 10;
                    warnings.push(`${effect.name}: ${effect.notes}`);
                    break;
                case 'high_demand':
                    score -= 5;
                    warnings.push(`${effect.name}: Book early!`);
                    break;
                case 'optimal':
                    score += 15;
                    reasons.push(`${effect.name}: Great time for this type of event`);
                    break;
                case 'weather_risk':
                    score -= 5;
                    warnings.push(`${effect.name}: Have a backup plan`);
                    break;
            }
        }
        // Check cultural dates
        const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        const endOfMonth = `${year}-${String(month).padStart(2, '0')}-28`;
        const culturalDates = await getRelevantCulturalDates(userId, startOfMonth, endOfMonth);
        for (const cd of culturalDates) {
            if (cd.planningAdvice === 'avoid') {
                score -= 10;
                culturalNotes.push(`${cd.name}: ${cd.notes}`);
            }
            else if (cd.planningAdvice === 'embrace') {
                score += 5;
                culturalNotes.push(`${cd.name} could be incorporated`);
            }
            else if (cd.planningAdvice === 'premium_pricing') {
                score -= 5;
                culturalNotes.push(`${cd.name}: Premium pricing likely`);
            }
        }
        // Ensure score is within bounds
        score = Math.max(0, Math.min(100, score));
        recommendations.push({
            dateRange: {
                start: startOfMonth,
                end: endOfMonth,
            },
            score,
            reasons,
            warnings,
            culturalNotes,
        });
    }
    // Sort by score
    return recommendations.sort((a, b) => b.score - a.score);
}
/**
 * Check specific date for conflicts
 */
export async function checkDateConflicts(userId, date) {
    const profile = await loadSeasonalProfile(userId);
    const checkDate = new Date(date);
    const month = checkDate.getMonth() + 1;
    const culturalConflicts = await getRelevantCulturalDates(userId, date, date);
    const seasonalConsiderations = getSeasonalPatterns(date, date);
    const personalConflicts = [];
    if (profile?.personalPatterns.difficultMonths.includes(month)) {
        personalConflicts.push('This month has difficult associations');
    }
    if (profile?.personalPatterns.lowEnergyMonths.includes(month)) {
        personalConflicts.push('You typically have lower energy this month');
    }
    // Determine recommendation
    const avoidDates = culturalConflicts.filter((c) => c.planningAdvice === 'avoid');
    const hasMajorConflict = avoidDates.length > 0 ||
        personalConflicts.some((p) => p.includes('difficult'));
    const recommendation = hasMajorConflict ? 'avoid' :
        (culturalConflicts.length > 0 || personalConflicts.length > 0) ? 'caution' :
            'clear';
    return {
        culturalConflicts,
        seasonalConsiderations,
        personalConflicts,
        recommendation,
    };
}
/**
 * Build context string for LLM injection
 */
export async function buildSeasonalPlanningContext(userId, eventType, targetDate) {
    if (!eventType && !targetDate)
        return '';
    const lines = ['[SEASONAL PLANNING INTELLIGENCE - Better Than Human]'];
    lines.push('I track every cultural date, season, and your personal rhythms:\n');
    if (targetDate) {
        const conflicts = await checkDateConflicts(userId, targetDate);
        if (conflicts.recommendation === 'avoid') {
            lines.push(`⚠️ ${targetDate} has conflicts:`);
            for (const c of conflicts.culturalConflicts.filter((c) => c.planningAdvice === 'avoid')) {
                lines.push(`  • ${c.name}: ${c.notes}`);
            }
            for (const p of conflicts.personalConflicts) {
                lines.push(`  • ${p}`);
            }
        }
        else if (conflicts.recommendation === 'caution') {
            lines.push(`🟡 ${targetDate} - proceed with awareness:`);
            for (const c of conflicts.culturalConflicts) {
                lines.push(`  • ${c.name}: ${c.notes}`);
            }
        }
        else {
            lines.push(`✅ ${targetDate} looks clear of major conflicts`);
        }
    }
    if (eventType) {
        const optimal = await suggestOptimalTiming(userId, eventType);
        const top3 = optimal.slice(0, 3);
        lines.push(`\n📅 Best months for ${eventType}:`);
        for (const rec of top3) {
            const month = new Date(rec.dateRange.start).toLocaleString('en-US', { month: 'long', year: 'numeric' });
            lines.push(`  • ${month} (score: ${rec.score}/100)`);
            if (rec.reasons.length > 0) {
                lines.push(`    ✓ ${rec.reasons[0]}`);
            }
            if (rec.warnings.length > 0) {
                lines.push(`    ⚠️ ${rec.warnings[0]}`);
            }
        }
    }
    return lines.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createDefaultProfile(userId) {
    return {
        userId,
        culturalBackgrounds: ['US', 'Western'],
        personalPatterns: createDefaultPersonalPatterns(),
        eventHistory: [],
        lastUpdated: new Date().toISOString(),
    };
}
function createDefaultPersonalPatterns() {
    return {
        lowEnergyMonths: [1, 2], // Post-holiday slump
        highEnergyMonths: [5, 6, 9, 10], // Spring and fall
        difficultMonths: [],
        busyMonths: [12], // Holiday season
        preferredCelebrationMonths: [],
    };
}
// ============================================================================
// SERVICE EXPORT
// ============================================================================
export const seasonalPlanningIntelligence = {
    getRelevantCulturalDates,
    getSeasonalPatterns,
    updateCulturalBackgrounds,
    updatePersonalPatterns,
    recordEventOutcome,
    suggestOptimalTiming,
    checkDateConflicts,
    buildSeasonalPlanningContext,
    loadSeasonalProfile,
};
export default seasonalPlanningIntelligence;
//# sourceMappingURL=seasonal-planning-intelligence.js.map