/**
 * Calendar & Scheduling Hooks
 *
 * Auto-indexing hooks for calendar and time-related data.
 * Enables semantic search over schedules, meetings, and time commitments.
 *
 * @module services/data-layer/hooks/calendar-hooks
 */
import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
// ============================================================================
// CALENDAR EVENTS
// ============================================================================
/**
 * Track calendar events
 */
export const onCalendarEventChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'calendar_event',
    contentBuilder: (e) => joinNonEmpty([
        `Event: ${e.title}.`,
        `Date: ${formatDate(e.date)}${e.time ? ` at ${e.time}` : ''}.`,
        e.attendees?.length ? `With: ${e.attendees.join(', ')}.` : '',
        formatField('Duration', e.duration ? `${e.duration} minutes` : undefined),
        formatField('Notes', e.notes),
    ]),
    metadataExtractor: (e) => ({
        date: e.date,
        time: e.time,
        importance: e.importance,
        attendees: e.attendees,
    }),
});
// ============================================================================
// MEETING MEMORIES
// ============================================================================
/**
 * Track meeting outcomes and action items
 */
export const onMeetingMemoryChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'meeting_memory',
    contentBuilder: (m) => joinNonEmpty([
        `Meeting: ${m.meetingTitle} (${formatDate(m.date)}).`,
        `Key points: ${m.keyPoints.join('; ')}.`,
        `Action items: ${m.actionItems.join('; ')}.`,
        formatField('Mood', m.mood),
    ]),
    metadataExtractor: (m) => ({
        date: m.date,
        attendees: m.attendees,
        mood: m.mood,
    }),
});
/**
 * Track recurring time commitments
 */
export const onRecurringCommitmentChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'recurring_commitment',
    contentBuilder: (r) => joinNonEmpty([
        `Recurring: ${r.commitment}.`,
        `Frequency: ${r.frequency}.`,
        formatField('Day', r.dayOfWeek),
        formatField('Time', r.time),
        `Importance: ${r.importance}.`,
    ]),
    metadataExtractor: (r) => ({
        frequency: r.frequency,
        importance: r.importance,
    }),
});
/**
 * Track scheduling conflicts
 */
export const onCalendarConflictChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'calendar_conflict',
    contentBuilder: (c) => joinNonEmpty([
        `Scheduling conflict on ${formatDate(c.date)}.`,
        `Events: ${c.events.join(' vs ')}.`,
        formatField('Resolution', c.resolution),
    ]),
    metadataExtractor: (c) => ({
        status: c.status,
        date: c.date,
    }),
    shouldSkip: (c) => c.status === 'resolved',
});
/**
 * Track meeting preparation
 */
export const onMeetingPrepChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'meeting_prep',
    contentBuilder: (m) => joinNonEmpty([
        `Prep for: ${m.meetingTitle} (${formatDate(m.date)}).`,
        `Notes: ${m.prepNotes}.`,
        `Objectives: ${m.objectives.join(', ')}.`,
        m.concerns?.length ? `Concerns: ${m.concerns.join(', ')}.` : '',
    ]),
    metadataExtractor: (m) => ({
        date: m.date,
    }),
});
/**
 * Track availability patterns
 */
export const onAvailabilityPatternChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'availability_pattern',
    contentBuilder: (a) => joinNonEmpty([
        `Availability: ${a.pattern}.`,
        `Days: ${a.dayType}${a.specificDays?.length ? ` (${a.specificDays.join(', ')})` : ''}.`,
        formatField('Time range', a.timeRange),
        formatField('Notes', a.notes),
    ]),
    metadataExtractor: (a) => ({
        dayType: a.dayType,
    }),
});
/**
 * Track time blocks for focus/protection
 */
export const onTimeBlockChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'time_block',
    contentBuilder: (t) => joinNonEmpty([
        `Time block: ${t.purpose}.`,
        `${formatDate(t.date)} from ${t.startTime} to ${t.endTime}.`,
        formatField('Category', t.category),
        t.recurring ? 'Recurring.' : '',
    ]),
    metadataExtractor: (t) => ({
        category: t.category,
        recurring: t.recurring,
        date: t.date,
    }),
});
/**
 * Track important deadlines
 */
export const onDeadlineChange = createDomainHook({
    storeType: 'calendar',
    entityType: 'deadline',
    contentBuilder: (d) => joinNonEmpty([
        `Deadline: ${d.title}.`,
        `Due: ${formatDate(d.date)}.`,
        formatField('Project', d.project),
        `Importance: ${d.importance}.`,
        `Status: ${d.status}.`,
    ]),
    metadataExtractor: (d) => ({
        importance: d.importance,
        status: d.status,
        date: d.date,
    }),
    shouldSkip: (d) => d.status === 'completed',
});
// ============================================================================
// EXPORTS
// ============================================================================
export const calendarHooks = {
    onCalendarEventChange,
    onMeetingMemoryChange,
    onRecurringCommitmentChange,
    onCalendarConflictChange,
    onMeetingPrepChange,
    onAvailabilityPatternChange,
    onTimeBlockChange,
    onDeadlineChange,
};
export default calendarHooks;
//# sourceMappingURL=calendar-hooks.js.map