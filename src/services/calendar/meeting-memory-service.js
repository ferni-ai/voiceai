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
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
import { onMeetingMemoryChange } from '../data-layer/hooks/calendar-hooks.js';
const log = createLogger({ module: 'meeting-memory' });
// ============================================================================
// MEMORY RETRIEVAL
// ============================================================================
/**
 * Get meeting memory context for a specific attendee
 */
export async function getMeetingAttendeeContext(userId, attendeeEmail) {
    try {
        const db = getFirestoreDb();
        if (!db) {
            return createEmptyContext(attendeeEmail);
        }
        // Load interactions with this person
        const interactionsSnapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('meeting_interactions')
            .where('personEmail', '==', attendeeEmail.toLowerCase())
            .orderBy('date', 'desc')
            .limit(20)
            .get();
        const interactions = interactionsSnapshot.docs.map((doc) => doc.data());
        // Load personal notes about this person
        const noteDoc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('contact_notes')
            .doc(attendeeEmail.toLowerCase().replace(/[^a-z0-9]/g, '_'))
            .get();
        const personNotes = noteDoc.exists ? noteDoc.data() : null;
        // Build context
        if (interactions.length === 0 && !personNotes) {
            return createEmptyContext(attendeeEmail);
        }
        const lastInteraction = interactions[0] || null;
        const allTopics = interactions.flatMap((i) => i.topics);
        const topicCounts = countOccurrences(allTopics);
        const typicalTopics = Object.entries(topicCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([topic]) => topic);
        // Calculate meeting frequency
        let frequency = 'rare';
        if (interactions.length >= 2) {
            const firstDate = new Date(interactions[interactions.length - 1].date);
            const lastDate = new Date(interactions[0].date);
            const daySpan = (lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000);
            const avgDaysBetween = daySpan / interactions.length;
            if (avgDaysBetween <= 10)
                frequency = 'weekly';
            else if (avgDaysBetween <= 45)
                frequency = 'monthly';
            else if (avgDaysBetween <= 90)
                frequency = 'occasional';
        }
        // Find open commitments (made but not completed)
        const openCommitments = interactions
            .flatMap((i) => i.commitmentsMade)
            .filter((c) => !c.toLowerCase().includes('done') && !c.toLowerCase().includes('completed'))
            .slice(0, 3);
        // Calculate days since last meeting
        let lastMeetingDaysAgo = null;
        if (lastInteraction) {
            const lastDate = new Date(lastInteraction.date);
            lastMeetingDaysAgo = Math.round((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
        }
        return {
            attendeeEmail,
            displayName: lastInteraction?.personName || extractNameFromEmail(attendeeEmail),
            relationship: {
                type: personNotes?.relationshipType ||
                    'unknown',
                sentiment: inferSentiment(interactions),
                interactionCount: interactions.length,
                firstInteraction: interactions.length > 0 ? new Date(interactions[interactions.length - 1].date) : null,
            },
            lastInteraction: lastInteraction
                ? {
                    date: new Date(lastInteraction.date),
                    topics: lastInteraction.topics,
                    commitmentsMade: lastInteraction.commitmentsMade,
                    commitmentsByThem: lastInteraction.commitmentsByThem || [],
                    openItems: openCommitments,
                    meetingTitle: lastInteraction.meetingTitle,
                }
                : null,
            patterns: {
                typicalMeetingTopics: typicalTopics,
                averageDurationMinutes: 45, // Default, could calculate from history
                meetingFrequency: frequency,
                lastMeetingDaysAgo,
            },
            personalNotes: personNotes?.notes || [],
        };
    }
    catch (error) {
        log.error({ error: String(error), userId, attendeeEmail }, 'Failed to get attendee context');
        return createEmptyContext(attendeeEmail);
    }
}
/**
 * Enrich a pre-meeting briefing with memory context
 */
export async function enrichPreMeetingBriefing(userId, event) {
    const now = new Date();
    const minutesUntil = Math.round((event.startTime.getTime() - now.getTime()) / 60000);
    // Get context for each attendee
    const attendees = event.attendees || [];
    const attendeeContexts = [];
    for (const email of attendees.slice(0, 5)) {
        // Limit to 5 attendees
        const context = await getMeetingAttendeeContext(userId, email);
        if (context) {
            attendeeContexts.push(context);
        }
    }
    // Collect past topics from all attendees
    const pastTopics = new Set();
    const openCommitments = [];
    const suggestedItems = [];
    for (const ctx of attendeeContexts) {
        if (ctx.lastInteraction) {
            ctx.lastInteraction.topics.forEach((t) => pastTopics.add(cleanForFirestore(t)));
            ctx.lastInteraction.openItems.forEach((c) => openCommitments.push(c));
        }
        // Suggest follow-up if it's been a while
        if (ctx.patterns.lastMeetingDaysAgo && ctx.patterns.lastMeetingDaysAgo > 30) {
            suggestedItems.push(`Catch up on what's new (haven't met in ${ctx.patterns.lastMeetingDaysAgo} days)`);
        }
    }
    // Add open commitments as suggested items
    for (const commitment of openCommitments.slice(0, 3)) {
        suggestedItems.push(`Follow up: ${commitment}`);
    }
    // Generate standard tips
    const standardTips = generateStandardTips(event, minutesUntil);
    // Assess priority
    const { priority, reason } = assessMeetingPriority(event, attendeeContexts);
    return {
        eventTitle: event.title,
        startsAt: event.startTime,
        minutesUntil,
        standardTips,
        relationshipContext: attendeeContexts,
        pastTopics: Array.from(pastTopics).slice(0, 5),
        openCommitments: openCommitments.slice(0, 3),
        suggestedAgendaItems: suggestedItems.slice(0, 5),
        priority,
        priorityReason: reason,
    };
}
/**
 * Record an interaction for future reference
 */
export async function recordMeetingInteraction(userId, interaction) {
    try {
        const db = getFirestoreDb();
        if (!db) {
            log.warn('Firestore not available for recording interaction');
            return;
        }
        const stored = {
            date: new Date().toISOString(),
            personEmail: interaction.personEmail.toLowerCase(),
            personName: interaction.personName,
            topics: interaction.topics,
            commitmentsMade: interaction.commitmentsMade,
            commitmentsByThem: interaction.commitmentsByThem || [],
            meetingTitle: interaction.meetingTitle,
        };
        const docId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('meeting_interactions')
            .doc(docId)
            .set(cleanForFirestore(stored));
        // Index to semantic memory for meeting context retrieval
        void onMeetingMemoryChange(userId, docId, {
            meetingTitle: interaction.meetingTitle,
            date: new Date().toISOString(),
            keyPoints: interaction.topics,
            actionItems: interaction.commitmentsMade,
            mood: undefined,
            attendees: [interaction.personEmail],
        }, 'create');
        log.debug({ userId, personEmail: interaction.personEmail }, 'Meeting interaction recorded');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to record meeting interaction');
    }
}
/**
 * Update personal notes about a contact
 */
export async function updateContactNotes(userId, email, notes, relationshipType) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return;
        const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('contact_notes')
            .doc(docId)
            .set(cleanForFirestore({
            email: email.toLowerCase(),
            notes,
            relationshipType,
            updatedAt: new Date().toISOString(),
        }), { merge: true });
        log.debug({ userId, email }, 'Contact notes updated');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to update contact notes');
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createEmptyContext(email) {
    return {
        attendeeEmail: email,
        displayName: extractNameFromEmail(email),
        relationship: {
            type: 'unknown',
            sentiment: 'unknown',
            interactionCount: 0,
            firstInteraction: null,
        },
        lastInteraction: null,
        patterns: {
            typicalMeetingTopics: [],
            averageDurationMinutes: 45,
            meetingFrequency: 'rare',
            lastMeetingDaysAgo: null,
        },
        personalNotes: [],
    };
}
function extractNameFromEmail(email) {
    const localPart = email.split('@')[0];
    // Convert john.doe or john_doe to John Doe
    return localPart
        .split(/[._]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}
function countOccurrences(arr) {
    return arr.reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
    }, {});
}
function inferSentiment(interactions) {
    if (interactions.length === 0)
        return 'unknown';
    // Simple heuristic based on sentiment tags in interactions
    const sentiments = interactions.map((i) => i.sentiment).filter(Boolean);
    if (sentiments.length === 0)
        return 'neutral';
    const positive = sentiments.filter((s) => s === 'positive').length;
    const negative = sentiments.filter((s) => s === 'negative' || s === 'complex').length;
    if (positive > negative * 2)
        return 'positive';
    if (negative > positive)
        return 'complex';
    return 'neutral';
}
function generateStandardTips(event, minutesUntil) {
    const tips = [];
    const title = event.title.toLowerCase();
    // Time-based tips
    if (minutesUntil <= 5) {
        tips.push('Take a deep breath and center yourself');
    }
    else if (minutesUntil <= 15) {
        tips.push('Review your key talking points');
        tips.push('Close unnecessary tabs and apps');
    }
    else {
        tips.push('Review relevant materials');
        tips.push('Prepare questions you want to ask');
    }
    // Meeting-type specific tips
    if (title.includes('interview')) {
        tips.push('Remember your key achievements and examples');
        tips.push('Have questions ready for your interviewer');
    }
    else if (title.includes('presentation') || title.includes('demo')) {
        tips.push('Test your screen share');
        tips.push('Have backup slides ready');
    }
    else if (title.includes('1:1') || title.includes('one-on-one')) {
        tips.push('Think about wins and challenges to share');
        tips.push('Come with specific asks or updates');
    }
    // Location tips
    if (event.location) {
        if (event.location.includes('http') ||
            event.location.includes('zoom') ||
            event.location.includes('meet')) {
            tips.push('Test your audio and video');
        }
    }
    return tips.slice(0, 4);
}
function assessMeetingPriority(event, contexts) {
    const title = event.title.toLowerCase();
    const description = (event.description || '').toLowerCase();
    // High priority keywords
    if (title.includes('interview') ||
        title.includes('board') ||
        title.includes('investor') ||
        title.includes('final')) {
        return { priority: 'high', reason: 'High-stakes meeting type' };
    }
    // Check for client relationship
    const hasClient = contexts.some((c) => c.relationship.type === 'client');
    if (hasClient) {
        return { priority: 'high', reason: 'Client meeting' };
    }
    // Check for manager
    const hasManager = contexts.some((c) => c.relationship.type === 'manager');
    if (hasManager) {
        return { priority: 'medium', reason: 'Meeting with manager' };
    }
    // Check for open commitments
    const hasOpenCommitments = contexts.some((c) => c.lastInteraction && c.lastInteraction.openItems.length > 0);
    if (hasOpenCommitments) {
        return { priority: 'medium', reason: 'Open action items to address' };
    }
    return { priority: 'low', reason: 'Standard meeting' };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const meetingMemoryService = {
    getAttendeeContext: getMeetingAttendeeContext,
    enrichBriefing: enrichPreMeetingBriefing,
    recordInteraction: recordMeetingInteraction,
    updateNotes: updateContactNotes,
};
export default meetingMemoryService;
//# sourceMappingURL=meeting-memory-service.js.map