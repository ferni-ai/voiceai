/**
 * Curiosity Memory - Follow Through on Passing Mentions
 *
 * "You mentioned your friend Sam a few weeks ago. How are they?"
 *
 * Philosophy: Real friends remember the small things. When someone
 * casually mentions a person, place, event, or activity, a good friend
 * files it away and asks about it later. This is one of the most
 * human-feeling capabilities.
 *
 * What we track:
 * - People mentioned (friends, family, colleagues)
 * - Places mentioned (vacation spots, hometown, new apartment)
 * - Events mentioned (weddings, concerts, deadlines)
 * - Activities mentioned (learning guitar, training for marathon)
 * - Goals mentioned (saving for house, getting promoted)
 *
 * When to follow up:
 * - 1-4 weeks after mention (sweet spot for "remembered")
 * - When the topic comes up naturally
 * - At session start if high priority
 *
 * @module CuriosityMemory
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'CuriosityMemory' });
// ============================================================================
// STORAGE
// ============================================================================
const profiles = new Map();
// Track what we've followed up on this session
const followedUpThisSession = new Set();
// ============================================================================
// RECORDING MENTIONS
// ============================================================================
/**
 * Record a passing mention from the user.
 * Call this during turn processing when mentions are detected.
 */
export function recordPassingMention(params) {
    const { userId, personaId, type, name, context, originalQuote, sessionId, emotionalContext, expectedDate, relatedTopics, } = params;
    // Get or create profile
    let profile = profiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            mentions: [],
            lastUpdated: new Date(),
            favoriteTopics: [],
            frequentPeople: [],
        };
        profiles.set(userId, profile);
    }
    // Check if we already have this mention
    const normalizedName = normalizeName(name);
    const existing = profile.mentions.find((m) => normalizeName(m.name) === normalizedName && m.type === type && !m.followedUpAt);
    if (existing) {
        // Update existing mention
        existing.mentionCount++;
        existing.context = context; // Update with latest context
        if (originalQuote)
            existing.originalQuote = originalQuote;
        if (emotionalContext)
            existing.emotionalContext = emotionalContext;
        if (expectedDate)
            existing.expectedDate = expectedDate;
        if (relatedTopics) {
            existing.relatedTopics = [...new Set([...(existing.relatedTopics || []), ...relatedTopics])];
        }
        // Boost priority if mentioned multiple times
        if (existing.mentionCount >= 3 && existing.followUpPriority === 'low') {
            existing.followUpPriority = 'medium';
        }
        if (existing.mentionCount >= 5 && existing.followUpPriority === 'medium') {
            existing.followUpPriority = 'high';
        }
        log.debug({ userId, type, name, mentionCount: existing.mentionCount }, '🔍 Updated mention');
        return existing;
    }
    // Calculate follow-up priority
    const priority = calculateFollowUpPriority({
        type,
        emotionalContext,
        expectedDate,
        context,
    });
    // Create new mention
    const mention = {
        id: `mention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        personaId,
        type,
        name,
        context,
        originalQuote,
        followUpPriority: priority.priority,
        followUpReason: priority.reason,
        mentionedAt: new Date(),
        sessionId,
        mentionCount: 1,
        emotionalContext,
        expectedDate,
        relatedTopics,
        timeSensitive: !!expectedDate || priority.timeSensitive,
    };
    profile.mentions.push(mention);
    profile.lastUpdated = new Date();
    // Update frequent people list
    if (type === 'person') {
        if (!profile.frequentPeople.includes(normalizedName)) {
            profile.frequentPeople.push(normalizedName);
        }
    }
    // Keep mentions list manageable (max 50 unfollowed)
    const unfollowed = profile.mentions.filter((m) => !m.followedUpAt);
    if (unfollowed.length > 50) {
        // Remove oldest low-priority ones
        const toRemove = unfollowed
            .filter((m) => m.followUpPriority === 'low')
            .sort((a, b) => new Date(a.mentionedAt).getTime() - new Date(b.mentionedAt).getTime())
            .slice(0, 10);
        for (const m of toRemove) {
            const idx = profile.mentions.indexOf(m);
            if (idx >= 0)
                profile.mentions.splice(idx, 1);
        }
    }
    log.info({ userId, type, name, priority: priority.priority }, '🔍 Recorded passing mention');
    return mention;
}
// ============================================================================
// GETTING FOLLOW-UP OPPORTUNITIES
// ============================================================================
/**
 * Get a follow-up opportunity to use in conversation.
 * Returns null if nothing appropriate to follow up on.
 */
export function getFollowUpOpportunity(userId, currentTopic) {
    const profile = profiles.get(userId);
    if (!profile)
        return null;
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const fourWeeks = 28 * 24 * 60 * 60 * 1000;
    // Filter to followable mentions
    const candidates = profile.mentions.filter((m) => {
        // Not already followed up
        if (m.followedUpAt)
            return false;
        // Not followed up this session
        if (followedUpThisSession.has(m.id))
            return false;
        // Time check: at least 1 day old, not more than 6 months
        const age = now - new Date(m.mentionedAt).getTime();
        if (age < 24 * 60 * 60 * 1000)
            return false; // Too recent
        if (age > 180 * 24 * 60 * 60 * 1000)
            return false; // Too old
        return true;
    });
    if (candidates.length === 0)
        return null;
    // Score candidates
    const scored = candidates.map((m) => {
        let score = 0;
        const age = now - new Date(m.mentionedAt).getTime();
        // Priority bonus
        if (m.followUpPriority === 'high')
            score += 30;
        if (m.followUpPriority === 'medium')
            score += 15;
        // Sweet spot timing (1-4 weeks ago)
        if (age >= oneWeek && age <= fourWeeks) {
            score += 25;
        }
        // Topic relevance
        if (currentTopic &&
            (m.name.toLowerCase().includes(currentTopic.toLowerCase()) ||
                m.context.toLowerCase().includes(currentTopic.toLowerCase()) ||
                m.relatedTopics?.some((t) => t.toLowerCase().includes(currentTopic.toLowerCase())))) {
            score += 40; // Big bonus for relevance
        }
        // Mention count bonus
        score += Math.min(m.mentionCount * 3, 15);
        // Time-sensitive bonus
        if (m.timeSensitive && m.expectedDate) {
            const daysUntil = (new Date(m.expectedDate).getTime() - now) / (24 * 60 * 60 * 1000);
            if (daysUntil > 0 && daysUntil < 14) {
                score += 35; // Coming up soon!
            }
        }
        // Emotional context bonus
        if (m.emotionalContext === 'negative' || m.emotionalContext === 'mixed') {
            score += 10; // Check in on potentially difficult things
        }
        return { mention: m, score };
    });
    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 10)
        return null;
    const { mention } = best;
    const { phrase, ssml, urgency } = generateFollowUpPhrase(mention);
    return {
        mention,
        phrase,
        ssml,
        urgency,
        reason: mention.followUpReason || 'You mentioned this before',
    };
}
/**
 * Mark a mention as followed up
 */
export function markFollowedUp(mentionId) {
    for (const [, profile] of profiles) {
        const mention = profile.mentions.find((m) => m.id === mentionId);
        if (mention) {
            mention.followedUpAt = new Date();
            followedUpThisSession.add(mentionId);
            log.debug({ mentionId, name: mention.name }, '🔍 Mention followed up');
            return;
        }
    }
}
/**
 * Clear session state
 */
export function clearSessionState() {
    followedUpThisSession.clear();
}
// ============================================================================
// DETECTION - What mentions are worth tracking
// ============================================================================
/**
 * Detect if the user's message contains a passing mention worth tracking.
 */
export function detectPassingMentions(params) {
    const { userText, currentTopic, emotion } = params;
    const mentions = [];
    const lower = userText.toLowerCase();
    // Person detection patterns
    const personPatterns = [
        /my (?:friend|buddy|pal) (\w+)/gi,
        /my (?:brother|sister|mom|dad|wife|husband|partner|girlfriend|boyfriend|son|daughter) (\w+)?/gi,
        /(?:friend|colleague|coworker) (?:named |called )?(\w+)/gi,
        /(\w+) (?:told me|said|mentioned|was telling me)/gi,
        /talked to (\w+)/gi,
        /heard from (\w+)/gi,
        /(\w+) and I/gi,
        /with (\w+) (?:yesterday|today|last week|recently)/gi,
    ];
    for (const pattern of personPatterns) {
        let match;
        while ((match = pattern.exec(userText)) !== null) {
            const name = match[1];
            if (name && name.length > 1 && !isCommonWord(name)) {
                const exists = mentions.some((m) => m.type === 'person' && normalizeName(m.name) === normalizeName(name));
                if (!exists) {
                    mentions.push({
                        type: 'person',
                        name: capitalizeFirst(name),
                        context: extractContext(userText, match.index),
                        quote: match[0],
                        emotionalContext: mapEmotion(emotion),
                    });
                }
            }
        }
    }
    // Event detection
    const eventPatterns = [
        {
            pattern: /(?:going to|attending|invited to) (?:a |the )?(\w+(?:\s+\w+)?)/gi,
            type: 'event',
        },
        { pattern: /(\w+(?:'s)? wedding)/gi, type: 'event' },
        {
            pattern: /(?:the |a )(?:concert|show|party|reunion|conference) (?:for |at |with )?(\w+)?/gi,
            type: 'event',
        },
        { pattern: /deadline (?:for |on )?(\w+(?:\s+\w+)?)/gi, type: 'event' },
    ];
    for (const { pattern, type } of eventPatterns) {
        let match;
        while ((match = pattern.exec(userText)) !== null) {
            const name = match[1] || match[0];
            if (name && name.length > 2) {
                mentions.push({
                    type,
                    name: name.trim(),
                    context: extractContext(userText, match.index),
                    quote: match[0],
                    emotionalContext: mapEmotion(emotion),
                    expectedDate: extractDateFromContext(userText),
                });
            }
        }
    }
    // Activity/hobby detection
    const activityPatterns = [
        /(?:started |trying to |learning to |want to )(\w+(?:ing)?(?:\s+\w+)?)/gi,
        /(?:training for|preparing for) (?:a |the )?(\w+)/gi,
        /(?:taking |signed up for) (?:a |some )?(\w+\s*(?:classes?|lessons?|course)?)/gi,
        /(?:been |started |trying )(\w+ing)/gi,
    ];
    for (const pattern of activityPatterns) {
        let match;
        while ((match = pattern.exec(userText)) !== null) {
            const name = match[1];
            if (name && name.length > 3 && !isCommonVerb(name)) {
                mentions.push({
                    type: 'activity',
                    name: name.trim(),
                    context: extractContext(userText, match.index),
                    quote: match[0],
                    emotionalContext: mapEmotion(emotion),
                });
            }
        }
    }
    // Goal detection
    const goalPatterns = [
        /(?:want to|trying to|hoping to|planning to) (\w+(?:\s+\w+){0,3})/gi,
        /(?:saving for|working toward|goal is to) (?:a |the )?(\w+(?:\s+\w+)?)/gi,
        /dream (?:of|is to) (\w+(?:\s+\w+)?)/gi,
    ];
    for (const pattern of goalPatterns) {
        let match;
        while ((match = pattern.exec(userText)) !== null) {
            const name = match[1];
            if (name && name.length > 3) {
                mentions.push({
                    type: 'goal',
                    name: name.trim(),
                    context: extractContext(userText, match.index),
                    quote: match[0],
                    emotionalContext: mapEmotion(emotion),
                });
            }
        }
    }
    // Place detection
    const placePatterns = [
        /(?:going to|visiting|trip to|moving to|been to) (\w+(?:\s+\w+)?)/gi,
        /(?:in|from|at) (\w+(?:,\s*\w+)?)/gi,
        /my (?:new |old )?(?:apartment|house|place|office) (?:in |at )?(\w+)?/gi,
    ];
    for (const pattern of placePatterns) {
        let match;
        while ((match = pattern.exec(userText)) !== null) {
            const name = match[1];
            if (name && name.length > 2 && !isCommonWord(name) && isLikelyPlace(name)) {
                mentions.push({
                    type: 'place',
                    name: capitalizeFirst(name.trim()),
                    context: extractContext(userText, match.index),
                    quote: match[0],
                    emotionalContext: mapEmotion(emotion),
                });
            }
        }
    }
    // Deduplicate
    const unique = mentions.filter((m, i, arr) => arr.findIndex((x) => x.type === m.type && normalizeName(x.name) === normalizeName(m.name)) ===
        i);
    return unique.slice(0, 5); // Max 5 per turn
}
function generateFollowUpPhrase(mention) {
    const { type, name, context, emotionalContext, timeSensitive, expectedDate, mentionedAt } = mention;
    let phrase;
    let urgency = 'whenever';
    const weeksAgo = Math.floor((Date.now() - new Date(mentionedAt).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const timeRef = weeksAgo === 1 ? 'last week' : weeksAgo < 4 ? 'a few weeks ago' : 'a while back';
    switch (type) {
        case 'person':
            phrase = generatePersonFollowUp(name, timeRef, emotionalContext);
            break;
        case 'event':
            if (timeSensitive && expectedDate) {
                const daysUntil = Math.ceil((new Date(expectedDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                if (daysUntil > 0 && daysUntil < 14) {
                    phrase = `Hey, isn't ${name} coming up soon? How are you feeling about it?`;
                    urgency = 'soon';
                }
                else if (daysUntil <= 0) {
                    phrase = `How did ${name} go? I remember you mentioning it.`;
                    urgency = 'immediate';
                }
                else {
                    phrase = `You mentioned ${name} ${timeRef}. Still happening?`;
                }
            }
            else {
                phrase = `Whatever happened with ${name}? You mentioned it ${timeRef}.`;
            }
            break;
        case 'activity':
            phrase = generateActivityFollowUp(name, timeRef);
            break;
        case 'goal':
            phrase = generateGoalFollowUp(name, timeRef, context);
            break;
        case 'place':
            phrase = generatePlaceFollowUp(name, timeRef, context);
            break;
        default:
            phrase = `You mentioned ${name} ${timeRef}. How's that going?`;
    }
    const ssml = `<break time="200ms"/><prosody rate="95%">${phrase}</prosody>`;
    return { phrase, ssml, urgency };
}
function generatePersonFollowUp(name, timeRef, emotional) {
    const phrases = emotional === 'negative' || emotional === 'mixed'
        ? [
            `You mentioned ${name} ${timeRef}. How are things going with them?`,
            `I've been thinking about what you said about ${name}. Everything okay there?`,
            `How's ${name} doing? You were on my mind.`,
        ]
        : [
            `How's ${name} doing? You mentioned them ${timeRef}.`,
            `Whatever happened with ${name}? I remember you mentioning them.`,
            `You mentioned ${name} ${timeRef}. Catch me up?`,
            `Random thought: How's ${name}?`,
        ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateActivityFollowUp(name, timeRef) {
    const phrases = [
        `How's the ${name} going? You mentioned starting that ${timeRef}.`,
        `Still doing ${name}? You mentioned it ${timeRef}.`,
        `Whatever happened with ${name}? Still at it?`,
        `You were trying ${name} ${timeRef}. How's that been?`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generateGoalFollowUp(name, timeRef, context) {
    const phrases = [
        `You mentioned wanting to ${name} ${timeRef}. Any progress?`,
        `How's the ${name} goal going? Still on your mind?`,
        `I remember you talking about ${name}. Where are you with that?`,
        `Whatever happened with wanting to ${name}?`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
function generatePlaceFollowUp(name, timeRef, context) {
    const lower = context.toLowerCase();
    if (lower.includes('trip') || lower.includes('visit') || lower.includes('going')) {
        return `Did you end up going to ${name}? You mentioned it ${timeRef}.`;
    }
    if (lower.includes('moving') || lower.includes('new')) {
        return `How's the new place in ${name}? Settling in okay?`;
    }
    return `You mentioned ${name} ${timeRef}. Everything good there?`;
}
// ============================================================================
// PRIORITY CALCULATION
// ============================================================================
function calculateFollowUpPriority(params) {
    const { type, emotionalContext, expectedDate, context } = params;
    const lower = context.toLowerCase();
    // Time-sensitive gets high priority
    if (expectedDate) {
        const daysUntil = (new Date(expectedDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        if (daysUntil > 0 && daysUntil < 30) {
            return { priority: 'high', reason: 'Coming up soon', timeSensitive: true };
        }
    }
    // Negative emotional context
    if (emotionalContext === 'negative' || emotionalContext === 'mixed') {
        return { priority: 'high', reason: 'Check in on difficult situation', timeSensitive: false };
    }
    // People are generally higher priority
    if (type === 'person') {
        // Close relationships
        if (lower.includes('mom') ||
            lower.includes('dad') ||
            lower.includes('wife') ||
            lower.includes('husband') ||
            lower.includes('partner')) {
            return { priority: 'high', reason: 'Close family member', timeSensitive: false };
        }
        return { priority: 'medium', reason: 'Personal connection', timeSensitive: false };
    }
    // Goals are medium priority
    if (type === 'goal') {
        return { priority: 'medium', reason: 'Supporting their aspirations', timeSensitive: false };
    }
    // Events can be time-sensitive
    if (type === 'event') {
        if (lower.includes('wedding') || lower.includes('birthday') || lower.includes('graduation')) {
            return { priority: 'high', reason: 'Life milestone', timeSensitive: true };
        }
        return { priority: 'medium', reason: 'Event follow-up', timeSensitive: true };
    }
    return { priority: 'low', reason: 'General interest', timeSensitive: false };
}
// ============================================================================
// HELPERS
// ============================================================================
function normalizeName(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '');
}
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
function extractContext(text, matchIndex) {
    const start = Math.max(0, matchIndex - 30);
    const end = Math.min(text.length, matchIndex + 50);
    return text.slice(start, end).trim();
}
function mapEmotion(emotion) {
    if (!emotion)
        return undefined;
    const e = emotion.toLowerCase();
    if (['happy', 'excited', 'joyful', 'grateful'].includes(e))
        return 'positive';
    if (['sad', 'angry', 'anxious', 'worried', 'frustrated'].includes(e))
        return 'negative';
    if (e === 'mixed' || e === 'conflicted')
        return 'mixed';
    return 'neutral';
}
function extractDateFromContext(text) {
    // Simple date extraction - could be enhanced
    const patterns = [
        /(?:on |by |next )(\w+day)/i,
        /(?:in |about )(\d+) (?:days?|weeks?|months?)/i,
        /(?:this |next )(\w+)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            // Return approximate date based on match
            const now = new Date();
            if (match[1] && /\d+/.test(match[1])) {
                const num = parseInt(match[1], 10);
                if (text.includes('week')) {
                    return new Date(now.getTime() + num * 7 * 24 * 60 * 60 * 1000);
                }
                if (text.includes('month')) {
                    return new Date(now.getTime() + num * 30 * 24 * 60 * 60 * 1000);
                }
                return new Date(now.getTime() + num * 24 * 60 * 60 * 1000);
            }
        }
    }
    return undefined;
}
function isCommonWord(word) {
    const common = [
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'so',
        'my',
        'your',
        'their',
        'our',
        'was',
        'were',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'that',
        'this',
        'these',
        'those',
        'here',
        'there',
        'then',
        'than',
        'when',
        'what',
        'where',
        'which',
        'who',
        'whom',
        'why',
        'how',
        'all',
        'each',
        'every',
        'both',
        'few',
        'more',
        'most',
        'some',
        'any',
        'about',
        'really',
        'just',
        'actually',
        'basically',
        'someone',
        'something',
        'today',
        'tomorrow',
        'yesterday',
    ];
    return common.includes(word.toLowerCase());
}
function isCommonVerb(word) {
    const verbs = [
        'going',
        'doing',
        'being',
        'having',
        'getting',
        'making',
        'saying',
        'thinking',
        'taking',
        'coming',
        'seeing',
        'knowing',
        'wanting',
        'using',
        'finding',
        'giving',
        'telling',
        'working',
        'feeling',
        'trying',
        'looking',
        'starting',
        'talking',
        'helping',
    ];
    return verbs.includes(word.toLowerCase());
}
function isLikelyPlace(name) {
    // Check if it looks like a place name (capitalized, not a common word)
    const lower = name.toLowerCase();
    // Exclude common false positives
    const exclude = ['me', 'you', 'them', 'us', 'him', 'her', 'here', 'there', 'home', 'work'];
    if (exclude.includes(lower))
        return false;
    // Include if it's capitalized in original or matches place patterns
    return /^[A-Z]/.test(name) || /ville|town|city|beach|park|mountain/i.test(name);
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function loadCuriosityProfile(userId, data) {
    // Hydrate dates
    const hydrated = {
        ...data,
        lastUpdated: new Date(data.lastUpdated),
        mentions: data.mentions.map((m) => ({
            ...m,
            mentionedAt: new Date(m.mentionedAt),
            followedUpAt: m.followedUpAt ? new Date(m.followedUpAt) : undefined,
            expectedDate: m.expectedDate ? new Date(m.expectedDate) : undefined,
        })),
    };
    profiles.set(userId, hydrated);
    log.debug({ userId, mentionCount: hydrated.mentions.length }, '🔍 Loaded curiosity profile');
}
export function getCuriosityProfileForPersistence(userId) {
    return profiles.get(userId) || null;
}
export function getAllUnfollowedMentions(userId) {
    const profile = profiles.get(userId);
    return profile?.mentions.filter((m) => !m.followedUpAt) || [];
}
export function getMentionsByType(userId, type) {
    const profile = profiles.get(userId);
    return profile?.mentions.filter((m) => m.type === type && !m.followedUpAt) || [];
}
/**
 * Clear all mentions for a user (for testing)
 */
export function clearUserMentions(userId) {
    profiles.delete(userId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordPassingMention,
    getFollowUpOpportunity,
    markFollowedUp,
    markAsFollowedUp: markFollowedUp, // Alias for consistency
    clearSessionState,
    detectPassingMentions,
    loadCuriosityProfile,
    getCuriosityProfileForPersistence,
    getAllUnfollowedMentions,
    getMentionsByType,
    clearUserMentions,
};
//# sourceMappingURL=curiosity-memory.js.map