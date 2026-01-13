/**
 * Meta-Conversation Context Builder
 *
 * Enables the agent to reflect on the conversation itself:
 * - "I noticed you've been quieter today than usual"
 * - "We keep coming back to this topic—it seems important to you"
 * - "You seem more energized today"
 *
 * This creates a layer of conversational awareness that makes
 * the agent feel more present and observant.
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { registerContextBuilder, createHintInjection, } from '../index.js';
const log = createLogger({ module: 'MetaConversation' });
// ============================================================================
// PATTERN DETECTION
// ============================================================================
/**
 * Detect if user is quieter than their historical average
 */
function detectQuieterThanUsual(currentTurnCount, avgWordsThisSession, profile) {
    if (!profile || currentTurnCount < 4)
        return null;
    // Get historical speaking pattern
    const historicalAvgWPM = profile.averageWPM || 0;
    const historicalPace = profile.speakingPace;
    // If we don't have history, skip
    if (!historicalAvgWPM && !historicalPace)
        return null;
    // Estimate if user is speaking less than usual
    // Low threshold: less than 60% of their usual verbosity
    const expectedWords = historicalPace === 'fast' ? 50 : historicalPace === 'slow' ? 20 : 35;
    if (avgWordsThisSession < expectedWords * 0.6 && avgWordsThisSession > 0) {
        const reflections = [
            'You seem a bit quieter today than usual. Everything okay?',
            "I've noticed you're being more brief today. No pressure—just checking in.",
            "You seem more reserved today. I'm here if you want to talk, or we can just keep it light.",
        ];
        return {
            type: 'verbosity_change',
            observation: `User averaging ${Math.round(avgWordsThisSession)} words vs expected ${expectedWords}`,
            reflection: reflections[Math.floor(Math.random() * reflections.length)],
            confidence: 0.7,
        };
    }
    return null;
}
/**
 * Detect if user is more energized than usual
 */
function detectEnergyChange(currentEnergy, profile) {
    if (!profile || !currentEnergy)
        return null;
    const historicalEnergy = profile.currentEnergyLevel;
    if (!historicalEnergy)
        return null;
    // User more energized than usual
    if (currentEnergy === 'high' && historicalEnergy === 'low') {
        return {
            type: 'energy_change',
            observation: 'User energy significantly higher than historical pattern',
            reflection: 'You seem more energized today! Something good happening?',
            confidence: 0.75,
        };
    }
    // User less energized than usual
    if (currentEnergy === 'low' && historicalEnergy === 'high') {
        return {
            type: 'energy_change',
            observation: 'User energy significantly lower than historical pattern',
            reflection: 'You seem a bit low energy today. How are you really doing?',
            confidence: 0.7,
        };
    }
    return null;
}
/**
 * Detect recurring topic across sessions
 */
function detectTopicRepetition(currentTopics, profile) {
    if (!profile)
        return null;
    // Check conversation summaries for recurring topics
    const historicalTopics = new Map();
    for (const summary of profile.conversationSummaries || []) {
        for (const topic of summary.mainTopics || []) {
            const normalized = topic.toLowerCase();
            historicalTopics.set(normalized, (historicalTopics.get(normalized) || 0) + 1);
        }
    }
    // Find topics that appear frequently historically AND in current conversation
    for (const currentTopic of currentTopics) {
        const normalized = currentTopic.toLowerCase();
        const historicalCount = historicalTopics.get(normalized) || 0;
        if (historicalCount >= 3) {
            const reflections = [
                `We keep coming back to ${currentTopic}. It seems like this is really important to you.`,
                `I've noticed ${currentTopic} comes up a lot in our conversations. Want to dig deeper into it?`,
                `${currentTopic} is clearly on your mind—it's come up in several of our talks. What's at the heart of it for you?`,
            ];
            return {
                type: 'topic_repetition',
                observation: `Topic "${currentTopic}" mentioned ${historicalCount} times across sessions`,
                reflection: reflections[Math.floor(Math.random() * reflections.length)],
                confidence: 0.8,
            };
        }
    }
    return null;
}
/**
 * Detect if user is opening up more (sharing vulnerability)
 */
function detectOpeningUp(emotionalIntensity, currentEmotion, profile) {
    if (!profile)
        return null;
    // Check if this is higher emotional intensity than typical
    const emotionalPatterns = profile.emotionalPatterns || [];
    if (emotionalPatterns.length < 3)
        return null;
    const avgHistoricalIntensity = emotionalPatterns.reduce((sum, p) => sum + (p.intensity || 0), 0) / emotionalPatterns.length;
    // User sharing more deeply than usual
    if (emotionalIntensity > avgHistoricalIntensity + 0.2 && emotionalIntensity > 0.5) {
        return {
            type: 'opening_up',
            observation: `Emotional intensity ${emotionalIntensity.toFixed(2)} vs historical avg ${avgHistoricalIntensity.toFixed(2)}`,
            reflection: "Thank you for sharing that with me. I can tell this is something you don't talk about lightly.",
            confidence: 0.75,
        };
    }
    return null;
}
/**
 * Detect emotional shift within session
 */
function detectEmotionalShift(currentEmotion, emotionalHistory) {
    if (emotionalHistory.length < 3)
        return null;
    // Check if emotion shifted significantly
    const recentEmotions = emotionalHistory.slice(-3);
    const valenceMap = {
        happy: 1,
        excited: 1,
        hopeful: 0.7,
        neutral: 0,
        anxious: -0.5,
        sad: -0.8,
        frustrated: -0.6,
        angry: -0.8,
    };
    const startValence = valenceMap[recentEmotions[0]?.emotion] ?? 0;
    const endValence = valenceMap[currentEmotion] ?? 0;
    const shift = endValence - startValence;
    // Positive shift
    if (shift > 0.5) {
        return {
            type: 'emotional_shift',
            observation: `Emotional valence shifted from ${startValence.toFixed(1)} to ${endValence.toFixed(1)}`,
            reflection: "You seem lighter now than when we started. I'm glad.",
            confidence: 0.7,
        };
    }
    // Negative shift
    if (shift < -0.5) {
        return {
            type: 'emotional_shift',
            observation: `Emotional valence dropped from ${startValence.toFixed(1)} to ${endValence.toFixed(1)}`,
            reflection: "Something shifted just now. Do you want to talk about what's coming up?",
            confidence: 0.7,
        };
    }
    return null;
}
// ============================================================================
// META-CONVERSATION CONTEXT BUILDER
// ============================================================================
// Track emotional history within session (module-level for session persistence)
const sessionEmotionalHistory = [];
let lastMetaReflectionTurn = 0;
/**
 * Build meta-conversation context injections
 */
const metaConversationBuilder = {
    name: 'meta-conversation',
    description: 'Reflects on conversation patterns and user behavior changes',
    priority: 75, // Late in the chain, after memory and emotion
    build: async (input) => {
        const { analysis, userData, userProfile, userText } = input;
        const injections = [];
        const turnCount = userData.turnCount || 0;
        // Track emotional history
        if (analysis.emotion.primary) {
            sessionEmotionalHistory.push({
                emotion: analysis.emotion.primary,
                turn: turnCount,
            });
            // Keep only last 10 turns
            if (sessionEmotionalHistory.length > 10) {
                sessionEmotionalHistory.shift();
            }
        }
        // Don't inject too frequently (minimum 6 turns between meta-reflections)
        if (turnCount - lastMetaReflectionTurn < 6) {
            return injections;
        }
        // Don't inject in early conversation (wait until turn 5+)
        if (turnCount < 5) {
            return injections;
        }
        // Calculate session metrics
        const avgWordCount = userText.split(/\s+/).length; // Simple word count
        const currentEnergy = analysis.emotion.intensity && analysis.emotion.intensity > 0.6
            ? 'high'
            : analysis.emotion.intensity && analysis.emotion.intensity < 0.3
                ? 'low'
                : 'medium';
        // Detect patterns
        const patterns = [];
        // 1. Quieter than usual
        const quieterPattern = detectQuieterThanUsual(turnCount, avgWordCount, userProfile);
        if (quieterPattern)
            patterns.push(quieterPattern);
        // 2. Energy change
        const energyPattern = detectEnergyChange(currentEnergy, userProfile);
        if (energyPattern)
            patterns.push(energyPattern);
        // 3. Topic repetition across sessions
        const topicPattern = detectTopicRepetition(analysis.topics.detected, userProfile);
        if (topicPattern)
            patterns.push(topicPattern);
        // 4. Opening up
        const openingPattern = detectOpeningUp(analysis.emotion.intensity || 0, analysis.emotion.primary, userProfile);
        if (openingPattern)
            patterns.push(openingPattern);
        // 5. Emotional shift within session
        const emotionalShiftPattern = detectEmotionalShift(analysis.emotion.primary, sessionEmotionalHistory);
        if (emotionalShiftPattern)
            patterns.push(emotionalShiftPattern);
        // Select highest confidence pattern
        if (patterns.length > 0) {
            patterns.sort((a, b) => b.confidence - a.confidence);
            const selectedPattern = patterns[0];
            // Only inject if confidence is high enough and random chance (40%)
            if (selectedPattern.confidence > 0.65 && Math.random() < 0.4) {
                injections.push(createHintInjection('meta_conversation', `[META-AWARENESS: ${selectedPattern.observation}. Consider naturally saying: "${selectedPattern.reflection}"]`));
                lastMetaReflectionTurn = turnCount;
                log.debug({
                    pattern: selectedPattern.type,
                    confidence: selectedPattern.confidence,
                }, 'Meta-conversation reflection triggered');
            }
        }
        return injections;
    },
};
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder(metaConversationBuilder);
export { metaConversationBuilder, detectTopicRepetition, detectEmotionalShift };
//# sourceMappingURL=meta-conversation.js.map