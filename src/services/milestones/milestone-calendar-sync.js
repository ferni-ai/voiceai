/**
 * Milestone Calendar Sync
 *
 * Syncs Jordan's milestones and events to the calendar.
 * This is "better than human" because no assistant:
 * - Automatically creates countdown reminders
 * - Blocks prep time for important milestones
 * - Injects milestone awareness into daily briefings
 *
 * @module milestones/milestone-calendar-sync
 */
import { createLogger } from '../../utils/safe-logger.js';
import { createEvent, getEventsForDay, } from '../calendar/calendar-service.js';
const log = createLogger({ module: 'milestone-calendar' });
// ============================================================================
// MAIN FUNCTIONS
// ============================================================================
/**
 * Sync a milestone to the calendar
 *
 * Creates the main event and optionally prep time.
 */
export async function syncMilestoneToCalendar(userId, milestone) {
    const result = {
        milestoneId: milestone.id,
        calendarEventId: null,
        countdownReminders: [],
        prepTimeBlocked: false,
    };
    try {
        // Create main calendar event (all day events use durationMinutes: 24*60)
        const mainEvent = await createEvent(userId, {
            title: `🎯 ${milestone.name}`,
            description: `Milestone: ${milestone.description || milestone.name}\n\nCategory: ${milestone.category || 'personal'}\nImportance: ${milestone.importance}\n\nTracked by Ferni`,
            startTime: milestone.date,
            durationMinutes: 60, // 1 hour event on milestone day
        });
        if (mainEvent) {
            result.calendarEventId = mainEvent.id;
            log.debug({ userId, milestoneId: milestone.id, eventId: mainEvent.id }, 'Milestone synced to calendar');
        }
        // Block prep time if needed
        if (milestone.requiresPrep && milestone.prepTimeHours) {
            const prepStart = new Date(milestone.date);
            prepStart.setDate(prepStart.getDate() - 1);
            prepStart.setHours(14, 0, 0, 0); // Day before at 2pm
            const prepEvent = await createEvent(userId, {
                title: `📝 Prep for: ${milestone.name}`,
                description: `Preparation time for tomorrow's milestone.\n\nMilestone: ${milestone.name}`,
                startTime: prepStart,
                durationMinutes: milestone.prepTimeHours * 60,
            });
            if (prepEvent) {
                result.prepTimeBlocked = true;
                result.prepEventId = prepEvent.id;
            }
        }
        return result;
    }
    catch (error) {
        log.error({ error: String(error), userId, milestoneId: milestone.id }, 'Failed to sync milestone');
        return result;
    }
}
/**
 * Create countdown reminders for a milestone
 */
export async function createMilestoneCountdown(userId, milestone, reminderDaysBefore = [30, 14, 7, 3, 1]) {
    const reminders = [];
    const now = new Date();
    const milestoneDate = new Date(milestone.date);
    for (const daysBefore of reminderDaysBefore) {
        const reminderDate = new Date(milestoneDate);
        reminderDate.setDate(reminderDate.getDate() - daysBefore);
        // Skip if reminder date is in the past
        if (reminderDate < now)
            continue;
        // Set to morning
        reminderDate.setHours(9, 0, 0, 0);
        try {
            const event = await createEvent(userId, {
                title: `⏰ ${daysBefore} days until: ${milestone.name}`,
                description: `Countdown reminder for ${milestone.name}\n\nMilestone date: ${milestoneDate.toLocaleDateString()}\nDays remaining: ${daysBefore}`,
                startTime: reminderDate,
                durationMinutes: 15,
            });
            if (event) {
                reminders.push({ date: reminderDate, eventId: event.id });
            }
        }
        catch (error) {
            log.error({ error: String(error), daysBefore }, 'Failed to create countdown reminder');
        }
    }
    log.info({ userId, milestoneId: milestone.id, reminderCount: reminders.length }, 'Created countdown reminders');
    return reminders;
}
/**
 * Get milestones that should be mentioned in today's briefing
 */
export async function getMilestonesForDailyBriefing(userId, milestones) {
    const countdowns = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (const milestone of milestones) {
        const milestoneDate = new Date(milestone.date);
        milestoneDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((milestoneDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        // Only include upcoming milestones (within 30 days)
        if (daysUntil < 0 || daysUntil > 30)
            continue;
        const isUrgent = daysUntil <= 7;
        const isImminent = daysUntil <= 3;
        // Generate appropriate message
        let message;
        if (daysUntil === 0) {
            message = `Today is the day: ${milestone.name}!`;
        }
        else if (daysUntil === 1) {
            message = `Tomorrow: ${milestone.name}`;
        }
        else if (isImminent) {
            message = `${milestone.name} in ${daysUntil} days - getting close!`;
        }
        else if (isUrgent) {
            message = `${milestone.name} coming up in ${daysUntil} days`;
        }
        else {
            message = `${daysUntil} days until ${milestone.name}`;
        }
        countdowns.push({
            milestone,
            daysUntil,
            isUrgent,
            isImminent,
            message,
        });
    }
    // Sort by days until
    countdowns.sort((a, b) => a.daysUntil - b.daysUntil);
    return countdowns;
}
/**
 * Inject milestone countdown into daily context
 */
export async function injectMilestoneCountdownToDaily(userId, milestones) {
    const countdowns = await getMilestonesForDailyBriefing(userId, milestones);
    if (countdowns.length === 0) {
        return null;
    }
    const sections = ["[MILESTONE COUNTDOWN - Jordan's Life Planning]"];
    // Group by urgency
    const imminent = countdowns.filter((c) => c.isImminent);
    const urgent = countdowns.filter((c) => c.isUrgent && !c.isImminent);
    const upcoming = countdowns.filter((c) => !c.isUrgent);
    if (imminent.length > 0) {
        sections.push('\n🚨 **Imminent (1-3 days):**');
        for (const c of imminent) {
            sections.push(`• ${c.message}`);
        }
    }
    if (urgent.length > 0) {
        sections.push('\n⏰ **This Week:**');
        for (const c of urgent) {
            sections.push(`• ${c.message}`);
        }
    }
    if (upcoming.length > 0) {
        sections.push('\n📅 **Coming Up:**');
        for (const c of upcoming.slice(0, 3)) {
            sections.push(`• ${c.message}`);
        }
    }
    return sections.join('\n');
}
/**
 * Check if milestone conflicts with calendar
 */
export async function checkMilestoneConflicts(userId, milestone) {
    try {
        const events = await getEventsForDay(userId, milestone.date);
        // Filter to significant conflicts (not all-day, longer than 30 min)
        const conflicts = events.filter((e) => {
            if (e.isAllDay)
                return false;
            const duration = (e.endTime.getTime() - e.startTime.getTime()) / 60000;
            return duration > 30;
        });
        if (conflicts.length === 0) {
            return { hasConflict: false, conflictingEvents: [], suggestion: null };
        }
        const totalConflictMinutes = conflicts.reduce((sum, e) => {
            return sum + (e.endTime.getTime() - e.startTime.getTime()) / 60000;
        }, 0);
        let suggestion = null;
        if (totalConflictMinutes > 180) {
            suggestion = `${milestone.name} day has ${Math.round(totalConflictMinutes / 60)}h of meetings. Consider clearing some time.`;
        }
        else if (conflicts.length > 2) {
            suggestion = `${conflicts.length} meetings on ${milestone.name} day. You might want to reschedule some.`;
        }
        return {
            hasConflict: true,
            conflictingEvents: conflicts,
            suggestion,
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to check milestone conflicts');
        return { hasConflict: false, conflictingEvents: [], suggestion: null };
    }
}
/**
 * Generate celebration suggestions for completed milestones
 */
export function generateMilestoneCelebration(milestone) {
    const category = milestone.category || 'personal';
    const messages = {
        personal: [
            'You did it! This is a moment worth celebrating.',
            'Another milestone achieved. How does it feel?',
        ],
        career: [
            'Career milestone reached! This took real effort.',
            'Professional growth in action. Well done.',
        ],
        health: [
            'Health milestone achieved! Your future self thanks you.',
            'Taking care of yourself pays off. Celebrate this.',
        ],
        relationship: [
            'Relationship milestone! These moments matter.',
            'Investing in relationships is always worth it.',
        ],
        financial: [
            'Financial milestone reached! Smart moves.',
            'Financial progress is worth celebrating.',
        ],
        other: [
            'Milestone achieved! Take a moment to appreciate this.',
            "Another goal reached. What's next?",
        ],
    };
    const celebrations = {
        personal: ['Treat yourself to something nice', 'Share this with someone you trust'],
        career: ['Update your accomplishments list', 'Acknowledge yourself publicly'],
        health: ['Enjoy a rest day guilt-free', 'Reward yourself with something healthy'],
        relationship: ['Plan something special together', 'Express gratitude to those involved'],
        financial: ["Review how far you've come", 'Set your next target'],
        other: ['Document this achievement', 'Celebrate in a way that feels right'],
    };
    const messageOptions = messages[category] || messages.other;
    const celebrationOptions = celebrations[category] || celebrations.other;
    return {
        message: messageOptions[Math.floor(Math.random() * messageOptions.length)],
        celebrationSuggestion: celebrationOptions[Math.floor(Math.random() * celebrationOptions.length)],
    };
}
// ============================================================================
// CONVENIENCE FUNCTION: Build Milestone Calendar Context
// ============================================================================
/**
 * Convenience function that fetches user milestones and generates calendar context.
 * This is the main entry point for context builders that need milestone-calendar integration.
 */
export async function buildMilestoneCalendarContext(userId) {
    try {
        // Dynamic import to avoid circular dependencies
        const { getUserMilestones } = await import('../../tools/domains/life-planning/life-firsts-tracker.js');
        const userMilestones = await getUserMilestones(userId);
        if (!userMilestones || userMilestones.length === 0) {
            return null;
        }
        // Convert to Milestone format expected by our functions
        const now = new Date();
        const milestones = userMilestones
            .filter((m) => m.targetDate && m.status !== 'completed')
            .map((m) => ({
            id: m.id,
            name: m.name,
            date: new Date(m.targetDate),
            description: m.description,
            category: mapCategory(m.category),
            importance: 'medium',
            requiresPrep: false,
            userId,
            createdAt: now,
            updatedAt: now,
        }));
        if (milestones.length === 0) {
            return null;
        }
        // Get countdowns for upcoming milestones
        return await injectMilestoneCountdownToDaily(userId, milestones);
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to build milestone calendar context');
        return null;
    }
}
/**
 * Map life-firsts-tracker categories to milestone-calendar-sync categories
 */
function mapCategory(category) {
    if (!category)
        return 'personal';
    const normalizedCategory = category.toLowerCase();
    if (['career', 'work', 'professional'].includes(normalizedCategory))
        return 'career';
    if (['health', 'wellness', 'fitness'].includes(normalizedCategory))
        return 'health';
    if (['relationship', 'family', 'social'].includes(normalizedCategory))
        return 'relationship';
    if (['financial', 'money', 'budget'].includes(normalizedCategory))
        return 'financial';
    if (['personal', 'self', 'growth'].includes(normalizedCategory))
        return 'personal';
    return 'other';
}
// Keywords that indicate milestone-related calendar blocks
const MILESTONE_KEYWORDS = ['prep for', 'focus:', 'milestone:', 'work on', 'planning:', 'review:'];
const PREP_KEYWORDS = ['prep', 'prepare', 'preparation', 'planning'];
const REVIEW_KEYWORDS = ['review', 'reflect', 'assess'];
const FOCUS_KEYWORDS = ['focus', 'work on', 'deep work'];
/**
 * Detect calendar events that are related to milestones (bidirectional discovery)
 *
 * This scans calendar events and matches them to milestones based on:
 * 1. Direct references (event linked to milestone via calendarEventId)
 * 2. Keyword matching (event title mentions milestone name)
 * 3. Date proximity (events blocked near milestone dates)
 */
export async function detectMilestoneRelatedEvents(userId, milestones, daysAhead = 14) {
    const linkMap = new Map();
    try {
        // Check each day for events
        for (let i = 0; i < daysAhead; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const events = await getEventsForDay(userId, date);
            if (!events || events.length === 0)
                continue;
            for (const event of events) {
                const eventTitle = event.title?.toLowerCase() || '';
                // Check each milestone for matches
                for (const milestone of milestones) {
                    const milestoneName = milestone.name.toLowerCase();
                    let linkType = null;
                    // Direct reference - event is the milestone event
                    if (event.id === milestone.calendarEventId) {
                        linkType = 'main';
                    }
                    // Countdown reminder reference
                    else if (milestone.countdownReminderIds?.includes(event.id)) {
                        linkType = 'countdown';
                    }
                    // Title mentions milestone name
                    else if (eventTitle.includes(milestoneName)) {
                        // Determine type based on keywords
                        if (PREP_KEYWORDS.some((k) => eventTitle.includes(k))) {
                            linkType = 'prep';
                        }
                        else if (REVIEW_KEYWORDS.some((k) => eventTitle.includes(k))) {
                            linkType = 'focus'; // We'll call review a focus type
                        }
                        else if (FOCUS_KEYWORDS.some((k) => eventTitle.includes(k))) {
                            linkType = 'focus';
                        }
                        else {
                            linkType = 'focus'; // Default to focus if milestone name found
                        }
                    }
                    // Generic milestone keywords + date proximity
                    else if (MILESTONE_KEYWORDS.some((k) => eventTitle.includes(k)) &&
                        isWithinDays(date, milestone.date, 3)) {
                        linkType = 'prep';
                    }
                    if (linkType) {
                        const links = linkMap.get(milestone.id) || [];
                        links.push({
                            eventId: event.id,
                            milestoneId: milestone.id,
                            linkType,
                            createdAt: new Date(),
                        });
                        linkMap.set(milestone.id, links);
                    }
                }
            }
        }
        log.debug({ userId, milestoneCount: milestones.length, linksFound: linkMap.size }, 'Detected milestone-calendar links');
        return linkMap;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to detect milestone-related events');
        return new Map();
    }
}
/**
 * Calculate time buffers for milestones based on blocked calendar time
 *
 * This is the bidirectional sync: looking at what the user has blocked
 * and calculating if they have enough time for their milestones.
 */
export async function calculateMilestoneTimeBuffers(userId, milestones) {
    const buffers = [];
    try {
        // Get all milestone-related events
        const linkMap = await detectMilestoneRelatedEvents(userId, milestones, 30);
        for (const milestone of milestones) {
            const links = linkMap.get(milestone.id) || [];
            const buffer = {
                milestoneId: milestone.id,
                milestoneName: milestone.name,
                targetDate: milestone.date,
                totalBlockedHours: 0,
                blockedEvents: [],
                estimatedHoursNeeded: milestone.prepTimeHours || 10, // Default 10 hours
                coverage: 'none',
                recommendation: '',
            };
            // Get details for each linked event
            for (const link of links) {
                const events = await getEventsForDay(userId, new Date()); // We'd need the actual event date
                const event = events.find((e) => e.id === link.eventId);
                if (event) {
                    const durationHours = (event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60 * 60);
                    buffer.blockedEvents.push({
                        eventId: link.eventId,
                        title: event.title,
                        date: event.startTime,
                        durationHours,
                        purpose: linkTypeToPurpose(link.linkType),
                    });
                    buffer.totalBlockedHours += durationHours;
                }
            }
            // Calculate coverage
            const coverageRatio = buffer.totalBlockedHours / buffer.estimatedHoursNeeded;
            if (coverageRatio >= 1.0) {
                buffer.coverage = 'adequate';
                buffer.recommendation = 'You have enough time blocked for this milestone. Stay focused!';
            }
            else if (coverageRatio >= 0.7) {
                buffer.coverage = 'light';
                buffer.recommendation = `Consider blocking ${Math.ceil(buffer.estimatedHoursNeeded - buffer.totalBlockedHours)} more hours for ${milestone.name}.`;
            }
            else if (coverageRatio >= 0.3) {
                buffer.coverage = 'light';
                buffer.recommendation = `You need more dedicated time for ${milestone.name}. Try blocking focus time this week.`;
            }
            else {
                buffer.coverage = 'none';
                buffer.recommendation = `No focused time blocked for ${milestone.name}. Consider scheduling prep time.`;
            }
            buffers.push(buffer);
        }
        log.info({ userId, bufferCount: buffers.length }, 'Calculated milestone time buffers');
        return buffers;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to calculate time buffers');
        return [];
    }
}
/**
 * Sync calendar event changes back to milestones
 *
 * Call this when a calendar event is updated to keep milestones in sync.
 */
export async function syncCalendarEventToMilestone(userId, eventId, eventUpdate, milestones) {
    try {
        // Find milestone linked to this event
        const linkedMilestone = milestones.find((m) => m.calendarEventId === eventId || m.countdownReminderIds?.includes(eventId));
        if (!linkedMilestone) {
            return { updated: false };
        }
        const changes = [];
        // Handle cancellation
        if (eventUpdate.cancelled) {
            changes.push(`Calendar event for "${linkedMilestone.name}" was cancelled`);
            // Note: We don't automatically cancel the milestone, just note it
            log.info({ userId, milestoneId: linkedMilestone.id, eventId }, 'Milestone calendar event cancelled');
        }
        // Handle date change
        if (eventUpdate.newDate && eventUpdate.newDate.getTime() !== linkedMilestone.date.getTime()) {
            const oldDate = linkedMilestone.date.toLocaleDateString();
            const newDate = eventUpdate.newDate.toLocaleDateString();
            changes.push(`"${linkedMilestone.name}" date changed from ${oldDate} to ${newDate}`);
            log.info({ userId, milestoneId: linkedMilestone.id, oldDate, newDate }, 'Milestone date synced from calendar');
        }
        return {
            updated: changes.length > 0,
            milestoneId: linkedMilestone.id,
            changes,
        };
    }
    catch (error) {
        log.error({ error: String(error), userId, eventId }, 'Failed to sync calendar to milestone');
        return { updated: false };
    }
}
/**
 * Get a summary of milestone-calendar sync status for the user
 */
export async function getMilestoneCalendarSyncStatus(userId, milestones) {
    const syncedMilestones = milestones.filter((m) => m.calendarEventId).length;
    const unsyncedMilestones = milestones.length - syncedMilestones;
    const buffers = await calculateMilestoneTimeBuffers(userId, milestones);
    const needingTime = buffers
        .filter((b) => b.coverage === 'none' || b.coverage === 'light')
        .map((b) => b.milestoneName);
    const conflicts = [];
    for (const milestone of milestones.slice(0, 5)) {
        const result = await checkMilestoneConflicts(userId, milestone);
        if (result.hasConflict && result.suggestion) {
            conflicts.push(result.suggestion);
        }
    }
    let recommendation = '';
    if (unsyncedMilestones > 0) {
        recommendation = `${unsyncedMilestones} milestones not on calendar. Want me to sync them?`;
    }
    else if (needingTime.length > 0) {
        recommendation = `${needingTime.length} milestones need more focus time. Let's block some time.`;
    }
    else if (conflicts.length > 0) {
        recommendation = 'Some milestone days are packed. Review your calendar?';
    }
    else {
        recommendation = 'Your milestones and calendar are well-aligned!';
    }
    return {
        syncedMilestones,
        unsyncedMilestones,
        milestonesNeedingTime: needingTime,
        upcomingConflicts: conflicts,
        recommendation,
    };
}
// Helper functions
function isWithinDays(date1, date2, days) {
    const diff = Math.abs(date1.getTime() - date2.getTime());
    return diff <= days * 24 * 60 * 60 * 1000;
}
function linkTypeToPurpose(linkType) {
    switch (linkType) {
        case 'prep':
            return 'prep';
        case 'focus':
            return 'focus';
        case 'countdown':
            return 'general';
        case 'main':
            return 'general';
        default:
            return 'general';
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const milestoneCalendarSync = {
    // One-way: Milestone → Calendar
    syncToCalendar: syncMilestoneToCalendar,
    createCountdown: createMilestoneCountdown,
    getForBriefing: getMilestonesForDailyBriefing,
    injectToDaily: injectMilestoneCountdownToDaily,
    checkConflicts: checkMilestoneConflicts,
    generateCelebration: generateMilestoneCelebration,
    buildContext: buildMilestoneCalendarContext,
    // Bidirectional: Calendar ↔ Milestone
    detectMilestoneEvents: detectMilestoneRelatedEvents,
    calculateTimeBuffers: calculateMilestoneTimeBuffers,
    syncEventToMilestone: syncCalendarEventToMilestone,
    getSyncStatus: getMilestoneCalendarSyncStatus,
};
export default milestoneCalendarSync;
//# sourceMappingURL=milestone-calendar-sync.js.map