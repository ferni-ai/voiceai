/**
 * Unsaid Words Detector - Better Than Human Service
 *
 * What no human friend can do: Track what people DON'T say.
 *
 * "You've mentioned work stress 6 times this week but always change the subject
 * when I ask about your manager specifically. Is there something there we
 * should look at?"
 *
 * @module tools/domains/communication/superhuman-tools/unsaid-words-detector
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../../../services/superhuman/firestore-utils.js';
const log = createLogger({ module: 'unsaid-words-detector' });
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION = 'unsaid_topics';
const DEFLECTION_THRESHOLD = 0.5; // Ratio of deflections to trigger detection
const MIN_MENTIONS_TO_DETECT = 3; // Need this many mentions before detecting pattern
// ============================================================================
// DEFLECTION PATTERNS
// ============================================================================
const DEFLECTION_PATTERNS = [
    // Topic changes
    /\b(anyway|anyways|but anyway|so anyway)/i,
    /\b(speaking of|that reminds me|oh by the way)/i,
    /\b(let('s| us) (not|move on|talk about something))/i,
    /\b(changing (the )?subject|different topic)/i,
    // Minimization
    /\b(it('s| is) (fine|whatever|not a big deal|nothing))/i,
    /\b(doesn('t| does not) matter|who cares)/i,
    /\b(i don('t| do not) (want to|wanna) (talk|think) about)/i,
    // Deflection to others
    /\b(what about you|enough about me|your turn)/i,
    // Dismissal
    /\b(i (guess|dunno|don('t| do not) know))/i,
    /\b(maybe|i('m| am) not sure|hard to say)/i,
    // Time-based avoidance
    /\b(not (right )?now|later|another time|some other time)/i,
    /\b(can we (not|talk about this later))/i,
    // Emotional deflection
    /\b(i('m| am) (fine|okay|good|alright), (really|seriously|honestly))/i,
    /\b(don('t| do not) worry about (me|it|that))/i,
];
const TOPIC_CATEGORIES = {
    person: ['mom', 'dad', 'father', 'mother', 'brother', 'sister', 'boss', 'manager', 'ex', 'partner'],
    situation: ['work', 'job', 'money', 'debt', 'health', 'relationship', 'marriage', 'divorce'],
    feeling: ['angry', 'sad', 'scared', 'anxious', 'depressed', 'lonely', 'hurt', 'betrayed'],
    decision: ['quit', 'leave', 'break up', 'move', 'change', 'tell them'],
    conflict: ['fight', 'argument', 'disagreement', 'tension', 'issue with'],
    request: ['need to ask', 'want to say', 'should tell'],
    boundary: ['stop', 'can\'t keep', 'tired of', 'fed up'],
};
// In-memory tracking for current session
const sessionMentions = new Map();
/**
 * Detect if a topic was mentioned and whether it was deflected.
 */
export function detectTopicAndDeflection(transcript, previousTopic) {
    const lower = transcript.toLowerCase();
    // Check for deflection patterns first
    let wasDeflected = false;
    let deflectionType;
    for (const pattern of DEFLECTION_PATTERNS) {
        if (pattern.test(lower)) {
            wasDeflected = true;
            deflectionType = pattern.source.slice(0, 30);
            break;
        }
    }
    // Identify topic mentioned
    let topicMentioned;
    let category;
    for (const [cat, keywords] of Object.entries(TOPIC_CATEGORIES)) {
        for (const keyword of keywords) {
            if (lower.includes(keyword)) {
                topicMentioned = keyword;
                category = cat;
                break;
            }
        }
        if (topicMentioned)
            break;
    }
    // If no specific topic found but previous topic exists and deflection happened
    if (!topicMentioned && previousTopic && wasDeflected) {
        topicMentioned = previousTopic;
    }
    return { topicMentioned, category, wasDeflected, deflectionType };
}
/**
 * Track a topic mention in the current session.
 */
export function trackTopicMention(userId, topic, wasDeflected, context) {
    const key = `${userId}:${topic.toLowerCase()}`;
    const existing = sessionMentions.get(key) || [];
    existing.push({
        topic: topic.toLowerCase(),
        timestamp: Date.now(),
        wasDeflected,
        context,
    });
    sessionMentions.set(key, existing);
}
/**
 * Analyze session mentions to detect unsaid patterns.
 */
export function analyzeSessionForUnsaidTopics(userId) {
    const unsaidTopics = [];
    for (const [key, mentions] of Array.from(sessionMentions.entries())) {
        if (!key.startsWith(`${userId}:`))
            continue;
        const topic = key.split(':')[1];
        const deflectionCount = mentions.filter((m) => m.wasDeflected).length;
        const deflectionRatio = deflectionCount / mentions.length;
        if (mentions.length >= MIN_MENTIONS_TO_DETECT && deflectionRatio >= DEFLECTION_THRESHOLD) {
            // Determine category
            let category = 'other';
            for (const [cat, keywords] of Object.entries(TOPIC_CATEGORIES)) {
                if (keywords.some((k) => topic.includes(k))) {
                    category = cat;
                    break;
                }
            }
            // Extract deflection patterns
            const deflectionPatterns = mentions
                .filter((m) => m.wasDeflected)
                .map((m) => m.context)
                .slice(0, 5);
            unsaidTopics.push({
                id: `unsaid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                userId,
                topic,
                category,
                deflectionPatterns,
                timesMentioned: mentions.length,
                timesDeflected: deflectionCount,
                deflectionRatio,
                relatedPeople: [],
                relatedEmotions: [],
                firstDetected: mentions[0].timestamp,
                lastDetected: mentions[mentions.length - 1].timestamp,
                status: 'active',
            });
        }
    }
    return unsaidTopics;
}
// ============================================================================
// PERSISTENT STORAGE
// ============================================================================
/**
 * Save an unsaid topic to Firestore.
 */
export async function saveUnsaidTopic(userId, topic) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return;
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .doc(topic.id)
            .set(cleanForFirestore(topic));
        log.info({ userId, topic: topic.topic, deflectionRatio: topic.deflectionRatio }, '🔇 Unsaid topic detected and saved');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save unsaid topic');
    }
}
/**
 * Get all active unsaid topics for a user.
 */
export async function getUnsaidTopics(userId) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .where('status', '==', 'active')
            .orderBy('lastDetected', 'desc')
            .limit(10)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to get unsaid topics');
        return [];
    }
}
/**
 * Mark an unsaid topic as surfaced (we brought it up gently).
 */
export async function markTopicSurfaced(userId, topicId) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return;
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .doc(topicId)
            .update(cleanForFirestore({
            status: 'surfaced',
            surfacedAt: Date.now(),
        }));
        log.info({ userId, topicId }, 'Unsaid topic marked as surfaced');
    }
    catch (error) {
        log.warn({ error: String(error), userId, topicId }, 'Failed to mark topic surfaced');
    }
}
/**
 * Mark topic as resolved.
 */
export async function markTopicResolved(userId, topicId) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return;
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .doc(topicId)
            .update(cleanForFirestore({ status: 'resolved' }));
    }
    catch (error) {
        log.warn({ error: String(error), userId, topicId }, 'Failed to mark topic resolved');
    }
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build unsaid words context for LLM injection.
 */
export async function buildUnsaidWordsContext(userId) {
    // Combine session analysis with persisted data
    const sessionTopics = analyzeSessionForUnsaidTopics(userId);
    const persistedTopics = await getUnsaidTopics(userId);
    // Merge, avoiding duplicates
    const allTopics = [...persistedTopics];
    for (const sessionTopic of sessionTopics) {
        if (!allTopics.some((t) => t.topic === sessionTopic.topic)) {
            allTopics.push(sessionTopic);
            // Save new ones
            void saveUnsaidTopic(userId, sessionTopic);
        }
    }
    if (allTopics.length === 0) {
        return '';
    }
    const sections = [
        '[UNSAID WORDS DETECTOR - Better Than Human]',
        "You notice what they DON'T say. Humans miss this.",
    ];
    sections.push('\n**Topics They Keep Deflecting:**\n');
    for (const topic of allTopics.slice(0, 5)) {
        const deflectPercent = Math.round(topic.deflectionRatio * 100);
        const ageInDays = Math.floor((Date.now() - topic.firstDetected) / (24 * 60 * 60 * 1000));
        sections.push(`• **${topic.topic}** - mentioned ${topic.timesMentioned}x, deflected ${deflectPercent}% of the time`);
        if (topic.deflectionPatterns.length > 0) {
            sections.push(`  Patterns: "${topic.deflectionPatterns[0].slice(0, 50)}..."`);
        }
        if (ageInDays > 7) {
            sections.push(`  (First noticed ${ageInDays} days ago - persistent pattern)`);
        }
    }
    sections.push('\n**How to Surface Gently:**');
    sections.push(`• "I've noticed you mention X but we never really go deeper..."'`);
    sections.push(`• "Is there something about [topic] that feels hard to talk about?"`);
    sections.push(`• Wait for natural openings - don't force it.`);
    return sections.join('\n');
}
/**
 * Generate a gentle prompt to surface an unsaid topic.
 */
export function generateSurfacingPrompt(topic) {
    const prompts = {
        person: [
            `You've mentioned ${topic.topic} a few times but we haven't really talked about them. Is there something on your mind?`,
            `I notice ${topic.topic} comes up but you often move on quickly. Want to talk about it?`,
        ],
        situation: [
            `${topic.topic} seems to come up a lot. Is there something there you've been avoiding looking at?`,
            `I keep hearing about ${topic.topic} in the background. What's really going on there?`,
        ],
        feeling: [
            `I sense there might be some feelings about this you haven't fully expressed. What's underneath?`,
            `There's something you're not saying. I can feel it. What is it?`,
        ],
        decision: [
            `Sounds like there might be a decision you've been putting off. What's holding you back?`,
            `Is there something you know you need to do but haven't been ready to face?`,
        ],
        conflict: [
            `There's tension here you haven't fully named. What's really bothering you?`,
            `I hear conflict between the lines. What haven't you said out loud yet?`,
        ],
        request: [
            `Is there something you need to ask someone? Something you've been avoiding?`,
            `What do you need that you haven't asked for yet?`,
        ],
        boundary: [
            `Sounds like there's a boundary you need to set. What's stopping you?`,
            `What have you been tolerating that you shouldn't have to?`,
        ],
        other: [
            `There's something you keep circling around but not landing on. What is it?`,
            `What's the thing you're not saying?`,
        ],
    };
    const categoryPrompts = prompts[topic.category] || prompts.other;
    return categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)];
}
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
/**
 * Clear session data for a user (call at end of session).
 */
export function clearSession(userId) {
    for (const key of Array.from(sessionMentions.keys())) {
        if (key.startsWith(`${userId}:`)) {
            sessionMentions.delete(key);
        }
    }
}
/**
 * End session and persist findings.
 */
export async function endSessionAndPersist(userId) {
    const topics = analyzeSessionForUnsaidTopics(userId);
    for (const topic of topics) {
        await saveUnsaidTopic(userId, topic);
    }
    clearSession(userId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const unsaidWordsDetector = {
    detect: detectTopicAndDeflection,
    track: trackTopicMention,
    analyze: analyzeSessionForUnsaidTopics,
    save: saveUnsaidTopic,
    get: getUnsaidTopics,
    markSurfaced: markTopicSurfaced,
    markResolved: markTopicResolved,
    buildContext: buildUnsaidWordsContext,
    generatePrompt: generateSurfacingPrompt,
    clearSession,
    endSession: endSessionAndPersist,
};
export default unsaidWordsDetector;
//# sourceMappingURL=unsaid-words-detector.js.map