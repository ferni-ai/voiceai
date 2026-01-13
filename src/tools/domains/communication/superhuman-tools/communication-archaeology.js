/**
 * Communication Archaeology - Better Than Human Service
 *
 * What no human friend can do: Perfect recall of every conversation you've ever mentioned.
 *
 * "Last time you talked to your dad about money, you mentioned he got defensive
 * when you said 'you should' - he responded better to questions. Want to try
 * that approach this time?"
 *
 * @module tools/domains/communication/superhuman-tools/communication-archaeology
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../../../services/superhuman/firestore-utils.js';
const log = createLogger({ module: 'communication-archaeology' });
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION_EVENTS = 'communication_events';
const COLLECTION_PROFILES = 'communication_profiles';
const MAX_EVENTS_PER_CONTACT = 100;
const MAX_EVENTS_TO_SURFACE = 5;
// ============================================================================
// EVENT STORAGE
// ============================================================================
/**
 * Record a communication event the user mentioned.
 * These are conversations they TELL us about, not ones we have with them.
 */
export async function recordCommunicationEvent(userId, event) {
    const id = `commevent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullEvent = {
        ...event,
        id,
        userId,
        mentionedAt: Date.now(),
    };
    try {
        const db = getFirestoreDb();
        if (db) {
            await db
                .collection('bogle_users')
                .doc(userId)
                .collection(COLLECTION_EVENTS)
                .doc(id)
                .set(cleanForFirestore(fullEvent));
            log.info({ userId, eventId: id, type: event.type, contact: event.contactName }, '📜 Communication event recorded');
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to record communication event');
    }
    return fullEvent;
}
/**
 * Get communication history with a specific contact.
 */
export async function getConversationHistory(userId, contactName, options) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        let query = db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION_EVENTS)
            .where('contactName', '==', contactName)
            .orderBy('occurredAt', 'desc')
            .limit(options?.limit || MAX_EVENTS_PER_CONTACT);
        const snapshot = await query.get();
        let events = snapshot.docs.map((doc) => doc.data());
        // Filter by topic if specified
        if (options?.topic) {
            const topicLower = options.topic.toLowerCase();
            events = events.filter((e) => e.topics.some((t) => t.toLowerCase().includes(topicLower)) ||
                e.summary.toLowerCase().includes(topicLower));
        }
        return events;
    }
    catch (error) {
        log.warn({ error: String(error), userId, contactName }, 'Failed to get conversation history');
        return [];
    }
}
/**
 * Get all recent communication events for a user.
 */
export async function getRecentCommunicationEvents(userId, options) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const cutoffDate = Date.now() - (options?.daysBack || 30) * 24 * 60 * 60 * 1000;
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION_EVENTS)
            .where('occurredAt', '>=', cutoffDate)
            .orderBy('occurredAt', 'desc')
            .limit(options?.limit || 50)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to get recent communication events');
        return [];
    }
}
// ============================================================================
// CONTACT PROFILES
// ============================================================================
/**
 * Update a contact's communication profile based on new data.
 */
export async function updateContactProfile(userId, contactName, update) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return;
        const contactId = `contact_${contactName.toLowerCase().replace(/\s+/g, '_')}`;
        const docRef = db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION_PROFILES)
            .doc(contactId);
        const existing = await docRef.get();
        const existingData = existing.data();
        const profile = {
            contactId,
            userId,
            name: contactName,
            preferredTone: update.preferredTone || existingData?.preferredTone || 'casual',
            responsePatterns: {
                ...existingData?.responsePatterns,
                ...update.responsePatterns,
            },
            effectiveApproaches: mergeArrays(existingData?.effectiveApproaches || [], update.effectiveApproaches || []),
            ineffectiveApproaches: mergeArrays(existingData?.ineffectiveApproaches || [], update.ineffectiveApproaches || []),
            topicsToAvoid: mergeArrays(existingData?.topicsToAvoid || [], update.topicsToAvoid || []),
            triggerPhrases: mergeArrays(existingData?.triggerPhrases || [], update.triggerPhrases || []),
            updatedAt: Date.now(),
            dataPoints: (existingData?.dataPoints || 0) + 1,
        };
        await docRef.set(cleanForFirestore(profile));
        log.debug({ userId, contactName }, 'Contact communication profile updated');
    }
    catch (error) {
        log.warn({ error: String(error), userId, contactName }, 'Failed to update contact profile');
    }
}
/**
 * Get a contact's communication profile.
 */
export async function getContactProfile(userId, contactName) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return null;
        const contactId = `contact_${contactName.toLowerCase().replace(/\s+/g, '_')}`;
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION_PROFILES)
            .doc(contactId)
            .get();
        return doc.exists ? doc.data() : null;
    }
    catch (error) {
        log.warn({ error: String(error), userId, contactName }, 'Failed to get contact profile');
        return null;
    }
}
// ============================================================================
// PATTERN DETECTION
// ============================================================================
/**
 * Detect communication patterns mentioned in a transcript.
 */
export function detectCommunicationMention(transcript, context) {
    const lower = transcript.toLowerCase();
    // Patterns indicating they're talking ABOUT a conversation
    const conversationPatterns = [
        /\bi (talked|spoke|chatted|texted|called|emailed|messaged) (to|with) (\w+)/i,
        /\b(\w+) (said|told|asked|mentioned|texted|called|emailed) (me|that)/i,
        /\bwhen i (talk|spoke|talked) to (\w+)/i,
        /\bmy (conversation|talk|chat|call) with (\w+)/i,
        /\blast time (i|we) (talked|spoke) (to |with |about )?(\w+)?/i,
    ];
    // Patterns indicating a planned conversation
    const planningPatterns = [
        /\bi need to (talk|speak|tell|ask|confront|call|text|email) (\w+)/i,
        /\bi('m| am) going to (talk|speak|tell|ask|call|text|email) (\w+)/i,
        /\bi should (talk|speak|tell|call|text|email) (\w+)/i,
        /\bi have to have (a|that) (conversation|talk|chat) with (\w+)/i,
    ];
    // Conflict patterns
    const conflictPatterns = [
        /\b(fight|argument|disagreement|conflict|blowup) with (\w+)/i,
        /\b(\w+) and i (fought|argued|had a disagreement)/i,
        /\bthings (are|got) (tense|heated|awkward) with (\w+)/i,
    ];
    // Check for conversation mentions
    for (const pattern of conversationPatterns) {
        const match = transcript.match(pattern);
        if (match) {
            const contactName = extractContactName(match);
            return {
                detected: true,
                type: 'mentioned',
                contactName,
                topics: extractTopics(transcript, context?.currentTopic),
                sentiment: detectSentiment(transcript),
            };
        }
    }
    // Check for planning patterns
    for (const pattern of planningPatterns) {
        const match = transcript.match(pattern);
        if (match) {
            const contactName = extractContactName(match);
            return {
                detected: true,
                type: 'planned',
                contactName,
                topics: extractTopics(transcript, context?.currentTopic),
                sentiment: 0, // Neutral for planned
            };
        }
    }
    // Check for conflict patterns
    for (const pattern of conflictPatterns) {
        const match = transcript.match(pattern);
        if (match) {
            const contactName = extractContactName(match);
            return {
                detected: true,
                type: 'conflict',
                contactName,
                topics: extractTopics(transcript, context?.currentTopic),
                sentiment: -0.5, // Negative for conflicts
            };
        }
    }
    return { detected: false };
}
/**
 * Learn from a mentioned conversation outcome.
 */
export async function learnFromConversationOutcome(userId, contactName, outcome) {
    const update = {};
    if (outcome.whatWorked) {
        update.effectiveApproaches = [outcome.whatWorked];
    }
    if (outcome.whatDidntWork) {
        update.ineffectiveApproaches = [outcome.whatDidntWork];
    }
    await updateContactProfile(userId, contactName, update);
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build archaeology context for a specific conversation/contact.
 */
export async function buildArchaeologyContext(userId, contactName, currentTopic) {
    const [history, profile] = await Promise.all([
        getConversationHistory(userId, contactName, { limit: MAX_EVENTS_TO_SURFACE, topic: currentTopic }),
        getContactProfile(userId, contactName),
    ]);
    if (history.length === 0 && !profile) {
        return '';
    }
    const sections = [
        `[COMMUNICATION ARCHAEOLOGY - ${contactName}]`,
        "You remember EVERY conversation they've mentioned about this person.",
    ];
    // Add profile insights
    if (profile && profile.dataPoints > 0) {
        sections.push(`\n**What You Know About Communicating with ${contactName}:**`);
        if (profile.effectiveApproaches.length > 0) {
            sections.push(`✅ What works: ${profile.effectiveApproaches.slice(0, 3).join(', ')}`);
        }
        if (profile.ineffectiveApproaches.length > 0) {
            sections.push(`❌ What doesn't work: ${profile.ineffectiveApproaches.slice(0, 3).join(', ')}`);
        }
        if (profile.triggerPhrases.length > 0) {
            sections.push(`⚠️ Avoid phrases like: "${profile.triggerPhrases.slice(0, 2).join('", "')}"`);
        }
        if (profile.topicsToAvoid.length > 0) {
            sections.push(`🚫 Sensitive topics: ${profile.topicsToAvoid.slice(0, 3).join(', ')}`);
        }
    }
    // Add relevant history
    if (history.length > 0) {
        sections.push(`\n**Past Conversations About ${currentTopic || 'this'}:**`);
        for (const event of history.slice(0, 3)) {
            const daysAgo = Math.floor((Date.now() - event.occurredAt) / (24 * 60 * 60 * 1000));
            const outcomeEmoji = event.outcome === 'positive' ? '✅' : event.outcome === 'negative' ? '❌' : '•';
            sections.push(`${outcomeEmoji} ${daysAgo} days ago: ${event.summary}` +
                (event.lessonsLearned?.length ? ` → Learned: ${event.lessonsLearned[0]}` : ''));
        }
    }
    sections.push('\n**Use this history to give context-aware advice.**');
    return sections.join('\n');
}
/**
 * Build general communication archaeology context.
 */
export async function buildGeneralArchaeologyContext(userId) {
    const recentEvents = await getRecentCommunicationEvents(userId, { limit: 10, daysBack: 14 });
    if (recentEvents.length === 0) {
        return '';
    }
    const sections = [
        '[RECENT COMMUNICATION HISTORY]',
        "Conversations they've mentioned recently:",
    ];
    // Group by contact
    const byContact = new Map();
    for (const event of recentEvents) {
        const name = event.contactName || 'Unknown';
        const existing = byContact.get(name) || [];
        existing.push(event);
        byContact.set(name, existing);
    }
    for (const [contact, events] of Array.from(byContact.entries())) {
        const latestEvent = events[0];
        const daysAgo = Math.floor((Date.now() - latestEvent.occurredAt) / (24 * 60 * 60 * 1000));
        const sentimentEmoji = latestEvent.sentiment > 0.3 ? '😊' : latestEvent.sentiment < -0.3 ? '😟' : '😐';
        sections.push(`• ${contact}: ${latestEvent.summary} (${daysAgo}d ago) ${sentimentEmoji}`);
    }
    return sections.join('\n');
}
// ============================================================================
// HELPERS
// ============================================================================
function mergeArrays(existing, incoming) {
    const combined = new Set([...existing, ...incoming]);
    return [...combined].slice(0, 10); // Keep max 10 items
}
function extractContactName(match) {
    // Find the captured name in the match groups
    for (let i = match.length - 1; i >= 1; i--) {
        const group = match[i];
        if (group &&
            !['to', 'with', 'me', 'that', 'talked', 'spoke', 'said', 'told', 'a', 'the'].includes(group.toLowerCase())) {
            // Capitalize first letter
            return group.charAt(0).toUpperCase() + group.slice(1).toLowerCase();
        }
    }
    return 'Unknown';
}
function extractTopics(transcript, currentTopic) {
    const topics = [];
    if (currentTopic) {
        topics.push(currentTopic);
    }
    // Common topic indicators
    const topicPatterns = [
        /\babout ([\w\s]+?)(?:\.|,|!|\?|$)/i,
        /\bregarding ([\w\s]+?)(?:\.|,|!|\?|$)/i,
        /\bthe ([\w\s]+?) (situation|issue|problem|thing)/i,
    ];
    for (const pattern of topicPatterns) {
        const match = transcript.match(pattern);
        if (match && match[1]) {
            topics.push(match[1].trim());
        }
    }
    return [...new Set(topics)];
}
function detectSentiment(transcript) {
    const lower = transcript.toLowerCase();
    // Positive indicators
    const positiveWords = ['great', 'good', 'happy', 'glad', 'relieved', 'better', 'resolved', 'agreed'];
    const negativeWords = [
        'bad',
        'terrible',
        'upset',
        'angry',
        'frustrated',
        'disappointed',
        'hurt',
        'fight',
        'argument',
    ];
    let score = 0;
    for (const word of positiveWords) {
        if (lower.includes(word))
            score += 0.2;
    }
    for (const word of negativeWords) {
        if (lower.includes(word))
            score -= 0.2;
    }
    return Math.max(-1, Math.min(1, score));
}
// ============================================================================
// EXPORTS
// ============================================================================
export const communicationArchaeology = {
    recordEvent: recordCommunicationEvent,
    getHistory: getConversationHistory,
    getRecent: getRecentCommunicationEvents,
    updateProfile: updateContactProfile,
    getProfile: getContactProfile,
    detectMention: detectCommunicationMention,
    learnOutcome: learnFromConversationOutcome,
    buildContext: buildArchaeologyContext,
    buildGeneralContext: buildGeneralArchaeologyContext,
};
export default communicationArchaeology;
//# sourceMappingURL=communication-archaeology.js.map