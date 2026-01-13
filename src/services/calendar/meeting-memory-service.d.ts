/**
 * Meeting Memory Service
 *
 * Enriches calendar meetings with Ferni's perfect memory.
 * This is "better than human" because no human assistant remembers:
 * - What you discussed last time with each person
 * - Commitments you made to them
 * - Your relationship history and patterns
 *
 * @module calendar/meeting-memory-service
 */
export interface MeetingMemoryContext {
    attendeeEmail: string;
    displayName: string | null;
    relationship: {
        type: 'colleague' | 'client' | 'friend' | 'manager' | 'report' | 'vendor' | 'unknown';
        sentiment: 'positive' | 'neutral' | 'complex' | 'unknown';
        interactionCount: number;
        firstInteraction: Date | null;
    };
    lastInteraction: {
        date: Date;
        topics: string[];
        commitmentsMade: string[];
        commitmentsByThem: string[];
        openItems: string[];
        meetingTitle: string;
    } | null;
    patterns: {
        typicalMeetingTopics: string[];
        averageDurationMinutes: number;
        meetingFrequency: 'weekly' | 'monthly' | 'occasional' | 'rare';
        lastMeetingDaysAgo: number | null;
    };
    personalNotes: string[];
}
export interface EnrichedBriefing {
    eventTitle: string;
    startsAt: Date;
    minutesUntil: number;
    standardTips: string[];
    relationshipContext: MeetingMemoryContext[];
    pastTopics: string[];
    openCommitments: string[];
    suggestedAgendaItems: string[];
    priority: 'high' | 'medium' | 'low';
    priorityReason: string;
}
/**
 * Get meeting memory context for a specific attendee
 */
export declare function getMeetingAttendeeContext(userId: string, attendeeEmail: string): Promise<MeetingMemoryContext | null>;
/**
 * Minimal event type for enrichment (compatible with both CalendarEvent types)
 */
interface MinimalCalendarEvent {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
    description?: string;
    location?: string;
}
/**
 * Enrich a pre-meeting briefing with memory context
 */
export declare function enrichPreMeetingBriefing(userId: string, event: MinimalCalendarEvent): Promise<EnrichedBriefing>;
/**
 * Record an interaction for future reference
 */
export declare function recordMeetingInteraction(userId: string, interaction: {
    personEmail: string;
    personName?: string;
    topics: string[];
    commitmentsMade: string[];
    commitmentsByThem?: string[];
    meetingTitle: string;
}): Promise<void>;
/**
 * Update personal notes about a contact
 */
export declare function updateContactNotes(userId: string, email: string, notes: string[], relationshipType?: string): Promise<void>;
export declare const meetingMemoryService: {
    getAttendeeContext: typeof getMeetingAttendeeContext;
    enrichBriefing: typeof enrichPreMeetingBriefing;
    recordInteraction: typeof recordMeetingInteraction;
    updateNotes: typeof updateContactNotes;
};
export default meetingMemoryService;
//# sourceMappingURL=meeting-memory-service.d.ts.map