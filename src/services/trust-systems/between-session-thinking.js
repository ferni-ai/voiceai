/**
 * Between-Session Thinking
 *
 * "I've been thinking about what you said..."
 *
 * Philosophy: Real relationships don't pause between conversations.
 * We think about people we care about. This system creates the
 * illusion (and eventually, the reality) of continuous presence.
 *
 * When to record:
 * - End of meaningful conversations
 * - After breakthroughs or vulnerable moments
 * - When user shares something that needs processing
 * - When conversation ends on an open thread
 *
 * When to surface:
 * - Start of next session (with probability gating)
 * - When relevant topic comes up
 * - After appropriate relationship depth reached
 *
 * @module BetweenSessionThinking
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'BetweenSessionThinking' });
// ============================================================================
// IN-MEMORY STORE (Will be persisted via unified persistence)
// ============================================================================
const thinkingRecords = new Map();
// Track what's been surfaced this session to avoid duplicates
const surfacedThisSession = new Set();
// ============================================================================
// RECORDING THINKING
// ============================================================================
/**
 * Record something worth thinking about between sessions.
 * Call this at meaningful moments during conversation.
 */
export function recordThinkingMoment(params) {
    const { userId, personaId, topic, userQuote, context, emotionalWeight, thinkingType, sourceSessionId, } = params;
    // Get or create user's thinking records
    let userRecords = thinkingRecords.get(userId);
    if (!userRecords) {
        userRecords = [];
        thinkingRecords.set(userId, userRecords);
    }
    // Check if we already have a similar thinking record (avoid duplicates)
    const existing = userRecords.find((r) => r.topic.toLowerCase() === topic.toLowerCase() &&
        r.thinkingType === thinkingType &&
        !r.surfacedAt);
    if (existing) {
        // Update existing record with new context if more recent
        existing.context = context;
        if (userQuote)
            existing.userQuote = userQuote;
        existing.emotionalWeight = emotionalWeight;
        log.debug({ userId, topic, thinkingType }, 'Updated existing thinking record');
        return existing;
    }
    // Create new record
    const record = {
        id: `thinking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        personaId,
        topic,
        userQuote,
        context,
        emotionalWeight,
        thinkingType,
        createdAt: new Date(),
        sessionsSince: 0,
        sourceSessionId,
    };
    userRecords.push(record);
    // Keep only last 10 unsurfaced records per user
    const unsurfaced = userRecords.filter((r) => !r.surfacedAt);
    if (unsurfaced.length > 10) {
        // Remove oldest unsurfaced
        const oldest = unsurfaced.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        userRecords.splice(userRecords.indexOf(oldest), 1);
    }
    log.info({ userId, personaId, topic, thinkingType, emotionalWeight }, '💭 Recorded thinking moment');
    return record;
}
// ============================================================================
// SURFACING THINKING
// ============================================================================
/**
 * Get a thinking moment to surface at the start of a session.
 * Returns null if nothing appropriate to surface.
 */
export function getThinkingMomentToSurface(userId, personaId, currentSessionId) {
    const userRecords = thinkingRecords.get(userId);
    if (!userRecords || userRecords.length === 0)
        return null;
    // Filter to unsurfaced records for this persona
    const candidates = userRecords.filter((r) => !r.surfacedAt &&
        r.personaId === personaId &&
        !surfacedThisSession.has(r.id) &&
        r.sourceSessionId !== currentSessionId // Don't surface same-session thoughts
    );
    if (candidates.length === 0)
        return null;
    // Prioritize by:
    // 1. Emotional weight (heavy > medium > light)
    // 2. Sessions since (sweet spot: 1-3 sessions)
    // 3. Recency (more recent = more relevant)
    candidates.sort((a, b) => {
        const weightScore = { heavy: 3, medium: 2, light: 1 };
        const aWeight = weightScore[a.emotionalWeight] || 1;
        const bWeight = weightScore[b.emotionalWeight] || 1;
        if (aWeight !== bWeight)
            return bWeight - aWeight;
        // Sweet spot is 1-3 sessions ago
        const aSessionScore = a.sessionsSince >= 1 && a.sessionsSince <= 3 ? 10 : 0;
        const bSessionScore = b.sessionsSince >= 1 && b.sessionsSince <= 3 ? 10 : 0;
        if (aSessionScore !== bSessionScore)
            return bSessionScore - aSessionScore;
        // More recent is better
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const record = candidates[0];
    if (!record)
        return null;
    // Generate the surfacing phrase
    const { phrase, ssml, shouldAskPermission } = generateThinkingPhrase(record);
    return {
        record,
        phrase,
        ssml,
        shouldAskPermission,
    };
}
/**
 * Mark a thinking moment as surfaced
 */
export function markThinkingSurfaced(recordId) {
    // Find across all users
    for (const [, records] of thinkingRecords) {
        const record = records.find((r) => r.id === recordId);
        if (record) {
            record.surfacedAt = new Date();
            surfacedThisSession.add(recordId);
            log.debug({ recordId, topic: record.topic }, '💭 Thinking moment surfaced');
            return;
        }
    }
}
/**
 * Increment sessions since for all records of a user.
 * Call this when a new session starts.
 */
export function incrementSessionCount(userId) {
    const userRecords = thinkingRecords.get(userId);
    if (!userRecords)
        return;
    for (const record of userRecords) {
        if (!record.surfacedAt) {
            record.sessionsSince++;
        }
    }
    // Clear same-session tracking
    surfacedThisSession.clear();
}
function generateThinkingPhrase(record) {
    const { topic, userQuote, thinkingType, emotionalWeight, sessionsSince } = record;
    let phrase;
    let shouldAskPermission = false;
    switch (thinkingType) {
        case 'mulling':
            phrase = generateMullingPhrase(topic, userQuote, sessionsSince);
            break;
        case 'connecting':
            phrase = generateConnectingPhrase(topic, sessionsSince);
            break;
        case 'realizing':
            phrase = generateRealizingPhrase(topic, sessionsSince);
            break;
        case 'questioning':
            phrase = generateQuestioningPhrase(topic, sessionsSince);
            break;
        case 'remembering':
            phrase = generateRememberingPhrase(topic, userQuote, sessionsSince);
            break;
        case 'concerned':
            phrase = generateConcernedPhrase(topic, sessionsSince);
            shouldAskPermission = emotionalWeight === 'heavy';
            break;
        default:
            phrase = `I've been thinking about what you said about ${topic}.`;
    }
    // Add SSML for natural delivery
    const ssml = `<break time="200ms"/><prosody rate="95%">${phrase}</prosody><break time="150ms"/>`;
    return { phrase, ssml, shouldAskPermission };
}
function generateMullingPhrase(topic, quote, sessions) {
    const phrases = quote
        ? [
            `You know, I've been thinking about what you said—"${truncate(quote, 50)}". It's been on my mind.`,
            `That thing you said about "${truncate(quote, 40)}"... I've been mulling it over.`,
            `I keep coming back to something you said: "${truncate(quote, 50)}".`,
        ]
        : [
            `I've been thinking about ${topic} since we last talked.`,
            `${topic} has been on my mind. What you shared really stuck with me.`,
            `Something about our conversation about ${topic}... it's stayed with me.`,
        ];
    if (sessions > 3) {
        phrases.push(`I know it's been a while, but I still think about what you shared about ${topic}.`);
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateConnectingPhrase(topic, sessions) {
    const phrases = [
        `I was reading something and it connected to what you said about ${topic}.`,
        `Something reminded me of our conversation about ${topic}. I made a connection I hadn't before.`,
        `I've been connecting dots about ${topic}. I think I see something new.`,
        `That thing about ${topic}—I realized it relates to something else you mentioned before.`,
    ];
    if (sessions === 1) {
        phrases.unshift(`Even since yesterday, I've been connecting what you said about ${topic} to other things.`);
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateRealizingPhrase(topic, _sessions) {
    const phrases = [
        `I had a thought about ${topic}. Not sure if it's useful, but...`,
        `Something clicked about what you said about ${topic}. I think I understand better now.`,
        `I realized something about ${topic}. Want to hear it?`,
        `You know that ${topic} thing? I think I finally get what you were really saying.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateQuestioningPhrase(topic, _sessions) {
    const phrases = [
        `I've been wondering about ${topic}. It raised some questions for me.`,
        `Something about ${topic} has me curious. Can I ask you more about it?`,
        `I've been sitting with what you said about ${topic}. I have questions.`,
        `${topic} got me thinking. There's something I want to understand better.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateRememberingPhrase(topic, quote, sessions) {
    const phrases = quote
        ? [
            `"${truncate(quote, 50)}"—that came back to me randomly. Thought of you.`,
            `I just remembered what you said: "${truncate(quote, 40)}". How's that going?`,
        ]
        : [
            `${topic} popped into my head. Just wanted to see how you're doing with that.`,
            `Random thought: I remembered what you said about ${topic}.`,
            `Something made me think of you and ${topic}. How is that going?`,
        ];
    if (sessions > 5) {
        phrases.push(`It's been a while since we talked about ${topic}, but I still think about it sometimes.`);
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateConcernedPhrase(topic, sessions) {
    const phrases = [
        `I've been thinking about what you shared about ${topic}. How are you doing with that?`,
        `${topic} has been on my mind. I wanted to check in.`,
        `I've been a bit worried since our conversation about ${topic}. You okay?`,
    ];
    if (sessions === 1) {
        phrases.unshift(`I couldn't stop thinking about ${topic}. Just wanted to make sure you're okay.`);
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
// ============================================================================
// DETECTION - What's worth thinking about
// ============================================================================
/**
 * Detect if the current conversation contains something worth "thinking about"
 * Call this during turn processing
 */
export function detectThinkingWorthy(context) {
    const { userText, topic, emotion, isVulnerable, isBreakthrough, hasOpenQuestion } = context;
    const lower = userText.toLowerCase();
    // Breakthroughs are always worth thinking about
    if (isBreakthrough) {
        return {
            worthy: true,
            type: 'realizing',
            extractedTopic: topic || extractTopicFromText(userText),
            emotionalWeight: 'heavy',
            quote: extractMeaningfulQuote(userText),
        };
    }
    // Vulnerable shares
    if (isVulnerable) {
        return {
            worthy: true,
            type: 'mulling',
            extractedTopic: topic || extractTopicFromText(userText),
            emotionalWeight: 'heavy',
            quote: extractMeaningfulQuote(userText),
        };
    }
    // Heavy emotional content
    const heavyIndicators = [
        'never told anyone',
        'first time saying',
        'been holding onto',
        "i'm scared",
        "i'm worried",
        "don't know what to do",
        'struggling with',
        "can't stop thinking",
        'keeps me up',
    ];
    if (heavyIndicators.some((ind) => lower.includes(ind))) {
        return {
            worthy: true,
            type: 'concerned',
            extractedTopic: topic || extractTopicFromText(userText),
            emotionalWeight: 'heavy',
            quote: extractMeaningfulQuote(userText),
        };
    }
    // Open questions or unresolved threads
    if (hasOpenQuestion) {
        return {
            worthy: true,
            type: 'questioning',
            extractedTopic: topic || extractTopicFromText(userText),
            emotionalWeight: 'medium',
        };
    }
    // Interesting shares (medium weight)
    const interestingIndicators = [
        'been thinking about',
        'realized',
        'occurred to me',
        'wondering if',
        'trying to figure out',
        'not sure how i feel',
    ];
    if (interestingIndicators.some((ind) => lower.includes(ind))) {
        return {
            worthy: true,
            type: 'mulling',
            extractedTopic: topic || extractTopicFromText(userText),
            emotionalWeight: 'medium',
            quote: extractMeaningfulQuote(userText),
        };
    }
    // Negative emotions might warrant concern
    if (emotion && ['sad', 'anxious', 'worried', 'overwhelmed', 'frustrated'].includes(emotion)) {
        // Only if the message is substantive
        if (userText.split(/\s+/).length > 10) {
            return {
                worthy: true,
                type: 'concerned',
                extractedTopic: topic || extractTopicFromText(userText),
                emotionalWeight: 'medium',
            };
        }
    }
    return { worthy: false };
}
// ============================================================================
// HELPERS
// ============================================================================
function truncate(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return `${text.slice(0, maxLength - 3)}...`;
}
function extractTopicFromText(text) {
    // Simple topic extraction - take first meaningful phrase
    const cleaned = text.replace(/[.!?,;:]/g, '').trim();
    const words = cleaned.split(/\s+/).slice(0, 6);
    if (words.length > 3) {
        return words.slice(0, 4).join(' ');
    }
    return words.join(' ') || 'what we discussed';
}
function extractMeaningfulQuote(text) {
    // Extract a meaningful quote if the text is substantive
    if (text.length < 20)
        return undefined;
    // Try to find a complete thought (first sentence)
    const sentences = text.match(/[^.!?]+[.!?]?/g);
    if (sentences && sentences[0]) {
        const first = sentences[0].trim();
        if (first.length > 15 && first.length < 100) {
            return first;
        }
    }
    // Otherwise return truncated text
    if (text.length < 100)
        return text;
    return `${text.slice(0, 97)}...`;
}
// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================
export function loadThinkingRecords(userId, records) {
    // Hydrate dates
    const hydrated = records.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        surfacedAt: r.surfacedAt ? new Date(r.surfacedAt) : undefined,
    }));
    thinkingRecords.set(userId, hydrated);
    log.debug({ userId, count: hydrated.length }, '💭 Loaded thinking records');
}
export function getThinkingRecordsForPersistence(userId) {
    return thinkingRecords.get(userId) || [];
}
export function getAllUnsurfacedThinking(userId) {
    const records = thinkingRecords.get(userId) || [];
    return records.filter((r) => !r.surfacedAt);
}
/**
 * Clear all thinking records for a user (for testing)
 */
export function clearUserThinking(userId) {
    thinkingRecords.delete(userId);
    surfacedThisSession.clear();
}
/**
 * Alias for markThinkingSurfaced (for consistency)
 */
export function markMomentSurfaced(userId, recordId) {
    markThinkingSurfaced(recordId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordThinkingMoment,
    getThinkingMomentToSurface,
    markThinkingSurfaced,
    markMomentSurfaced,
    incrementSessionCount,
    detectThinkingWorthy,
    loadThinkingRecords,
    getThinkingRecordsForPersistence,
    getAllUnsurfacedThinking,
    clearUserThinking,
};
//# sourceMappingURL=between-session-thinking.js.map