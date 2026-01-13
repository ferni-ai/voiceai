/**
 * Milestone-Calendar Coordinator - Better Than Human Service
 *
 * What no human friend can do: Coordinate milestone planning with calendar
 * awareness at the same time, considering capacity and optimal windows.
 *
 * This service bridges life planning (milestones) with communication (calendar)
 * to provide:
 * - Calendar-aware milestone planning
 * - Optimal time windows for milestone work
 * - Conflict detection between milestones and commitments
 * - Capacity assessment for new milestones
 *
 * @module services/superhuman/milestone-calendar-coordinator
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getCalendarLoadFactors, } from '../calendar/calendar-load-service.js';
import { getDayOverview, } from '../calendar/calendar-service.js';
const log = createLogger({ module: 'milestone-calendar-coordinator' });
// ============================================================================
// CONFIGURATION
// ============================================================================
// Ideal hours for focused milestone work
const IDEAL_FOCUS_HOURS = { start: 9, end: 12 }; // Morning focus block
const ACCEPTABLE_FOCUS_HOURS = { start: 14, end: 17 }; // Afternoon block
// Thresholds
const HEAVY_CALENDAR_HOURS_PER_DAY = 5;
const OVERLOADED_CALENDAR_HOURS_PER_DAY = 7;
const MAX_ACTIVE_MILESTONES = 5;
const HEALTHY_CALENDAR_LOAD_PERCENT = 60;
// ============================================================================
// MAIN FUNCTIONS
// ============================================================================
/**
 * Find optimal time windows for milestone work in the next N days.
 */
export async function findOptimalMilestoneWindows(userId, options = {}) {
    const { daysAhead = 14, minDurationHours = 2, preferMornings = true } = options;
    log.info({ userId, daysAhead, minDurationHours }, 'Finding optimal milestone windows');
    const windows = [];
    try {
        // Check each day
        for (let i = 0; i < daysAhead; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            date.setHours(0, 0, 0, 0);
            const dayOverview = await getDayOverview(userId, date);
            if (!dayOverview)
                continue;
            // Calculate available hours
            const meetingHours = calculateMeetingHours(dayOverview);
            const availableHours = 8 - meetingHours; // Assume 8-hour workday
            if (availableHours < minDurationHours)
                continue;
            // Check for morning block (ideal)
            if (preferMornings &&
                !hasConflict(dayOverview, IDEAL_FOCUS_HOURS.start, IDEAL_FOCUS_HOURS.end)) {
                windows.push({
                    date,
                    startHour: IDEAL_FOCUS_HOURS.start,
                    endHour: IDEAL_FOCUS_HOURS.end,
                    durationHours: 3,
                    quality: meetingHours < 3 ? 'ideal' : 'good',
                    reason: meetingHours < 3
                        ? 'Light calendar day with clear morning'
                        : 'Morning block available despite some meetings',
                });
            }
            // Check for afternoon block
            else if (!hasConflict(dayOverview, ACCEPTABLE_FOCUS_HOURS.start, ACCEPTABLE_FOCUS_HOURS.end)) {
                windows.push({
                    date,
                    startHour: ACCEPTABLE_FOCUS_HOURS.start,
                    endHour: ACCEPTABLE_FOCUS_HOURS.end,
                    durationHours: 3,
                    quality: meetingHours < 4 ? 'good' : 'acceptable',
                    reason: 'Afternoon focus block available',
                });
            }
            // Any available time
            else if (availableHours >= minDurationHours) {
                const { start, end } = findFirstAvailableSlot(dayOverview, minDurationHours);
                if (start !== null && end !== null) {
                    windows.push({
                        date,
                        startHour: start,
                        endHour: end,
                        durationHours: end - start,
                        quality: 'constrained',
                        reason: 'Limited availability but focus time exists',
                    });
                }
            }
        }
        // Sort by quality, then date
        windows.sort((a, b) => {
            const qualityOrder = { ideal: 0, good: 1, acceptable: 2, constrained: 3 };
            if (qualityOrder[a.quality] !== qualityOrder[b.quality]) {
                return qualityOrder[a.quality] - qualityOrder[b.quality];
            }
            return a.date.getTime() - b.date.getTime();
        });
        log.info({ userId, windowCount: windows.length }, 'Found milestone windows');
        return windows.slice(0, 10); // Return top 10 windows
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to find milestone windows');
        return [];
    }
}
/**
 * Suggest time blocks for a specific milestone.
 */
export async function suggestTimeBlocks(userId, milestone) {
    log.info({ userId, milestoneId: milestone.id }, 'Suggesting time blocks for milestone');
    const result = {
        milestoneId: milestone.id,
        milestoneName: milestone.name,
        suggestedBlocks: [],
        totalHoursNeeded: milestone.estimatedHours || 10,
        hoursAvailable: 0,
        feasibility: 'moderate',
    };
    try {
        // Get optimal windows
        const windows = await findOptimalMilestoneWindows(userId, {
            daysAhead: getDaysUntil(milestone.targetDate),
            minDurationHours: 2,
        });
        // Accumulate hours
        let accumulatedHours = 0;
        const purposes = [
            'planning',
            'execution',
            'review',
        ];
        let purposeIndex = 0;
        for (const window of windows) {
            if (accumulatedHours >= result.totalHoursNeeded)
                break;
            result.suggestedBlocks.push({
                date: window.date,
                startHour: window.startHour,
                durationHours: Math.min(window.durationHours, result.totalHoursNeeded - accumulatedHours),
                purpose: purposes[purposeIndex % purposes.length],
            });
            accumulatedHours += window.durationHours;
            purposeIndex++;
        }
        result.hoursAvailable = accumulatedHours;
        // Assess feasibility
        const ratio = accumulatedHours / result.totalHoursNeeded;
        if (ratio >= 1.2)
            result.feasibility = 'easy';
        else if (ratio >= 1.0)
            result.feasibility = 'moderate';
        else if (ratio >= 0.7)
            result.feasibility = 'challenging';
        else
            result.feasibility = 'unlikely';
        log.info({
            userId,
            milestoneId: milestone.id,
            feasibility: result.feasibility,
            hoursAvailable: accumulatedHours,
        }, 'Time blocks suggested');
        return result;
    }
    catch (error) {
        log.error({ error: String(error), userId, milestoneId: milestone.id }, 'Failed to suggest time blocks');
        return result;
    }
}
/**
 * Detect conflicts between milestones and calendar.
 */
export async function detectMilestoneConflicts(userId, milestones) {
    log.info({ userId, milestoneCount: milestones.length }, 'Detecting milestone conflicts');
    const conflicts = [];
    try {
        // Get calendar load
        const calendarLoad = await getCalendarLoadFactors(userId);
        for (const milestone of milestones) {
            const daysUntil = getDaysUntil(milestone.targetDate);
            // Check if milestone date falls on a heavy calendar day
            const dayOverview = await getDayOverview(userId, milestone.targetDate);
            if (dayOverview) {
                const meetingHours = calculateMeetingHours(dayOverview);
                if (meetingHours >= OVERLOADED_CALENDAR_HOURS_PER_DAY) {
                    conflicts.push({
                        milestoneId: milestone.id,
                        milestoneName: milestone.name,
                        targetDate: milestone.targetDate,
                        conflictType: 'heavy_calendar',
                        severity: 'high',
                        description: `Your milestone date has ${meetingHours}+ hours of meetings scheduled`,
                        suggestion: `Consider moving "${milestone.name}" to a lighter day or blocking prep time beforehand`,
                    });
                }
                else if (meetingHours >= HEAVY_CALENDAR_HOURS_PER_DAY) {
                    conflicts.push({
                        milestoneId: milestone.id,
                        milestoneName: milestone.name,
                        targetDate: milestone.targetDate,
                        conflictType: 'heavy_calendar',
                        severity: 'medium',
                        description: `Your milestone date has ${meetingHours} hours of meetings`,
                        suggestion: 'You might feel rushed - consider protecting some focus time',
                    });
                }
            }
            // Check for milestone clustering (multiple milestones close together)
            const nearbyMilestones = milestones.filter((m) => {
                if (m.id === milestone.id)
                    return false;
                const diff = Math.abs(getDaysUntil(m.targetDate) - daysUntil);
                return diff <= 3; // Within 3 days
            });
            if (nearbyMilestones.length > 0) {
                conflicts.push({
                    milestoneId: milestone.id,
                    milestoneName: milestone.name,
                    targetDate: milestone.targetDate,
                    conflictType: 'other_milestone',
                    severity: nearbyMilestones.length >= 2 ? 'high' : 'medium',
                    description: `${nearbyMilestones.length} other milestone(s) within 3 days: ${nearbyMilestones.map((m) => m.name).join(', ')}`,
                    suggestion: 'Consider spreading these out for better focus on each',
                });
            }
            // Capacity warning for important/urgent milestones
            if (milestone.importance === 'high' && daysUntil <= 7) {
                if (calendarLoad && calendarLoad.weeklyMeetingHours >= 30) {
                    conflicts.push({
                        milestoneId: milestone.id,
                        milestoneName: milestone.name,
                        targetDate: milestone.targetDate,
                        conflictType: 'capacity',
                        severity: 'high',
                        description: `High-importance milestone in ${daysUntil} days, but your week has ${calendarLoad.weeklyMeetingHours}+ meeting hours`,
                        suggestion: 'Consider declining some meetings or delegating to protect time for this',
                    });
                }
            }
        }
        log.info({ userId, conflictCount: conflicts.length }, 'Milestone conflicts detected');
        return conflicts;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to detect milestone conflicts');
        return [];
    }
}
/**
 * Assess capacity for taking on a new milestone.
 */
export async function getCapacityForNewMilestone(userId, activeMilestones) {
    log.info({ userId, activeMilestoneCount: activeMilestones.length }, 'Assessing milestone capacity');
    const assessment = {
        userId,
        assessedAt: new Date(),
        currentLoad: 'moderate',
        activeMilestones: activeMilestones.length,
        calendarLoadPercent: 0,
        canTakeNewMilestone: true,
        recommendation: '',
    };
    try {
        // Get calendar load
        const calendarLoad = await getCalendarLoadFactors(userId);
        if (calendarLoad) {
            // Calculate calendar load percentage
            const weeklyCapacityHours = 40; // Assume 40-hour work week
            assessment.calendarLoadPercent = Math.round((calendarLoad.weeklyMeetingHours / weeklyCapacityHours) * 100);
        }
        // Determine current load level
        const milestoneLoad = activeMilestones.length / MAX_ACTIVE_MILESTONES;
        const combinedLoad = (milestoneLoad + assessment.calendarLoadPercent / 100) / 2;
        if (combinedLoad < 0.4) {
            assessment.currentLoad = 'light';
        }
        else if (combinedLoad < 0.6) {
            assessment.currentLoad = 'moderate';
        }
        else if (combinedLoad < 0.8) {
            assessment.currentLoad = 'heavy';
        }
        else {
            assessment.currentLoad = 'overloaded';
        }
        // Determine if can take new milestone
        assessment.canTakeNewMilestone =
            activeMilestones.length < MAX_ACTIVE_MILESTONES && assessment.calendarLoadPercent < 80;
        // Generate recommendation
        if (assessment.canTakeNewMilestone) {
            if (assessment.currentLoad === 'light') {
                assessment.recommendation =
                    'You have plenty of capacity for a new milestone. Great time to start something new!';
            }
            else if (assessment.currentLoad === 'moderate') {
                assessment.recommendation =
                    'You can take on a new milestone, but consider starting it after your current commitments settle.';
                // Find optimal start date
                const windows = await findOptimalMilestoneWindows(userId, { daysAhead: 14 });
                if (windows.length > 0 && windows[0].quality !== 'constrained') {
                    assessment.optimalStartDate = windows[0].date;
                }
            }
            else {
                assessment.recommendation =
                    "You're fairly busy, but one more focused milestone is doable. Keep it realistic.";
            }
        }
        else {
            if (activeMilestones.length >= MAX_ACTIVE_MILESTONES) {
                assessment.recommendation = `You have ${activeMilestones.length} active milestones. Complete or postpone one before adding more.`;
            }
            else {
                assessment.recommendation =
                    'Your calendar is packed. Wait for some breathing room before starting new milestones.';
            }
        }
        log.info({ userId, currentLoad: assessment.currentLoad, canTakeNew: assessment.canTakeNewMilestone }, 'Capacity assessed');
        return assessment;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to assess capacity');
        assessment.recommendation = "Couldn't fully assess your capacity. Proceed with caution.";
        return assessment;
    }
}
/**
 * Generate a coordination summary for milestone ↔ calendar handoff.
 */
export async function getCoordinationContext(userId, milestones) {
    try {
        const [conflicts, capacity, windows] = await Promise.all([
            detectMilestoneConflicts(userId, milestones),
            getCapacityForNewMilestone(userId, milestones),
            findOptimalMilestoneWindows(userId, { daysAhead: 7 }),
        ]);
        const lines = [];
        // Capacity summary
        lines.push(`**Current Capacity:** ${capacity.currentLoad}`);
        lines.push(`- ${capacity.activeMilestones} active milestones`);
        lines.push(`- Calendar at ${capacity.calendarLoadPercent}% capacity`);
        // Conflicts
        if (conflicts.length > 0) {
            lines.push(`\n**Attention Needed:**`);
            for (const conflict of conflicts.filter((c) => c.severity === 'high').slice(0, 3)) {
                lines.push(`- ${conflict.description}`);
            }
        }
        // Best windows
        if (windows.length > 0) {
            const idealWindows = windows.filter((w) => w.quality === 'ideal' || w.quality === 'good');
            if (idealWindows.length > 0) {
                lines.push(`\n**Best Focus Windows:**`);
                for (const window of idealWindows.slice(0, 3)) {
                    const dateStr = window.date.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                    });
                    lines.push(`- ${dateStr} ${window.startHour}:00-${window.endHour}:00 (${window.quality})`);
                }
            }
        }
        return lines.join('\n');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to generate coordination context');
        return '';
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function calculateMeetingHours(dayOverview) {
    if (!dayOverview.events || dayOverview.events.length === 0)
        return 0;
    let totalMinutes = 0;
    for (const event of dayOverview.events) {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        totalMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
    }
    return totalMinutes / 60;
}
function hasConflict(dayOverview, startHour, endHour) {
    if (!dayOverview.events || dayOverview.events.length === 0)
        return false;
    for (const event of dayOverview.events) {
        const eventStart = new Date(event.startTime);
        const eventEnd = new Date(event.endTime);
        const eventStartHour = eventStart.getHours();
        const eventEndHour = eventEnd.getHours();
        // Check for overlap
        if (eventStartHour < endHour && eventEndHour > startHour) {
            return true;
        }
    }
    return false;
}
function findFirstAvailableSlot(dayOverview, minDurationHours) {
    const workStart = 9;
    const workEnd = 17;
    // Get busy times
    const busySlots = [];
    if (dayOverview.events) {
        for (const event of dayOverview.events) {
            const eventStart = new Date(event.startTime);
            const eventEnd = new Date(event.endTime);
            busySlots.push({
                start: eventStart.getHours(),
                end: eventEnd.getHours(),
            });
        }
    }
    // Sort by start time
    busySlots.sort((a, b) => a.start - b.start);
    // Find first gap
    let searchStart = workStart;
    for (const slot of busySlots) {
        if (slot.start - searchStart >= minDurationHours) {
            return { start: searchStart, end: Math.min(slot.start, searchStart + minDurationHours) };
        }
        searchStart = Math.max(searchStart, slot.end);
    }
    // Check after last meeting
    if (workEnd - searchStart >= minDurationHours) {
        return { start: searchStart, end: Math.min(workEnd, searchStart + minDurationHours) };
    }
    return { start: null, end: null };
}
function getDaysUntil(date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
//# sourceMappingURL=milestone-calendar-coordinator.js.map