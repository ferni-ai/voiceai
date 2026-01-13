/**
 * Proactive Calendar Intelligence
 *
 * Provides proactive insights and assistance:
 * 1. Pre-meeting briefings (prep before important meetings)
 * 2. Post-meeting follow-ups (capture action items)
 * 3. Conflict detection with suggestions
 * 4. Smart recurring event suggestions
 *
 * Designed to make Alex "superhuman" at calendar management.
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getEventsForDay, findFreeTimeSlots, } from './calendar-service.js';
import { analyzeCalendarPatterns } from './calendar-intelligence.js';
const log = createLogger({ module: 'ProactiveCalendar' });
// ============================================================================
// PRE-MEETING BRIEFINGS
// ============================================================================
/**
 * Get pre-meeting briefings for upcoming events
 *
 * Returns briefings for events starting within the specified window.
 * Prioritizes high-importance meetings (interviews, presentations, etc.)
 */
export async function getUpcomingBriefings(userId, windowMinutes = 60) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);
    try {
        const dayEvents = await getEventsForDay(userId, now);
        const briefings = [];
        for (const event of dayEvents) {
            const startTime = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
            // Only events starting within the window
            if (startTime < now || startTime > windowEnd)
                continue;
            const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);
            const priority = calculateMeetingPriority(event);
            // Only generate briefings for medium+ priority or very soon meetings
            if (priority === 'low' && minutesUntil > 15)
                continue;
            briefings.push({
                eventId: event.id,
                eventTitle: event.title || 'Untitled',
                startsAt: startTime,
                minutesUntil,
                briefing: generateBriefing(event, minutesUntil),
                priority,
            });
        }
        // Sort by start time
        briefings.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        log.debug({ userId, briefingCount: briefings.length }, 'Generated pre-meeting briefings');
        return briefings;
    }
    catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to get upcoming briefings');
        return [];
    }
}
/**
 * Calculate meeting priority
 */
function calculateMeetingPriority(event) {
    const title = (event.title || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    // High priority
    if (title.includes('interview') ||
        title.includes('presentation') ||
        title.includes('board') ||
        title.includes('client') ||
        title.includes('investor') ||
        title.includes('final') ||
        description.includes('important')) {
        return 'high';
    }
    // Medium priority
    if (title.includes('meeting') ||
        title.includes('call') ||
        title.includes('review') ||
        title.includes('sync') ||
        title.includes('standup') ||
        title.includes('1:1') ||
        title.includes('one-on-one')) {
        return 'medium';
    }
    return 'low';
}
/**
 * Generate briefing content for an event
 */
function generateBriefing(event, minutesUntil) {
    const title = (event.title || 'Meeting').toLowerCase();
    const prepTips = [];
    // Time-based tips
    if (minutesUntil <= 5) {
        prepTips.push('Take a deep breath and center yourself');
    }
    else if (minutesUntil <= 15) {
        prepTips.push('Review your key talking points');
        prepTips.push('Close unnecessary tabs and apps');
    }
    else {
        prepTips.push('Review relevant materials');
        prepTips.push('Prepare questions you want to ask');
    }
    // Meeting type specific tips
    if (title.includes('interview')) {
        prepTips.push('Remember your key achievements and examples');
        prepTips.push('Have questions ready for your interviewer');
        prepTips.push("You've prepared for this - trust yourself");
    }
    else if (title.includes('presentation')) {
        prepTips.push('Test your screen share');
        prepTips.push('Have backup slides ready');
        prepTips.push('Speak slowly and pause for questions');
    }
    else if (title.includes('1:1') || title.includes('one-on-one')) {
        prepTips.push('Think about wins and challenges to share');
        prepTips.push('Come with specific asks or updates');
    }
    else if (title.includes('client') || title.includes('customer')) {
        prepTips.push('Review their recent interactions');
        prepTips.push('Have account details ready');
    }
    // Location tips
    if (event.location) {
        if (event.location.includes('http') ||
            event.location.includes('zoom') ||
            event.location.includes('meet')) {
            prepTips.push('Test your audio and video');
        }
        else {
            prepTips.push(`Remember: This is at ${event.location}`);
        }
    }
    // Build summary
    const time = new Date(event.startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
    let summary = `"${event.title || 'Meeting'}" starts at ${time} (in ${minutesUntil} minutes)`;
    if (event.attendees && event.attendees.length > 0) {
        summary += ` with ${event.attendees.length} attendee${event.attendees.length > 1 ? 's' : ''}`;
    }
    return {
        summary,
        prepTips: prepTips.slice(0, 3), // Max 3 tips
        attendeeInfo: event.attendees?.join(', '),
    };
}
// ============================================================================
// POST-MEETING FOLLOW-UPS
// ============================================================================
/**
 * Get post-meeting follow-up prompts for recently ended events
 *
 * Returns follow-ups for events that ended within the specified window.
 */
export async function getPostMeetingFollowUps(userId, windowMinutes = 30) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);
    try {
        const dayEvents = await getEventsForDay(userId, now);
        const followUps = [];
        for (const event of dayEvents) {
            const endTime = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);
            // Only events that ended within the window
            if (endTime < windowStart || endTime > now)
                continue;
            const priority = calculateMeetingPriority(event);
            // Only follow up on medium+ priority meetings
            if (priority === 'low')
                continue;
            followUps.push({
                eventId: event.id,
                eventTitle: event.title || 'Untitled',
                endedAt: endTime,
                prompts: generateFollowUpPrompts(event),
                suggestedActions: generateSuggestedActions(event),
            });
        }
        log.debug({ userId, followUpCount: followUps.length }, 'Generated post-meeting follow-ups');
        return followUps;
    }
    catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to get post-meeting follow-ups');
        return [];
    }
}
/**
 * Generate follow-up prompts for an event
 */
function generateFollowUpPrompts(event) {
    const title = (event.title || '').toLowerCase();
    const prompts = [];
    prompts.push('How did it go?');
    if (title.includes('interview')) {
        prompts.push('What questions came up?');
        prompts.push('Any follow-up items?');
    }
    else if (title.includes('meeting') || title.includes('sync')) {
        prompts.push('Any action items to capture?');
        prompts.push('Who needs to do what by when?');
    }
    else if (title.includes('1:1')) {
        prompts.push('Any commitments you made?');
        prompts.push('Anything to follow up on?');
    }
    return prompts.slice(0, 3);
}
/**
 * Generate suggested actions after a meeting
 */
function generateSuggestedActions(event) {
    const title = (event.title || '').toLowerCase();
    const actions = [];
    if (title.includes('interview')) {
        actions.push('Send thank-you note');
        actions.push('Note key takeaways');
    }
    else if (title.includes('client') || title.includes('customer')) {
        actions.push('Send follow-up email');
        actions.push('Update CRM notes');
    }
    else {
        actions.push('Document action items');
        actions.push('Schedule follow-up if needed');
    }
    return actions;
}
// ============================================================================
// CONFLICT DETECTION
// ============================================================================
/**
 * Analyze conflicts for a proposed event
 *
 * Returns detailed conflict analysis with suggestions.
 */
export async function analyzeConflicts(userId, proposedStart, proposedEnd, eventTitle) {
    try {
        const dayEvents = await getEventsForDay(userId, proposedStart);
        const conflicts = [];
        for (const event of dayEvents) {
            const eventStart = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
            const eventEnd = event.endTime instanceof Date ? event.endTime : new Date(event.endTime);
            // Check for overlap
            if (proposedStart < eventEnd && proposedEnd > eventStart) {
                conflicts.push(event);
            }
        }
        if (conflicts.length === 0) {
            return {
                hasConflict: false,
                conflictingEvents: [],
                severity: 'warning',
                description: 'No conflicts detected',
                suggestions: [],
            };
        }
        // Determine severity
        const severity = determineSeverity(conflicts);
        // Find alternatives
        const duration = Math.round((proposedEnd.getTime() - proposedStart.getTime()) / 60000);
        const freeSlots = await findFreeTimeSlots(userId, proposedStart, {
            minDurationMinutes: duration,
        });
        const suggestions = freeSlots.map((slot) => ({
            alternativeTime: slot.start,
            description: formatTimeSlot(slot.start, slot.end),
        }));
        // Build description
        const conflictNames = conflicts.map((c) => c.title || 'Event').slice(0, 2);
        const description = conflicts.length === 1
            ? `Conflicts with "${conflictNames[0]}"`
            : `Conflicts with ${conflictNames.join(' and ')}${conflicts.length > 2 ? ` and ${conflicts.length - 2} more` : ''}`;
        return {
            hasConflict: true,
            conflictingEvents: conflicts,
            severity,
            description,
            suggestions: suggestions.slice(0, 3),
        };
    }
    catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to analyze conflicts');
        return {
            hasConflict: false,
            conflictingEvents: [],
            severity: 'warning',
            description: 'Could not check for conflicts',
            suggestions: [],
        };
    }
}
/**
 * Determine conflict severity
 */
function determineSeverity(conflicts) {
    // Hard conflict = overlapping with confirmed, important meetings
    const hasHardConflict = conflicts.some((event) => {
        const priority = calculateMeetingPriority(event);
        return priority === 'high' && event.status === 'confirmed';
    });
    if (hasHardConflict)
        return 'hard';
    // Soft conflict = overlapping with less important events
    const hasSoftConflict = conflicts.some((event) => event.status === 'confirmed');
    if (hasSoftConflict)
        return 'soft';
    // Warning = tentative events only
    return 'warning';
}
/**
 * Format time slot for display
 */
function formatTimeSlot(start, end) {
    const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const day = start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
    return `${day} ${startTime} - ${endTime}`;
}
// ============================================================================
// RECURRING EVENT SUGGESTIONS
// ============================================================================
/**
 * Suggest recurring events based on calendar patterns
 *
 * Analyzes past events to identify patterns that could become recurring.
 * Note: This is a simplified version that uses the available CalendarPatterns.
 */
export async function suggestRecurringEvents(userId) {
    try {
        const patterns = await analyzeCalendarPatterns(userId);
        const suggestions = [];
        // Use pattern data to generate suggestions
        if (patterns.busiestDayOfWeek && patterns.averageMeetingsPerDay > 3) {
            suggestions.push({
                title: 'Focus Time Block',
                suggestedPattern: 'weekly',
                confidence: 0.7,
                reasoning: `${patterns.busiestDayOfWeek} tends to be busy - consider protecting focus time`,
                suggestedTime: { hour: patterns.peakMeetingHours.start - 1, minute: 0 },
            });
        }
        // Suggest standup if high meeting frequency
        if (patterns.averageMeetingsPerDay >= 2) {
            suggestions.push({
                title: 'Daily Planning',
                suggestedPattern: 'daily',
                confidence: patterns.averageMeetingsPerDay / 5,
                reasoning: 'Regular planning helps manage a busy calendar',
                suggestedTime: { hour: 9, minute: 0 },
            });
        }
        // If too many back-to-backs, suggest buffer time
        if (patterns.backToBackFrequency > 0.3) {
            suggestions.push({
                title: 'Buffer Time',
                suggestedPattern: 'weekly',
                confidence: patterns.backToBackFrequency,
                reasoning: `You have back-to-back meetings ${Math.round(patterns.backToBackFrequency * 100)}% of the time`,
            });
        }
        log.debug({ userId, suggestionCount: suggestions.length }, 'Generated recurring suggestions');
        return suggestions.slice(0, 5); // Max 5 suggestions
    }
    catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to suggest recurring events');
        return [];
    }
}
// ============================================================================
// SMART SCHEDULING
// ============================================================================
/**
 * Find the best time for a new event based on preferences and patterns
 *
 * ENHANCED WITH "BETTER THAN HUMAN" ENERGY-AWARE SCHEDULING:
 * - Uses learned meeting patterns for optimal time detection
 * - Considers user's energy peaks and focus time preferences
 * - Avoids times the user typically avoids
 * - Respects clustering preferences (batched vs spread meetings)
 */
export async function findBestTimeFor(userId, duration, preferences) {
    const { preferMorning = false, preferAfternoon = false, avoidBackToBack = true, minGapMinutes = 15, meetingType = 'general', } = preferences || {};
    try {
        const today = new Date();
        const freeSlots = await findFreeTimeSlots(userId, today, { minDurationMinutes: duration });
        // Load user's learned meeting patterns for energy-aware scheduling
        let patterns = null;
        try {
            const { getMeetingPatterns } = await import('./meeting-pattern-learning.js');
            patterns = await getMeetingPatterns(userId);
            log.debug({ userId, learnedFromEvents: patterns.learnedFromEventCount }, 'Loaded meeting patterns for scheduling');
        }
        catch {
            log.debug({ userId }, 'Could not load meeting patterns, using defaults');
        }
        const scoredSlots = freeSlots.map((slot) => {
            let score = 0.5; // Base score
            const reasons = [];
            const hour = slot.start.getHours();
            const dayOfWeek = slot.start.getDay();
            // ================================================================
            // ENERGY-AWARE SCHEDULING (Better Than Human)
            // ================================================================
            if (patterns && patterns.learnedFromEventCount > 10) {
                // Bonus for energy peak hours
                if (patterns.energyPeaks.includes(hour)) {
                    score += 0.15;
                    reasons.push('Your peak energy time');
                }
                // Bonus for preferred start times for this day
                const preferredHours = patterns.preferredStartTimes[dayOfWeek] || [];
                if (preferredHours.includes(hour)) {
                    score += 0.2;
                    reasons.push('Matches your usual pattern');
                }
                // Penalty for avoid hours
                if (patterns.avoidHours.includes(hour)) {
                    score -= 0.25;
                    reasons.push('You typically avoid this time');
                }
                // Penalty for avoid days
                if (patterns.avoidDays.includes(dayOfWeek)) {
                    score -= 0.3;
                    reasons.push('You typically avoid this day');
                }
                // Protect focus time based on learned preference
                if (patterns.focusTimePreference === 'morning' && hour >= 9 && hour <= 11) {
                    score -= 0.15;
                    reasons.push('Protects your morning focus time');
                }
                else if (patterns.focusTimePreference === 'afternoon' && hour >= 14 && hour <= 16) {
                    score -= 0.15;
                    reasons.push('Protects your afternoon focus time');
                }
            }
            // ================================================================
            // EXPLICIT PREFERENCE SCORING
            // ================================================================
            if (preferMorning && hour >= 9 && hour <= 12) {
                score += 0.2;
                reasons.push('Morning slot as requested');
            }
            else if (preferAfternoon && hour >= 13 && hour <= 17) {
                score += 0.2;
                reasons.push('Afternoon slot as requested');
            }
            // Avoid very early or late
            if (hour < 8 || hour > 19) {
                score -= 0.3;
                reasons.push('Outside normal hours');
            }
            // Premium time (10am, 2pm, 3pm) - fallback if no learned patterns
            if (!patterns && [10, 14, 15].includes(hour)) {
                score += 0.1;
                reasons.push('Popular meeting time');
            }
            // Back-to-back prevention: prefer middle of available slot
            const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
            if (slotDuration > duration * 2) {
                score += 0.1;
                reasons.push('Room for buffer');
            }
            // ================================================================
            // MEETING TYPE OPTIMIZATION
            // ================================================================
            if (meetingType === 'clientCall' || meetingType === 'oneOnOne') {
                // Important meetings should be during energy peaks
                if (patterns?.energyPeaks.includes(hour)) {
                    score += 0.1;
                    reasons.push('Peak time for important calls');
                }
            }
            else if (meetingType === 'standup') {
                // Standups work well in morning
                if (hour >= 9 && hour <= 10) {
                    score += 0.1;
                    reasons.push('Good time for standup');
                }
            }
            return {
                time: slot.start,
                score: Math.max(0, Math.min(1, score)),
                reasoning: reasons.length > 0 ? reasons.join(', ') : 'Available slot',
            };
        });
        // Sort by score descending
        scoredSlots.sort((a, b) => b.score - a.score);
        return scoredSlots.slice(0, 5);
    }
    catch (error) {
        log.error({ userId, error: String(error) }, 'Failed to find best time');
        return [];
    }
}
//# sourceMappingURL=proactive-calendar.js.map