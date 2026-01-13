/**
 * Conversation Texture - The "Feel" of Past Conversations
 *
 * "Our talks usually feel exploratory. Today felt heavier."
 *
 * Philosophy: Real friends remember not just what was said, but the
 * texture of conversations - were they playful? Heavy? Exploratory?
 * Fast-paced or contemplative? This creates a sense of shared history
 * and helps calibrate the current conversation.
 *
 * What we track:
 * - Conversation rhythm (rapid back-and-forth vs. long pauses)
 * - Emotional tone (playful, serious, vulnerable, analytical)
 * - Depth level (surface chat vs. deep exploration)
 * - Energy pattern (building, steady, winding down)
 * - Topics and how they were approached
 *
 * When to reference:
 * - When current conversation differs from usual pattern
 * - When returning to similar topics
 * - At session start for context
 *
 * @module services/trust-systems/conversation-texture
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ConversationTexture' });
// ============================================================================
// STORAGE
// ============================================================================
/** Profiles per user:persona */
const profiles = new Map();
/** Current session state per userId */
const sessionStates = new Map();
// ============================================================================
// SESSION TRACKING
// ============================================================================
/**
 * Start tracking texture for a new session
 */
export function startSessionTexture(userId, personaId, sessionId) {
    const state = {
        userId,
        personaId,
        sessionId,
        toneSignals: [],
        depthSignals: [],
        topics: new Set(),
        memorableMoments: [],
        turnCount: 0,
        startTime: new Date(),
        lastActivity: new Date(),
    };
    sessionStates.set(userId, state);
    log.debug({ userId, personaId, sessionId }, '🎨 Started tracking conversation texture');
}
/**
 * Record a tone signal from the current turn
 */
export function recordToneSignal(userId, tone, confidence = 0.7) {
    const state = sessionStates.get(userId);
    if (!state)
        return;
    state.toneSignals.push({
        tone,
        timestamp: new Date(),
        confidence,
    });
    state.lastActivity = new Date();
    state.turnCount++;
}
/**
 * Record depth level for the current turn
 */
export function recordDepthSignal(userId, depth) {
    const state = sessionStates.get(userId);
    if (!state)
        return;
    state.depthSignals.push({
        depth,
        timestamp: new Date(),
    });
}
/**
 * Record topics discussed
 */
export function recordTopics(userId, topics) {
    const state = sessionStates.get(userId);
    if (!state)
        return;
    for (const topic of topics) {
        state.topics.add(topic.toLowerCase());
    }
}
/**
 * Record a memorable moment
 */
export function recordMemorableMoment(userId, moment) {
    const state = sessionStates.get(userId);
    if (!state)
        return;
    state.memorableMoments.push(moment);
}
/**
 * Detect tone from user message content and emotion
 */
export function detectTone(params) {
    const { userText, emotion, isVulnerable, isBreakthrough, hasProblemSolving } = params;
    const lower = userText.toLowerCase();
    // Check for specific patterns
    if (isVulnerable || emotion === 'sadness' || emotion === 'fear') {
        return 'vulnerable';
    }
    if (isBreakthrough) {
        return 'reflective';
    }
    if (hasProblemSolving || /how (do|can|should) i/i.test(lower)) {
        return 'analytical';
    }
    // Check for playful indicators
    if (/haha|lol|😂|😄|joking|kidding|funny/i.test(lower) || emotion === 'joy') {
        return 'playful';
    }
    // Check for exploratory
    if (/wonder|curious|what if|i've been thinking/i.test(lower)) {
        return 'exploratory';
    }
    // Check for celebratory
    if (/excited|amazing|great news|can't believe|finally/i.test(lower)) {
        return 'celebratory';
    }
    // Check for serious
    if (/need to talk|something happened|concerned|worried/i.test(lower)) {
        return 'serious';
    }
    // Default to mixed
    return 'mixed';
}
/**
 * Detect depth level from message content
 */
export function detectDepth(params) {
    const { userText, isVulnerable, isPersonal, turnCount = 0 } = params;
    const lower = userText.toLowerCase();
    // Profound markers
    if (isVulnerable &&
        (lower.includes('never told anyone') ||
            lower.includes('first time') ||
            lower.includes('changed my life') ||
            lower.includes('realized'))) {
        return 'profound';
    }
    // Deep markers
    if (isVulnerable ||
        isPersonal ||
        /afraid|scared|love|hate|ashamed|proud|dream|fear|hope/i.test(lower)) {
        return 'deep';
    }
    // Moderate
    if (turnCount > 5 || /feel|think|believe|struggle|trying/i.test(lower)) {
        return 'moderate';
    }
    return 'surface';
}
// ============================================================================
// SNAPSHOT CREATION
// ============================================================================
/**
 * Finalize the session and create a texture snapshot
 */
export function finalizeSessionTexture(userId) {
    const state = sessionStates.get(userId);
    if (!state || state.turnCount < 2) {
        sessionStates.delete(userId);
        return null;
    }
    // Calculate primary tone
    const toneCounts = new Map();
    for (const signal of state.toneSignals) {
        const count = toneCounts.get(signal.tone) || 0;
        toneCounts.set(signal.tone, count + signal.confidence);
    }
    let primaryTone = 'mixed';
    let maxCount = 0;
    const secondaryTones = [];
    for (const [tone, count] of toneCounts) {
        if (count > maxCount) {
            if (primaryTone !== 'mixed') {
                secondaryTones.push(primaryTone);
            }
            primaryTone = tone;
            maxCount = count;
        }
        else if (count > maxCount * 0.5) {
            secondaryTones.push(tone);
        }
    }
    // Calculate depth (max depth reached)
    const depthOrder = ['surface', 'moderate', 'deep', 'profound'];
    let maxDepth = 'surface';
    for (const signal of state.depthSignals) {
        if (depthOrder.indexOf(signal.depth) > depthOrder.indexOf(maxDepth)) {
            maxDepth = signal.depth;
        }
    }
    // Calculate rhythm based on timing
    const durationMinutes = (state.lastActivity.getTime() - state.startTime.getTime()) / 60000;
    const turnsPerMinute = state.turnCount / Math.max(durationMinutes, 1);
    let rhythm;
    if (turnsPerMinute > 3) {
        rhythm = 'rapid';
    }
    else if (turnsPerMinute > 1.5) {
        rhythm = 'flowing';
    }
    else if (turnsPerMinute > 0.5) {
        rhythm = 'contemplative';
    }
    else {
        rhythm = 'variable';
    }
    // Calculate energy pattern (simplified - based on depth progression)
    const depthValues = state.depthSignals.map((s) => depthOrder.indexOf(s.depth));
    const firstHalf = depthValues.slice(0, Math.floor(depthValues.length / 2));
    const secondHalf = depthValues.slice(Math.floor(depthValues.length / 2));
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
    let energy;
    if (secondAvg > firstAvg + 0.5) {
        energy = 'building';
    }
    else if (firstAvg > secondAvg + 0.5) {
        energy = 'winding_down';
    }
    else if (Math.abs(firstAvg - secondAvg) < 0.3) {
        energy = 'steady';
    }
    else {
        energy = 'peaks_and_valleys';
    }
    // Create snapshot
    const snapshot = {
        id: `texture_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: state.userId,
        personaId: state.personaId,
        sessionId: state.sessionId,
        primaryTone,
        secondaryTones: secondaryTones.length > 0 ? secondaryTones : undefined,
        depth: maxDepth,
        rhythm,
        energy,
        topics: Array.from(state.topics),
        turnCount: state.turnCount,
        durationMinutes: Math.round(durationMinutes),
        createdAt: new Date(),
        memorableMoments: state.memorableMoments.length > 0 ? state.memorableMoments : undefined,
    };
    // Update profile
    const key = `${state.userId}:${state.personaId}`;
    let profile = profiles.get(key);
    if (!profile) {
        profile = {
            userId: state.userId,
            personaId: state.personaId,
            snapshots: [],
            patterns: {
                usualTone: primaryTone,
                usualDepth: maxDepth,
                usualRhythm: rhythm,
                frequentTopics: [],
                conversationCount: 0,
            },
            lastUpdated: new Date(),
        };
        profiles.set(key, profile);
    }
    // Add snapshot (keep last 50)
    profile.snapshots.push(snapshot);
    if (profile.snapshots.length > 50) {
        profile.snapshots = profile.snapshots.slice(-50);
    }
    // Update patterns
    updatePatterns(profile);
    // Cleanup session state
    sessionStates.delete(userId);
    log.info({
        userId: state.userId,
        personaId: state.personaId,
        tone: primaryTone,
        depth: maxDepth,
        rhythm,
        turnCount: state.turnCount,
    }, '🎨 Conversation texture recorded');
    return snapshot;
}
/**
 * Update computed patterns from snapshots
 */
function updatePatterns(profile) {
    if (profile.snapshots.length === 0)
        return;
    // Count tones
    const toneCounts = new Map();
    const depthCounts = new Map();
    const rhythmCounts = new Map();
    const topicCounts = new Map();
    for (const snapshot of profile.snapshots) {
        toneCounts.set(snapshot.primaryTone, (toneCounts.get(snapshot.primaryTone) || 0) + 1);
        depthCounts.set(snapshot.depth, (depthCounts.get(snapshot.depth) || 0) + 1);
        rhythmCounts.set(snapshot.rhythm, (rhythmCounts.get(snapshot.rhythm) || 0) + 1);
        for (const topic of snapshot.topics) {
            topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
    }
    // Find most common
    profile.patterns.usualTone = getMostCommon(toneCounts) || 'mixed';
    profile.patterns.usualDepth = getMostCommon(depthCounts) || 'moderate';
    profile.patterns.usualRhythm = getMostCommon(rhythmCounts) || 'flowing';
    profile.patterns.conversationCount = profile.snapshots.length;
    // Top 10 frequent topics
    const sortedTopics = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic]) => topic);
    profile.patterns.frequentTopics = sortedTopics;
    profile.lastUpdated = new Date();
}
function getMostCommon(counts) {
    let maxKey;
    let maxCount = 0;
    for (const [key, count] of counts) {
        if (count > maxCount) {
            maxKey = key;
            maxCount = count;
        }
    }
    return maxKey;
}
/**
 * Compare current session to usual patterns
 */
export function compareToUsual(userId, personaId, currentTone, currentDepth) {
    const key = `${userId}:${personaId}`;
    const profile = profiles.get(key);
    if (!profile || profile.patterns.conversationCount < 3) {
        return { isDifferent: false, differences: [], shouldMention: false };
    }
    const differences = [];
    const phrases = [];
    // Compare tone
    if (currentTone && currentTone !== profile.patterns.usualTone && currentTone !== 'mixed') {
        differences.push(`tone is ${currentTone} instead of usual ${profile.patterns.usualTone}`);
        if (currentTone === 'vulnerable' && profile.patterns.usualTone !== 'vulnerable') {
            phrases.push("This feels different from our usual conversations. I'm glad you're sharing this with me.");
        }
        else if (currentTone === 'playful' && profile.patterns.usualTone === 'serious') {
            phrases.push("I love this lighter energy. It's nice.");
        }
        else if (currentTone === 'serious' && profile.patterns.usualTone === 'playful') {
            phrases.push('I can tell this matters to you.');
        }
    }
    // Compare depth
    if (currentDepth && currentDepth !== profile.patterns.usualDepth) {
        const depthOrder = ['surface', 'moderate', 'deep', 'profound'];
        const currentIndex = depthOrder.indexOf(currentDepth);
        const usualIndex = depthOrder.indexOf(profile.patterns.usualDepth);
        if (currentIndex > usualIndex) {
            differences.push(`going deeper than usual`);
            if (currentDepth === 'deep' || currentDepth === 'profound') {
                phrases.push('Thank you for trusting me with this. It means a lot.');
            }
        }
        else if (currentIndex < usualIndex - 1) {
            differences.push(`staying lighter than usual`);
        }
    }
    const isDifferent = differences.length > 0;
    const shouldMention = isDifferent && phrases.length > 0 && Math.random() < 0.3; // 30% chance
    return {
        isDifferent,
        differences,
        phrase: phrases[0],
        shouldMention,
    };
}
/**
 * Get a summary of usual conversation texture with a persona
 */
export function getUsualTextureSummary(userId, personaId) {
    const key = `${userId}:${personaId}`;
    const profile = profiles.get(key);
    if (!profile || profile.patterns.conversationCount < 5) {
        return null;
    }
    const { usualTone, usualDepth, usualRhythm, frequentTopics, conversationCount } = profile.patterns;
    const toneDescriptions = {
        playful: 'light and playful',
        serious: 'thoughtful and serious',
        vulnerable: 'open and vulnerable',
        analytical: 'problem-solving focused',
        exploratory: 'curious and exploratory',
        supportive: 'supportive and comforting',
        celebratory: 'celebratory',
        reflective: 'reflective',
        mixed: 'varied',
    };
    const depthDescriptions = {
        surface: 'stay fairly surface-level',
        moderate: 'go to meaningful depth',
        deep: 'often go deep',
        profound: 'reach profound depths',
    };
    const rhythmDescriptions = {
        rapid: 'quick back-and-forth',
        flowing: 'easy, natural flow',
        contemplative: 'thoughtful pauses',
        variable: 'varied rhythm',
    };
    const topicsStr = frequentTopics.length > 0 ? ` We often explore ${frequentTopics.slice(0, 3).join(', ')}.` : '';
    return (`Over ${conversationCount} conversations, we've developed a ${toneDescriptions[usualTone]} dynamic. ` +
        `Our talks tend to ${depthDescriptions[usualDepth]} with a ${rhythmDescriptions[usualRhythm]}.${topicsStr}`);
}
/**
 * Get the most recent conversation summary for context
 */
export function getRecentTextureSummary(userId, personaId) {
    const key = `${userId}:${personaId}`;
    const profile = profiles.get(key);
    if (!profile || profile.snapshots.length === 0) {
        return null;
    }
    const recent = profile.snapshots[profile.snapshots.length - 1];
    const daysAgo = Math.floor((Date.now() - recent.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo > 30)
        return null;
    const toneWord = recent.primaryTone === 'mixed' ? 'varied' : recent.primaryTone;
    const timeRef = daysAgo === 0 ? 'earlier' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
    return (`Last time (${timeRef}), our conversation was ${toneWord}. ` +
        `We talked about ${recent.topics.slice(0, 2).join(' and ') || 'various things'}.`);
}
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Load texture profile from persistence
 */
export function loadTextureProfile(userId, personaId, data) {
    const key = `${userId}:${personaId}`;
    // Hydrate dates
    const hydrated = {
        ...data,
        lastUpdated: new Date(data.lastUpdated),
        snapshots: data.snapshots.map((s) => ({
            ...s,
            createdAt: new Date(s.createdAt),
        })),
    };
    profiles.set(key, hydrated);
    log.debug({ userId, personaId, snapshotCount: hydrated.snapshots.length }, '🎨 Loaded texture profile');
}
/**
 * Get texture profile for persistence
 */
export function getTextureProfileForPersistence(userId, personaId) {
    return profiles.get(`${userId}:${personaId}`) || null;
}
/**
 * Clear texture data for a user (for testing)
 */
export function clearUserTexture(userId, personaId) {
    profiles.delete(`${userId}:${personaId}`);
    sessionStates.delete(userId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    startSessionTexture,
    recordToneSignal,
    recordDepthSignal,
    recordTopics,
    recordMemorableMoment,
    detectTone,
    detectDepth,
    finalizeSessionTexture,
    compareToUsual,
    getUsualTextureSummary,
    getRecentTextureSummary,
    loadTextureProfile,
    getTextureProfileForPersistence,
    clearUserTexture,
};
//# sourceMappingURL=conversation-texture.js.map