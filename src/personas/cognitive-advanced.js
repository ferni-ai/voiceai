/**
 * Advanced Cognitive Intelligence System
 *
 * Extends the base cognitive system with:
 * - User cognitive style detection
 * - Cognitive handoff transfer
 * - Multi-step reasoning chains
 * - Cognitive conflict resolution
 * - Cognitive learning and growth
 * - Knowledge state persistence
 */
import { createHash } from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import { getCognitiveProfile } from './cognitive-profiles.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
const log = getLogger();
const COGNITIVE_CACHE_CONFIG = {
    /** Maximum entries */
    maxEntries: 200,
    /** TTL in milliseconds (1 hour) */
    ttlMs: 60 * 60 * 1000,
    /** Minimum message count change to invalidate */
    messageCountThreshold: 3,
};
const cognitiveStyleCache = new Map();
const cognitiveCacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
};
/**
 * Generate cache key from messages
 */
function generateCognitiveStyleCacheKey(messages) {
    // Use first and last message plus count for key
    const keyData = {
        first: messages[0]?.slice(0, 50) || '',
        last: messages[messages.length - 1]?.slice(0, 50) || '',
        count: messages.length,
    };
    return createHash('md5').update(JSON.stringify(keyData)).digest('hex').slice(0, 16);
}
/**
 * Get cached cognitive style if valid
 */
function getCachedCognitiveStyle(messages, cacheKey) {
    const entry = cognitiveStyleCache.get(cacheKey);
    if (!entry) {
        cognitiveCacheStats.misses++;
        return null;
    }
    // Check TTL
    if (Date.now() - entry.createdAt > COGNITIVE_CACHE_CONFIG.ttlMs) {
        cognitiveStyleCache.delete(cacheKey);
        cognitiveCacheStats.misses++;
        return null;
    }
    // Check if message count changed significantly
    if (Math.abs(messages.length - entry.messageCount) >= COGNITIVE_CACHE_CONFIG.messageCountThreshold) {
        cognitiveStyleCache.delete(cacheKey);
        cognitiveCacheStats.misses++;
        return null;
    }
    cognitiveCacheStats.hits++;
    log.debug({ cacheKey, confidence: entry.result.confidence }, 'Cognitive style cache hit');
    return entry.result;
}
/**
 * Cache cognitive style result
 */
function cacheCognitiveStyle(cacheKey, result, messageCount) {
    // Evict LRU if at capacity
    if (cognitiveStyleCache.size >= COGNITIVE_CACHE_CONFIG.maxEntries) {
        const firstKey = cognitiveStyleCache.keys().next().value;
        if (firstKey) {
            cognitiveStyleCache.delete(firstKey);
            cognitiveCacheStats.evictions++;
        }
    }
    cognitiveStyleCache.set(cacheKey, {
        result,
        createdAt: Date.now(),
        messageCount,
    });
}
/**
 * Get cognitive style cache statistics
 */
export function getCognitiveStyleCacheStats() {
    const total = cognitiveCacheStats.hits + cognitiveCacheStats.misses;
    return {
        size: cognitiveStyleCache.size,
        hits: cognitiveCacheStats.hits,
        misses: cognitiveCacheStats.misses,
        evictions: cognitiveCacheStats.evictions,
        hitRate: total > 0 ? cognitiveCacheStats.hits / total : 0,
    };
}
/**
 * Clear cognitive style cache (for testing)
 */
export function clearCognitiveStyleCache() {
    cognitiveStyleCache.clear();
    cognitiveCacheStats.hits = 0;
    cognitiveCacheStats.misses = 0;
    cognitiveCacheStats.evictions = 0;
}
/**
 * Detect user's cognitive style from their messages
 */
export function detectUserCognitiveStyle(messages) {
    if (messages.length < 2) {
        return {
            primary: 'unknown',
            confidence: 0,
            signals: {
                analyticalScore: 0,
                emotionalScore: 0,
                practicalScore: 0,
                narrativeScore: 0,
                systematicScore: 0,
                intuitiveScore: 0,
                totalSignals: 0,
            },
        };
    }
    // Check cache first
    const cacheKey = generateCognitiveStyleCacheKey(messages);
    const cached = getCachedCognitiveStyle(messages, cacheKey);
    if (cached) {
        return cached;
    }
    const allText = messages.join(' ').toLowerCase();
    const signals = {
        analyticalScore: 0,
        emotionalScore: 0,
        practicalScore: 0,
        narrativeScore: 0,
        systematicScore: 0,
        intuitiveScore: 0,
        totalSignals: 0,
    };
    // Analytical signals
    const analyticalPatterns = [
        /\b(data|numbers|statistics|percent|evidence|research|study|analysis)\b/gi,
        /\b(compared to|versus|ratio|rate|average|trend)\b/gi,
        /\b(prove|evidence|logical|reason|calculate|measure)\b/gi,
        /\b(how much|how many|what percentage|specifically)\b/gi,
    ];
    // Emotional signals
    const emotionalPatterns = [
        /\b(feel|feeling|felt|feelings|emotion|emotional)\b/gi,
        /\b(worried|scared|anxious|excited|happy|sad|frustrated|overwhelmed)\b/gi,
        /\b(heart|gut|instinct|sense|vibe)\b/gi,
        /\b(love|hate|fear|hope|afraid|joy)\b/gi,
    ];
    // Practical signals
    const practicalPatterns = [
        /\b(what should i|what do i|how do i|steps|action|do|doing)\b/gi,
        /\b(practical|concrete|specific|exactly|actually)\b/gi,
        /\b(result|outcome|goal|achieve|accomplish|done)\b/gi,
        /\b(next|then|after that|first|finally)\b/gi,
    ];
    // Narrative signals
    const narrativePatterns = [
        /\b(story|happened|remember when|back when|one time)\b/gi,
        /\b(why|meaning|purpose|matters|important because)\b/gi,
        /\b(like|as if|metaphor|imagine|picture)\b/gi,
        /\b(journey|path|chapter|life|experience)\b/gi,
    ];
    // Systematic signals
    const systematicPatterns = [
        /\b(step by step|process|system|order|organize|structure)\b/gi,
        /\b(first|second|third|next|then|finally|after)\b/gi,
        /\b(list|checklist|plan|schedule|timeline)\b/gi,
        /\b(method|approach|framework|procedure)\b/gi,
    ];
    // Intuitive signals
    const intuitivePatterns = [
        /\b(sense|feel like|seems|might|maybe|perhaps|could be)\b/gi,
        /\b(big picture|overall|general|whole|connected)\b/gi,
        /\b(intuition|hunch|gut feeling|instinct)\b/gi,
        /\b(wonder|curious|what if|imagine)\b/gi,
    ];
    // Count matches
    for (const pattern of analyticalPatterns) {
        signals.analyticalScore += (allText.match(pattern) || []).length;
    }
    for (const pattern of emotionalPatterns) {
        signals.emotionalScore += (allText.match(pattern) || []).length;
    }
    for (const pattern of practicalPatterns) {
        signals.practicalScore += (allText.match(pattern) || []).length;
    }
    for (const pattern of narrativePatterns) {
        signals.narrativeScore += (allText.match(pattern) || []).length;
    }
    for (const pattern of systematicPatterns) {
        signals.systematicScore += (allText.match(pattern) || []).length;
    }
    for (const pattern of intuitivePatterns) {
        signals.intuitiveScore += (allText.match(pattern) || []).length;
    }
    signals.totalSignals =
        signals.analyticalScore +
            signals.emotionalScore +
            signals.practicalScore +
            signals.narrativeScore +
            signals.systematicScore +
            signals.intuitiveScore;
    // Find primary and secondary
    const scores = [
        ['analytical', signals.analyticalScore],
        ['emotional', signals.emotionalScore],
        ['practical', signals.practicalScore],
        ['narrative', signals.narrativeScore],
        ['systematic', signals.systematicScore],
        ['intuitive', signals.intuitiveScore],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    const primary = scores[0][1] > 0 ? scores[0][0] : 'unknown';
    const secondary = scores[1][1] > 0 && scores[1][1] >= scores[0][1] * 0.5 ? scores[1][0] : undefined;
    // Calculate confidence
    const confidence = signals.totalSignals > 0
        ? Math.min(1.0, scores[0][1] / Math.max(1, signals.totalSignals) + messages.length * 0.05)
        : 0;
    const result = { primary, secondary, confidence, signals };
    // Cache the result
    cacheCognitiveStyle(cacheKey, result, messages.length);
    return result;
}
/**
 * Build cognitive handoff context from previous persona's session
 */
export function buildCognitiveHandoffContext(previousPersonaId, targetPersonaId, sessionData) {
    const previousProfile = getCognitiveProfile(previousPersonaId);
    const targetProfile = getCognitiveProfile(targetPersonaId);
    // Detect user's cognitive style
    const userStyle = detectUserCognitiveStyle(sessionData.userMessages);
    // What did previous persona naturally notice?
    const noticed = [];
    if (previousProfile) {
        for (const focus of previousProfile.attention.primaryFocus) {
            if (sessionData.topics.some((t) => topicMatchesFocus(t, focus))) {
                noticed.push(focusToNotice(focus, sessionData.topics));
            }
        }
    }
    // What might previous persona have missed?
    const potentialBlindSpots = previousProfile?.attention.blindSpots || [];
    // Build natural language handoff note
    const handoffNote = buildHandoffNote(previousPersonaId, targetPersonaId, previousProfile, targetProfile, userStyle.primary, noticed, potentialBlindSpots);
    // Suggest approach for target persona
    let suggestedApproach;
    if (targetProfile && userStyle.primary !== 'unknown') {
        suggestedApproach = buildApproachSuggestion(targetProfile, userStyle.primary, potentialBlindSpots);
    }
    return {
        noticed,
        potentialBlindSpots,
        userCognitiveStyle: userStyle.primary,
        effectiveApproaches: sessionData.reasoningApproaches,
        userExpertiseTopics: sessionData.userExpertiseTopics || [],
        needsMoreExplanation: sessionData.needsExplanation || [],
        suggestedApproach,
        handoffNote,
    };
}
function topicMatchesFocus(topic, focus) {
    const focusKeywords = {
        emotions: ['feel', 'emotion', 'stress', 'worry', 'happy', 'sad'],
        patterns: ['pattern', 'trend', 'data', 'numbers', 'recurring'],
        relationships: ['family', 'friend', 'partner', 'spouse', 'parent', 'child'],
        systems: ['process', 'system', 'workflow', 'organization'],
        meaning: ['why', 'purpose', 'meaning', 'important', 'matters'],
        actions: ['do', 'action', 'step', 'plan', 'next'],
        possibilities: ['could', 'option', 'alternative', 'what if'],
        history: ['past', 'before', 'history', 'background'],
        details: ['specific', 'exactly', 'detail', 'number'],
        big_picture: ['overall', 'big picture', 'general', 'strategy'],
        risks: ['risk', 'danger', 'problem', 'issue', 'concern'],
        opportunities: ['opportunity', 'chance', 'potential', 'upside'],
    };
    const keywords = focusKeywords[focus] || [];
    return keywords.some((kw) => topic.toLowerCase().includes(kw));
}
function focusToNotice(focus, topics) {
    const focusDescriptions = {
        emotions: 'emotional undertones in the conversation',
        patterns: 'patterns in the data they shared',
        relationships: 'relationship dynamics at play',
        systems: 'the systematic aspects',
        meaning: 'the deeper meaning behind their questions',
        actions: 'action items and next steps',
        possibilities: 'potential alternatives',
        history: 'historical context',
        details: 'specific details and numbers',
        big_picture: 'the overall strategy',
        risks: 'potential risks',
        opportunities: 'opportunities to explore',
    };
    return focusDescriptions[focus];
}
function buildHandoffNote(previousId, targetId, previousProfile, targetProfile, userStyle, noticed, blindSpots) {
    const notes = [];
    // What previous persona noticed
    if (noticed.length > 0) {
        notes.push(`I noticed ${noticed.slice(0, 2).join(' and ')}.`);
    }
    // What target might want to check
    if (blindSpots.length > 0 && targetProfile) {
        const targetStrengths = targetProfile.attention.primaryFocus;
        const overlap = blindSpots.filter((bs) => targetStrengths.includes(bs));
        if (overlap.length > 0) {
            notes.push(`You might want to check on ${focusToNotice(overlap[0], [])} - that's not my strong suit.`);
        }
    }
    // User's style hint
    if (userStyle !== 'unknown') {
        const styleHints = {
            analytical: "They're pretty analytical - likes data and evidence.",
            emotional: 'They lead with feelings - emotional connection matters.',
            practical: "They're action-oriented - wants concrete next steps.",
            narrative: 'They think in stories - metaphors and meaning resonate.',
            systematic: 'They like structure - step-by-step works well.',
            intuitive: "They're intuitive - comfortable with big picture, less detail.",
            unknown: '',
        };
        if (styleHints[userStyle]) {
            notes.push(styleHints[userStyle]);
        }
    }
    return notes.join(' ');
}
function buildApproachSuggestion(targetProfile, userStyle, previousBlindSpots) {
    // Match or complement user style
    const complementary = {
        analytical: 'analytical',
        emotional: 'empathetic',
        practical: 'pragmatic',
        narrative: 'narrative',
        systematic: 'systematic',
        intuitive: 'intuitive',
        unknown: targetProfile.reasoningStyle,
    };
    const suggestedStyle = complementary[userStyle];
    // Check if target can do this style
    if (suggestedStyle === targetProfile.reasoningStyle ||
        suggestedStyle === targetProfile.secondaryReasoning) {
        return `Your ${suggestedStyle} approach should work well with this user.`;
    }
    // If not natural fit, suggest adaptation
    return `User responds to ${suggestedStyle} thinking. You might lean on that aspect more than usual.`;
}
/**
 * Build a multi-step reasoning chain for complex situations
 */
export function buildReasoningChain(personaProfile, context) {
    // Only build chains for complex or ambiguous situations
    if (context.complexity === 'simple') {
        return null;
    }
    const steps = [];
    const primaryStyle = personaProfile.reasoningStyle;
    const secondaryStyle = personaProfile.secondaryReasoning;
    // High emotional weight → start with empathy
    if (context.emotionalWeight > 0.6 && primaryStyle !== 'empathetic') {
        steps.push({
            step: 1,
            approach: 'empathetic',
            purpose: 'Acknowledge feelings first',
            duration: 'brief',
            showReasoning: false,
        });
    }
    // User needs support → empathy throughout
    if (context.userNeed === 'support') {
        steps.push({
            step: steps.length + 1,
            approach: 'empathetic',
            purpose: 'Provide emotional support',
            duration: 'moderate',
            showReasoning: false,
        });
        // Then offer perspective with primary style
        if (primaryStyle !== 'empathetic') {
            steps.push({
                step: steps.length + 1,
                approach: primaryStyle,
                purpose: 'Offer perspective through your natural lens',
                duration: 'brief',
                showReasoning: true,
            });
        }
    }
    // User needs decision → analysis then action
    if (context.userNeed === 'decision') {
        // Analytical step
        steps.push({
            step: steps.length + 1,
            approach: primaryStyle === 'analytical' ? 'analytical' : secondaryStyle || 'analytical',
            purpose: 'Analyze the options',
            duration: 'moderate',
            showReasoning: true,
        });
        // Pragmatic step
        steps.push({
            step: steps.length + 1,
            approach: 'pragmatic',
            purpose: 'Focus on actionable outcomes',
            duration: 'brief',
            showReasoning: false,
        });
    }
    // User needs exploration → narrative then possibilities
    if (context.userNeed === 'exploration') {
        steps.push({
            step: steps.length + 1,
            approach: 'narrative',
            purpose: 'Explore the story and meaning',
            duration: 'extended',
            showReasoning: true,
        });
        steps.push({
            step: steps.length + 1,
            approach: 'intuitive',
            purpose: 'Open up possibilities',
            duration: 'moderate',
            showReasoning: true,
        });
    }
    // User needs information → analytical then clear
    if (context.userNeed === 'information') {
        steps.push({
            step: steps.length + 1,
            approach: 'analytical',
            purpose: 'Present the facts clearly',
            duration: 'moderate',
            showReasoning: personaProfile.informationProcessing.deliberationLevel > 0.6,
        });
        steps.push({
            step: steps.length + 1,
            approach: 'systematic',
            purpose: 'Structure the information',
            duration: 'brief',
            showReasoning: false,
        });
    }
    // Ensure at least 2 steps for chains
    if (steps.length < 2) {
        return null;
    }
    return {
        id: `chain_${Date.now()}`,
        steps,
        totalSteps: steps.length,
        currentStep: 1,
        context: context.topic,
    };
}
/**
 * Get the current step's guidance from a reasoning chain
 */
export function getReasoningChainGuidance(chain) {
    if (chain.currentStep > chain.totalSteps) {
        return '';
    }
    const step = chain.steps[chain.currentStep - 1];
    const isLast = chain.currentStep === chain.totalSteps;
    let guidance = `[REASONING STEP ${chain.currentStep}/${chain.totalSteps}]\n`;
    guidance += `Approach: ${step.approach.toUpperCase()}\n`;
    guidance += `Purpose: ${step.purpose}\n`;
    guidance += `Duration: Keep this ${step.duration}\n`;
    if (step.showReasoning) {
        guidance += `Show your thinking process.\n`;
    }
    if (!isLast) {
        const nextStep = chain.steps[chain.currentStep];
        guidance += `Next: Will shift to ${nextStep.approach} approach.\n`;
    }
    return guidance;
}
/**
 * Detect and resolve cognitive style conflicts
 */
export function detectCognitiveConflict(personaProfile, context) {
    const personaStyle = personaProfile.reasoningStyle;
    // Detect user need
    let userNeed = 'validation';
    if (context.requestType === 'venting' || context.emotionalIntensity > 0.7) {
        userNeed = 'emotional_support';
    }
    else if (context.requestType === 'seeking_advice') {
        userNeed = 'practical_action';
    }
    else if (context.userCognitiveStyle === 'analytical') {
        userNeed = 'deep_analysis';
    }
    else if (context.requestType === 'sharing' || context.userCognitiveStyle === 'narrative') {
        userNeed = 'exploration';
    }
    // Check for conflict
    const conflicts = [
        { need: 'emotional_support', style: 'analytical', severity: 'significant' },
        { need: 'emotional_support', style: 'systematic', severity: 'moderate' },
        { need: 'practical_action', style: 'narrative', severity: 'mild' },
        { need: 'practical_action', style: 'intuitive', severity: 'moderate' },
        { need: 'deep_analysis', style: 'empathetic', severity: 'mild' },
        { need: 'deep_analysis', style: 'pragmatic', severity: 'mild' },
    ];
    const conflict = conflicts.find((c) => c.need === userNeed && c.style === personaStyle);
    if (!conflict) {
        return null;
    }
    // Determine resolution strategy
    let resolution = 'blend_approaches';
    let phrase = '';
    if (conflict.severity === 'significant') {
        // Significant conflict - need to explicitly acknowledge
        if (personaProfile.secondaryReasoning) {
            resolution = 'shift_to_secondary';
            phrase = getConflictPhrase(personaStyle, userNeed, 'shift');
        }
        else {
            resolution = 'acknowledge_limitation';
            phrase = getConflictPhrase(personaStyle, userNeed, 'acknowledge');
        }
    }
    else if (conflict.severity === 'moderate') {
        resolution = 'blend_approaches';
        phrase = getConflictPhrase(personaStyle, userNeed, 'blend');
    }
    else {
        // Mild - just be aware
        resolution = 'blend_approaches';
        phrase = '';
    }
    return {
        detected: true,
        personaStyle,
        userNeed,
        severity: conflict.severity,
        resolution,
        phrase,
    };
}
function getConflictPhrase(style, need, resolution) {
    const phrases = {
        analytical: {
            emotional_support_shift: "I know I tend to jump to analysis, but let me just sit with what you're feeling first...",
            emotional_support_acknowledge: "I notice I want to analyze this, but right now that's not what you need. Tell me more about how you're feeling.",
            emotional_support_blend: "I hear that this is hard. Let me understand both what's happening and how it's affecting you.",
        },
        systematic: {
            emotional_support_shift: 'Before I start breaking this down into steps, I want to acknowledge how overwhelming this must feel.',
            emotional_support_acknowledge: 'My instinct is to organize this, but I sense you need me to just listen first.',
            emotional_support_blend: "This is a lot. Let's take it one piece at a time, but no rush.",
        },
        narrative: {
            practical_action_shift: 'I could share a story about this, but I think you need something more concrete right now.',
            practical_action_acknowledge: "I'm tempted to explore the meaning here, but you need action steps. Let me focus on that.",
            practical_action_blend: "Here's what I'd suggest doing - and I'll share a quick story about why this works.",
        },
        intuitive: {
            practical_action_shift: 'My sense is pointing me somewhere, but let me give you something more concrete to work with.',
            practical_action_acknowledge: "I'm seeing the big picture, but you need specifics. Let me try to be more practical.",
            practical_action_blend: "Here's what my instinct says, and here's the practical first step.",
        },
    };
    const key = `${need}_${resolution}`;
    return phrases[style]?.[key] || '';
}
/**
 * Track cognitive approach effectiveness
 *
 * NOW WITH PERSISTENCE! Cognitive learnings are saved to Firestore so we
 * actually learn HOW to communicate with each user over time.
 */
export class CognitiveLearningTracker {
    learnings = new Map();
    recentEffectiveness = [];
    loadedUsers = new Set(); // Track which users we've loaded from persistence
    pendingSaves = new Set(); // Track dirty learnings that need saving
    saveTimeout = null;
    /**
     * Load learning from persistence if not already loaded
     */
    async ensureLoaded(userId, personaId) {
        const key = `${userId}_${personaId}`;
        if (this.loadedUsers.has(key))
            return;
        try {
            const { loadCognitiveLearning, fromPersistedLearning } = await import('./cognitive-persistence.js');
            const persisted = await loadCognitiveLearning(userId, personaId);
            if (persisted) {
                const learning = fromPersistedLearning(persisted);
                this.learnings.set(cleanForFirestore(key), {
                    userId,
                    personaId,
                    ...learning,
                });
                log.info({ userId, personaId, totalInteractions: learning.totalInteractions }, '✅ Loaded cognitive learning from persistence');
            }
            this.loadedUsers.add(cleanForFirestore(key));
        }
        catch (error) {
            log.warn({ error, userId, personaId }, 'Failed to load cognitive learning, starting fresh');
            this.loadedUsers.add(cleanForFirestore(key));
        }
    }
    /**
     * Schedule a debounced save to persistence
     */
    scheduleSave(userId, personaId) {
        const key = `${userId}_${personaId}`;
        this.pendingSaves.add(cleanForFirestore(key));
        // Debounce saves - wait 5 seconds after last change
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            void this.flushPendingSaves();
        }, 5000);
    }
    /**
     * Flush all pending saves to Firestore
     */
    async flushPendingSaves() {
        if (this.pendingSaves.size === 0)
            return;
        const { saveCognitiveLearning, toPersistableLearning } = await import('./cognitive-persistence.js');
        for (const key of this.pendingSaves) {
            const learning = this.learnings.get(key);
            if (learning) {
                try {
                    const persistable = toPersistableLearning(learning.userId, learning.personaId, learning);
                    await saveCognitiveLearning(persistable);
                    log.debug({ key }, 'Saved cognitive learning to persistence');
                }
                catch (error) {
                    log.error({ error, key }, 'Failed to save cognitive learning');
                }
            }
        }
        this.pendingSaves.clear();
    }
    /**
     * Record a cognitive approach and user response
     */
    recordApproachEffectiveness(userId, personaId, approach, context, userResponse, userCognitiveStyle) {
        // Record the interaction
        this.recentEffectiveness.push({
            approach,
            context,
            userResponse,
            userCognitiveStyle,
            timestamp: new Date(),
        });
        // Keep only last 100
        if (this.recentEffectiveness.length > 100) {
            this.recentEffectiveness.shift();
        }
        // Update learning for this user-persona pair
        const key = `${userId}_${personaId}`;
        let learning = this.learnings.get(key);
        if (!learning) {
            learning = {
                userId,
                personaId,
                effectiveApproaches: new Map(),
                userPreferredStyle: 'unknown',
                breakthroughApproaches: [],
                ineffectiveApproaches: [],
                expertiseTopics: [],
                noviceTopics: [],
                totalInteractions: 0,
            };
            this.learnings.set(key, learning);
        }
        learning.totalInteractions++;
        // Update approach effectiveness
        const currentScore = learning.effectiveApproaches.get(approach) || 0.5;
        const adjustment = userResponse === 'breakthrough'
            ? 0.3
            : userResponse === 'engaged'
                ? 0.1
                : userResponse === 'disengaged'
                    ? -0.15
                    : 0;
        learning.effectiveApproaches.set(approach, Math.max(0, Math.min(1, currentScore + adjustment)));
        // Track breakthroughs
        if (userResponse === 'breakthrough' && !learning.breakthroughApproaches.includes(approach)) {
            learning.breakthroughApproaches.push(approach);
        }
        // Track ineffective approaches
        if (userResponse === 'disengaged') {
            const score = learning.effectiveApproaches.get(approach) || 0.5;
            if (score < 0.3 && !learning.ineffectiveApproaches.includes(approach)) {
                learning.ineffectiveApproaches.push(approach);
            }
        }
        // Update user's preferred style
        if (userCognitiveStyle !== 'unknown') {
            learning.userPreferredStyle = userCognitiveStyle;
        }
        log.debug({
            userId,
            personaId,
            approach,
            userResponse,
            newScore: learning.effectiveApproaches.get(approach),
        }, 'Cognitive approach effectiveness recorded');
        // Schedule save to persistence
        this.scheduleSave(userId, personaId);
    }
    /**
     * Record expertise level for a topic
     */
    recordTopicExpertise(userId, personaId, topic, level) {
        const key = `${userId}_${personaId}`;
        const learning = this.learnings.get(key);
        if (!learning)
            return;
        if (level === 'expert' && !learning.expertiseTopics.includes(topic)) {
            learning.expertiseTopics.push(topic);
            // Remove from novice if present
            learning.noviceTopics = learning.noviceTopics.filter((t) => t !== topic);
            this.scheduleSave(userId, personaId);
        }
        else if (level === 'novice' && !learning.noviceTopics.includes(topic)) {
            learning.noviceTopics.push(topic);
            this.scheduleSave(userId, personaId);
        }
    }
    /**
     * Get learning for a user-persona pair
     */
    getLearning(userId, personaId) {
        return this.learnings.get(`${userId}_${personaId}`) || null;
    }
    /**
     * Get learning with async persistence load
     */
    async getLearningAsync(userId, personaId) {
        await this.ensureLoaded(userId, personaId);
        return this.learnings.get(`${userId}_${personaId}`) || null;
    }
    /**
     * Get recommended approach based on learning
     */
    getRecommendedApproach(userId, personaId, defaultApproach) {
        const learning = this.learnings.get(`${userId}_${personaId}`);
        if (!learning || learning.totalInteractions < 3) {
            return {
                approach: defaultApproach,
                confidence: 0.5,
                reason: 'Using default - not enough data',
            };
        }
        // Find best scoring approach
        let bestApproach = defaultApproach;
        let bestScore = learning.effectiveApproaches.get(defaultApproach) || 0.5;
        for (const [approach, score] of learning.effectiveApproaches) {
            if (score > bestScore) {
                bestApproach = approach;
                bestScore = score;
            }
        }
        // Check if any breakthrough approaches
        if (learning.breakthroughApproaches.length > 0) {
            const recentBreakthrough = learning.breakthroughApproaches[learning.breakthroughApproaches.length - 1];
            const breakthroughScore = learning.effectiveApproaches.get(recentBreakthrough) || 0.5;
            if (breakthroughScore >= bestScore) {
                bestApproach = recentBreakthrough;
                bestScore = breakthroughScore;
            }
        }
        // Avoid ineffective approaches
        if (learning.ineffectiveApproaches.includes(bestApproach)) {
            // Fall back to default if best is ineffective
            bestApproach = defaultApproach;
            bestScore = 0.5;
        }
        const confidence = Math.min(1.0, 0.5 + learning.totalInteractions * 0.02);
        const reason = bestApproach === defaultApproach
            ? 'Using default approach'
            : `${bestApproach} has worked well with this user (score: ${bestScore.toFixed(2)})`;
        return { approach: bestApproach, confidence, reason };
    }
    /**
     * Export learnings for persistence
     */
    exportLearnings() {
        const result = {};
        for (const [key, learning] of this.learnings) {
            result[key] = {
                ...learning,
                effectiveApproaches: new Map(learning.effectiveApproaches),
            };
        }
        return result;
    }
    /**
     * Import learnings from persistence
     */
    importLearnings(data) {
        for (const [key, learning] of Object.entries(data)) {
            this.learnings.set(key, {
                ...learning,
                effectiveApproaches: new Map(Object.entries(learning.effectiveApproaches)),
            });
        }
    }
}
// Singleton
let cognitiveLearningTracker = null;
export function getCognitiveLearningTracker() {
    if (!cognitiveLearningTracker) {
        cognitiveLearningTracker = new CognitiveLearningTracker();
    }
    return cognitiveLearningTracker;
}
/**
 * Initialize cognitive learning for a user-persona pair (call at session start)
 */
export async function initializeCognitiveLearning(userId, personaId) {
    const tracker = getCognitiveLearningTracker();
    await tracker.ensureLoaded(userId, personaId);
}
/**
 * Flush cognitive learning to persistence (call at session end)
 */
export async function flushCognitiveLearning() {
    const tracker = getCognitiveLearningTracker();
    await tracker.flushPendingSaves();
}
/**
 * Track what we've explained to users
 *
 * NOW WITH PERSISTENCE! Knowledge state is saved to Firestore so we don't
 * re-explain concepts users already understand.
 */
export class KnowledgeStateTracker {
    states = new Map();
    loadedUsers = new Set(); // Track which users we've loaded
    pendingSaves = new Set(); // Track dirty states that need saving
    saveTimeout = null;
    /**
     * Load state from persistence if not already loaded
     */
    async ensureLoaded(userId) {
        if (this.loadedUsers.has(userId))
            return;
        try {
            const { loadKnowledgeState, fromPersistedKnowledge } = await import('./cognitive-persistence.js');
            const persisted = await loadKnowledgeState(userId);
            if (persisted) {
                const state = fromPersistedKnowledge(persisted);
                this.states.set(userId, state);
                log.info({ userId, topicsCount: state.topicsExplained.size }, '✅ Loaded knowledge state from persistence');
            }
            this.loadedUsers.add(userId);
        }
        catch (error) {
            log.warn({ error, userId }, 'Failed to load knowledge state, starting fresh');
            this.loadedUsers.add(userId);
        }
    }
    /**
     * Schedule a debounced save to persistence
     */
    scheduleSave(userId) {
        this.pendingSaves.add(userId);
        // Debounce saves - wait 5 seconds after last change
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => {
            void this.flushPendingSaves();
        }, 5000);
    }
    /**
     * Flush all pending saves to Firestore
     */
    async flushPendingSaves() {
        if (this.pendingSaves.size === 0)
            return;
        const { saveKnowledgeState, toPersistableKnowledge } = await import('./cognitive-persistence.js');
        for (const userId of this.pendingSaves) {
            const state = this.states.get(userId);
            if (state) {
                try {
                    const persistable = toPersistableKnowledge(userId, state);
                    await saveKnowledgeState(persistable);
                    log.debug({ userId }, 'Saved knowledge state to persistence');
                }
                catch (error) {
                    log.error({ error, userId }, 'Failed to save knowledge state');
                }
            }
        }
        this.pendingSaves.clear();
    }
    /**
     * Record that we explained a topic
     */
    recordExplanation(userId, topic, personaId, userResponse) {
        let state = this.states.get(userId);
        if (!state) {
            state = {
                userId,
                topicsExplained: new Map(),
                skipExplanationFor: [],
                confusionTopics: [],
            };
            this.states.set(userId, state);
        }
        const existing = state.topicsExplained.get(topic);
        if (userResponse === 'already_knew') {
            // User already knows this - skip in future
            if (!state.skipExplanationFor.includes(topic)) {
                state.skipExplanationFor.push(topic);
            }
            if (!existing) {
                state.topicsExplained.set(cleanForFirestore(topic), {
                    firstExplained: new Date(),
                    timesRevisited: 0,
                    understandingLevel: 'expert',
                    lastAssessedConfidence: 1.0,
                    personaWhoExplained: personaId,
                });
            }
            this.scheduleSave(userId);
            return;
        }
        if (existing) {
            existing.timesRevisited++;
            if (userResponse === 'understood') {
                // Progress understanding level
                if (existing.understandingLevel === 'introduced') {
                    existing.understandingLevel = 'learning';
                }
                else if (existing.understandingLevel === 'learning' && existing.timesRevisited >= 2) {
                    existing.understandingLevel = 'comfortable';
                }
                existing.lastAssessedConfidence = Math.min(1.0, existing.lastAssessedConfidence + 0.2);
            }
            else if (userResponse === 'confused') {
                // Track confusion
                if (!state.confusionTopics.includes(topic)) {
                    state.confusionTopics.push(topic);
                }
                existing.lastAssessedConfidence = Math.max(0, existing.lastAssessedConfidence - 0.3);
            }
            else if (userResponse === 'asked_more') {
                // Good sign - engaged but learning
                existing.lastAssessedConfidence = Math.min(1.0, existing.lastAssessedConfidence + 0.1);
            }
        }
        else {
            // First time explaining
            state.topicsExplained.set(cleanForFirestore(topic), {
                firstExplained: new Date(),
                timesRevisited: 0,
                understandingLevel: 'introduced',
                lastAssessedConfidence: userResponse === 'understood' ? 0.6 : 0.3,
                personaWhoExplained: personaId,
            });
            if (userResponse === 'confused') {
                state.confusionTopics.push(topic);
            }
        }
        // Schedule save to persistence
        this.scheduleSave(userId);
    }
    /**
     * Get explanation guidance for a topic
     */
    getExplanationGuidance(userId, topic) {
        const state = this.states.get(userId);
        if (!state) {
            return {
                shouldExplain: true,
                depth: 'moderate',
                note: 'First time discussing with this user.',
            };
        }
        // Check if we should skip
        if (state.skipExplanationFor.includes(topic)) {
            return {
                shouldExplain: false,
                depth: 'skip',
                note: `User already knows about ${topic} - skip the basics.`,
            };
        }
        const topicState = state.topicsExplained.get(topic);
        if (!topicState) {
            return { shouldExplain: true, depth: 'moderate', note: `New topic for this user.` };
        }
        // Check understanding level
        switch (topicState.understandingLevel) {
            case 'expert':
                return { shouldExplain: false, depth: 'skip', note: `User is comfortable with ${topic}.` };
            case 'comfortable':
                return {
                    shouldExplain: true,
                    depth: 'brief_reminder',
                    note: `User knows ${topic} - just a quick reference.`,
                };
            case 'learning':
                return {
                    shouldExplain: true,
                    depth: 'moderate',
                    note: `User is learning ${topic} - reinforce key points.`,
                };
            case 'introduced':
                if (state.confusionTopics.includes(topic)) {
                    return {
                        shouldExplain: true,
                        depth: 'full',
                        note: `User has struggled with ${topic} - try a different approach.`,
                    };
                }
                return {
                    shouldExplain: true,
                    depth: 'full',
                    note: `User is new to ${topic} - explain thoroughly.`,
                };
        }
    }
    /**
     * Get explanation guidance with async persistence load
     */
    async getExplanationGuidanceAsync(userId, topic) {
        await this.ensureLoaded(userId);
        return this.getExplanationGuidance(userId, topic);
    }
    /**
     * Get state for persistence
     */
    getState(userId) {
        return this.states.get(userId) || null;
    }
    /**
     * Load state from persistence
     */
    loadState(userId, data) {
        this.states.set(userId, {
            ...data,
            topicsExplained: new Map(Object.entries(data.topicsExplained).map(([k, v]) => [
                k,
                {
                    ...v,
                    firstExplained: new Date(v.firstExplained),
                },
            ])),
        });
    }
}
// Singleton
let knowledgeStateTracker = null;
export function getKnowledgeStateTracker() {
    if (!knowledgeStateTracker) {
        knowledgeStateTracker = new KnowledgeStateTracker();
    }
    return knowledgeStateTracker;
}
/**
 * Initialize knowledge state for a user (call at session start)
 */
export async function initializeKnowledgeState(userId) {
    const tracker = getKnowledgeStateTracker();
    await tracker.ensureLoaded(userId);
}
/**
 * Flush knowledge state to persistence (call at session end)
 */
export async function flushKnowledgeState() {
    const tracker = getKnowledgeStateTracker();
    await tracker.flushPendingSaves();
}
/**
 * Get cognitive growth adjustments based on relationship stage
 */
export function getCognitiveGrowthProfile(relationshipStage, sessionCount) {
    switch (relationshipStage) {
        case 'stranger':
            return {
                relationshipStage,
                showReasoningLevel: 0.8, // Show thinking to build trust
                adaptationLevel: 0.3, // Not much data to adapt
                shortcutsAllowed: false, // Be thorough
                canReferenceHistory: false,
            };
        case 'acquaintance':
            return {
                relationshipStage,
                showReasoningLevel: 0.6,
                adaptationLevel: 0.5,
                shortcutsAllowed: false,
                canReferenceHistory: sessionCount > 2,
            };
        case 'friend':
            return {
                relationshipStage,
                showReasoningLevel: 0.4, // They trust your conclusions
                adaptationLevel: 0.7,
                shortcutsAllowed: true, // Can skip some basics
                canReferenceHistory: true,
            };
        case 'trusted_advisor':
            return {
                relationshipStage,
                showReasoningLevel: 0.2, // Only show reasoning for complex things
                adaptationLevel: 0.9, // Highly personalized
                shortcutsAllowed: true,
                canReferenceHistory: true,
            };
    }
}
/**
 * Build cognitive growth context for prompt
 */
export function buildCognitiveGrowthContext(profile, cognitivelearning) {
    const sections = [];
    // Relationship stage guidance
    sections.push(`[RELATIONSHIP: ${profile.relationshipStage.toUpperCase()}]`);
    if (profile.showReasoningLevel > 0.6) {
        sections.push('Show your thinking process to build trust.');
    }
    else if (profile.showReasoningLevel < 0.3) {
        sections.push('You can skip showing all your reasoning - they trust you.');
    }
    if (profile.shortcutsAllowed) {
        sections.push('You can use shorthand and skip basics they already know.');
    }
    if (profile.canReferenceHistory && cognitivelearning) {
        // Reference what has worked
        if (cognitivelearning.breakthroughApproaches.length > 0) {
            sections.push(`Past breakthroughs with ${cognitivelearning.breakthroughApproaches.join(', ')} approach.`);
        }
        if (cognitivelearning.expertiseTopics.length > 0) {
            sections.push(`They're knowledgeable about: ${cognitivelearning.expertiseTopics.slice(0, 3).join(', ')}.`);
        }
    }
    if (profile.adaptationLevel > 0.7 && cognitivelearning?.userPreferredStyle !== 'unknown') {
        sections.push(`Adapt to their ${cognitivelearning?.userPreferredStyle} thinking style.`);
    }
    return sections.join('\n');
}
export default {
    detectUserCognitiveStyle,
    buildCognitiveHandoffContext,
    buildReasoningChain,
    getReasoningChainGuidance,
    detectCognitiveConflict,
    getCognitiveLearningTracker,
    getKnowledgeStateTracker,
    getCognitiveGrowthProfile,
    buildCognitiveGrowthContext,
};
//# sourceMappingURL=cognitive-advanced.js.map